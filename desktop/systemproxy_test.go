package main

import (
	"net/http"
	"net/url"
	"testing"
	"time"
)

const scutilFixture = "<dictionary> {\n" +
	"  ExceptionsList : <array> {\n" +
	"    0 : 127.0.0.1\n" +
	"    1 : 192.168.0.0/16\n" +
	"    2 : *.corp.example\n" +
	"  }\n" +
	"  HTTPEnable : 1\n" +
	"  HTTPPort : 7897\n" +
	"  HTTPProxy : 127.0.0.1\n" +
	"  HTTPSEnable : 1\n" +
	"  HTTPSPort : 7897\n" +
	"  HTTPSProxy : 127.0.0.1\n" +
	"  ProxyAutoConfigEnable : 0\n" +
	"}\n"

func TestParseScutilProxy(t *testing.T) {
	settings := parseScutilProxy(scutilFixture)
	if !settings.HTTPEnabled || settings.HTTPHost != "127.0.0.1" || settings.HTTPPort != "7897" {
		t.Fatalf("unexpected http settings: %+v", settings)
	}
	if !settings.HTTPSEnabled || settings.HTTPSHost != "127.0.0.1" || settings.HTTPSPort != "7897" {
		t.Fatalf("unexpected https settings: %+v", settings)
	}
	if len(settings.Exceptions) != 3 || settings.Exceptions[2] != "*.corp.example" {
		t.Fatalf("unexpected exceptions: %v", settings.Exceptions)
	}
	if settings.PAC != "" {
		t.Fatalf("unexpected pac: %q", settings.PAC)
	}
}

func TestParseScutilProxyDisabled(t *testing.T) {
	settings := parseScutilProxy("<dictionary> {\n  HTTPEnable : 0\n  HTTPSEnable : 0\n}\n")
	if settings.HTTPEnabled || settings.HTTPSEnabled {
		t.Fatalf("disabled proxies must stay disabled: %+v", settings)
	}
}

func TestIsDirectHost(t *testing.T) {
	direct := []string{"localhost", "127.0.0.1", "::1", "10.1.2.3", "192.168.0.4", "172.16.5.5", "169.254.1.1", "build.local", "[::1]"}
	for _, host := range direct {
		if !isDirectHost(host) {
			t.Errorf("isDirectHost(%q) = false, want true", host)
		}
	}
	proxied := []string{"gospeak.example.com", "8.8.8.8", "104.21.59.173", ""}
	for _, host := range proxied {
		if isDirectHost(host) {
			t.Errorf("isDirectHost(%q) = true, want false", host)
		}
	}
}

func TestHostExcluded(t *testing.T) {
	rules := []string{"127.0.0.1", "192.168.0.0/16", "*.corp.example", ".internal", "<local>", ""}
	cases := map[string]bool{
		"127.0.0.1":            true,
		"192.168.10.9":         true,
		"10.9.9.9":             false,
		"api.corp.example":     true,
		"example.com":          false,
		"a.internal":           true,
		"internal":             false,
		"gospeak.example.com": false,
	}
	for host, want := range cases {
		if got := hostExcluded(host, rules); got != want {
			t.Errorf("hostExcluded(%q) = %v, want %v", host, got, want)
		}
	}
}

func TestProxyForScheme(t *testing.T) {
	settings := testProxySettings()

	u, err := settings.proxyFor("https")
	if err != nil || u == nil || u.Host != "127.0.0.1:7897" {
		t.Fatalf("https proxy = %v (%v)", u, err)
	}
	u, err = settings.proxyFor("http")
	if err != nil || u == nil || u.Host != "127.0.0.1:7897" {
		t.Fatalf("http proxy = %v (%v)", u, err)
	}

	disabled := proxySettings{}
	if u, err := disabled.proxyFor("https"); err != nil || u != nil {
		t.Fatalf("disabled settings must yield nil, got %v (%v)", u, err)
	}

	withScheme := proxySettings{HTTPSEnabled: true, HTTPSHost: "127.0.0.1"}
	if u, _ := withScheme.proxyFor("https"); u == nil || u.Host != "127.0.0.1:80" {
		t.Fatalf("missing port should default to 80, got %v", u)
	}
}

func TestSystemProxyHookUsesOsSetting(t *testing.T) {
	sys := &systemProxy{
		read: func() proxySettings { return testProxySettings() },
		env:  func(*http.Request) (*url.URL, error) { return nil, nil },
	}
	hook := sys.hook()

	req := &http.Request{URL: &url.URL{Scheme: "https", Host: "gospeak.example.com"}}
	u, err := hook(req)
	if err != nil || u == nil || u.Host != "127.0.0.1:7897" {
		t.Fatalf("hook = %v (%v), want the OS proxy", u, err)
	}

	local := &http.Request{URL: &url.URL{Scheme: "http", Host: "127.0.0.1:8998"}}
	if u, err := hook(local); err != nil || u != nil {
		t.Fatalf("loopback backend must stay direct, got %v (%v)", u, err)
	}
}

func TestSystemProxyEnvWins(t *testing.T) {
	envProxy, _ := url.Parse("http://127.0.0.1:7890")
	sys := &systemProxy{
		read: func() proxySettings { return testProxySettings() },
		env:  func(*http.Request) (*url.URL, error) { return envProxy, nil },
	}
	u, err := sys.hook()(&http.Request{URL: &url.URL{Scheme: "https", Host: "gospeak.example.com"}})
	if err != nil || u == nil || u.Host != "127.0.0.1:7890" {
		t.Fatalf("hook = %v (%v), want the environment proxy", u, err)
	}
}

func TestSystemProxyPacFallsOpenToDirect(t *testing.T) {
	settings := testProxySettings()
	settings.PAC = "http://127.0.0.1/proxy.pac"
	sys := &systemProxy{
		read: func() proxySettings { return settings },
		env:  func(*http.Request) (*url.URL, error) { return nil, nil },
	}
	u, err := sys.hook()(&http.Request{URL: &url.URL{Scheme: "https", Host: "gospeak.example.com"}})
	if err != nil || u != nil {
		t.Fatalf("an unreadable PAC must fall open to direct, got %v (%v)", u, err)
	}
}

func TestSystemProxySettingsCached(t *testing.T) {
	reads := 0
	sys := &systemProxy{
		read: func() proxySettings { reads++; return testProxySettings() },
		ttl:  time.Minute,
	}
	_ = sys.settings()
	_ = sys.settings()
	if reads != 1 {
		t.Fatalf("settings re-read %d times, want 1 while cached", reads)
	}
}
