package main

// Local loopback reverse proxy — the heart of "desktop ships its own web UI".
//
// The desktop window loads http://127.0.0.1:<port>/ served by THIS process, so
// the page and its API/WS calls share one origin (no CORS, cookies work
// normally). This server:
//   - serves the embedded web frontend (webui/dist, SPA history fallback);
//   - reverse-proxies /api/v1, /uploads, /livekit and /ws to the configured
//     backend base URL (server-to-server, browser same-origin policy does not
//     apply);
//   - rewrites Set-Cookie (strips Secure/Domain) so backend session cookies
//     stick to the loopback origin;
//   - forwards /wsworker?target=<ws-url> to SFU/signaling worker nodes,
//     carrying the session cookie the page sends (same origin). Only hosts the
//     trusted backend handed out (or the configured base URL host) are
//     reachable, the upgrade must come from the loopback origin, and worker
//     responses never set cookies on the loopback origin.
//
// Changing the base URL simply swaps the proxy target — the page never sees a
// cross-origin request.

import (
	"bytes"
	"compress/gzip"
	"context"
	"crypto/sha256"
	"crypto/tls"
	"embed"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"log"
	"mime"
	"net"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
	"path"
	"strings"
	"sync"
	"time"

	"gospeak/proxyrules"
)

//go:embed all:webui/dist
var embeddedDist embed.FS

type proxyServer struct {
	mu     sync.RWMutex
	target *url.URL

	// port is the loopback port, reported by /healthz and the watchdog.
	port     int
	listener net.Listener
	srv      *http.Server

	errMu             sync.Mutex
	lastUpstreamError string

	dist      fs.FS
	mainProxy *httputil.ReverseProxy
	// transport is shared by the main and worker proxies so idle connections to
	// the backend (and to SFU nodes) are reused across both. It routes upgrade
	// requests over HTTP/1.1 and everything else over HTTP/2.
	transport http.RoundTripper

	// assets caches the embedded dist in memory: a page reload re-reads nothing
	// from disk, and gzip is computed once per file (see assetCache).
	assets *assetCache

	workerMu    sync.Mutex
	workerProxy map[string]*httputil.ReverseProxy
	workerOrder []string

	// workerHosts holds the worker host:port values the backend advertised via
	// ws-endpoint. Together with the configured base URL host they form the
	// allowlist for /wsworker.
	workerHosts *workerHostAllowlist

	// allowedWorkerHosts is injected by the caller and must return only hosts
	// the trusted backend handed out (the ws-endpoint worker host plus the
	// configured base URL host). nil means "nothing is allowed": the /wsworker
	// route is an SSRF primitive without it, so the default is fail-closed.
	allowedWorkerHosts func() []string
}

// proxyTransport is the connection pool both reverse proxies share.
//
// The default Transport only keeps 2 idle connections per host, which makes the
// page's burst of parallel API calls (and the overlay's polling) pay for a new
// TCP/TLS handshake every few requests; it also honours HTTP(S)_PROXY, which on
// a developer machine can hijack loopback→backend traffic that the user never
// meant to route through a proxy. Neither is what a desktop client wants.
//
// Two pools are built from it: one that never proxies (the direct route) and
// one that follows the OS/environment proxy (the fallback route). upstreamRouter
// decides which one a request takes.
func proxyTransport() *http.Transport {
	return newProxyTransport(nil)
}

func newProxyTransport(proxy func(*http.Request) (*url.URL, error)) *http.Transport {
	return &http.Transport{
		Proxy: proxy,
		// 每个解析地址单独限时：一个被黑洞的 Cloudflare 边缘 IP 不能吃掉整个
		// 拨号预算，让健康的兄弟地址永远轮不到（见 proxyroute.go 的 dialRace）。
		DialContext: multiDialContext(
			&net.Dialer{Timeout: perAttemptDial, KeepAlive: 30 * time.Second},
			perAttemptDial,
			dialStagger,
		),
		// 只走 HTTP/1.1：WebSocket 握手带 Connection/Upgrade，Go 的 HTTP/2
		// 客户端直接拒绝这类头。proxyRoundTripper 只把升级请求交给这里，
		// 普通 API 仍走 h2。
		ForceAttemptHTTP2:   false,
		TLSNextProto:        map[string]func(string, *tls.Conn) http.RoundTripper{},
		MaxIdleConns:        64,
		MaxIdleConnsPerHost: 16,
		IdleConnTimeout:     90 * time.Second,
		TLSHandshakeTimeout: 5 * time.Second,
		// 后端连上但不回响应时必须尽快失败给页面，而不是让 axios 干等 50s。
		ResponseHeaderTimeout: upstreamHeaderTimeout,
		ExpectContinueTimeout: time.Second,
	}
}

// proxyHTTP2Transport carries the traffic that is not a protocol upgrade:
// ordinary API/upload/RTC requests keep HTTP/2 multiplexing when the backend
// speaks it.
func proxyHTTP2Transport() *http.Transport {
	return newHTTP2Transport(nil)
}

func newHTTP2Transport(proxy func(*http.Request) (*url.URL, error)) *http.Transport {
	tr := newProxyTransport(proxy)
	tr.ForceAttemptHTTP2 = true
	tr.TLSNextProto = nil // let crypto/tls negotiate h2 again
	tr.Protocols = http1AndHTTP2()
	// HTTP/2 has no ResponseHeaderTimeout, so a half-open connection would hang
	// until the page's 50s timeout. Ping an idle connection and drop it when the
	// peer stops answering.
	tr.HTTP2 = &http.HTTP2Config{
		SendPingTimeout: 30 * time.Second,
		PingTimeout:     10 * time.Second,
	}
	return tr
}

// http1AndHTTP2 lets the TLS handshake offer h2 while keeping h1 as the
// fallback for a backend that does not speak it.
func http1AndHTTP2() *http.Protocols {
	p := new(http.Protocols)
	p.SetHTTP1(true)
	p.SetHTTP2(true)
	return p
}

// proxyRoundTripper downgrades a request to HTTP/1.1 only when it needs to be
// one: a WebSocket (or any Connection: Upgrade) handshake cannot travel over
// HTTP/2 with Go's client, while everything else benefits from h2. This is the
// automatic downgrade — no configuration, and a backend that negotiates h2 no
// longer turns /ws and /wsworker into 502.
type proxyRoundTripper struct {
	http11 *http.Transport
	http2  *http.Transport
}

func newProxyRoundTripper() *proxyRoundTripper {
	return newProxyRoundTripperWith(nil)
}

func newProxyRoundTripperWith(proxy func(*http.Request) (*url.URL, error)) *proxyRoundTripper {
	return &proxyRoundTripper{
		http11: newProxyTransport(proxy),
		http2:  newHTTP2Transport(proxy),
	}
}

func (t *proxyRoundTripper) RoundTrip(req *http.Request) (*http.Response, error) {
	if isUpgradeRequest(req) {
		return t.http11.RoundTrip(req)
	}
	return t.http2.RoundTrip(req)
}

// isUpgradeRequest reports whether a request asks for a protocol switch.
// ReverseProxy sets these headers on the outbound request before RoundTrip.
func isUpgradeRequest(req *http.Request) bool {
	return req.Header.Get("Upgrade") != "" ||
		strings.EqualFold(req.Header.Get("Connection"), "upgrade")
}

// handler wires the loopback routes: proxied API/WS prefixes first, static
// frontend last (it owns "/" and the SPA fallback).
func (s *proxyServer) handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("/api/v1/", s.handleProxied)
	mux.HandleFunc("/uploads/", s.handleProxied)
	// LiveKit 信令同源反代：后端下发的 serverUrl 是 ws://127.0.0.1:<port>/livekit，
	// 由这里转给用户配置的后端（后端再转发到内部 LiveKit）。
	mux.HandleFunc("/livekit/", s.handleProxied)
	// Signal socket (page resolves ws://127.0.0.1:<port>/ws as same origin).
	mux.HandleFunc("/ws", s.handleProxied)
	// SFU / signaling worker nodes reached through us with the session cookie.
	mux.HandleFunc("/wsworker", s.handleWorker)
	// Liveness only: answered by this process without touching the backend.
	mux.HandleFunc("/healthz", s.handleHealthz)
	mux.HandleFunc("/", s.serveDist)
	return mux
}

// startProxyServer listens on the persisted loopback port (see proxyport.go)
// and returns the server plus its "http://127.0.0.1:<port>" base URL.
func startProxyServer() (*proxyServer, string, error) {
	sub, err := fs.Sub(embeddedDist, "webui/dist")
	if err != nil {
		return nil, "", fmt.Errorf("open embedded dist: %w", err)
	}

	s := &proxyServer{
		dist:        sub,
		assets:      newAssetCache(),
		workerProxy: map[string]*httputil.ReverseProxy{},
		workerHosts: &workerHostAllowlist{},
	}
	// 直连优先，直连在请求发出前就失败（DNS / 拨号 / TLS 握手）才切系统代理；
	// 切换后粘住一段时间，直连探测恢复再切回（见 proxyroute.go）。
	sysProxy := newSystemProxy()
	s.transport = newUpstreamRouter(
		func() *url.URL {
			s.mu.RLock()
			defer s.mu.RUnlock()
			return s.target
		},
		newProxyRoundTripper(),
		newProxyRoundTripperWith(sysProxy.hook()),
		sysProxy,
	)
	// The only hosts /wsworker may reach: whatever the trusted backend handed
	// out (ws-endpoint) plus the host of the server the user configured. Both
	// are normalized host:port so the allowlist pins the port as well.
	s.allowedWorkerHosts = s.trustedWorkerHosts
	s.mainProxy = &httputil.ReverseProxy{
		Director:       s.directMain,
		ModifyResponse: s.modifyMainResponse,
		Transport:      s.transport,
		ErrorHandler:   s.proxyErrorHandler,
	}

	listener, port, err := listenLoopback(proxyPortDir())
	if err != nil {
		return nil, "", err
	}
	s.port = port
	s.listener = listener
	s.srv = &http.Server{
		Handler:           s.handler(),
		ReadHeaderTimeout: 10 * time.Second,
		IdleTimeout:       120 * time.Second,
	}
	go func(srv *http.Server) {
		_ = srv.Serve(listener)
	}(s.srv)
	// Pre-compress the frontend while the window is still being created, so the
	// first page load never waits on gzip. With build-time .gz sidecars (the
	// packaged app) this only warms the in-memory cache.
	go func() {
		s.assets.warm(s.dist)
		startupMark("asset cache warm")
	}()
	return s, fmt.Sprintf("http://127.0.0.1:%d", port), nil
}

// trustedWorkerHosts is the default allowedWorkerHosts: the hosts the trusted
// backend advertised via ws-endpoint plus the configured base URL host.
func (s *proxyServer) trustedWorkerHosts() []string {
	hosts := s.workerHosts.list()
	s.mu.RLock()
	t := s.target
	s.mu.RUnlock()
	if t != nil {
		if hp, err := proxyrules.NormalizedHostPort(t.Scheme, t.Host); err == nil {
			hosts = append(hosts, hp)
		}
	}
	return hosts
}

// setProxyTarget points the proxy at a new backend base URL ("" = unset).
func (s *proxyServer) setProxyTarget(baseURL string) {
	s.mu.Lock()
	if strings.TrimSpace(baseURL) == "" {
		s.target = nil
		s.mu.Unlock()
		s.workerHosts.reset()
		return
	}
	u, err := url.Parse(strings.TrimSpace(baseURL))
	if err != nil || u.Host == "" {
		s.target = nil
		s.mu.Unlock()
		s.workerHosts.reset()
		return
	}
	s.target = u
	s.mu.Unlock()
	// Worker hosts were handed out by the previous backend; they must not stay
	// reachable after switching servers.
	s.workerHosts.reset()
}

func (s *proxyServer) directMain(req *http.Request) {
	s.mu.RLock()
	t := s.target
	s.mu.RUnlock()
	if t == nil {
		return // handled by handleProxied with a 503 before reaching here
	}
	// Tell the backend which origin the page actually uses (the loopback one),
	// so serverUrl comes back as ws://127.0.0.1:<port>/livekit and stays
	// same-origin instead of pointing the window straight at the remote host.
	// Overwritten unconditionally: the page is untrusted, and a client-supplied
	// value would let it steer the backend's serverUrl/cookie-scope decisions.
	proto := "http"
	if req.TLS != nil {
		proto = "https"
	}
	req.Header.Set("X-Forwarded-Host", req.Host)
	req.Header.Set("X-Forwarded-Proto", proto)
	req.URL.Scheme = t.Scheme
	req.URL.Host = t.Host
	req.Host = t.Host
	if t.Path != "" && t.Path != "/" {
		// Base URL may carry a path prefix; keep it in front.
		req.URL.Path = strings.TrimSuffix(t.Path, "/") + req.URL.Path
	}
}

// handleProxied forwards API/upload/RTC/WS traffic to the configured backend.
func (s *proxyServer) handleProxied(w http.ResponseWriter, r *http.Request) {
	s.mu.RLock()
	t := s.target
	s.mu.RUnlock()
	if t == nil {
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		w.WriteHeader(http.StatusServiceUnavailable)
		_ = json.NewEncoder(w).Encode(map[string]any{
			"code": 6001,
			"msg":  "server base url not configured",
			"data": nil,
		})
		return
	}
	s.mainProxy.ServeHTTP(w, r)
}

// handleWorker forwards a WebSocket connection to the node given via the
// "target" query parameter (an absolute ws/wss URL returned by ws-endpoint).
//
// The target is client-supplied, so it is only honoured when its host:port was
// handed out by the trusted backend (see allowedWorkerHosts) and the upgrade
// originates from the loopback origin. Without that, any local page could use
// this route to reach loopback services and the cloud metadata endpoint.
func (s *proxyServer) handleWorker(w http.ResponseWriter, r *http.Request) {
	if !loopbackOriginAllowed(r) {
		http.Error(w, "cross-origin upgrade rejected", http.StatusForbidden)
		return
	}
	raw := r.URL.Query().Get("target")
	u, err := url.Parse(raw)
	if err != nil || u.Host == "" || u.User != nil {
		http.Error(w, "invalid target", http.StatusBadRequest)
		return
	}
	// Normalize to http(s) for ReverseProxy (it handles the WS upgrade).
	switch u.Scheme {
	case "ws":
		u.Scheme = "http"
	case "wss":
		u.Scheme = "https"
	case "http", "https":
	default:
		http.Error(w, "unsupported scheme", http.StatusBadRequest)
		return
	}
	if !s.workerHostAllowed(u.Scheme, u.Host) {
		http.Error(w, "target host not allowed", http.StatusForbidden)
		return
	}
	// The target's own query belongs to the remote handshake (a worker may
	// authenticate by query token), so it is kept; the inbound "target"
	// parameter is dropped so it never leaks the backend topology downstream.
	inbound := r.URL.Query()
	inbound.Del("target")
	for k, vs := range u.Query() {
		for _, v := range vs {
			inbound.Add(k, v)
		}
	}
	r.URL.RawQuery = inbound.Encode()

	proxy := s.workerFor(u)
	proxy.ServeHTTP(w, r)
}

// loopbackOriginAllowed rejects a cross-origin WebSocket upgrade. Browsers
// always send Origin; non-browser clients that omit it are left to the host
// allowlist.
func loopbackOriginAllowed(r *http.Request) bool {
	origin := r.Header.Get("Origin")
	if origin == "" {
		return true
	}
	u, err := url.Parse(origin)
	if err != nil || u.Host == "" {
		return false
	}
	if !strings.EqualFold(u.Host, r.Host) {
		return false
	}
	want := "http"
	if r.TLS != nil {
		want = "https"
	}
	return strings.EqualFold(u.Scheme, want)
}

// workerHostAllowed asks the shared rule whether the target's host:port is
// trusted. The allowlist is the injected one (advertised worker hosts plus the
// configured base URL host); the configured base URL is handed to the shared
// rule as its own channel too, so the overlap is idempotent. Entries are
// normalized host:port pairs, so an allowed host on one port does not open
// every other port of that host (the SSRF payloads all relied on that).
func (s *proxyServer) workerHostAllowed(scheme, hostport string) bool {
	if s.allowedWorkerHosts == nil {
		return false
	}
	s.mu.RLock()
	t := s.target
	s.mu.RUnlock()
	baseURL := ""
	if t != nil {
		baseURL = t.String()
	}
	return proxyrules.IsTrustedWorker(
		scheme+"://"+hostport,
		baseURL,
		strings.Join(s.allowedWorkerHosts(), ","),
	)
}

// workerHostAllowlist records the worker hosts the trusted backend handed out.
// It is bounded: a compromised backend response must not grow it without limit.
type workerHostAllowlist struct {
	mu    sync.Mutex
	hosts []string
}

const maxAllowedWorkerHosts = 16

func (a *workerHostAllowlist) allow(hostport string) {
	if a == nil || hostport == "" {
		return
	}
	a.mu.Lock()
	defer a.mu.Unlock()
	for _, h := range a.hosts {
		if h == hostport {
			return
		}
	}
	if len(a.hosts) >= maxAllowedWorkerHosts {
		a.hosts = a.hosts[1:]
	}
	a.hosts = append(a.hosts, hostport)
}

func (a *workerHostAllowlist) list() []string {
	if a == nil {
		return nil
	}
	a.mu.Lock()
	defer a.mu.Unlock()
	return append([]string(nil), a.hosts...)
}

func (a *workerHostAllowlist) reset() {
	if a == nil {
		return
	}
	a.mu.Lock()
	a.hosts = nil
	a.mu.Unlock()
}

// maxWorkerProxies bounds the per-target proxy cache: the key derives from a
// client-supplied URL, so an unbounded map is a memory sink.
const maxWorkerProxies = 64

func (s *proxyServer) workerFor(u *url.URL) *httputil.ReverseProxy {
	key := u.Scheme + "://" + u.Host + u.Path
	s.workerMu.Lock()
	defer s.workerMu.Unlock()
	if s.workerProxy == nil {
		s.workerProxy = map[string]*httputil.ReverseProxy{}
	}
	if p, ok := s.workerProxy[key]; ok {
		return p
	}
	if len(s.workerProxy) >= maxWorkerProxies {
		if len(s.workerOrder) > 0 {
			delete(s.workerProxy, s.workerOrder[0])
			s.workerOrder = s.workerOrder[1:]
		}
	}
	p := &httputil.ReverseProxy{
		Director: func(req *http.Request) {
			req.URL.Scheme = u.Scheme
			req.URL.Host = u.Host
			req.URL.Path = u.Path
			req.URL.RawPath = ""
			req.Host = u.Host
		},
		ModifyResponse: stripWorkerCookies,
		Transport:      s.transport,
		ErrorHandler:   s.proxyErrorHandler,
	}
	s.workerProxy[key] = p
	s.workerOrder = append(s.workerOrder, key)
	return p
}

// stripWorkerCookies keeps a worker node from planting cookies on the loopback
// origin: the page talks to us same-origin, so any Set-Cookie here would land
// on 127.0.0.1:<port> and be replayed to the backend.
func stripWorkerCookies(resp *http.Response) error {
	resp.Header.Del("Set-Cookie")
	return nil
}

// proxyErrorHandler answers an unreachable backend with the API's unified error
// envelope instead of ReverseProxy's bare 502 text, so the page's API client
// can tell "server is down" apart from a server-side error and show its own
// message (code 6002 = sfu/proxy transport error). The classified cause is kept
// for /healthz and the crash report.
func (s *proxyServer) proxyErrorHandler(w http.ResponseWriter, r *http.Request, err error) {
	s.recordUpstreamError(err)
	log.Printf("[GOSpeak] loopback proxy: %s %s -> %v (%s)", r.Method, r.URL.Path, err, s.UpstreamError())
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(http.StatusBadGateway)
	_ = json.NewEncoder(w).Encode(map[string]any{
		"code": 6002,
		"msg":  "backend unreachable",
		"data": nil,
	})
}

// handleHealthz reports liveness only. It never reaches the backend: no target
// configured is still a healthy process.
func (s *proxyServer) handleHealthz(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	s.mu.RLock()
	target := ""
	if s.target != nil {
		target = s.target.String()
	}
	s.mu.RUnlock()
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"ok":                  true,
		"port":                s.port,
		"target":              target,
		"last_upstream_error": s.UpstreamError(),
		"route":               s.RouteName(),
		"route_fallbacks":     s.RouteFallbacks(),
	})
}

// RouteName reports which upstream hop is in use: "direct" or "proxy".
func (s *proxyServer) RouteName() string {
	if router, ok := s.transport.(*upstreamRouter); ok {
		return router.RouteName()
	}
	return "direct"
}

// RouteFallbacks reports how many times the session left the direct route.
func (s *proxyServer) RouteFallbacks() int {
	if router, ok := s.transport.(*upstreamRouter); ok {
		return router.FallbackCount()
	}
	return 0
}

// UpstreamError returns the class of the last backend failure: "" | dns | tls |
// timeout | refused | other.
func (s *proxyServer) UpstreamError() string {
	s.errMu.Lock()
	defer s.errMu.Unlock()
	return s.lastUpstreamError
}

func (s *proxyServer) recordUpstreamError(err error) {
	kind := classifyProxyError(err)
	if kind == "" {
		return
	}
	s.errMu.Lock()
	s.lastUpstreamError = kind
	s.errMu.Unlock()
}

func classifyProxyError(err error) string {
	if err == nil {
		return ""
	}
	var dnsErr *net.DNSError
	if errors.As(err, &dnsErr) {
		return "dns"
	}
	var verifyErr *tls.CertificateVerificationError
	if errors.As(err, &verifyErr) {
		return "tls"
	}
	if errors.Is(err, context.DeadlineExceeded) || os.IsTimeout(err) {
		return "timeout"
	}
	if strings.Contains(err.Error(), "connection refused") {
		return "refused"
	}
	return "other"
}

// modifyMainResponse rewrites backend cookies for the loopback origin and, on
// the ws-endpoint response, records the worker host the backend advertised so
// /wsworker can reach it. The worker host comes from the trusted backend, never
// from the page, which is what keeps the allowlist trustworthy.
func (s *proxyServer) modifyMainResponse(resp *http.Response) error {
	if err := fixCookies(resp); err != nil {
		return err
	}
	if resp.Request != nil && strings.HasSuffix(resp.Request.URL.Path, "/signal/ws-endpoint") {
		s.recordWorkerEndpoint(resp)
	}
	return nil
}

// maxWorkerEndpointBody bounds how much of the ws-endpoint response is
// buffered to read the worker URL. The payload is a few hundred bytes.
const maxWorkerEndpointBody = 64 << 10

// recordWorkerEndpoint reads the ws-endpoint JSON body and allowlists the host
// of the returned worker URL. The body is buffered and restored so the page
// still receives it unchanged.
func (s *proxyServer) recordWorkerEndpoint(resp *http.Response) {
	if resp.Body == nil || resp.Header.Get("Content-Encoding") != "" {
		return
	}
	head, err := io.ReadAll(io.LimitReader(resp.Body, maxWorkerEndpointBody))
	if err != nil {
		resp.Body = io.NopCloser(bytes.NewReader(head))
		resp.ContentLength = int64(len(head))
		return
	}
	resp.Body = struct {
		io.Reader
		io.Closer
	}{io.MultiReader(bytes.NewReader(head), resp.Body), resp.Body}
	if len(head) >= maxWorkerEndpointBody {
		return
	}
	resp.ContentLength = int64(len(head))

	var payload struct {
		Data struct {
			URL string `json:"url"`
		} `json:"data"`
	}
	if json.Unmarshal(head, &payload) != nil {
		return
	}
	u, err := url.Parse(payload.Data.URL)
	if err != nil || u.Host == "" {
		return
	}
	scheme := strings.ToLower(u.Scheme)
	if scheme == "ws" {
		scheme = "http"
	} else if scheme == "wss" {
		scheme = "https"
	}
	if hp, err := proxyrules.NormalizedHostPort(scheme, u.Host); err == nil {
		s.workerHosts.allow(hp)
	}
}

// fixCookies rewrites backend Set-Cookie headers so they stick to the loopback
// origin: a Secure cookie cannot be stored over plain http, and a Domain
// attribute would break host-only scoping. SameSite is normalized to Lax (the
// page talks to us same-origin, so Lax is all that is needed). The rewriting
// is string-level in the shared proxyrules module: it keeps the backend's
// attribute order and any extension attributes, which browsers accept the same.
func fixCookies(resp *http.Response) error {
	values := resp.Header.Values("Set-Cookie")
	if len(values) == 0 {
		return nil
	}
	resp.Header.Del("Set-Cookie")
	for _, v := range values {
		resp.Header.Add("Set-Cookie", proxyrules.RewriteSetCookie(v))
	}
	return nil
}

// serveDist serves the embedded frontend with an SPA history fallback: any
// path without a file extension falls back to index.html so routes like
// /domain/test or /login work on deep links. A missing URL *with* an extension is a
// real 404 — answering it with index.html would hand an HTML page to a <script>
// tag and turn a build mistake into a confusing MIME error.
func (s *proxyServer) serveDist(w http.ResponseWriter, r *http.Request) {
	if r.URL.Path == "/" {
		startupMark("first page request from the WebView")
	}
	name := strings.TrimPrefix(path.Clean(r.URL.Path), "/")
	if name == "" || name == "." || !fs.ValidPath(name) {
		s.serveIndex(w, r)
		return
	}
	// Compression sidecars written by the build are not public URLs.
	if strings.HasSuffix(name, ".gz") {
		http.NotFound(w, r)
		return
	}
	if s.serveAsset(w, r, name) == nil {
		return
	}
	// An SPA route has no extension and falls back to index.html; a missing
	// asset stays a 404.
	if path.Ext(name) == "" {
		s.serveIndex(w, r)
		return
	}
	http.NotFound(w, r)
}

func (s *proxyServer) serveIndex(w http.ResponseWriter, r *http.Request) {
	if err := s.serveAsset(w, r, "index.html"); err != nil {
		http.Error(w, "frontend not built", http.StatusInternalServerError)
	}
}

// serveAsset writes one embedded file from the in-memory cache. It returns the
// error from loading the asset so callers can fall back (SPA routes) or 404.
//
// Headers set here:
//   - Cache-Control: hashed build output (assets/, chunks/, entries/) is
//     content-addressed, so it can be cached forever; index.html must always be
//     revalidated or an app update would keep loading stale chunk URLs;
//   - ETag + ServeContent: a reload revalidates with a 304 instead of
//     re-downloading ~2 MB of JS;
//   - Content-Encoding: gzip for text assets when the page accepts it (skipped
//     for Range requests, which address the identity encoding).
func (s *proxyServer) serveAsset(w http.ResponseWriter, r *http.Request, name string) error {
	a, err := s.assets.get(s.dist, name)
	if err != nil {
		return err
	}

	h := w.Header()
	h.Set("X-Content-Type-Options", "nosniff")
	h.Set("Cache-Control", cacheControlFor(name))
	// The representation depends on Accept-Encoding in both branches, so Vary
	// must be set unconditionally or a shared cache can serve gzip bytes to a
	// client that did not ask for them.
	h.Set("Vary", "Accept-Encoding")
	// ServeContent sniffs the Content-Type from the (possibly gzipped) body,
	// which labels every compressed asset application/x-gzip. The path is the
	// only trustworthy source, and the .map extension is not in Go's table.
	h.Set("Content-Type", contentTypeFor(name))

	etag := a.etag
	body := a.body
	enc := "identity"
	if a.gz != nil && r.Header.Get("Range") == "" && acceptsGzip(r.Header.Get("Accept-Encoding")) {
		h.Set("Content-Encoding", "gzip")
		etag = strings.TrimSuffix(a.etag, `"`) + `-gz"`
		body = a.gz
		enc = "gzip"
	}
	h.Set("ETag", etag)
	startupMark("serve %s (%d B %s)", name, len(body), enc)

	// ServeContent keeps Range, If-Range, If-None-Match and If-Modified-Since
	// handling (plus HEAD) off our hands.
	http.ServeContent(w, r, name, a.modTime, bytes.NewReader(body))
	return nil
}

// cacheControlFor picks the caching policy for a dist path.
func cacheControlFor(name string) string {
	switch {
	case name == "index.html":
		// Revalidate on every load: it references the hashed chunk names.
		return "no-cache"
	case strings.HasPrefix(name, "assets/"),
		strings.HasPrefix(name, "chunks/"),
		strings.HasPrefix(name, "entries/"):
		return "public, max-age=31536000, immutable"
	default:
		// Unhashed files (favicons, presets/): short cache, revalidate soon.
		return "public, max-age=3600"
	}
}

// contentTypeFor maps a dist path to its media type. Source maps are missing
// from Go's table, and everything else goes through mime.TypeByExtension so
// the browser still gets the charset-bearing type it expects.
func contentTypeFor(name string) string {
	ext := strings.ToLower(path.Ext(name))
	if ext == ".map" {
		return "application/json"
	}
	if ct := mime.TypeByExtension(ext); ct != "" {
		return ct
	}
	return "application/octet-stream"
}

// acceptsGzip reports whether an Accept-Encoding header value allows gzip.
func acceptsGzip(v string) bool {
	for _, part := range strings.Split(v, ",") {
		part = strings.TrimSpace(part)
		if i := strings.IndexByte(part, ';'); i >= 0 {
			part = strings.TrimSpace(part[:i])
		}
		if strings.EqualFold(part, "gzip") {
			return true
		}
	}
	return false
}

// compressibleExtensions are the embedded asset types worth gzipping: text and
// wasm. Images, fonts and icons are already compressed containers.
var compressibleExtensions = map[string]bool{
	".js":   true,
	".mjs":  true,
	".css":  true,
	".html": true,
	".json": true,
	".svg":  true,
	".txt":  true,
	".xml":  true,
	".map":  true,
	".wasm": true,
}

// staticAsset is one file from the embedded dist, held in memory together with
// its gzip encoding and ETag so a page load is a memcpy, not a disk read.
type staticAsset struct {
	body    []byte
	gz      []byte // nil when not compressible / not smaller
	etag    string
	modTime time.Time
}

// assetCache is the read-through cache in front of the embedded dist.
//
// The whole frontend is ~2 MB, so keeping it (plus gzip) resident costs a few
// MB and removes every asset read from the reload path. Loads are serialized:
// they are rare (once per file per process) and this keeps the background
// warm-up from duplicating work the first page load is already doing.
type assetCache struct {
	mu    sync.Mutex
	items map[string]*staticAsset
}

func newAssetCache() *assetCache {
	return &assetCache{items: map[string]*staticAsset{}}
}

// get returns the cached asset, loading and compressing it on first use.
func (c *assetCache) get(dist fs.FS, name string) (*staticAsset, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if a, ok := c.items[name]; ok {
		return a, nil
	}

	f, err := dist.Open(name)
	if err != nil {
		return nil, err
	}
	defer func() { _ = f.Close() }()
	stat, err := f.Stat()
	if err != nil {
		return nil, err
	}
	if stat.IsDir() {
		return nil, fs.ErrNotExist
	}
	body, err := io.ReadAll(f)
	if err != nil {
		return nil, err
	}

	sum := sha256.Sum256(body)
	a := &staticAsset{
		body:    body,
		etag:    `"` + hex.EncodeToString(sum[:8]) + `"`,
		modTime: stat.ModTime(),
	}
	if compressibleExtensions[strings.ToLower(path.Ext(name))] && len(body) >= 512 {
		// Prefer the .gz sidecar the desktop build writes next to each asset
		// (see mygo.config.ts): then a launch compresses nothing at all. The
		// runtime fallback keeps `go run`, `mygo dev` and tests working from a
		// plain dist.
		if gz, err := fs.ReadFile(dist, name+".gz"); err == nil && len(gz) > 0 && len(gz) < len(body) {
			a.gz = gz
		} else if gz, err := gzipBytes(body); err == nil && len(gz) < len(body) {
			a.gz = gz
		}
	}
	c.items[name] = a
	return a, nil
}

// warm pre-loads and pre-compresses every compressible asset, so the first page
// load after launch hits a fully warm cache. Runs in the background; failures
// are irrelevant (the asset is simply loaded on demand later).
func (c *assetCache) warm(dist fs.FS) {
	_ = fs.WalkDir(dist, ".", func(p string, d fs.DirEntry, err error) error {
		if err != nil || d.IsDir() || strings.HasSuffix(p, ".gz") {
			// .gz sidecars are read as part of their asset, not on their own.
			return nil
		}
		if compressibleExtensions[strings.ToLower(path.Ext(p))] {
			_, _ = c.get(dist, p)
		}
		return nil
	})
}

// gzipBytes compresses b at the default level: the balance point for one-off
// work on a few hundred KB of JS (level 9 buys a couple of percent for several
// times the CPU).
func gzipBytes(b []byte) ([]byte, error) {
	var buf bytes.Buffer
	buf.Grow(len(b) / 3)
	zw, err := gzip.NewWriterLevel(&buf, gzip.DefaultCompression)
	if err != nil {
		return nil, err
	}
	if _, err := zw.Write(b); err != nil {
		return nil, err
	}
	if err := zw.Close(); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

// package-level singleton so server_config.go can retarget the proxy.
var loopbackProxy *proxyServer

// proxyLoopbackURL is the "http://127.0.0.1:<port>" the windows load.
var proxyLoopbackURL string

// ensureProxyStarted boots the loopback proxy once and returns its base URL.
func ensureProxyStarted() (string, error) {
	if loopbackProxy != nil {
		return proxyLoopbackURL, nil
	}
	s, base, err := startProxyServer()
	if err != nil {
		return "", err
	}
	loopbackProxy = s
	proxyLoopbackURL = base
	// Apply the persisted base URL (if any) loaded by loadServerConfig.
	loopbackProxy.setProxyTarget(currentBaseURL())
	return proxyLoopbackURL, nil
}

func proxyPort() int {
	if loopbackProxy == nil {
		return 0
	}
	return loopbackProxy.port
}

// probeLoopback checks the local proxy from the host side. It never goes to the
// backend: /healthz is answered by this process.
func probeLoopback(port int) error {
	if port == 0 {
		return errors.New("proxy: not listening")
	}
	client := &http.Client{
		Transport: &http.Transport{Proxy: nil},
		Timeout:   2 * time.Second,
	}
	resp, err := client.Get(fmt.Sprintf("http://127.0.0.1:%d/healthz", port))
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("healthz: status %d", resp.StatusCode)
	}
	return nil
}

// restart closes the listener and serves again, preferring the saved port. The
// target and the in-memory asset cache stay as they are.
func (s *proxyServer) restart() (oldPort, newPort int, err error) {
	oldPort = s.port
	if s.srv != nil {
		_ = s.srv.Close()
	}
	if s.listener != nil {
		_ = s.listener.Close()
	}
	ln, port, lerr := listenLoopback(proxyPortDir())
	if lerr != nil {
		return oldPort, 0, lerr
	}
	s.listener = ln
	s.port = port
	s.srv = &http.Server{
		Handler:           s.handler(),
		ReadHeaderTimeout: 10 * time.Second,
		IdleTimeout:       120 * time.Second,
	}
	go func(srv *http.Server) { _ = srv.Serve(ln) }(s.srv)
	proxyLoopbackURL = fmt.Sprintf("http://127.0.0.1:%d", port)
	return oldPort, port, nil
}
