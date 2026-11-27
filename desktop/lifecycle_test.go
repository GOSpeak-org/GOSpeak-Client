package main

import (
	"testing"

	"github.com/egoist/mygo"
)

func TestNativeQuitPermission(t *testing.T) {
	p := newQuitPermission()

	if !p.hidesWindowClose() {
		t.Fatal("ordinary window close must hide to tray")
	}

	p.beginQuit()
	if p.hidesWindowClose() {
		t.Fatal("native quit must close every window and terminate the app")
	}
}

func TestHideOnCloseLetsNativeQuitCloseWindow(t *testing.T) {
	quitting.beginQuit()
	t.Cleanup(quitting.endQuit)

	hideCalled := false
	handler := hideOnClose(func() { hideCalled = true })
	e := &mygo.CloseEvent{}
	handler(e)

	if e.DefaultPrevented() {
		t.Fatal("a hidden window must not veto a native quit, or Cmd+Q is cancelled")
	}
	if hideCalled {
		t.Fatal("a hidden window must not re-hide itself during a native quit")
	}
}

func TestHideOnCloseHidesOrdinaryClose(t *testing.T) {
	quitting.endQuit()

	hideCalled := false
	handler := hideOnClose(func() { hideCalled = true })
	e := &mygo.CloseEvent{}
	handler(e)

	if !e.DefaultPrevented() {
		t.Fatal("an ordinary close must be prevented so the window hides to tray")
	}
	if !hideCalled {
		t.Fatal("an ordinary close must hide the window")
	}
}
