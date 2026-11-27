package main

import "testing"

func TestAutoScale(t *testing.T) {
	cases := []struct {
		width int
		want  float64
	}{
		{1280, 1.0},
		{1920, 1.0},
		{2560, 1.25},
		{3440, 1.35},
		{3840, 1.5},
		{5120, 1.5},
	}
	for _, c := range cases {
		if got := autoScale(c.width); got != c.want {
			t.Errorf("autoScale(%d) = %v, want %v", c.width, got, c.want)
		}
	}
}

func TestHudWindowSize(t *testing.T) {
	overlayCfg.mu.Lock()
	prevScale := overlayCfg.scale
	overlayCfg.scale = 2
	overlayCfg.mu.Unlock()
	t.Cleanup(func() {
		overlayCfg.mu.Lock()
		overlayCfg.scale = prevScale
		overlayCfg.mu.Unlock()
	})

	w, h := hudWindowSize(3)
	if w != hudWidth*2 {
		t.Errorf("width = %d, want %d", w, hudWidth*2)
	}
	if h != hudHeight(3)*2 {
		t.Errorf("height = %d, want %d", h, hudHeight(3)*2)
	}
}

// TestHudWindowSizeLocksOverlayWinMu documents the lock ordering that caused
// a startup deadlock: with an automatic scale, hudWindowSize reaches
// overlayDisplayWidth -> overlayWindow(), which takes overlayWinMu. Callers
// must therefore size the window (hudWindowSize) BEFORE taking overlayWinMu;
// doing it inside (as createOverlayWindow used to) self-deadlocks. This test
// pins the behaviour so a future refactor cannot silently reintroduce it.
func TestHudWindowSizeLocksOverlayWinMu(t *testing.T) {
	overlayCfg.mu.Lock()
	prevScale := overlayCfg.scale
	overlayCfg.scale = 0 // automatic: forces the overlayDisplayWidth path
	overlayCfg.mu.Unlock()
	t.Cleanup(func() {
		overlayCfg.mu.Lock()
		overlayCfg.scale = prevScale
		overlayCfg.mu.Unlock()
	})

	called := false
	prevDisplayWidth := overlayDisplayWidth
	overlayDisplayWidth = func() int {
		called = true
		// This is exactly what overlayWindow() does: take overlayWinMu.
		overlayWinMu.Lock()
		overlayWinMu.Unlock()
		return 1920
	}
	t.Cleanup(func() { overlayDisplayWidth = prevDisplayWidth })

	hudWindowSize(0)
	if !called {
		t.Fatal("hudWindowSize must consult overlayDisplayWidth on automatic scale")
	}
}

func TestHudScaleFallsBackToAuto(t *testing.T) {
	overlayCfg.mu.Lock()
	prevScale := overlayCfg.scale
	overlayCfg.scale = 0
	overlayCfg.mu.Unlock()
	t.Cleanup(func() {
		overlayCfg.mu.Lock()
		overlayCfg.scale = prevScale
		overlayCfg.mu.Unlock()
	})

	stubDisplayWidth(t, 1920)
	if got := hudScale(); got != 1.0 {
		t.Fatalf("hudScale() = %v, want 1.0 for a 1920-wide display", got)
	}

	overlayDisplayWidth = func() int { return 3840 }
	if got := hudScale(); got != 1.5 {
		t.Fatalf("hudScale() = %v, want 1.5 for a 3840-wide display", got)
	}
}
