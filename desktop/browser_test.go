package main

import (
	"context"
	"testing"
)

func TestBrowserOpenExternalRejectsNonHTTP(t *testing.T) {
	for _, raw := range []string{"file:///etc/passwd", "javascript:alert(1)", "not-a-url", "https://"} {
		if err := (Browser{}).OpenExternal(context.Background(), raw); err == nil {
			t.Fatalf("expected error for %q", raw)
		}
	}
}
