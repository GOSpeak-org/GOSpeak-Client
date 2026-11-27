package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func resetHostLog(t *testing.T) {
	t.Helper()
	hostLog.mu.Lock()
	hostLog.entries = nil
	hostLog.mu.Unlock()
}

func TestAppendHostEntryKeepsRingBounded(t *testing.T) {
	resetHostLog(t)
	for i := 0; i < hostLogCapacity+50; i++ {
		appendHostEntry(ClientLogEntry{
			ID:      "e",
			Level:   "info",
			Scope:   "test",
			Message: "m",
			TS:      int64(i),
		})
	}
	entries := snapshotHostLog()
	if len(entries) != hostLogCapacity {
		t.Fatalf("ring size = %d, want %d", len(entries), hostLogCapacity)
	}
	// 最新的留在尾部
	if entries[len(entries)-1].TS != int64(hostLogCapacity+49) {
		t.Fatalf("newest entry missing, got ts %d", entries[len(entries)-1].TS)
	}
}

func TestAppendHostEntryFillsMissingTimestamp(t *testing.T) {
	resetHostLog(t)
	before := time.Now().UnixMilli()
	appendHostEntry(ClientLogEntry{ID: "x", Level: "error", Scope: "s", Message: "m"})
	entries := snapshotHostLog()
	if len(entries) != 1 {
		t.Fatalf("expected 1 entry, got %d", len(entries))
	}
	if entries[0].TS < before {
		t.Fatalf("timestamp not filled, got %d", entries[0].TS)
	}
}

func TestSnapshotHostLogIsACopy(t *testing.T) {
	resetHostLog(t)
	appendHostEntry(ClientLogEntry{ID: "x", TS: 1, Level: "info", Scope: "s", Message: "m"})
	snap := snapshotHostLog()
	snap[0].Message = "mutated"
	if snapshotHostLog()[0].Message != "m" {
		t.Fatal("snapshot must not alias the ring")
	}
}

func TestHostLogRotation(t *testing.T) {
	resetHostLog(t)
	dir := t.TempDir()
	path := filepath.Join(dir, hostLogFileName)
	f, err := os.OpenFile(path, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o644)
	if err != nil {
		t.Fatalf("open: %v", err)
	}

	hostLog.mu.Lock()
	hostLog.file = f
	hostLog.path = path
	hostLog.written = hostLogMaxBytes
	hostLog.mu.Unlock()

	// 写入越过上限，触发一次轮转
	if _, err := (hostLogWriter{}).Write([]byte("trigger\n")); err != nil {
		t.Fatalf("write: %v", err)
	}

	if _, err := os.Stat(path + ".1"); err != nil {
		t.Fatalf("rotated file missing: %v", err)
	}
	hostLog.mu.Lock()
	written := hostLog.written
	hostLog.file.Close()
	hostLog.file = nil
	hostLog.path = ""
	hostLog.mu.Unlock()
	if written != 0 {
		t.Fatalf("written counter should reset after rotation, got %d", written)
	}
}

func TestBuildHostLogTextIncludesHeaderAndEntries(t *testing.T) {
	resetHostLog(t)
	appendHostEntry(ClientLogEntry{
		ID:      "a",
		TS:      time.Date(2026, 1, 1, 0, 0, 1, 0, time.UTC).UnixMilli(),
		Level:   "error",
		Scope:   "page.load",
		Message: "failed",
		Stack:   "line1\nline2",
		Extra:   map[string]any{"code": 102},
	})

	text := buildHostLogText()
	for _, want := range []string{"GOSpeak 宿主日志", "条目数: 1", "ERROR page.load", "failed", "line1", `"code":102`} {
		if !strings.Contains(text, want) {
			t.Fatalf("report missing %q:\n%s", want, text)
		}
	}
}

func TestBuildHostLogTextHandlesEmpty(t *testing.T) {
	resetHostLog(t)
	text := buildHostLogText()
	if !strings.Contains(text, "(无)") {
		t.Fatalf("empty report should say so, got:\n%s", text)
	}
}

func TestWriteLogFileCreatesParents(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "nested", "log.txt")
	if err := writeLogFile(path, "hello"); err != nil {
		t.Fatalf("writeLogFile: %v", err)
	}
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read back: %v", err)
	}
	if string(data) != "hello" {
		t.Fatalf("content = %q", data)
	}
}

func TestExportLogFileNameShape(t *testing.T) {
	name := exportLogFileName()
	if !strings.HasPrefix(name, "gospeak-log-") || !strings.HasSuffix(name, ".txt") {
		t.Fatalf("unexpected name %q", name)
	}
	if len(name) != len("gospeak-log-20260101-000000.txt") {
		t.Fatalf("unexpected length %d for %q", len(name), name)
	}
}
