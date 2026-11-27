package main

import (
	"context"
	"errors"
	"fmt"
	"log"
	"sync"
	"time"

	"github.com/egoist/mygo"
)

const (
	maxRestarts    = 3
	restartWindow  = 10 * time.Minute
	probeFailLimit = 2
	probeInterval  = 15 * time.Second
)

type component int

const (
	componentPage component = iota
	componentProxy
)

type supervisorEventKind int

const (
	eventPageRenderGone supervisorEventKind = iota
	eventPageLoadFailed
	eventProxyProbeFailed
	eventProxyProbeOK
	eventProxyRestarted
)

type supervisorEvent struct {
	kind    supervisorEventKind
	reason  string
	detail  string
	oldPort int
	newPort int
}

type supervisorAction struct {
	Wait         time.Duration
	RestartProxy bool
	ReloadPage   bool
	Report       bool
	Notify       string
	ReportReason string
	ReportDetail string
}

type supervision struct {
	attempts   map[component][]time.Time
	probeFails int
}

func newSupervision() *supervision {
	return &supervision{attempts: map[component][]time.Time{}}
}

var restartBackoff = []time.Duration{500 * time.Millisecond, time.Second, 2 * time.Second}

func (s *supervision) decide(ev supervisorEvent, now time.Time) supervisorAction {
	switch ev.kind {
	case eventProxyProbeOK:
		s.probeFails = 0
		delete(s.attempts, componentProxy)
		return supervisorAction{}
	case eventProxyProbeFailed:
		s.probeFails++
		if s.probeFails < probeFailLimit {
			return supervisorAction{}
		}
		s.probeFails = 0
		return s.restart(componentProxy, ev, now)
	case eventProxyRestarted:
		delete(s.attempts, componentProxy)
		act := supervisorAction{ReloadPage: true}
		if ev.oldPort != ev.newPort {
			act.Notify = "本地代理端口已变更，页面已重新加载，需要重新登录。"
		}
		return act
	case eventPageRenderGone, eventPageLoadFailed:
		return s.restart(componentPage, ev, now)
	default:
		return supervisorAction{}
	}
}

func (s *supervision) restart(comp component, ev supervisorEvent, now time.Time) supervisorAction {
	kept := s.attempts[comp][:0]
	for _, at := range s.attempts[comp] {
		if now.Sub(at) <= restartWindow {
			kept = append(kept, at)
		}
	}
	s.attempts[comp] = kept

	if len(kept) >= maxRestarts {
		detail := ev.detail
		if detail == "" {
			detail = ev.reason
		}
		if detail == "" {
			detail = "no detail"
		}
		return supervisorAction{
			Report:       true,
			ReportReason: "页面或本地代理反复失效，已自动重启 3 次仍未恢复。",
			ReportDetail: detail,
		}
	}

	act := supervisorAction{Wait: restartBackoff[len(kept)]}
	s.attempts[comp] = append(s.attempts[comp], now)
	if comp == componentProxy {
		act.RestartProxy = true
	} else {
		act.ReloadPage = true
	}
	return act
}

type pageOps interface{ Reload() }

type proxyOps interface {
	Probe() error
	Restart() (oldPort, newPort int, err error)
}

type hostOps interface {
	Report(reason, detail string)
	Notify(title, body string)
}

type supervisor struct {
	page  pageOps
	proxy proxyOps
	host  hostOps

	state   *supervision
	events  chan supervisorEvent
	pending map[component]bool
	busy    int
	mu      sync.Mutex
}

func newSupervisor(page pageOps, proxy proxyOps, host hostOps) *supervisor {
	return &supervisor{
		page:    page,
		proxy:   proxy,
		host:    host,
		state:   newSupervision(),
		events:  make(chan supervisorEvent, 8),
		pending: map[component]bool{},
	}
}

func (s *supervisor) post(ev supervisorEvent) {
	select {
	case s.events <- ev:
	default:
		log.Printf("[GOSpeak] supervisor: event dropped (%d)", ev.kind)
	}
}

func (s *supervisor) Run(ctx context.Context) {
	ticker := time.NewTicker(probeInterval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case ev := <-s.events:
			s.handle(ev)
		case <-ticker.C:
			if err := s.proxy.Probe(); err != nil {
				s.handle(supervisorEvent{kind: eventProxyProbeFailed, detail: err.Error()})
			} else {
				s.handle(supervisorEvent{kind: eventProxyProbeOK})
			}
		}
	}
}

func (s *supervisor) handle(ev supervisorEvent) {
	comp := componentPage
	if ev.kind == eventProxyProbeFailed ||
		ev.kind == eventProxyProbeOK ||
		ev.kind == eventProxyRestarted {
		comp = componentProxy
	}

	s.mu.Lock()
	if s.pending[comp] {
		s.mu.Unlock()
		return
	}
	act := s.state.decide(ev, time.Now())
	if act.Wait > 0 {
		s.pending[comp] = true
	}
	s.mu.Unlock()

	if act.Wait > 0 {
		time.AfterFunc(act.Wait, func() {
			s.mu.Lock()
			delete(s.pending, comp)
			s.busy++
			s.mu.Unlock()
			s.runAction(comp, act, ev)
			s.mu.Lock()
			s.busy--
			s.mu.Unlock()
		})
		return
	}
	s.runAction(comp, act, ev)
}

func (s *supervisor) runAction(_ component, act supervisorAction, ev supervisorEvent) {
	if act.RestartProxy {
		oldPort, newPort, err := s.proxy.Restart()
		if err != nil {
			s.host.Report("本地回环代理无法重启。", err.Error())
			return
		}
		appendHostEntry(ClientLogEntry{
			ID:      fmt.Sprintf("supervisor-%d", time.Now().UnixNano()),
			Level:   "warn",
			Scope:   "supervisor",
			Message: fmt.Sprintf("proxy restarted: %d -> %d", oldPort, newPort),
		})
		s.handle(supervisorEvent{kind: eventProxyRestarted, oldPort: oldPort, newPort: newPort})
		return
	}
	if act.ReloadPage {
		s.page.Reload()
		appendHostEntry(ClientLogEntry{
			ID:      fmt.Sprintf("supervisor-%d", time.Now().UnixNano()),
			Level:   "warn",
			Scope:   "supervisor",
			Message: "page reloaded after failure: " + ev.reason,
		})
	}
	if act.Notify != "" {
		s.host.Notify("GOSpeak", act.Notify)
	}
	if act.Report {
		s.host.Report(act.ReportReason, act.ReportDetail)
	}
}

// waitPending blocks until every deferred action has run. Tests only.
func (s *supervisor) waitPending() {
	for {
		s.mu.Lock()
		idle := len(s.pending) == 0 && s.busy == 0
		s.mu.Unlock()
		if idle {
			return
		}
		time.Sleep(time.Millisecond)
	}
}

var appSupervisor *supervisor

type loopbackPageOps struct{}

func (loopbackPageOps) Reload() { mygo.RunOnMain(reloadAllWindows) }

type loopbackProxyOps struct{}

func (loopbackProxyOps) Probe() error { return probeLoopback(proxyPort()) }

func (loopbackProxyOps) Restart() (int, int, error) {
	if loopbackProxy == nil {
		return 0, 0, errors.New("proxy is not running")
	}
	return loopbackProxy.restart()
}

type nativeHostOps struct {
	mu       sync.Mutex
	lastNote string
	lastAt   time.Time
}

func (h *nativeHostOps) Report(reason, detail string) {
	reportFatal(reason, detail)
}

func (h *nativeHostOps) Notify(title, body string) {
	h.mu.Lock()
	if body == h.lastNote && time.Since(h.lastAt) < time.Minute {
		h.mu.Unlock()
		return
	}
	h.lastNote = body
	h.lastAt = time.Now()
	h.mu.Unlock()
	mygo.RunOnMain(func() {
		n := mygo.NewNotification(mygo.NotificationOptions{Title: title, Body: body})
		_ = n.Show()
	})
}
