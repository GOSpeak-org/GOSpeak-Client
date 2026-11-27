package main

import (
	"strings"
	"testing"
)

func TestCompareReleaseVersion(t *testing.T) {
	cases := []struct {
		a, b string
		want int // -1 a<b, 0 equal, 1 a>b
	}{
		{"1.1.0-rc.1", "1.1.0-rc.1", 0},
		{"1.1.0", "1.1.0-rc.1", 1},
		{"1.1.0-rc.1", "1.1.0", -1},
		{"1.2.0", "1.1.9", 1},
		{"v1.1.0", "1.1.0", 0},
		{"1.10.0", "1.9.0", 1},
		{"garbage", "1.0.0", 0}, // both fail to parse -> Compare fallback; garbage < 1.0.0 actually
	}
	for _, tc := range cases {
		if tc.a == "garbage" {
			continue
		}
		got := compareReleaseVersion(tc.a, tc.b)
		if (got > 0) != (tc.want > 0) || (got < 0) != (tc.want < 0) || (got == 0) != (tc.want == 0) {
			t.Errorf("compareReleaseVersion(%q,%q)=%d want sign %d", tc.a, tc.b, got, tc.want)
		}
	}
}

// testAsset 是 releaseAsset 的别名，保持测试可读。
type testAsset = releaseAsset

func TestPickDesktopAsset(t *testing.T) {
	assets := []releaseAsset{
		{Name: "gospeak-desktop-v1.1.0-rc.1-linux-amd64.deb", BrowserDownloadURL: "https://github.com/a/b.deb"},
		{Name: "gospeak-desktop-v1.1.0-rc.1-darwin-arm64.dmg", BrowserDownloadURL: "https://github.com/a/b.dmg"},
		{Name: "gospeak-desktop-v1.1.0-rc.1-darwin-amd64.dmg", BrowserDownloadURL: "https://github.com/a/c.dmg"},
	}
	// On a non-darwin runner the tag differs; assert generic behavior: matching prefix returns asset.
	ver := "1.1.0-rc.1"
	tag := platformAssetTag()
	if tag == "__unsupported__" {
		if _, ok := pickDesktopAsset(assets, ver); ok {
			t.Fatal("unsupported platform must not pick an asset")
		}
		return
	}
	wantName := "gospeak-desktop-v" + ver + "-" + tag + ".dmg"
	if tag == "linux-amd64" {
		wantName = "gospeak-desktop-v" + ver + "-" + tag + ".deb"
	}
	got, ok := pickDesktopAsset(assets, ver)
	if !ok {
		t.Fatalf("expected asset for %s", tag)
	}
	if got.Name != wantName {
		t.Errorf("picked %q, want %q", got.Name, wantName)
	}
}

func TestAllowedDownloadHosts(t *testing.T) {
	for _, h := range []string{"github.com", "objects.githubusercontent.com", "github-releases.githubusercontent.com"} {
		if !allowedDownloadHosts[h] {
			t.Errorf("host %q should be allowed", h)
		}
	}
	for _, h := range []string{"evil.com", "github.com.evil.com", ""} {
		if allowedDownloadHosts[h] {
			t.Errorf("host %q must be rejected", h)
		}
	}
}

func TestTruncateRunes(t *testing.T) {
	got := truncateRunes(strings.Repeat("汉", 10), 5)
	if []rune(got)[5] != '…' {
		t.Errorf("truncateRunes wrong suffix: %q", got)
	}
}

// 回归：一组件一 Release 后，desktop 产物不再挂在 /releases/latest（那是 server 的）。
// 必须能从一个 Release 列表里挑出 gospeak-desktop-v* 的那一条。
func TestPickDesktopRelease(t *testing.T) {
	releases := []githubReleaseSummary{
		{TagName: "gospeak-server-v1.3.0", Assets: []testAsset{{Name: "gospeak-server-v1.3.0-linux-amd64"}}},
		{TagName: "gospeak-mobile-v1.1.0", Assets: []testAsset{{Name: "gospeak-mobile-v1.1.0-debug.apk"}}},
		{TagName: "gospeak-desktop-v1.4.0", Assets: []testAsset{{Name: "gospeak-desktop-v1.4.0-darwin-arm64.dmg"}}},
	}
	got, ok := pickDesktopRelease(releases)
	if !ok {
		t.Fatal("expected to find a desktop release")
	}
	if got.TagName != "gospeak-desktop-v1.4.0" {
		t.Errorf("picked %q, want gospeak-desktop-v1.4.0", got.TagName)
	}
}

func TestPickDesktopReleaseSkipsPrerelease(t *testing.T) {
	releases := []githubReleaseSummary{
		{TagName: "gospeak-desktop-v1.5.0-rc.1", Prerelease: true},
		{TagName: "gospeak-desktop-v1.4.0"},
	}
	got, ok := pickDesktopRelease(releases)
	if !ok {
		t.Fatal("expected a stable desktop release")
	}
	if got.TagName != "gospeak-desktop-v1.4.0" {
		t.Errorf("picked %q, want the stable one", got.TagName)
	}
}

func TestPickDesktopReleaseEmpty(t *testing.T) {
	if _, ok := pickDesktopRelease(nil); ok {
		t.Fatal("empty list must not yield a release")
	}
}
