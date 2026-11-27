package main

import (
	"encoding/json"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"sync"
	"time"

	"github.com/egoist/mygo"

	"gospeak/proxyrules"
)

// ServerConfig exposes the backend base URL the desktop client connects to.
//
// The base URL is persisted to the app's user-data directory so it survives
// restarts and can be changed either before login (login-screen field) or from
// the settings UI. JSON tags must stay in sync with the TS side
// (packages/desktop/src/capabilities/server.ts and app/web/src/config/server.ts).
type ServerConfig struct{}

type serverConfigFile struct {
	BaseURL string `json:"baseUrl"`
}

var (
	serverConfigMu sync.Mutex
	serverBaseURL  string
)

const serverConfigFileName = "server-config.json"

// clearHostCookies drops the loopback origin's cookie jar when the server
// changes. A variable so tests can stub it: the real call waits for the host
// runtime and blocks forever outside a running app.
var clearHostCookies = func() {
	_ = mygo.Cookies.Clear()
}

// loadServerConfig reads the persisted base URL (if any) from user data. Safe to
// call once during startup; failures are non-fatal (base URL stays "").
func loadServerConfig() {
	dir, err := mygo.App.Path(mygo.PathUserData)
	if err != nil {
		return
	}
	path := filepath.Join(dir, serverConfigFileName)
	data, err := os.ReadFile(path)
	if err != nil {
		return // no config yet
	}
	var cfg serverConfigFile
	if err := json.Unmarshal(data, &cfg); err != nil {
		backup, _ := backupCorruptConfig(path)
		log.Printf("[GOSpeak] server config is corrupt, backed up to %s", backup)
		return
	}
	normalized := proxyrules.NormalizeBaseURL(cfg.BaseURL)
	if err := validateBaseURL(normalized); err != nil {
		backup, _ := backupCorruptConfig(path)
		log.Printf("[GOSpeak] server config is invalid (%v), backed up to %s", err, backup)
		return
	}
	serverConfigMu.Lock()
	serverBaseURL = normalized
	serverConfigMu.Unlock()
	// A config written by an older build may still carry a trailing slash; rewrite
	// it so the file always holds the canonical form the UI shows.
	if normalized != cfg.BaseURL {
		writeServerConfigFile(path, normalized)
	}
}

// writeServerConfigFile rewrites the persisted config. Failures are non-fatal:
// the in-memory value stays in charge for this run.
func writeServerConfigFile(path, baseURL string) {
	encoded, err := json.MarshalIndent(serverConfigFile{BaseURL: baseURL}, "", "  ")
	if err != nil {
		return
	}
	_ = os.WriteFile(path, encoded, 0o644)
}

// backupCorruptConfig moves a damaged config aside so the next launch starts
// clean while the old file stays available for diagnosis.
func backupCorruptConfig(path string) (string, error) {
	backup := fmt.Sprintf("%s.corrupt-%d", path, time.Now().Unix())
	if err := os.Rename(path, backup); err != nil {
		return "", err
	}
	return backup, nil
}

// currentBaseURL returns the in-memory configured base URL ("" when unset).
func currentBaseURL() string {
	serverConfigMu.Lock()
	defer serverConfigMu.Unlock()
	return serverBaseURL
}

// GetBaseURL returns the configured backend base URL ("" when unset).
func (ServerConfig) GetBaseURL() string {
	return currentBaseURL()
}

// validateBaseURL reports whether raw is acceptable as a backend base URL.
// An empty value is valid and means "no server configured". Anything else must
// be an absolute http(s) URL with a host; the message is shown to the user.
// The rule itself lives in the shared proxyrules module (also used by mobile).
func validateBaseURL(raw string) error {
	return proxyrules.ValidateBaseURL(raw)
}

// SetBaseURL persists a new backend base URL and immediately connects to it:
// the loopback proxy target is switched and the windows reload, so the page
// keeps a single same-origin view of the new server. An empty value clears the
// stored URL (proxy then answers API calls with 503 until configured).
//
// An invalid URL returns an error and changes nothing: the previous base URL
// stays in memory and on disk, the proxy target and the pages are untouched.
// The error return is what makes the TS side's rollback branch reachable —
// mygo resolves bound calls without an error result to a fulfilled promise.
func (ServerConfig) SetBaseURL(newURL string) error {
	// "https://host/" and "https://host" are the same server: persist only the
	// canonical form so the file, the UI field and later comparisons agree.
	newURL = proxyrules.NormalizeBaseURL(newURL)
	if err := validateBaseURL(newURL); err != nil {
		return err
	}
	previous := currentBaseURL()

	// Persist to user data.
	dir, derr := mygo.App.Path(mygo.PathUserData)
	if derr == nil {
		if mkErr := os.MkdirAll(dir, 0o755); mkErr == nil {
			writeServerConfigFile(filepath.Join(dir, serverConfigFileName), newURL)
		}
	}
	// Cannot resolve user data: keep in memory only.
	serverConfigMu.Lock()
	serverBaseURL = newURL
	serverConfigMu.Unlock()

	// Switching servers must not carry the previous server's session over:
	// the cookies live on the loopback origin, and the page keeps the cached
	// user plus the session expiry in localStorage. The overlay's avatars come
	// from the old server too, so their cache goes with it.
	if newURL != previous {
		clearHostCookies()
		clearPageSessionCache()
		overlayAvatars.clear()
	}

	// Apply live: swap proxy target, then reload the pages so they re-resolve
	// their session against the (new) server. Same origin before and after —
	// no CORS involved anywhere.
	if loopbackProxy != nil {
		loopbackProxy.setProxyTarget(newURL)
	}
	reloadAllWindows()
	return nil
}

// clearPageSessionCache drops the cached user and session expiry the web app
// keeps in localStorage. They are keyed by the loopback origin, which stays the
// same across servers, so they have to be cleared explicitly.
func clearPageSessionCache() {
	if mainWindow == nil {
		return
	}
	p := mainWindow.Page()
	if p == nil {
		return
	}
	_, _ = p.Eval(`(() => {
		try {
			localStorage.removeItem("user");
			localStorage.removeItem("gospeak_session_expires_at");
		} catch {}
	})()`)
}
