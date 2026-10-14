package console

import (
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/euler-gaozl/agent-os-sdk/serviceclient"
	"github.com/euler-gaozl/agent-os-sdk/servicehttp"
)

func TestResourceSaveRequiresRegistryModelSupport(t *testing.T) {
	service, user := strings.Repeat("s", 32), strings.Repeat("u", 32)
	body := `{"kind":"agent","spec":{"model":{"limits":{}}}}`
	for _, tc := range []struct {
		name, profile string
		status, want  int
	}{
		{"old registry", "not found", 404, 503},
		{"unavailable", "synthetic-private-detail", 503, 503},
		{"malformed", "{", 200, 503},
		{"wrong version", `{"format":2,"provides":"agent-model-native-v1"}`, 200, 503},
		{"missing capability", `{"format":1}`, 200, 503},
		{"supported", `{"format":1,"provides":"agent-model-native-v1"}`, 200, 201},
	} {
		t.Run(tc.name, func(t *testing.T) {
			probes, writes := 0, 0
			up := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if r.Header.Get("Authorization") != "Bearer "+service {
					t.Error("browser identity forwarded instead of service identity")
				}
				switch r.URL.Path {
				case "/v1/models/capabilities":
					probes++
					if r.Method != http.MethodGet {
						t.Error("capability probe must be read-only")
					}
					w.WriteHeader(tc.status)
					_, _ = io.WriteString(w, tc.profile)
				case "/v1/resources":
					writes++
					got, err := io.ReadAll(r.Body)
					if r.Method != http.MethodPost || err != nil || string(got) != body {
						t.Error("save body or method changed")
					}
					w.WriteHeader(http.StatusCreated)
					_, _ = io.WriteString(w, `{"revision":2}`)
				default:
					t.Error("unexpected upstream route", r.URL.Path)
				}
			}))
			defer up.Close()
			h := (&Server{HTTP: servicehttp.Config{Role: "control", Token: service, AdminToken: user, UserFacing: true}, Client: serviceclient.Client{RegistryURL: up.URL, Token: service}}).Handler()
			for _, authenticated := range []bool{false, true} {
				r := httptest.NewRequest(http.MethodPost, "/api/resources", strings.NewReader(body))
				if authenticated {
					r.Header.Set("Authorization", "Bearer "+user)
				}
				w := httptest.NewRecorder()
				h.ServeHTTP(w, r)
				if !authenticated {
					if w.Code != 401 || probes != 0 || writes != 0 {
						t.Fatal("unauthorized save reached Registry")
					}
					continue
				}
				if w.Code != tc.want || probes != 1 || strings.Contains(w.Body.String(), "synthetic-private-detail") {
					t.Fatal("unexpected compatibility response", w.Code, probes)
				}
				if (tc.want == 201 && writes != 1) || (tc.want != 201 && writes != 0) {
					t.Fatal("unsupported Registry received a save", writes)
				}
			}
		})
	}
}
