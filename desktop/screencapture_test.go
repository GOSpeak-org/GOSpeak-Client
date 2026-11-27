package main

import (
	"errors"
	"testing"

	"github.com/egoist/mygo/plugins/permissionflow"
)

func TestScreenCaptureStatusString(t *testing.T) {
	cases := []struct {
		status permissionflow.Status
		want   string
	}{
		{permissionflow.Granted, "granted"},
		{permissionflow.Denied, "denied"},
		{permissionflow.NotDetermined, "unknown"},
		{permissionflow.Unknown, "unknown"},
	}
	for _, c := range cases {
		if got := screenCaptureStatusString(c.status); got != c.want {
			t.Errorf("status %v: got %q, want %q", c.status, got, c.want)
		}
	}
}

func TestScreenCaptureCheckUnsupportedIsNotAnError(t *testing.T) {
	// On platforms without a screen-recording gate (Linux/Windows) the gate is
	// open: callers should proceed rather than block sharing.
	got := screenCaptureCheckResult(permissionflow.Unknown, errors.ErrUnsupported)
	if got != "unsupported" {
		t.Errorf("got %q, want unsupported", got)
	}
}
