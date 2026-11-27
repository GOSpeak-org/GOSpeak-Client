package main

import (
	"context"
	"crypto/tls"
	"errors"
	"io"
	"log"
	"net"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"sync/atomic"
	"time"
)

// Route policy for the loopback proxy's upstream hop.
//
// Direct first: when the backend is reachable the desktop pays no proxy
// latency, and the OS proxy (or a proxy app) stays out of the path. A direct
// attempt only fails over to the configured proxy when the failure happened
// before the request could have reached the backend (DNS, dial, TLS
// handshake), so a failed request is not replayed against a server that may
// already have processed it.
//
// The proxy route is sticky for a while. On Chinese networks a Cloudflare edge
// IP is regularly unreachable while its sibling A record answers, and the
// dialer already races every resolved address; what it cannot fix is a path
// that dies mid-session. Sticking avoids paying a failed direct attempt on
// every single request, and a cheap TLS probe promotes the direct route back
// once it recovers.
const (
	// perAttemptDial bounds one resolved address; a dead edge IP must not eat
	// the whole dial budget and starve its healthy sibling.
	perAttemptDial = 2500 * time.Millisecond
	dialStagger    = 250 * time.Millisecond

	// upstreamHeaderTimeout is the ceiling for "the backend started answering".
	// HTTP/2 has no ResponseHeaderTimeout, and without a ceiling a half-open
	// connection hangs until the page's own 50s axios timeout.
	upstreamHeaderTimeout = 12 * time.Second

	// proxyRecheck is how long the proxy route is trusted before the direct
	// path is probed again in the background.
	proxyRecheck = 30 * time.Second
)

const (
	routeDirect int32 = iota
	routeProxy
)

// upstreamRouter is the shared RoundTripper behind both the main and worker
// reverse proxies. It owns the direct/proxy decision, the dial-timeout policy
// and the background probe.
type upstreamRouter struct {
	// target returns the currently configured backend base URL.
	target func() *url.URL

	direct  http.RoundTripper
	proxied http.RoundTripper
	sys     *systemProxy

	// probe checks the direct path without sending an HTTP request. Injected
	// for tests; defaults to probeTarget.
	probe func(context.Context, *url.URL) error

	mode atomic.Int32

	mu         sync.Mutex
	lastProbe  time.Time
	probing    bool
	fallbacks  int
	directOKMu sync.Mutex
}

func newUpstreamRouter(target func() *url.URL, direct, proxied http.RoundTripper, sys *systemProxy) *upstreamRouter {
	return &upstreamRouter{
		target:  target,
		direct:  direct,
		proxied: proxied,
		sys:     sys,
		probe:   probeTarget,
	}
}

// RouteName reports the route currently in use, for /healthz.
func (r *upstreamRouter) RouteName() string {
	if r.mode.Load() == routeProxy {
		return "proxy"
	}
	return "direct"
}

// FallbackCount reports how many times the route left direct, for /healthz.
func (r *upstreamRouter) FallbackCount() int {
	r.mu.Lock()
	defer r.mu.Unlock()
	return r.fallbacks
}

func (r *upstreamRouter) RoundTrip(req *http.Request) (*http.Response, error) {
	if r.mode.Load() == routeProxy {
		return r.viaProxy(req)
	}
	return r.viaDirect(req)
}

// viaDirect is the normal path: try the backend directly, then decide whether
// the failure is worth a proxy retry.
func (r *upstreamRouter) viaDirect(req *http.Request) (*http.Response, error) {
	resp, err := r.attempt(req, r.direct)
	if err == nil {
		r.noteDirectOK()
		return resp, nil
	}
	if !r.hasProxy() {
		return nil, err
	}
	r.switchToProxy(err)
	if !canRetryRequest(req, err) {
		return nil, err
	}
	retry, retryErr := r.attempt(req, r.proxied)
	if retryErr != nil {
		log.Printf("[GOSpeak] upstream route: direct failed (%v), system proxy failed too (%v)", err, retryErr)
		return nil, err
	}
	return retry, nil
}

// viaProxy keeps the session on the proxy until the direct path proves
// healthy again.
func (r *upstreamRouter) viaProxy(req *http.Request) (*http.Response, error) {
	r.probeInBackground()
	resp, err := r.attempt(req, r.proxied)
	if err == nil {
		return resp, nil
	}
	if !canRetryRequest(req, err) {
		return nil, err
	}
	log.Printf("[GOSpeak] upstream route: system proxy failed (%v), retrying direct", err)
	direct, directErr := r.attempt(req, r.direct)
	if directErr != nil {
		return nil, err
	}
	r.noteDirectOK()
	return direct, nil
}

// attempt runs one upstream round trip with a header deadline and returns the
// response with a body that releases the deadline when the page is done with
// it. Protocol upgrades are passed straight through: their handshake wait is
// already covered by ResponseHeaderTimeout, and a deadline tied to the request
// context would tear down the tunnelled WebSocket once it fires.
func (r *upstreamRouter) attempt(req *http.Request, rt http.RoundTripper) (*http.Response, error) {
	if isUpgradeRequest(req) || !withinHeaderBudget(req) {
		return rt.RoundTrip(req)
	}
	ctx, cancel := context.WithCancel(req.Context())
	timer := time.AfterFunc(upstreamHeaderTimeout, cancel)
	resp, err := rt.RoundTrip(req.Clone(ctx))
	if !timer.Stop() {
		if resp != nil {
			resp.Body.Close()
		}
		cancel()
		return nil, context.DeadlineExceeded
	}
	if err != nil {
		cancel()
		return nil, err
	}
	resp.Body = &cancelOnClose{ReadCloser: resp.Body, cancel: cancel}
	return resp, nil
}

// maxBodyForHeaderBudget is the largest request body that may carry the
// header deadline. The deadline covers upload time too, so a big or a
// streaming upload would be cut off mid-body by a fixed one.
const maxBodyForHeaderBudget = 1 << 20

// withinHeaderBudget reports whether the fixed header deadline may be applied:
// no body, or a small body that uploads well inside it.
func withinHeaderBudget(req *http.Request) bool {
	if req == nil || req.Body == nil || req.Body == http.NoBody {
		return true
	}
	return req.ContentLength > 0 && req.ContentLength <= maxBodyForHeaderBudget
}

type cancelOnClose struct {
	io.ReadCloser
	cancel context.CancelFunc
}

func (c *cancelOnClose) Close() error {
	err := c.ReadCloser.Close()
	c.cancel()
	return err
}

// hasProxy reports whether the configured backend has a proxy to fall back to.
func (r *upstreamRouter) hasProxy() bool {
	if r.sys == nil || r.target == nil || r.proxied == nil {
		return false
	}
	t := r.target()
	if t == nil || t.Host == "" || isDirectHost(t.Hostname()) {
		return false
	}
	if hostExcluded(t.Hostname(), r.sys.settings().Exceptions) {
		return false
	}
	u, err := r.sys.hook()(&http.Request{URL: t})
	return err == nil && u != nil
}

func (r *upstreamRouter) switchToProxy(err error) {
	if r.mode.Swap(routeProxy) != routeProxy {
		r.mu.Lock()
		r.fallbacks++
		r.mu.Unlock()
		log.Printf("[GOSpeak] upstream route -> system proxy (direct failed: %v)", err)
	}
}

func (r *upstreamRouter) noteDirectOK() {
	if r.mode.Swap(routeDirect) == routeProxy {
		log.Printf("[GOSpeak] upstream route -> direct")
	}
}

// probeInBackground checks the direct path at most once per proxyRecheck. The
// probe never blocks a user request.
func (r *upstreamRouter) probeInBackground() {
	if r.target == nil || r.probe == nil {
		return
	}
	r.mu.Lock()
	if r.probing || time.Since(r.lastProbe) < proxyRecheck {
		r.mu.Unlock()
		return
	}
	r.probing = true
	r.lastProbe = time.Now()
	r.mu.Unlock()

	t := r.target()
	if t == nil {
		r.mu.Lock()
		r.probing = false
		r.mu.Unlock()
		return
	}
	go func() {
		defer func() {
			r.mu.Lock()
			r.probing = false
			r.mu.Unlock()
		}()
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if err := r.probe(ctx, t); err != nil {
			log.Printf("[GOSpeak] upstream route: direct still failing (%v)", err)
			return
		}
		r.noteDirectOK()
	}()
}

// canRetryRequest guards the one automatic replay the router performs. It is
// allowed only when the failure happened before the request could reach the
// backend and the body can be sent again unchanged; anything else would risk
// applying a POST twice.
func canRetryRequest(req *http.Request, err error) bool {
	if req == nil || err == nil {
		return false
	}
	if req.Context().Err() != nil {
		return false // the page gave up; retrying would only burn another attempt
	}
	if req.Body != nil && req.Body != http.NoBody {
		return false
	}
	return safeToFallback(req.Method, err)
}

func safeToFallback(method string, err error) bool {
	if err == nil || errors.Is(err, context.Canceled) {
		return false
	}
	if notSent(err) {
		return true
	}
	return isIdempotent(method) && transientAfterSend(err)
}

// notSent reports failures that happen before any HTTP bytes reach the
// backend, so a retry cannot double-apply anything.
func notSent(err error) bool {
	var dnsErr *net.DNSError
	if errors.As(err, &dnsErr) {
		return true
	}
	var opErr *net.OpError
	if errors.As(err, &opErr) {
		return opErr.Op == "dial" || opErr.Op == "remote address"
	}
	msg := strings.ToLower(err.Error())
	return strings.Contains(msg, "tls handshake timeout") ||
		strings.Contains(msg, "connection refused") ||
		strings.Contains(msg, "no route to host") ||
		strings.Contains(msg, "network is unreachable")
}

// transientAfterSend reports failures where the backend may already have seen
// the request; only idempotent methods may be replayed for those.
func transientAfterSend(err error) bool {
	if errors.Is(err, context.DeadlineExceeded) {
		return true
	}
	msg := strings.ToLower(err.Error())
	return strings.Contains(msg, "connection reset by peer") ||
		strings.Contains(msg, "unexpected eof") ||
		strings.Contains(msg, "i/o timeout") ||
		strings.Contains(msg, "use of closed network connection") ||
		strings.Contains(msg, "server closed idle connection")
}

func isIdempotent(method string) bool {
	switch method {
	case http.MethodGet, http.MethodHead, http.MethodOptions, http.MethodTrace:
		return true
	default:
		return false
	}
}

// probeTarget checks the direct path without an HTTP request: connect (and
// complete a TLS handshake, for https) to the backend. Nothing is sent to the
// server, so the probe is safe to run against production.
func probeTarget(ctx context.Context, target *url.URL) error {
	host := target.Hostname()
	port := target.Port()
	if port == "" {
		if strings.EqualFold(target.Scheme, "https") {
			port = "443"
		} else {
			port = "80"
		}
	}
	dial := multiDialContext(&net.Dialer{Timeout: perAttemptDial, KeepAlive: 30 * time.Second}, perAttemptDial, dialStagger)
	conn, err := dial(ctx, "tcp", net.JoinHostPort(host, port))
	if err != nil {
		return err
	}
	if !strings.EqualFold(target.Scheme, "https") {
		return conn.Close()
	}
	defer conn.Close()
	handshakeCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	tc := tls.Client(conn, &tls.Config{ServerName: host, MinVersion: tls.VersionTLS12})
	return tc.HandshakeContext(handshakeCtx)
}

// multiDialContext dials every address a name resolves to, starting them
// staggered and keeping the first connection that succeeds. A single dead
// Cloudflare edge IP behind a healthy one must not fail the request: net's
// dialer tries addresses in order under one shared deadline, so the first
// black-holed address consumes the whole budget.
func multiDialContext(d *net.Dialer, perAttempt, stagger time.Duration) func(context.Context, string, string) (net.Conn, error) {
	return func(ctx context.Context, network, addr string) (net.Conn, error) {
		host, port, err := net.SplitHostPort(addr)
		if err != nil {
			return nil, err
		}
		if net.ParseIP(host) != nil {
			return d.DialContext(ctx, network, addr)
		}
		ips, err := net.DefaultResolver.LookupIPAddr(ctx, host)
		if err != nil {
			return nil, err
		}
		addrs := make([]string, 0, len(ips))
		for _, ip := range ips {
			if !addressFitsNetwork(ip.IP, network) {
				continue
			}
			addrs = append(addrs, net.JoinHostPort(ip.IP.String(), port))
		}
		switch len(addrs) {
		case 0:
			return nil, &net.DNSError{Err: "no suitable address", Name: host}
		case 1:
			return d.DialContext(ctx, network, addrs[0])
		}
		return dialRace(ctx, d, network, addrs, perAttempt, stagger)
	}
}

func dialRace(ctx context.Context, d *net.Dialer, network string, addrs []string, perAttempt, stagger time.Duration) (net.Conn, error) {
	raceCtx, cancel := context.WithCancel(ctx)
	defer cancel()

	type outcome struct {
		conn net.Conn
		err  error
	}
	results := make(chan outcome, len(addrs))
	launched := 0
	for ; launched < len(addrs); launched++ {
		go func(addr string) {
			attemptCtx, attemptCancel := context.WithTimeout(raceCtx, perAttempt)
			defer attemptCancel()
			conn, err := d.DialContext(attemptCtx, network, addr)
			results <- outcome{conn: conn, err: err}
		}(addrs[launched])
		if launched+1 == len(addrs) {
			break
		}
		select {
		case result := <-results:
			if result.err == nil {
				return result.conn, nil
			}
		case <-time.After(stagger):
		case <-raceCtx.Done():
			return nil, raceCtx.Err()
		}
	}

	var lastErr error
	remaining := launched
	if remaining < len(addrs) {
		remaining = len(addrs)
	}
	for i := 0; i < remaining; i++ {
		select {
		case result := <-results:
			if result.err == nil {
				return result.conn, nil
			}
			lastErr = result.err
		case <-raceCtx.Done():
			return nil, raceCtx.Err()
		}
	}
	if lastErr == nil {
		lastErr = errors.New("all dial attempts failed")
	}
	return nil, lastErr
}

func addressFitsNetwork(ip net.IP, network string) bool {
	switch network {
	case "tcp4":
		return ip.To4() != nil
	case "tcp6":
		return ip.To4() == nil
	default:
		return true
	}
}
