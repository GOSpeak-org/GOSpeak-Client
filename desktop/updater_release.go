package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"time"
)

// releaseInfo is the payload the About tab consumes for "check update + download".
// It is intentionally separate from UpdateInfo (the MyGo self-update feed).
type releaseInfo struct {
	Available bool   `json:"available"`
	Version   string `json:"version"`
	Notes     string `json:"notes"`
	Current   string `json:"current"`
	AssetName string `json:"assetName"`
	URL       string `json:"url"`
}

const (
	// 一组件一 Release 后，desktop 产物不再挂在 /releases/latest（那是 server 的）。
	// 改为拉列表再按 gospeak-desktop-v* 前缀筛选。
	githubAPIReleases = "https://api.github.com/repos/GOSpeak-org/GOSpeak-Client/releases?per_page=30"
	releaseNotesMax   = 2000
)

// allowedDownloadHosts is the only set of hosts we will stream a file from.
// CheckRelease hands the URL to the frontend; a tampered bridge message must
// not be able to make the host write an arbitrary remote file to disk.
var allowedDownloadHosts = map[string]bool{
	"github.com":                            true,
	"objects.githubusercontent.com":         true,
	"github-releases.githubusercontent.com": true,
}

// releaseAsset 是 Release 附件的最小字段集。
type releaseAsset struct {
	Name               string `json:"name"`
	BrowserDownloadURL string `json:"browser_download_url"`
}

// githubReleaseSummary 是 /releases 列表接口的条目（本文件只关心这几个字段）。
type githubReleaseSummary struct {
	TagName    string         `json:"tag_name"`
	Body       string         `json:"body"`
	Prerelease bool           `json:"prerelease"`
	Draft      bool           `json:"draft"`
	Assets     []releaseAsset `json:"assets"`
}

// pickDesktopRelease 从 Release 列表里挑出最新的稳定 desktop 发布。
// 跳过 draft / prerelease，以及任何非 gospeak-desktop-v* 的条目。
func pickDesktopRelease(releases []githubReleaseSummary) (githubReleaseSummary, bool) {
	var best githubReleaseSummary
	var bestVer string
	found := false
	for _, r := range releases {
		if r.Draft || r.Prerelease {
			continue
		}
		ver, ok := strings.CutPrefix(r.TagName, "gospeak-desktop-v")
		if !ok {
			continue
		}
		if !found || compareReleaseVersion(ver, bestVer) > 0 {
			best = r
			bestVer = ver
			found = true
		}
	}
	return best, found
}

// CheckRelease fetches the newest desktop release and picks the installer that
// matches the running OS/arch. Unlike Check() it does not depend on the MyGo
// updates feed, so it works on every build (including dev and packaged ones).
func (Updater) CheckRelease(ctx context.Context) (*releaseInfo, error) {
	info := &releaseInfo{Current: version}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, githubAPIReleases, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("User-Agent", "GOSpeak-Updater/"+version)

	client := &http.Client{Timeout: 15 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("请求 GitHub Releases 失败: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("GitHub Releases 返回 %s", resp.Status)
	}

	var releases []githubReleaseSummary
	if err := json.NewDecoder(io.LimitReader(resp.Body, 4<<20)).Decode(&releases); err != nil {
		return nil, fmt.Errorf("解析 GitHub Releases 失败: %w", err)
	}

	release, ok := pickDesktopRelease(releases)
	if !ok {
		// 还没有任何 desktop 正式发布：返回当前版本，不报错。
		return info, nil
	}

	latest, _ := strings.CutPrefix(release.TagName, "gospeak-desktop-v")
	info.Version = latest
	info.Available = compareReleaseVersion(latest, version) > 0

	asset, ok := pickDesktopAsset(release.Assets, latest)
	if !ok {
		return info, nil
	}
	info.AssetName = asset.Name
	info.URL = asset.BrowserDownloadURL
	info.Notes = truncateRunes(release.Body, releaseNotesMax)
	return info, nil
}

// DownloadRelease streams url into the user's Downloads folder, broadcasting
// 0..1 progress on updater.progress. The URL host is allowlisted and the file
// is written atomically via a .part sidecar.
func (Updater) DownloadRelease(ctx context.Context, rawURL string) error {
	u, err := url.Parse(rawURL)
	if err != nil || !allowedDownloadHosts[strings.ToLower(u.Hostname())] {
		return errors.New("下载链接不在允许的地址范围内")
	}
	if u.Scheme != "https" {
		return errors.New("下载链接必须使用 HTTPS")
	}

	name := filepath.Base(u.Path)
	if name == "." || name == "/" || name == "" {
		return errors.New("下载链接缺少文件名")
	}
	home, err := os.UserHomeDir()
	if err != nil {
		return err
	}
	dir := filepath.Join(home, "Downloads")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}
	dst := uniquePath(dir, name)
	part := dst + ".part"

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, rawURL, nil)
	if err != nil {
		return err
	}
	req.Header.Set("User-Agent", "GOSpeak-Updater/"+version)
	resp, err := (&http.Client{Timeout: 10 * time.Minute}).Do(req)
	if err != nil {
		return fmt.Errorf("下载失败: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("下载返回 %s", resp.Status)
	}

	f, err := os.OpenFile(part, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0o644)
	if err != nil {
		return err
	}
	total := resp.ContentLength
	var written int64
	buf := make([]byte, 64<<10)
	for {
		n, readErr := resp.Body.Read(buf)
		if n > 0 {
			if _, werr := f.Write(buf[:n]); werr != nil {
				f.Close()
				os.Remove(part)
				return werr
			}
			written += int64(n)
			if total > 0 {
				_ = updaterProgressEvent.Broadcast(min(1, float64(written)/float64(total)))
			}
		}
		if readErr == io.EOF {
			break
		}
		if readErr != nil {
			f.Close()
			os.Remove(part)
			return readErr
		}
	}
	if err := f.Close(); err != nil {
		os.Remove(part)
		return err
	}
	if err := os.Rename(part, dst); err != nil {
		os.Remove(part)
		return err
	}
	_ = updaterProgressEvent.Broadcast(1)
	return nil
}

// pickDesktopAsset chooses the installer for the running platform.
func pickDesktopAsset(assets []releaseAsset, ver string) (releaseAsset, bool) {
	var zero releaseAsset
	prefix := "gospeak-desktop-v" + ver + "-" + platformAssetTag() + "."
	for _, a := range assets {
		if strings.HasPrefix(a.Name, prefix) && a.BrowserDownloadURL != "" {
			return a, true
		}
	}
	return zero, false
}

func platformAssetTag() string {
	switch runtime.GOOS {
	case "darwin":
		return "darwin-" + runtime.GOARCH
	case "windows":
		return "windows-" + runtime.GOARCH
	case "linux":
		return "linux-" + runtime.GOARCH
	default:
		return "__unsupported__"
	}
}

// uniquePath returns a non-existing path, appending -1, -2 ... before the
// extension when the target already exists.
func uniquePath(dir, name string) string {
	p := filepath.Join(dir, name)
	if _, err := os.Stat(p); os.IsNotExist(err) {
		return p
	}
	ext := filepath.Ext(name)
	base := strings.TrimSuffix(name, ext)
	for i := 1; ; i++ {
		candidate := filepath.Join(dir, fmt.Sprintf("%s-%d%s", base, i, ext))
		if _, err := os.Stat(candidate); os.IsNotExist(err) {
			return candidate
		}
	}
}

func truncateRunes(s string, max int) string {
	r := []rune(s)
	if len(r) <= max {
		return s
	}
	return string(r[:max]) + "…"
}

// compareReleaseVersion returns >0 when a is newer than b. It understands
// numeric cores and prerelease suffixes (1.2.0 > 1.2.0-rc.1).
func compareReleaseVersion(a, b string) int {
	pa, oka := parseReleaseVersion(a)
	pb, okb := parseReleaseVersion(b)
	if !oka || !okb {
		return strings.Compare(a, b)
	}
	for i := 0; i < 3; i++ {
		if pa.core[i] != pb.core[i] {
			if pa.core[i] > pb.core[i] {
				return 1
			}
			return -1
		}
	}
	if pa.pre == pb.pre {
		return 0
	}
	if pa.pre == "" {
		return 1
	}
	if pb.pre == "" {
		return -1
	}
	return strings.Compare(pa.pre, pb.pre)
}

type parsedVersion struct {
	core [3]int
	pre  string
}

func parseReleaseVersion(s string) (parsedVersion, bool) {
	var v parsedVersion
	s = strings.TrimSpace(strings.TrimPrefix(strings.TrimSpace(s), "v"))
	core, pre, _ := strings.Cut(s, "-")
	parts := strings.Split(core, ".")
	if len(parts) != 3 {
		return v, false
	}
	for i := 0; i < 3; i++ {
		n, err := strconv.Atoi(parts[i])
		if err != nil {
			return v, false
		}
		v.core[i] = n
	}
	v.pre = pre
	return v, true
}
