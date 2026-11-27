package main

import (
	"context"
	"errors"
	"io"
	"strings"
	"testing"

	"github.com/egoist/mygo"
)

func TestComparisonVersion(t *testing.T) {
	cases := []struct {
		name string
		in   string
		want string
	}{
		{"release version is used", "1.2.3", "1.2.3"},
		{"release version with prerelease", "1.2.3-beta.1", "1.2.3-beta.1"},
		{"surrounding whitespace", " 1.2.3 ", "1.2.3"},
		{"dev build leaves mygo default", "dev", ""},
		{"empty leaves mygo default", "", ""},
		{"blank leaves mygo default", "   ", ""},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := comparisonVersion(tc.in); got != tc.want {
				t.Fatalf("comparisonVersion(%q) = %q, want %q", tc.in, got, tc.want)
			}
		})
	}
}

// stubUpdateSource stands in for the release feed so the enabled-updates path
// can be exercised without the network.
type stubUpdateSource struct{ manifest string }

func (s stubUpdateSource) Manifest(context.Context, bool) (io.ReadCloser, error) {
	return io.NopCloser(strings.NewReader(s.manifest)), nil
}

func (s stubUpdateSource) Open(context.Context, string) (io.ReadCloser, error) {
	return nil, errors.New("stub source has no files")
}

// TestCheckReportsUnsupportedWithoutTouchingTheFeed covers the guard that keeps
// version comparison out of the picture while builds have no update feed: the
// call must answer from local state alone (Supported=false, Available=false, no
// error) and never reach the feed. Whether a build can self-update comes from
// mygo.Updater.Enabled(), so the assertions follow that instead of assuming the
// feature is off.
func TestCheckReportsUnsupportedWithoutTouchingTheFeed(t *testing.T) {
	enabled := mygo.Updater.Enabled()
	if enabled {
		// Serve an incomplete manifest locally: Check must fail on it instead
		// of querying the feed, which keeps the test off the network.
		mygo.Updater.SetSource(stubUpdateSource{manifest: `{"version":"0.0.0"}`})
		t.Cleanup(func() { mygo.Updater.SetSource(nil) })
	}

	info, err := (Updater{}).Check(context.Background())

	if enabled {
		if err == nil {
			t.Fatal("Check() must surface a broken manifest when updates are enabled")
		}
		return
	}

	if err != nil {
		t.Fatalf("Check() error = %v, want nil while updates are disabled", err)
	}
	if info == nil {
		t.Fatal("Check() = nil, want UpdateInfo")
	}
	if info.Supported != enabled {
		t.Fatalf("Supported = %v, want %v from mygo.Updater.Enabled()", info.Supported, enabled)
	}
	if info.Available {
		t.Fatal("Available = true on a build that cannot self-update")
	}
	if info.Version != "" {
		t.Fatalf("Version = %q, want empty", info.Version)
	}
	if info.Current != version {
		t.Fatalf("Current = %q, want %q", info.Current, version)
	}

	pendingUpdate.Lock()
	pending := pendingUpdate.up
	pendingUpdate.Unlock()
	if pending != nil {
		t.Fatal("Check() recorded a pending update on a build that cannot self-update")
	}
}
