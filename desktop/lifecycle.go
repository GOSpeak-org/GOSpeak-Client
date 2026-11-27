package main

import (
	"sync/atomic"

	"github.com/egoist/mygo"
)

// quitPermission distinguishes quitting the app from closing its window.
// Native quit reaches OnBeforeQuit on every platform, before MyGo asks any
// window to close. Until then, closing the main window hides it to the tray.
type quitPermission struct {
	active atomic.Bool
}

func newQuitPermission() *quitPermission { return &quitPermission{} }

func (p *quitPermission) beginQuit() { p.active.Store(true) }

func (p *quitPermission) endQuit() { p.active.Store(false) }

func (p *quitPermission) hidesWindowClose() bool { return !p.active.Load() }

var quitting = newQuitPermission()

// hideOnClose builds an OnClose handler that hides a window instead of closing
// it, except while a native quit is in progress. MyGo's quit sequence treats a
// prevented OnClose as a veto and cancels the whole quit (prepareQuit), so even
// a hidden helper window such as the overlay must let its close go through on
// Cmd+Q, Dock Quit or the app menu.
func hideOnClose(hide func()) func(*mygo.CloseEvent) {
	return func(e *mygo.CloseEvent) {
		if !quitting.hidesWindowClose() {
			return
		}
		e.PreventDefault()
		hide()
	}
}

// showMainWindow brings the main window back from the tray, restoring it when
// minimized, and gives it focus.
func showMainWindow() {
	if mainWindow == nil {
		return
	}
	mainWindow.Show()
	mainWindow.Restore()
	mainWindow.Focus()
}

// hideMainWindow hides the main window without closing it, so the process
// (and its socket, media session and tray icon) stays alive.
func hideMainWindow() {
	if mainWindow != nil {
		mainWindow.Hide()
	}
}

// trayMenu builds the tray menu: open the window, hide it, or quit for real.
func trayMenu() *mygo.Menu {
	return mygo.NewMenu([]*mygo.MenuItem{
		{
			Label: "打开 GOSpeak",
			Click: func(*mygo.MenuItem, *mygo.Window) { showMainWindow() },
		},
		{
			Label: "隐藏到托盘",
			Click: func(*mygo.MenuItem, *mygo.Window) { hideMainWindow() },
		},
		{
			Label: "锁定/解锁覆盖层位置",
			Click: func(*mygo.MenuItem, *mygo.Window) { toggleOverlayLock() },
		},
		mygo.Separator(),
		{
			Label: "退出",
			Click: func(*mygo.MenuItem, *mygo.Window) { requestQuit() },
		},
	})
}

// initLifecycle wires the "close hides, tray keeps running" behaviour and the
// entry points that bring the window back.
func initLifecycle() {
	// Closing the last window must not quit: the tray keeps the app alive.
	mygo.App.OnWindowAllClosed(func() {})

	// MyGo fires this for Cmd+Q, Dock Quit, the app menu and system logout on
	// every platform. It runs before any window close, so window handlers can
	// tell a real quit from the user merely closing the window to the tray.
	mygo.App.OnBeforeQuit(func(*mygo.QuitEvent) { quitting.beginQuit() })

	// Overlay configuration writes are debounced (overlay.go); quitting must
	// flush a change made right before the user closed the app.
	mygo.App.OnWillQuit(func(*mygo.QuitEvent) { flushOverlayConfig() })

	if mainWindow != nil {
		mainWindow.OnClose(hideOnClose(hideMainWindow))
	}

	// Dock icon click (macOS) reopens the hidden window.
	mygo.App.OnActivate(func(hasVisibleWindows bool) {
		if !hasVisibleWindows {
			showMainWindow()
		}
	})

	// A second launch focuses the running instance instead of starting a new
	// process.
	mygo.App.OnSecondInstance(func([]string, string) { showMainWindow() })
}

// requestQuit starts the normal application quit sequence. OnBeforeQuit marks
// the quit before MyGo closes windows, so the tray close handler lets it through.
func requestQuit() {
	mygo.App.Quit()
}
