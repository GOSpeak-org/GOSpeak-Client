package main

import (
	"bytes"
	"compress/gzip"
	"context"
	"encoding/json"
	"errors"
	"io"
	"io/fs"
	"net"
	"net/http"
	"net/http/httptest"
	"net/http/httputil"
	"net/url"
	"path"
	"strconv"
	"strings"
	"testing"
	"testing/fstest"
	"time"
)

// testDist is a miniature frontend dist: one hashed asset big enough to be
// worth gzipping, one unhashed file, and the SPA entry point.
func testDist() fstest.MapFS {
	long := strings.Repeat("body{color:#fff}", 200) // ~2.8 KB of compressible text
	return fstest.MapFS{
		"index.html": {
			Data:    []byte("<!doctype html><title>GOSpeak</title>"),
			ModTime: time.Now(),
		},
		"assets/index.abc123.css": {
			Data:    []byte(long),
			ModTime: time.Now(),
		},
		"favicon.ico": {
			Data:    []byte("not-really-an-ico"),
			ModTime: time.Now(),
		},
	}
}

func newServeTestServer() *proxyServer {
	return &proxyServer{dist: testDist(), assets: newAssetCache(), transport: newProxyRoundTripper()}
}

// newTestReverseProxy builds the same proxy wiring as startProxyServer without
// binding a loopback port.
func newTestReverseProxy(s *proxyServer) *httputil.ReverseProxy {
	return &httputil.ReverseProxy{
		Director:       s.directMain,
		ModifyResponse: fixCookies,
		Transport:      s.transport,
		ErrorHandler:   s.proxyErrorHandler,
	}
}

// do runs one request through serveDist.
func do(s *proxyServer, target string, header map[string]string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(http.MethodGet, target, nil)
	for k, v := range header {
		req.Header.Set(k, v)
	}
	rec := httptest.NewRecorder()
	s.serveDist(rec, req)
	return rec
}

func TestServeDistGzipsHashedAssetsAndCachesThemForever(t *testing.T) {
	s := newServeTestServer()
	rec := do(s, "/assets/index.abc123.css", map[string]string{"Accept-Encoding": "gzip, deflate"})

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	if got := rec.Header().Get("Content-Encoding"); got != "gzip" {
		t.Fatalf("Content-Encoding = %q, want gzip", got)
	}
	if got := rec.Header().Get("Cache-Control"); got != "public, max-age=31536000, immutable" {
		t.Fatalf("Cache-Control = %q, want immutable", got)
	}
	if rec.Header().Get("ETag") == "" {
		t.Fatal("missing ETag")
	}
	if got := rec.Header().Get("Vary"); got != "Accept-Encoding" {
		t.Fatalf("Vary = %q, want Accept-Encoding", got)
	}

	zr, err := gzip.NewReader(bytes.NewReader(rec.Body.Bytes()))
	if err != nil {
		t.Fatalf("gzip reader: %v", err)
	}
	plain, err := io.ReadAll(zr)
	if err != nil {
		t.Fatalf("gunzip: %v", err)
	}
	if want := strings.Repeat("body{color:#fff}", 200); string(plain) != want {
		t.Fatalf("decompressed body mismatch: %d bytes", len(plain))
	}
	if rec.Body.Len() >= len(plain) {
		t.Fatalf("compressed body (%d) not smaller than plain (%d)", rec.Body.Len(), len(plain))
	}
}

func TestServeDistIdentityEncodingWhenGzipNotAccepted(t *testing.T) {
	s := newServeTestServer()
	rec := do(s, "/assets/index.abc123.css", nil)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	if got := rec.Header().Get("Content-Encoding"); got != "" {
		t.Fatalf("Content-Encoding = %q, want none", got)
	}
	if rec.Body.Len() != len(strings.Repeat("body{color:#fff}", 200)) {
		t.Fatalf("body length = %d, want uncompressed length", rec.Body.Len())
	}
}

func TestServeDistRevalidatesWithETag(t *testing.T) {
	s := newServeTestServer()
	first := do(s, "/index.html", nil)
	etag := first.Header().Get("ETag")
	if etag == "" {
		t.Fatal("missing ETag")
	}

	second := do(s, "/index.html", map[string]string{"If-None-Match": etag})
	if second.Code != http.StatusNotModified {
		t.Fatalf("status = %d, want 304", second.Code)
	}
	if second.Body.Len() != 0 {
		t.Fatalf("304 carried a body of %d bytes", second.Body.Len())
	}
}

func TestServeIndexIsNeverCachedBlindly(t *testing.T) {
	s := newServeTestServer()
	for _, target := range []string{"/", "/domain/test"} {
		rec := do(s, target, nil)
		if rec.Code != http.StatusOK {
			t.Fatalf("%s: status = %d, want 200", target, rec.Code)
		}
		if got := rec.Header().Get("Cache-Control"); got != "no-cache" {
			t.Fatalf("%s: Cache-Control = %q, want no-cache", target, got)
		}
		if !strings.Contains(rec.Body.String(), "GOSpeak") {
			t.Fatalf("%s: did not fall back to index.html", target)
		}
	}
}

func TestServeDistMissingAssetIs404NotIndex(t *testing.T) {
	s := newServeTestServer()
	rec := do(s, "/chunks/gone.abc123.js", nil)
	if rec.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404", rec.Code)
	}
}

func TestServeDistUnhashedFileGetsShortCache(t *testing.T) {
	s := newServeTestServer()
	rec := do(s, "/favicon.ico", nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	if got := rec.Header().Get("Cache-Control"); got != "public, max-age=3600" {
		t.Fatalf("Cache-Control = %q, want short cache", got)
	}
}

func TestProxyWithoutTargetReturnsConfiguredJSONError(t *testing.T) {
	s := newServeTestServer()
	s.mainProxy = newTestReverseProxy(s)
	rec := httptest.NewRecorder()
	s.handleProxied(rec, httptest.NewRequest(http.MethodGet, "/api/v1/health", nil))

	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("status = %d, want 503", rec.Code)
	}
	var body struct {
		Code int `json:"code"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if body.Code != 6001 {
		t.Fatalf("code = %d, want 6001", body.Code)
	}
}

func TestProxyErrorHandlerReturnsUnifiedEnvelope(t *testing.T) {
	s := &proxyServer{assets: newAssetCache(), transport: newProxyRoundTripper()}
	s.mainProxy = newTestReverseProxy(s)
	// Port 1 is privileged and (in practice) closed: the dial fails fast.
	s.setProxyTarget("http://127.0.0.1:1")

	rec := httptest.NewRecorder()
	s.handleProxied(rec, httptest.NewRequest(http.MethodGet, "/api/v1/health", nil))

	if rec.Code != http.StatusBadGateway {
		t.Fatalf("status = %d, want 502", rec.Code)
	}
	var body struct {
		Code int `json:"code"`
		Data any `json:"data"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if body.Code != 6002 {
		t.Fatalf("code = %d, want 6002", body.Code)
	}
	if body.Data != nil {
		t.Fatalf("data = %v, want null", body.Data)
	}
}

// requireBuiltDist skips tests that need the real frontend build. webui/dist is
// generated (mygo.config.ts buildCommand) and untracked, so a checkout without
// a build must not fail here. The embed directive still needs the directory to
// exist at compile time; this covers the directory existing but being empty or
// holding only a placeholder.
//
// index.html is the only file required: the build writes .gz sidecars next to
// the assets, but the host compresses at runtime when they are absent, and the
// release chain embeds app/web/dist as-is (no sidecars). The .gz check would
// therefore skip these tests in CI, where the coverage matters most.
func requireBuiltDist(t *testing.T) fs.FS {
	t.Helper()
	sub, err := fs.Sub(embeddedDist, "webui/dist")
	if err != nil {
		t.Skipf("webui/dist is not embedded (%v); run the desktop build", err)
	}
	if _, err := fs.Stat(sub, "index.html"); err != nil {
		t.Skipf("webui/dist/index.html is missing (%v); run the desktop build (mygo build or the mygo.config.ts buildCommand)", err)
	}
	return sub
}

// TestEmbeddedDistEndToEnd exercises the production embed FS: the real
// index.html must be served gzipped with a revalidating cache policy, and every
// hashed asset it references must resolve (a build/embed mismatch shows up here
// instead of as a blank window).
func TestEmbeddedDistEndToEnd(t *testing.T) {
	sub := requireBuiltDist(t)
	s := &proxyServer{dist: sub, assets: newAssetCache()}

	index := do(s, "/index.html", map[string]string{"Accept-Encoding": "gzip"})
	if index.Code != http.StatusOK {
		t.Fatalf("index status = %d", index.Code)
	}
	if index.Header().Get("Content-Encoding") != "gzip" {
		t.Fatal("index.html not gzipped")
	}

	var refs []string
	// Walk the decompressed HTML for absolute asset paths.
	zr, err := gzip.NewReader(bytes.NewReader(index.Body.Bytes()))
	if err != nil {
		t.Fatalf("gzip: %v", err)
	}
	html, err := io.ReadAll(zr)
	if err != nil {
		t.Fatalf("read: %v", err)
	}
	for _, part := range strings.Split(string(html), `"`) {
		if strings.HasPrefix(part, "/") && path.Ext(part) != "" {
			refs = append(refs, part)
		}
	}
	if len(refs) == 0 {
		t.Fatal("index.html references no assets")
	}

	var plainTotal, gzTotal int
	for _, ref := range refs {
		a, err := s.assets.get(sub, strings.TrimPrefix(ref, "/"))
		if err != nil {
			t.Fatalf("asset %s referenced by index.html is missing: %v", ref, err)
		}
		plainTotal += len(a.body)
		if a.gz != nil {
			gzTotal += len(a.gz)
		} else {
			gzTotal += len(a.body)
		}
	}
	t.Logf("index.html references %d assets: %d KiB plain -> %d KiB gzipped",
		len(refs), plainTotal/1024, gzTotal/1024)
	if gzTotal >= plainTotal {
		t.Fatalf("gzip did not shrink the referenced assets (%d >= %d)", gzTotal, plainTotal)
	}
}

// TestHandlerServesRealDistOverHTTP runs the real route table and embed FS
// through an actual HTTP server, covering what the WebView sees: the page, an
// SPA deep link, a hashed chunk, and the API prefix with no backend configured.
func TestHandlerServesRealDistOverHTTP(t *testing.T) {
	sub := requireBuiltDist(t)
	s := &proxyServer{dist: sub, assets: newAssetCache(), transport: newProxyRoundTripper()}
	s.mainProxy = newTestReverseProxy(s)
	ts := httptest.NewServer(s.handler())
	defer ts.Close()

	client := ts.Client() // sends Accept-Encoding: gzip and decompresses transparently

	page, err := client.Get(ts.URL + "/")
	if err != nil {
		t.Fatalf("GET /: %v", err)
	}
	defer func() { _ = page.Body.Close() }()
	if page.StatusCode != http.StatusOK {
		t.Fatalf("GET / status = %d", page.StatusCode)
	}
	if !page.Uncompressed {
		t.Error("GET / was not gzip-compressed")
	}
	body, _ := io.ReadAll(page.Body)
	if !bytes.Contains(body, []byte("GOSpeak")) {
		t.Error("GET / did not return the frontend")
	}

	deep, err := client.Get(ts.URL + "/domain/test")
	if err != nil {
		t.Fatalf("GET /domain/test: %v", err)
	}
	defer func() { _ = deep.Body.Close() }()
	if deep.StatusCode != http.StatusOK {
		t.Fatalf("SPA deep link status = %d, want 200", deep.StatusCode)
	}

	api, err := client.Get(ts.URL + "/api/v1/health")
	if err != nil {
		t.Fatalf("GET /api/v1/health: %v", err)
	}
	defer func() { _ = api.Body.Close() }()
	if api.StatusCode != http.StatusServiceUnavailable {
		t.Fatalf("unconfigured API status = %d, want 503", api.StatusCode)
	}
}

// TestServeDistPrefersPrecompressedSidecar covers the packaged-app path: the
// build writes a .gz next to each asset, and the host must serve that instead of
// compressing at launch.
func TestServeDistPrefersPrecompressedSidecar(t *testing.T) {
	var buf bytes.Buffer
	zw := gzip.NewWriter(&buf)
	if _, err := zw.Write([]byte("sidecar-payload")); err != nil {
		t.Fatalf("gzip: %v", err)
	}
	if err := zw.Close(); err != nil {
		t.Fatalf("gzip close: %v", err)
	}

	dist := fstest.MapFS{
		"chunks/sidecar.js": {
			Data:    []byte(strings.Repeat("raw-body-", 200)),
			ModTime: time.Now(),
		},
		"chunks/sidecar.js.gz": {
			Data:    buf.Bytes(),
			ModTime: time.Now(),
		},
	}
	s := &proxyServer{dist: dist, assets: newAssetCache()}

	rec := do(s, "/chunks/sidecar.js", map[string]string{"Accept-Encoding": "gzip"})
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	if rec.Header().Get("Content-Encoding") != "gzip" {
		t.Fatal("not served gzipped")
	}
	if got := rec.Body.Bytes(); !bytes.Equal(got, buf.Bytes()) {
		t.Fatal("served bytes are not the precompressed sidecar")
	}

	// A direct request for the sidecar is not a public URL.
	if rec := do(s, "/chunks/sidecar.js.gz", nil); rec.Code != http.StatusNotFound {
		t.Fatalf("sidecar status = %d, want 404", rec.Code)
	}
}

func TestAcceptsGzip(t *testing.T) {
	cases := map[string]bool{
		"":                    false,
		"gzip":                true,
		"deflate, gzip;q=0.5": true,
		"br, GZIP":            true,
		"deflate":             false,
		"notgzip":             false,
		"gzip;q=0":            true, // 简化实现：不按 q 值降级
	}
	for in, want := range cases {
		if got := acceptsGzip(in); got != want {
			t.Errorf("acceptsGzip(%q) = %v, want %v", in, got, want)
		}
	}
}

func TestProxyTransportKeepsHTTP11ForWebSockets(t *testing.T) {
	tr := proxyTransport()
	if tr.ForceAttemptHTTP2 {
		t.Fatal("ForceAttemptHTTP2 must stay off: Go's HTTP/2 client rejects the Connection/Upgrade headers of a WebSocket handshake")
	}
	if tr.TLSNextProto == nil || len(tr.TLSNextProto) != 0 {
		t.Fatal("TLSNextProto must be an empty non-nil map so TLS backends never negotiate HTTP/2")
	}
}

func TestProxyRoundTripperDowngradesOnlyUpgrades(t *testing.T) {
	rt := newProxyRoundTripper()
	if rt.http2 == nil || !rt.http2.ForceAttemptHTTP2 || rt.http2.TLSNextProto != nil {
		t.Fatal("non-upgrade traffic must keep HTTP/2: API calls should not be forced onto HTTP/1.1")
	}

	upgrade := &http.Request{Header: http.Header{
		"Connection": {"Upgrade"},
		"Upgrade":    {"websocket"},
	}}
	if !isUpgradeRequest(upgrade) {
		t.Fatal("a WebSocket handshake must route to the HTTP/1.1 transport")
	}
	plain := &http.Request{Header: http.Header{"Accept": {"application/json"}}}
	if isUpgradeRequest(plain) {
		t.Fatal("a plain API request must not be treated as a protocol upgrade")
	}
}

func TestClassifyProxyError(t *testing.T) {
	cases := []struct {
		name string
		err  error
		want string
	}{
		{"nil", nil, ""},
		{"dns", &net.DNSError{Err: "no such host", Name: "x"}, "dns"},
		{"timeout", context.DeadlineExceeded, "timeout"},
		{"refused", errors.New("dial tcp 127.0.0.1:8998: connect: connection refused"), "refused"},
		{"other", errors.New("boom"), "other"},
	}
	for _, tc := range cases {
		if got := classifyProxyError(tc.err); got != tc.want {
			t.Errorf("%s: got %q, want %q", tc.name, got, tc.want)
		}
	}
}

func TestHealthzReportsLivenessWithoutTarget(t *testing.T) {
	s := &proxyServer{assets: newAssetCache(), transport: newProxyRoundTripper(), port: 47000}
	rec := httptest.NewRecorder()
	s.handleHealthz(rec, httptest.NewRequest(http.MethodGet, "/healthz", nil))

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	var body struct {
		OK     bool   `json:"ok"`
		Port   int    `json:"port"`
		Target string `json:"target"`
		Last   string `json:"last_upstream_error"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if !body.OK || body.Port != 47000 || body.Target != "" || body.Last != "" {
		t.Fatalf("unexpected body: %+v", body)
	}
}

func TestProxyErrorHandlerRecordsUpstreamError(t *testing.T) {
	s := &proxyServer{assets: newAssetCache(), transport: newProxyRoundTripper()}
	rec := httptest.NewRecorder()
	s.proxyErrorHandler(rec, httptest.NewRequest(http.MethodGet, "/api/v1/x", nil), errors.New("dial tcp: connect: connection refused"))

	if got := s.UpstreamError(); got != "refused" {
		t.Fatalf("UpstreamError() = %q, want refused", got)
	}
	if rec.Code != http.StatusBadGateway {
		t.Fatalf("status = %d, want 502", rec.Code)
	}
}

func TestProbeLoopbackHealthyServer(t *testing.T) {
	s := &proxyServer{dist: testDist(), assets: newAssetCache(), transport: newProxyRoundTripper()}
	s.port = 1
	mux := http.NewServeMux()
	mux.HandleFunc("/healthz", s.handleHealthz)
	srv := httptest.NewServer(mux)
	defer srv.Close()

	u, _ := url.Parse(srv.URL)
	port, _ := strconv.Atoi(u.Port())
	if err := probeLoopback(port); err != nil {
		t.Fatalf("probe healthy server: %v", err)
	}
}

func TestProbeLoopbackClosedPort(t *testing.T) {
	if err := probeLoopback(1); err == nil {
		t.Fatal("expected an error probing a closed port")
	}
}
