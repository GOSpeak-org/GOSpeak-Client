package main

import (
	"net"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"
)

// systemProxy answers one question for the transports: "for this URL, which
// proxy should I dial?". A nil result means direct.
//
// Precedence:
//  1. HTTP(S)_PROXY / NO_PROXY in the environment (developer shells, CI, and
//     anyone who launched the app from a terminal);
//  2. the OS setting (macOS SystemConfiguration, read through scutil);
//  3. direct.
//
// Loopback, RFC1918, link-local and *.local targets are always direct: a
// desktop that talks to a backend on the same machine or the same LAN must not
// have that traffic rerouted through whichever proxy app the user happens to
// run. Go's http.ProxyFromEnvironment only understands the environment, so on
// macOS the system setting has to be read explicitly.
type systemProxy struct {
	read func() proxySettings
	env  func(*http.Request) (*url.URL, error)
	ttl  time.Duration

	mu       sync.Mutex
	cached   proxySettings
	loadedAt time.Time
}

type proxySettings struct {
	HTTPEnabled  bool
	HTTPHost     string
	HTTPPort     string
	HTTPSEnabled bool
	HTTPSHost    string
	HTTPSPort    string
	Exceptions   []string
	PAC          string
}

func newSystemProxy() *systemProxy {
	return &systemProxy{read: readSystemProxy, env: http.ProxyFromEnvironment, ttl: 15 * time.Second}
}

// settings returns the OS proxy configuration, refreshed at most every ttl so
// switching modes in a proxy app takes effect without restarting GOSpeak.
func (p *systemProxy) settings() proxySettings {
	if p == nil || p.read == nil {
		return proxySettings{}
	}
	p.mu.Lock()
	defer p.mu.Unlock()
	if p.ttl > 0 && !p.loadedAt.IsZero() && time.Since(p.loadedAt) < p.ttl {
		return p.cached
	}
	p.cached = p.read()
	p.loadedAt = time.Now()
	return p.cached
}

// hook is the http.Transport.Proxy hook backed by the settings above.
func (p *systemProxy) hook() func(*http.Request) (*url.URL, error) {
	return func(req *http.Request) (*url.URL, error) {
		if req == nil || req.URL == nil {
			return nil, nil
		}
		host := req.URL.Hostname()
		if isDirectHost(host) {
			return nil, nil
		}
		if p.env != nil {
			if u, err := p.env(req); err != nil || u != nil {
				return u, err
			}
		}
		settings := p.settings()
		if settings.PAC != "" {
			// PAC evaluation is not implemented: an unreadable PAC must fail
			// open to direct rather than silently black-holing every request.
			return nil, nil
		}
		if hostExcluded(host, settings.Exceptions) {
			return nil, nil
		}
		return settings.proxyFor(req.URL.Scheme)
	}
}

// proxyFor maps a target scheme to the OS proxy entry that covers it.
func (s proxySettings) proxyFor(scheme string) (*url.URL, error) {
	var host, port string
	var enabled bool
	switch strings.ToLower(scheme) {
	case "https", "wss":
		host, port, enabled = s.HTTPSHost, s.HTTPSPort, s.HTTPSEnabled
	default:
		host, port, enabled = s.HTTPHost, s.HTTPPort, s.HTTPEnabled
	}
	if !enabled || host == "" {
		return nil, nil
	}
	host = strings.Trim(host, "[]")
	if port == "" {
		port = "80"
	}
	return &url.URL{Scheme: "http", Host: net.JoinHostPort(host, port)}, nil
}

// isDirectHost reports whether traffic to host must never take a proxy:
// loopback, private, link-local and mDNS names are the desktop's own machine,
// its LAN, or a local dev server.
func isDirectHost(host string) bool {
	h := strings.ToLower(strings.TrimSuffix(strings.Trim(host, "[]"), "."))
	if h == "" {
		return false
	}
	if h == "localhost" || h == "0.0.0.0" {
		return true
	}
	if strings.HasSuffix(h, ".localhost") || strings.HasSuffix(h, ".local") {
		return true
	}
	ip := net.ParseIP(h)
	if ip == nil {
		return false
	}
	return ip.IsLoopback() || ip.IsPrivate() || ip.IsLinkLocalUnicast() || ip.IsUnspecified()
}

// hostExcluded answers the OS proxy's own bypass list. Entries follow the
// forms macOS and browsers use: .example.com (suffix), *.example.com, CIDR and
// exact hosts. "<local>" is a no-op here because those targets are already
// direct (see isDirectHost).
func hostExcluded(host string, rules []string) bool {
	h := strings.ToLower(strings.TrimSuffix(strings.Trim(host, "[]"), "."))
	if h == "" || len(rules) == 0 {
		return false
	}
	ip := net.ParseIP(h)
	for _, rule := range rules {
		r := strings.ToLower(strings.TrimSpace(rule))
		r = strings.TrimSuffix(r, ".")
		switch {
		case r == "" || r == "<local>":
			continue
		case strings.Contains(r, "/"):
			if ip == nil {
				continue
			}
			if _, network, err := net.ParseCIDR(r); err == nil && network.Contains(ip) {
				return true
			}
		case strings.HasPrefix(r, "*."):
			if strings.HasSuffix(h, r[1:]) {
				return true
			}
		case strings.HasPrefix(r, "."):
			if strings.HasSuffix(h, r) {
				return true
			}
		default:
			if h == r {
				return true
			}
		}
	}
	return false
}

// parseScutilProxy reads the ASCII dump printed by "scutil --proxy":
//
//	<dictionary> {
//	  ExceptionsList : <array> {
//	    0 : 127.0.0.1
//	  }
//	  HTTPSEnable : 1
//	  HTTPSPort : 7897
//	  HTTPSProxy : 127.0.0.1
//	}
func parseScutilProxy(out string) proxySettings {
	var settings proxySettings
	inExceptions := false
	for _, line := range strings.Split(out, "\n") {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		if inExceptions {
			if strings.HasPrefix(line, "}") {
				inExceptions = false
				continue
			}
			if _, value, ok := splitScutilEntry(line); ok && value != "" {
				settings.Exceptions = append(settings.Exceptions, value)
			}
			continue
		}
		key, value, ok := splitScutilEntry(line)
		if !ok {
			continue
		}
		switch key {
		case "HTTPEnable":
			settings.HTTPEnabled = value == "1"
		case "HTTPProxy":
			settings.HTTPHost = value
		case "HTTPPort":
			settings.HTTPPort = value
		case "HTTPSEnable":
			settings.HTTPSEnabled = value == "1"
		case "HTTPSProxy":
			settings.HTTPSHost = value
		case "HTTPSPort":
			settings.HTTPSPort = value
		case "ProxyAutoConfigURLString":
			settings.PAC = value
		case "ExceptionsList":
			inExceptions = true
		}
	}
	return settings
}

func splitScutilEntry(line string) (key, value string, ok bool) {
	i := strings.Index(line, " : ")
	if i < 0 {
		return "", "", false
	}
	return strings.TrimSpace(line[:i]), strings.TrimSpace(line[i+3:]), true
}
