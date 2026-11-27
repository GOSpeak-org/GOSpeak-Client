package main

import (
	"context"
	_ "embed"

	"github.com/egoist/mygo"
)

//go:embed preload_clientlog.js
var clientLogPreloadScript string

// pagePreloadScript is injected into every page. Only the client-log bridge is
// injected: clipboard access goes through the Clipboard binding called by
// @gospeak/desktop's createClipboard(), so the page never patches
// navigator.clipboard and WebView2 shows no clipboard permission prompt.
var pagePreloadScript = clientLogPreloadScript

// Clipboard backs the page's clipboard capability with the OS clipboard. The
// page calls these through @gospeak/desktop, never via navigator.clipboard in
// the desktop host.
type Clipboard struct{}

func (Clipboard) ReadText(context.Context) string {
	return mygo.Clipboard.ReadText()
}

func (Clipboard) WriteText(_ context.Context, text string) {
	mygo.Clipboard.WriteText(text)
}
