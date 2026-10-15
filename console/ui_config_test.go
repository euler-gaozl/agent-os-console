package console

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/euler-gaozl/agent-os-sdk/serviceclient"
	"github.com/euler-gaozl/agent-os-sdk/servicehttp"
)

func TestPublicFuturesURLRequiresExplicitBrowserAddress(t *testing.T) {
	for _, value := range []string{"", "http://127.0.0.1:18098", "https://research.example.invalid/workspace/"} {
		got, err := PublicFuturesURL(value)
		if err != nil || got != value {
			t.Fatal("explicit browser address changed", got, err)
		}
	}
	for _, value := range []string{"/futures", "//example.invalid", "javascript:alert(1)", "https://", "https://user:secret@example.invalid", "https://example.invalid?token=secret", "https://example.invalid?", "https://example.invalid#secret", "https://example.invalid#", "https://example.invalid\\other", "https://example.invalid/\npath"} {
		if _, err := PublicFuturesURL(value); err == nil {
			t.Fatal("unsafe or ambiguous browser address accepted")
		}
	}
}

func TestUIConfigIsAuthenticatedAndIndependentOfInternalServices(t *testing.T) {
	service, user := strings.Repeat("service", 8), strings.Repeat("user", 10)
	upstreamCalls := 0
	up := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		upstreamCalls++
		http.Error(w, "unavailable", http.StatusServiceUnavailable)
	}))
	defer up.Close()
	for _, entry := range []string{"", "http://127.0.0.1:18098", "https://research.example.invalid/workspace/"} {
		h := (&Server{HTTP: servicehttp.Config{Role: "control", Token: service, AdminToken: user, UserFacing: true, PublicPath: PublicPath}, Client: serviceclient.Client{RegistryURL: up.URL, RuntimeURL: up.URL, CatalogURL: up.URL, Token: service}, KnowledgeURL: up.URL, StorageURL: up.URL, SourcesURL: up.URL, FuturesPublicURL: entry}).Handler()
		for _, token := range []string{"", service, user} {
			r := httptest.NewRequest(http.MethodGet, "/api/ui-config", nil)
			if token != "" {
				r.Header.Set("Authorization", "Bearer "+token)
			}
			w := httptest.NewRecorder()
			h.ServeHTTP(w, r)
			if token != user {
				if w.Code != http.StatusUnauthorized {
					t.Fatal("browser config bypassed user authentication", w.Code)
				}
				continue
			}
			var result map[string]string
			if w.Code != http.StatusOK || json.Unmarshal(w.Body.Bytes(), &result) != nil || len(result) != 1 || result["futures_public_url"] != entry || w.Header().Get("Cache-Control") != "no-store" {
				t.Fatal("public config response changed", w.Code, w.Body.String())
			}
			for _, private := range []string{service, user, up.URL} {
				if strings.Contains(w.Body.String(), private) {
					t.Fatal("internal configuration leaked to browser")
				}
			}
		}
	}
	if upstreamCalls != 0 {
		t.Fatal("navigation configuration contacted a downstream service", upstreamCalls)
	}
}
