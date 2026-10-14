package console

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/euler-gaozl/agent-os-sdk/serviceclient"
	"github.com/euler-gaozl/agent-os-sdk/servicehttp"
)

func TestNativeModelPreviewUsesServerIdentity(t *testing.T) {
	service, user := strings.Repeat("s", 32), strings.Repeat("u", 32)
	calls := 0
	up := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		if r.URL.Path != "/v1/models/resolve" || r.Method != "POST" || r.Header.Get("Authorization") != "Bearer "+service {
			t.Error("model preview lost method, route or server identity")
		}
		var model map[string]any
		if err := json.NewDecoder(r.Body).Decode(&model); err != nil || model["key_env"] != "PROVIDER_KEY" {
			t.Error("model connection changed in BFF")
		}
		_, _ = io.WriteString(w, `{"context_window":1048576,"max_output_tokens":393216}`)
	}))
	defer up.Close()
	h := (&Server{HTTP: servicehttp.Config{Role: "control", Token: service, AdminToken: user, UserFacing: true}, Client: serviceclient.Client{RegistryURL: up.URL, Token: service}}).Handler()
	for _, authenticated := range []bool{false, true} {
		r := httptest.NewRequest("POST", "/api/models/resolve", strings.NewReader(`{"base_url":"https://api.deepseek.com","model":"deepseek-flash","key_env":"PROVIDER_KEY"}`))
		if authenticated {
			r.Header.Set("Authorization", "Bearer "+user)
		}
		w := httptest.NewRecorder()
		h.ServeHTTP(w, r)
		if !authenticated && (w.Code != 401 || calls != 0) {
			t.Fatal("unauthorized preview reached Registry")
		}
		if authenticated && (w.Code != 200 || calls != 1 || !strings.Contains(w.Body.String(), "393216")) {
			t.Fatal("authorized preview failed", w.Code)
		}
	}
}

func TestNativeTaskTransportPreservesLongBodies(t *testing.T) {
	input := `{"task":"` + strings.Repeat("x", 4500000) + `"}`
	output := `{"output":"` + strings.Repeat("y", 9000000) + `"}`
	calls := 0
	up := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		if r.Method == "POST" {
			body, err := io.ReadAll(r.Body)
			if err != nil || string(body) != input {
				t.Error("task input truncated", err)
			}
		}
		_, _ = io.WriteString(w, output)
	}))
	defer up.Close()
	h := http.NewServeMux()
	(&Server{Client: serviceclient.Client{RuntimeURL: up.URL, Token: "synthetic-service"}}).Routes(h)
	for _, method := range []string{"POST", "GET"} {
		path := "/api/runs"
		var body io.Reader = strings.NewReader(input)
		if method == "GET" {
			path += "/synthetic-run"
			body = nil
		}
		w := httptest.NewRecorder()
		h.ServeHTTP(w, httptest.NewRequest(method, path, body))
		if w.Code != 200 || w.Body.String() != output {
			t.Fatal("large task response changed", method, w.Code, w.Body.Len())
		}
	}
	if calls != 2 {
		t.Fatal("unexpected upstream calls", calls)
	}
	// Lists and side routes do not inherit the large single-task allowance.
	w := httptest.NewRecorder()
	h.ServeHTTP(w, httptest.NewRequest("GET", "/api/runs", nil))
	if w.Code != 502 || strings.Contains(w.Body.String(), strings.Repeat("y", 100)) {
		t.Fatal("oversized list silently truncated")
	}
}
