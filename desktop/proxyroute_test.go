package main

import (
	"context"
	"errors"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strconv"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

// stubTransport stands in for one upstream hop.
type stubTransport struct {
	calls int32
	err   error
}

func (s *stubTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	atomic.AddInt32(&s.calls, 1)
	if s.err != nil {
		return nil, s.err
	}
	return &http.Response{
		StatusCode: http.StatusOK,
		Header:     http.Header{},
		Body:       io.NopCloser(strings.NewReader("upstream")),
		Request:    req,
	}, nil
}

func (s *stubTransport) count() int { return int(atomic.LoadInt32(&s.calls)) }

func testProxySettings() proxySettings {
	return proxySettings{
		HTTPSEnabled: true,
		HTTPSHost:    "127.0.0.1",
		HTTPSPort:    "7897",
		HTTPEnabled:  true,
		HTTPHost:     "127.0.0.1",
		HTTPPort:     "7897",
	}
}

func newTestRouter(t *testing.T, target string, direct, proxied http.RoundTripper) *upstreamRouter {
	t.Helper()
	u, err := url.Parse(target)
	if err != nil {
		t.Fatalf("parse target: %v", err)
	}
	sys := &systemProxy{
		read: func() proxySettings { return testProxySettings() },
		env:  func(*http.Request) (*url.URL, error) { return nil, nil },
	}
	return newUpstreamRouter(func() *url.URL { return u }, direct, proxied, sys)
}

func newTestRequest(t *testing.T, method, target string, body io.Reader) *http.Request {
	t.Helper()
	req, err := http.NewRequestWithContext(context.Background(), method, target, body)
	if err != nil {
		t.Fatalf("new request: %v", err)
	}
	return req
}

var errDial = &net.OpError{Op: "dial", Net: "tcp", Err: errors.New("connect: connection refused")}

func TestRouterKeepsDirectWhenHealthy(t *testing.T) {
	direct, proxied := &stubTransport{}, &stubTransport{}
	router := newTestRouter(t, "https://gospeak.example.com", direct, proxied)

	resp, err := router.RoundTrip(newTestRequest(t, http.MethodGet, "https://gospeak.example.com/api/v1/x", nil))
	if err != nil {
		t.Fatalf("round trip: %v", err)
	}
	resp.Body.Close()
	if proxied.count() != 0 {
		t.Fatalf("proxy used %d times, want 0: a healthy direct path must not touch the proxy", proxied.count())
	}
	if got := router.RouteName(); got != "direct" {
		t.Fatalf("route = %q, want direct", got)
	}
}

func TestRouterFallsBackToProxyOnDialError(t *testing.T) {
	direct := &stubTransport{err: errDial}
	proxied := &stubTransport{}
	router := newTestRouter(t, "https://gospeak.example.com", direct, proxied)

	resp, err := router.RoundTrip(newTestRequest(t, http.MethodPost, "https://gospeak.example.com/api/v1/domain/list-public", nil))
	if err != nil {
		t.Fatalf("round trip: %v, want the proxy retry to answer", err)
	}
	resp.Body.Close()
	if proxied.count() != 1 {
		t.Fatalf("proxy used %d times, want 1", proxied.count())
	}
	if got := router.RouteName(); got != "proxy" {
		t.Fatalf("route = %q, want proxy", got)
	}
	if got := router.FallbackCount(); got != 1 {
		t.Fatalf("fallbacks = %d, want 1", got)
	}
}

func TestRouterDoesNotReplayRequestWithBody(t *testing.T) {
	direct := &stubTransport{err: errDial}
	proxied := &stubTransport{}
	router := newTestRouter(t, "https://gospeak.example.com", direct, proxied)

	req := newTestRequest(t, http.MethodPost, "https://gospeak.example.com/api/v1/room", strings.NewReader("payload"))
	if _, err := router.RoundTrip(req); err == nil {
		t.Fatal("expected the direct failure to surface instead of replaying a body")
	}
	if proxied.count() != 0 {
		t.Fatalf("proxy used %d times, want 0: a consumed body must not be replayed", proxied.count())
	}
	if got := router.RouteName(); got != "proxy" {
		t.Fatalf("route = %q, want proxy so the next request uses it", got)
	}
}

func TestRouterFallsBackToDirectWhenProxyFails(t *testing.T) {
	direct := &stubTransport{}
	proxied := &stubTransport{err: errDial}
	router := newTestRouter(t, "https://gospeak.example.com", direct, proxied)
	router.mode.Store(routeProxy)

	resp, err := router.RoundTrip(newTestRequest(t, http.MethodGet, "https://gospeak.example.com/api/v1/x", nil))
	if err != nil {
		t.Fatalf("round trip: %v, want the direct retry to answer", err)
	}
	resp.Body.Close()
	if direct.count() != 1 {
		t.Fatalf("direct used %d times, want 1", direct.count())
	}
	if got := router.RouteName(); got != "direct" {
		t.Fatalf("route = %q, want direct", got)
	}
}

func TestRouterProbePromotesDirectAgain(t *testing.T) {
	direct := &stubTransport{err: errDial}
	proxied := &stubTransport{}
	router := newTestRouter(t, "https://gospeak.example.com", direct, proxied)

	resp, err := router.RoundTrip(newTestRequest(t, http.MethodGet, "https://gospeak.example.com/api/v1/x", nil))
	if err != nil {
		t.Fatalf("the proxy retry should have answered: %v", err)
	}
	resp.Body.Close()
	if got := router.RouteName(); got != "proxy" {
		t.Fatalf("route = %q, want proxy", got)
	}

	probed := make(chan struct{})
	router.probe = func(context.Context, *url.URL) error {
		close(probed)
		return nil
	}
	router.mu.Lock()
	router.lastProbe = time.Time{}
	router.mu.Unlock()

	resp, err = router.RoundTrip(newTestRequest(t, http.MethodGet, "https://gospeak.example.com/api/v1/x", nil))
	if err != nil {
		t.Fatalf("proxy request while probing: %v", err)
	}
	resp.Body.Close()
	select {
	case <-probed:
	case <-time.After(2 * time.Second):
		t.Fatal("probe never ran")
	}
	deadline := time.Now().Add(2 * time.Second)
	for router.RouteName() != "direct" {
		if time.Now().After(deadline) {
			t.Fatal("a healthy probe must promote the direct route")
		}
		time.Sleep(10 * time.Millisecond)
	}
}

func TestRouterNeverUsesProxyForPrivateBackend(t *testing.T) {
	direct := &stubTransport{err: errDial}
	proxied := &stubTransport{}
	router := newTestRouter(t, "http://127.0.0.1:8998", direct, proxied)

	if _, err := router.RoundTrip(newTestRequest(t, http.MethodGet, "http://127.0.0.1:8998/api/v1/x", nil)); err == nil {
		t.Fatal("expected the direct failure")
	}
	if proxied.count() != 0 {
		t.Fatalf("proxy used %d times: a loopback backend must stay direct", proxied.count())
	}
}

func TestSafeToFallback(t *testing.T) {
	cases := []struct {
		name   string
		method string
		err    error
		want   bool
	}{
		{"nil", http.MethodGet, nil, false},
		{"dial", http.MethodPost, errDial, true},
		{"dns", http.MethodPost, &net.DNSError{Err: "no such host", Name: "x"}, true},
		{"tls handshake", http.MethodPost, errors.New("net/http: TLS handshake timeout"), true},
		{"refused", http.MethodPost, errors.New("dial tcp 1.2.3.4:443: connect: connection refused"), true},
		{"reset on GET", http.MethodGet, errors.New("read tcp: connection reset by peer"), true},
		{"reset on POST", http.MethodPost, errors.New("read tcp: connection reset by peer"), false},
		{"canceled", http.MethodGet, context.Canceled, false},
		{"certificate", http.MethodGet, errors.New("x509: certificate signed by unknown authority"), false},
	}
	for _, tc := range cases {
		if got := safeToFallback(tc.method, tc.err); got != tc.want {
			t.Errorf("%s: safeToFallback = %v, want %v", tc.name, got, tc.want)
		}
	}
}

func TestCanRetryRequestGuardsBody(t *testing.T) {
	base := newTestRequest(t, http.MethodPost, "https://gospeak.example.com/x", nil)
	if !canRetryRequest(base, errDial) {
		t.Fatal("an empty-body POST that never reached the backend is safe to retry")
	}

	withBody := newTestRequest(t, http.MethodPost, "https://gospeak.example.com/x", strings.NewReader("x"))
	if canRetryRequest(withBody, errDial) {
		t.Fatal("a request with a body must not be replayed")
	}

	canceledCtx, cancel := context.WithCancel(context.Background())
	cancel()
	req := newTestRequest(t, http.MethodGet, "https://gospeak.example.com/x", nil).WithContext(canceledCtx)
	if canRetryRequest(req, errDial) {
		t.Fatal("a canceled request must not be retried")
	}
}

// TestMultiDialContextReachesHealthyAddress covers the failure that started
// this: a name with several A records where one address is black-holed. The
// dialer must not stop at the first address.
func TestMultiDialContextReachesHealthyAddress(t *testing.T) {
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("listen: %v", err)
	}
	defer listener.Close()

	port := listener.Addr().(*net.TCPAddr).Port
	dial := multiDialContext(&net.Dialer{Timeout: time.Second}, time.Second, 50*time.Millisecond)
	conn, err := dial(context.Background(), "tcp", net.JoinHostPort("localhost", strconv.Itoa(port)))
	if err != nil {
		t.Fatalf("dial localhost: %v", err)
	}
	conn.Close()
}

func TestWithinHeaderBudgetSkipsLargeUploads(t *testing.T) {
	empty := newTestRequest(t, http.MethodPost, "https://gospeak.example.com/x", nil)
	if !withinHeaderBudget(empty) {
		t.Fatal("an empty-body request may carry the header deadline")
	}

	small := newTestRequest(t, http.MethodPost, "https://gospeak.example.com/x", strings.NewReader("{}"))
	small.ContentLength = 2
	if !withinHeaderBudget(small) {
		t.Fatal("a small JSON body uploads well inside the deadline")
	}

	large := newTestRequest(t, http.MethodPost, "https://gospeak.example.com/x", strings.NewReader("x"))
	large.ContentLength = maxBodyForHeaderBudget + 1
	if withinHeaderBudget(large) {
		t.Fatal("a large upload must not be cut off by the header deadline")
	}

	streamed := newTestRequest(t, http.MethodPost, "https://gospeak.example.com/x", strings.NewReader("x"))
	streamed.ContentLength = -1
	if withinHeaderBudget(streamed) {
		t.Fatal("an unknown-length body must not be cut off by the header deadline")
	}
}

func TestProbeTargetReportsFailureForClosedPort(t *testing.T) {
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("listen: %v", err)
	}
	addr := listener.Addr().(*net.TCPAddr)
	listener.Close()

	target, _ := url.Parse("http://" + net.JoinHostPort("127.0.0.1", strconv.Itoa(addr.Port)) + "/")
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	if err := probeTarget(ctx, target); err == nil {
		t.Fatal("probing a closed port must fail")
	}
}

func TestProbeTargetReachesLiveListener(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {}))
	defer srv.Close()

	target, _ := url.Parse(srv.URL + "/")
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	if err := probeTarget(ctx, target); err != nil {
		t.Fatalf("probe live listener: %v", err)
	}
}
