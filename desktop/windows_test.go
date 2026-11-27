package main

import "testing"

func TestExternalTarget(t *testing.T) {
	t.Setenv("GOSPEAK_DESKTOP_DEV", "1")

	tests := []struct {
		name string
		raw  string
		want string
	}{
		{"empty", "", ""},
		{"relative", "/room/1", ""},
		{"same origin", devWindowURL + "/room/1", ""},
		{"same origin query", devWindowURL + "/?x=1", ""},
		{"other https host", "https://example.com/a", "https://example.com/a"},
		{"other port", "http://localhost:4000/x", "http://localhost:4000/x"},
		{"protocol relative", "//example.com/x", "//example.com/x"},
		{"mailto", "mailto:a@b.com", "mailto:a@b.com"},
		{"tel", "tel:+123", "tel:+123"},
		{"about blank", "about:blank", ""},
		{"blob", "blob:" + devWindowURL + "/uuid", ""},
		{"data", "data:text/plain,hi", ""},
		{"javascript", "javascript:alert(1)", "javascript:alert(1)"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := externalTarget(tt.raw); got != tt.want {
				t.Fatalf("externalTarget(%q) = %q, want %q", tt.raw, got, tt.want)
			}
		})
	}
}

func TestOpenableExternal(t *testing.T) {
	tests := []struct {
		raw  string
		want bool
	}{
		{"https://example.com", true},
		{"http://example.com", true},
		{"mailto:a@b.com", true},
		{"tel:+123", true},
		{"//example.com/x", true},
		{"/room/1", false},
		{"javascript:alert(1)", false},
		{"file:///etc/passwd", false},
		{"data:text/plain,hi", false},
		{"", false},
	}
	for _, tt := range tests {
		if got := openableExternal(tt.raw); got != tt.want {
			t.Errorf("openableExternal(%q) = %v, want %v", tt.raw, got, tt.want)
		}
	}
}
