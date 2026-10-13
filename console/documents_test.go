package console

import (
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/euler-gaozl/agent-os-sdk/serviceclient"
)

func TestConsoleRoutesNotesToRuntimeAndBytesToStorage(t *testing.T) {
	upstream := func(domain string) *httptest.Server {
		return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.Header.Get("Authorization") != "Bearer fixture-control-token" {
				t.Error("service identity lost")
			}
			body, _ := io.ReadAll(r.Body)
			w.Header().Set("Content-Type", "text/plain")
			_, _ = io.WriteString(w, domain+" "+r.Method+" "+r.URL.RequestURI()+" "+string(body))
		}))
	}
	runtime, storage := upstream("runtime"), upstream("storage")
	defer runtime.Close()
	defer storage.Close()
	s := &Server{StorageURL: storage.URL, Client: serviceclient.Client{RuntimeURL: runtime.URL, Token: "fixture-control-token"}}
	m := http.NewServeMux()
	s.Routes(m)
	for _, tc := range []struct{ method, path, body, want string }{
		{"GET", "/api/documents?q=retained&kind=memory", "", "runtime GET /v1/documents?q=retained&kind=memory "},
		{"GET", "/api/documents/old-id", "", "runtime GET /v1/documents/old-id "},
		{"GET", "/api/notes?state=retired", "", "runtime GET /v1/notes?state=retired "},
		{"GET", "/api/notes/old-id/history", "", "runtime GET /v1/notes/old-id/history "},
		{"POST", "/api/notes/retire", `{"request_id":"retry-stable"}`, `runtime POST /v1/notes/retire {"request_id":"retry-stable"}`},
		{"POST", "/api/documents", `{"content":"same body"}`, `runtime POST /v1/documents {"content":"same body"}`},
		{"GET", "/api/artifacts/hash", "", "storage GET /artifacts/hash "},
		{"GET", "/api/runs/run-id/working-state?revision=2", "", "runtime GET /v1/runs/run-id/working-state?revision=2 "},
		{"GET", "/api/runs/run-id/source-recovery", "", "runtime GET /v1/runs/run-id/source-recovery "},
		{"GET", "/api/runs/run-id/calls/page?limit=25&filter=unresolved&after=cursor", "", "runtime GET /v1/runs/run-id/calls/page?limit=25&filter=unresolved&after=cursor "},
		{"GET", "/api/runs/run-id/calls/record?operation_id=run-id%2Fdsh%2F3&field=response&offset=8192&version=hash", "", "runtime GET /v1/runs/run-id/calls/record?operation_id=run-id%2Fdsh%2F3&field=response&offset=8192&version=hash "},
		{"POST", "/api/runs/run-id/resume-source-state", "{}", "runtime POST /v1/runs/run-id/resume-source-state {}"},
	} {
		w := httptest.NewRecorder()
		m.ServeHTTP(w, httptest.NewRequest(tc.method, tc.path, strings.NewReader(tc.body)))
		if w.Code != 200 || w.Body.String() != tc.want {
			t.Fatal("wrong data owner", w.Code, w.Body.String())
		}
	}
}
