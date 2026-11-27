package main

import (
	"context"
	"errors"
	"log"
	"time"

	"github.com/egoist/mygo/plugins/permissionflow"
)

// screenCaptureStatusString maps a permissionflow status to the wire value the
// TS SDK consumes. macOS reports Screen Recording as denied until it is
// granted, so NotDetermined and Unknown both map to "unknown" (the UI guides
// the user for either).
func screenCaptureStatusString(status permissionflow.Status) string {
	switch status {
	case permissionflow.Granted:
		return "granted"
	case permissionflow.Denied:
		return "denied"
	default:
		return "unknown"
	}
}

// screenCaptureCheckResult folds a Check result into a wire status. A system
// with no screen-recording gate (Linux, Windows) leaves capture unrestricted,
// so callers should proceed instead of blocking sharing.
func screenCaptureCheckResult(status permissionflow.Status, err error) string {
	if errors.Is(err, errors.ErrUnsupported) {
		return "unsupported"
	}
	if err != nil {
		return "unknown"
	}
	return screenCaptureStatusString(status)
}

// ScreenCapture exposes the macOS Screen Recording permission to the web
// frontend. MyGo's WKWebView implements the camera/microphone capture prompt
// but not display capture: getDisplayMedia() is rejected with NotAllowedError
// unless the app already holds Screen Recording. Checking/guiding from the
// host before the page starts sharing closes that gap.
type ScreenCapture struct{}

// Check reports the permission without prompting.
func (ScreenCapture) Check() string {
	status, err := permissionflow.Check(permissionflow.ScreenRecording)
	return screenCaptureCheckResult(status, err)
}

// Guide opens System Settings (with an app-drag panel on macOS) and waits for
// the user to grant the permission, then reports the result. The call is
// bounded so a user who never touches System Settings cannot hang the bridge.
func (ScreenCapture) Guide(ctx context.Context) string {
	guideCtx, cancel := context.WithTimeout(ctx, 3*time.Minute)
	defer cancel()
	status, err := permissionflow.Guide(guideCtx, permissionflow.ScreenRecording, permissionflow.GuideOptions{})
	if err != nil && !errors.Is(err, errors.ErrUnsupported) {
		log.Printf("[GOSpeak] screen recording guide failed: %v", err)
	}
	return screenCaptureCheckResult(status, err)
}
