package main

import (
	"errors"
	"testing"
	"time"
)

func TestDecideRestartsWithinBudget(t *testing.T) {
	s := newSupervision()
	now := time.Unix(1000, 0)

	first := s.decide(supervisorEvent{kind: eventPageRenderGone, reason: "renderer gone"}, now)
	if !first.ReloadPage || first.Wait != 500*time.Millisecond || first.Report {
		t.Fatalf("first: %+v", first)
	}
	second := s.decide(supervisorEvent{kind: eventPageRenderGone}, now.Add(time.Second))
	if second.Wait != time.Second {
		t.Fatalf("second backoff = %v, want 1s", second.Wait)
	}
	third := s.decide(supervisorEvent{kind: eventPageRenderGone}, now.Add(2*time.Second))
	if third.Wait != 2*time.Second {
		t.Fatalf("third backoff = %v, want 2s", third.Wait)
	}
	fourth := s.decide(supervisorEvent{kind: eventPageRenderGone}, now.Add(3*time.Second))
	if !fourth.Report || fourth.ReloadPage {
		t.Fatalf("fourth must report instead of reloading: %+v", fourth)
	}
}

func TestDecideBudgetExpiresAfterWindow(t *testing.T) {
	s := newSupervision()
	now := time.Unix(2000, 0)
	for i := 0; i < maxRestarts; i++ {
		s.decide(supervisorEvent{kind: eventPageLoadFailed}, now.Add(time.Duration(i)*time.Second))
	}
	act := s.decide(supervisorEvent{kind: eventPageLoadFailed}, now.Add(restartWindow+time.Minute))
	if act.Report || act.Wait == 0 {
		t.Fatalf("after the window the budget must reset: %+v", act)
	}
}

func TestDecideProxyProbeNeedsTwoFailures(t *testing.T) {
	s := newSupervision()
	now := time.Unix(3000, 0)

	if act := s.decide(supervisorEvent{kind: eventProxyProbeFailed}, now); act.RestartProxy {
		t.Fatalf("one probe failure must not restart: %+v", act)
	}
	act := s.decide(supervisorEvent{kind: eventProxyProbeFailed}, now.Add(probeInterval))
	if !act.RestartProxy {
		t.Fatalf("second consecutive failure must restart: %+v", act)
	}
	s.decide(supervisorEvent{kind: eventProxyProbeOK}, now.Add(2*probeInterval))
	if act := s.decide(supervisorEvent{kind: eventProxyProbeFailed}, now.Add(3*probeInterval)); act.RestartProxy {
		t.Fatalf("a healthy probe must reset the failure streak: %+v", act)
	}
}

func TestDecidePortChangeNotifiesAndReloads(t *testing.T) {
	s := newSupervision()
	now := time.Unix(4000, 0)
	act := s.decide(supervisorEvent{kind: eventProxyRestarted, oldPort: 47000, newPort: 47001}, now)
	if !act.ReloadPage || act.Notify == "" {
		t.Fatalf("port change must notify and reload: %+v", act)
	}
	act = s.decide(supervisorEvent{kind: eventProxyRestarted, oldPort: 47000, newPort: 47000}, now)
	if !act.ReloadPage || act.Notify != "" {
		t.Fatalf("same port must only reload: %+v", act)
	}
}

type fakePage struct{ reloads int }

func (f *fakePage) Reload() { f.reloads++ }

type fakeProxy struct {
	probeErr error
	restarts int
	oldPort  int
	newPort  int
}

func (f *fakeProxy) Probe() error { return f.probeErr }
func (f *fakeProxy) Restart() (int, int, error) {
	f.restarts++
	return f.oldPort, f.newPort, nil
}

type fakeHost struct {
	reports int
	notes   []string
}

func (f *fakeHost) Report(string, string)        { f.reports++ }
func (f *fakeHost) Notify(_ string, body string) { f.notes = append(f.notes, body) }

const supervisorIdleTimeout = 5 * time.Second

// waitForIdle waits for every deferred supervisor action to finish, with a
// deadline so a stuck action fails the test instead of hanging the package.
func waitForIdle(t *testing.T, s *supervisor) {
	t.Helper()
	deadline := time.Now().Add(supervisorIdleTimeout)
	for {
		s.mu.Lock()
		pending, busy := len(s.pending), s.busy
		s.mu.Unlock()
		if pending == 0 && busy == 0 {
			return
		}
		if time.Now().After(deadline) {
			t.Fatalf("supervisor still busy after %v: pending=%d busy=%d", supervisorIdleTimeout, pending, busy)
		}
		time.Sleep(time.Millisecond)
	}
}

func TestSupervisorRestartsProxyOnTwoProbeFailures(t *testing.T) {
	page := &fakePage{}
	proxy := &fakeProxy{probeErr: errors.New("down"), oldPort: 47000, newPort: 47001}
	host := &fakeHost{}
	sup := newSupervisor(page, proxy, host)

	sup.handle(supervisorEvent{kind: eventProxyProbeFailed})
	sup.handle(supervisorEvent{kind: eventProxyProbeFailed})
	waitForIdle(t, sup)

	if proxy.restarts != 1 {
		t.Fatalf("restarts = %d, want 1", proxy.restarts)
	}
	if page.reloads != 1 {
		t.Fatalf("reloads = %d, want 1", page.reloads)
	}
	if len(host.notes) != 1 {
		t.Fatalf("notes = %v, want one port-change notice", host.notes)
	}
}

func TestSupervisorReportsAfterBudget(t *testing.T) {
	page := &fakePage{}
	host := &fakeHost{}
	sup := newSupervisor(page, &fakeProxy{}, host)

	for i := 0; i < maxRestarts+1; i++ {
		sup.handle(supervisorEvent{kind: eventPageRenderGone, reason: "gone"})
		waitForIdle(t, sup)
		wantReloads := min(i+1, maxRestarts)
		if page.reloads != wantReloads {
			t.Fatalf("event %d: reloads = %d, want %d", i, page.reloads, wantReloads)
		}
	}
	if host.reports != 1 {
		t.Fatalf("reports = %d, want 1", host.reports)
	}
	if page.reloads != maxRestarts {
		t.Fatalf("reloads = %d, want %d", page.reloads, maxRestarts)
	}
	if len(host.notes) != 0 {
		t.Fatalf("notes = %v, want none for a page-only restart budget", host.notes)
	}
}

func TestPageEventForLoadError(t *testing.T) {
	app := "http://127.0.0.1:47000"

	// 102 = ERR_CONNECTION_REFUSED（-3 是取消，不算崩溃，见 isFatalLoadFailure）
	ev, ok := pageEventForLoadError(app+"/", app, 102)
	if !ok || ev.kind != eventPageLoadFailed {
		t.Fatalf("app shell failure must map to a page event: %+v %v", ev, ok)
	}
	if _, ok := pageEventForLoadError(app+"/uploads/x.png", app, 102); ok {
		t.Fatal("a non-shell URL must not count as a page failure")
	}
}
