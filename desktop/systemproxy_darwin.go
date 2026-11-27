//go:build darwin

package main

import (
	"context"
	"os/exec"
	"time"
)

// readSystemProxy reads the macOS proxy configuration. scutil is used instead
// of a cgo SystemConfiguration binding so the desktop keeps building without
// cgo (and keeps its Windows/Linux cross builds intact).
func readSystemProxy() proxySettings {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	out, err := exec.CommandContext(ctx, "/usr/sbin/scutil", "--proxy").Output()
	if err != nil {
		return proxySettings{}
	}
	return parseScutilProxy(string(out))
}
