package main

import (
	"context"
	"fmt"
	"net/url"
)

// Browser opens links in the system browser from the embedded webview.
type Browser struct{}

// OpenExternal opens an http(s) URL with the platform default browser.
func (Browser) OpenExternal(ctx context.Context, rawURL string) error {
	u, err := url.Parse(rawURL)
	if err != nil || (u.Scheme != "http" && u.Scheme != "https") || u.Host == "" {
		return fmt.Errorf("invalid external URL %q", rawURL)
	}
	return openInBrowser(u.String())
}
