package main

import (
	"cmp"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/egoist/mygo"
)

// ClientLogEntry is one log line relayed from the page, or recorded by the
// host itself. Keep the JSON tags in sync with HostLogEntry in
// packages/desktop/src/capabilities/clientlog.ts.
type ClientLogEntry struct {
	ID      string         `json:"id"`
	TS      int64          `json:"ts"`
	Level   string         `json:"level"`
	Scope   string         `json:"scope"`
	Message string         `json:"message"`
	Stack   string         `json:"stack,omitempty"`
	Extra   map[string]any `json:"extra,omitempty"`
}

const (
	// hostLogCapacity is the in-memory ring the crash window reads from: the
	// page's IndexedDB is unreachable once the WebView is gone.
	hostLogCapacity = 1000
	hostLogFileName = "gospeak.log"
	hostLogMaxBytes = 5 << 20
	hostLogBackups  = 2
)

var hostLog = struct {
	mu      sync.Mutex
	entries []ClientLogEntry
	file    *os.File
	written int64
	path    string
}{}

// initHostLog opens the rotating log file and tees log.Printf into it, so the
// host's own messages land in the same place the page's are exported from.
func initHostLog() {
	dir, err := mygo.App.Path(mygo.PathLogs)
	if err != nil || dir == "" {
		log.Printf("[GOSpeak] log directory unavailable: %v", err)
		return
	}
	if err := os.MkdirAll(dir, 0o755); err != nil {
		log.Printf("[GOSpeak] cannot create log directory: %v", err)
		return
	}
	path := filepath.Join(dir, hostLogFileName)
	f, err := os.OpenFile(path, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o644)
	if err != nil {
		log.Printf("[GOSpeak] cannot open log file: %v", err)
		return
	}
	info, _ := f.Stat()
	hostLog.mu.Lock()
	hostLog.file = f
	hostLog.path = path
	if info != nil {
		hostLog.written = info.Size()
	}
	hostLog.mu.Unlock()
	log.SetOutput(io.MultiWriter(os.Stderr, hostLogWriter{}))
}

// hostLogWriter appends log.Printf output to the rotating file.
type hostLogWriter struct{}

func (hostLogWriter) Write(p []byte) (int, error) {
	hostLog.mu.Lock()
	defer hostLog.mu.Unlock()
	if hostLog.file == nil {
		return len(p), nil
	}
	n, err := hostLog.file.Write(p)
	hostLog.written += int64(n)
	if hostLog.written >= hostLogMaxBytes {
		rotateHostLogLocked()
	}
	return n, err
}

// rotateHostLogLocked renames the current file to .1 (shifting older backups)
// and opens a fresh one. Caller holds hostLog.mu.
func rotateHostLogLocked() {
	if hostLog.file == nil || hostLog.path == "" {
		return
	}
	_ = hostLog.file.Close()
	base := hostLog.path
	for i := hostLogBackups - 1; i >= 1; i-- {
		_ = os.Rename(fmt.Sprintf("%s.%d", base, i), fmt.Sprintf("%s.%d", base, i+1))
	}
	_ = os.Rename(base, base+".1")
	f, err := os.OpenFile(base, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o644)
	if err != nil {
		hostLog.file = nil
		return
	}
	hostLog.file = f
	hostLog.written = 0
}

// appendHostEntry records one entry in the ring and, for host-originated
// entries, in the file.
func appendHostEntry(entry ClientLogEntry) {
	if entry.TS == 0 {
		entry.TS = time.Now().UnixMilli()
	}
	hostLog.mu.Lock()
	hostLog.entries = append(hostLog.entries, entry)
	if len(hostLog.entries) > hostLogCapacity {
		hostLog.entries = hostLog.entries[len(hostLog.entries)-hostLogCapacity:]
	}
	hostLog.mu.Unlock()
}

// snapshotHostLog returns the ring in time order.
func snapshotHostLog() []ClientLogEntry {
	hostLog.mu.Lock()
	defer hostLog.mu.Unlock()
	out := make([]ClientLogEntry, len(hostLog.entries))
	copy(out, hostLog.entries)
	return out
}

// hostLogsDir returns the directory holding the host log file, "" when the
// host could not open one.
func hostLogsDir() string {
	hostLog.mu.Lock()
	defer hostLog.mu.Unlock()
	if hostLog.path == "" {
		return ""
	}
	return filepath.Dir(hostLog.path)
}

// ClientLog exposes the host-side log ring to the page and to the crash
// window. The page keeps its own IndexedDB copy; this is the one that
// survives the WebView.
type ClientLog struct{}

func (ClientLog) Append(_ context.Context, entry ClientLogEntry) {
	appendHostEntry(entry)
}

func (ClientLog) Snapshot(_ context.Context) []ClientLogEntry {
	return snapshotHostLog()
}

func (ClientLog) Clear(_ context.Context) {
	hostLog.mu.Lock()
	hostLog.entries = nil
	hostLog.mu.Unlock()
}

func (ClientLog) LogsPath(_ context.Context) string {
	return hostLogsDir()
}

func (ClientLog) RevealLogs(_ context.Context) {
	if dir := hostLogsDir(); dir != "" {
		mygo.Shell.ShowItemInFolder(dir)
	}
}

// ReportFatal opens the native crash window. It runs on the caller's
// goroutine, so the window creation is posted to the main thread.
func (ClientLog) ReportFatal(_ context.Context, reason, detail string) {
	reportFatal(reason, detail)
}

// exportLogFileName is the suggested name for an exported report:
// gospeak-log-20261115-220301.txt.
func exportLogFileName() string {
	return "gospeak-log-" + time.Now().Format("20060102-150405") + ".txt"
}

// buildHostLogText renders the host's own report, used by the crash window
// where the page (and its IndexedDB copy) is unreachable.
func buildHostLogText() string {
	entries := snapshotHostLog()
	now := time.Now()
	var b strings.Builder
	fmt.Fprintf(&b, "GOSpeak 宿主日志\n")
	fmt.Fprintf(&b, "生成时间: %s\n", now.Format("2006-01-02 15:04:05.000"))
	fmt.Fprintf(&b, "版本: %s (%s)\n", version, commit)
	fmt.Fprintf(&b, "服务器: %s\n", cmp.Or(currentBaseURL(), "(未配置)"))
	fmt.Fprintf(&b, "日志目录: %s\n", cmp.Or(hostLogsDir(), "(不可用)"))
	fmt.Fprintf(&b, "条目数: %d\n\n", len(entries))
	for _, e := range entries {
		fmt.Fprintf(&b, "[%s] %s %s\n", time.UnixMilli(e.TS).Format("2006-01-02 15:04:05.000"),
			strings.ToUpper(e.Level), e.Scope)
		fmt.Fprintf(&b, "  %s\n", e.Message)
		if e.Stack != "" {
			for _, line := range strings.Split(e.Stack, "\n") {
				fmt.Fprintf(&b, "  %s\n", line)
			}
		}
		if len(e.Extra) > 0 {
			if data, err := json.Marshal(e.Extra); err == nil {
				fmt.Fprintf(&b, "  extra: %s\n", data)
			}
		}
	}
	if len(entries) == 0 {
		b.WriteString("(无)\n")
	}
	return b.String()
}

// writeLogFile writes the report to path, creating parent directories.
func writeLogFile(path, text string) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	return os.WriteFile(path, []byte(text), 0o644)
}

// logHostError records a host-side error both in the ring and in the file.
func logHostError(scope string, err error) {
	if err == nil {
		return
	}
	entry := ClientLogEntry{
		ID:      fmt.Sprintf("host-%d", time.Now().UnixNano()),
		TS:      time.Now().UnixMilli(),
		Level:   "error",
		Scope:   scope,
		Message: err.Error(),
	}
	appendHostEntry(entry)
	if data, mErr := json.Marshal(entry); mErr == nil {
		_, _ = hostLogWriter{}.Write(append(data, '\n'))
	}
}
