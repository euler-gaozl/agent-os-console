package console

import (
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"

	"github.com/euler-gaozl/agent-os-sdk/serviceclient"
)

func TestContinuationProxyRetainsReceiptIdentityAndStatus(t *testing.T) {
	for _, tc := range []struct {
		method, path, body string
		status             int
	}{
		{"GET", "/api/runs/a%2Fb/continuation/request-context", "", 200},
		{"POST", "/api/runs/a%2Fb/continuation", `{"request_id":"stable","expected_failure_version":"abc"}`, 202},
		{"POST", "/api/runs/a%2Fb/continuation", `{"request_id":"stable","expected_failure_version":"abc"}`, 409},
		{"GET", "/api/runs/a%2Fb/continuation/requests/stable", "", 200},
		{"HEAD", "/api/runs/a%2Fb/continuation/request-context", "", 405},
	} {
		t.Run(tc.method+tc.path+http.StatusText(tc.status), func(t *testing.T) {
			up := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if r.Method != tc.method || r.URL.RequestURI() != strings.Replace(tc.path, "/api/", "/v1/", 1) {
					t.Error("request identity changed")
				}
				if r.Header.Get("Authorization") != "Bearer fixture-control-token" || r.Header.Get("Idempotency-Key") != "stable" {
					t.Error("wrong identity")
				}
				body, _ := io.ReadAll(r.Body)
				if string(body) != tc.body {
					t.Error("request body changed")
				}
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(tc.status)
				if tc.method != "HEAD" {
					_, _ = io.WriteString(w, `{"opaque":"fixture receipt or error"}`)
				}
			}))
			defer up.Close()
			s := &Server{Client: serviceclient.Client{RuntimeURL: up.URL, Token: "fixture-control-token"}}
			mux := http.NewServeMux()
			s.Routes(mux)
			r := httptest.NewRequest(tc.method, tc.path, strings.NewReader(tc.body))
			r.Header.Set("Authorization", "Bearer browser-token")
			r.Header.Set("Idempotency-Key", "stable")
			w := httptest.NewRecorder()
			mux.ServeHTTP(w, r)
			if w.Code != tc.status || w.Header().Get("Cache-Control") != "no-store" {
				t.Fatal(w.Code, w.Header())
			}
			if tc.method != "HEAD" && w.Body.String() != `{"opaque":"fixture receipt or error"}` {
				t.Fatal("receipt changed", w.Body.String())
			}
		})
	}
}

func TestContinuationProxyDoesNotReportTransportFailureAsReceipt(t *testing.T) {
	var calls atomic.Int32
	up := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		w.WriteHeader(202)
		_, _ = io.WriteString(w, strings.Repeat("x", (16<<10)+1))
	}))
	defer up.Close()
	s := &Server{Client: serviceclient.Client{RuntimeURL: up.URL}}
	mux := http.NewServeMux()
	s.Routes(mux)
	for _, path := range []string{"/api/runs/r/continuation?", "/api/runs/r/continuation?bad=1", "/api/runs/r/continuation/request-context?", "/api/runs/r/continuation/requests/stable?"} {
		w := httptest.NewRecorder()
		mux.ServeHTTP(w, httptest.NewRequest("POST", path, strings.NewReader("{}")))
		if w.Code != 400 || calls.Load() != 0 || w.Header().Get("Cache-Control") != "no-store" {
			t.Fatal("query changed or reached Runtime", path, w.Code, calls.Load())
		}
	}
	w := httptest.NewRecorder()
	mux.ServeHTTP(w, httptest.NewRequest("POST", "/api/runs/r/continuation", strings.NewReader(strings.Repeat("x", 1025))))
	if w.Code != 413 || calls.Load() != 0 {
		t.Fatal("oversized request reached Runtime", w.Code, calls.Load())
	}
	w = httptest.NewRecorder()
	mux.ServeHTTP(w, httptest.NewRequest("POST", "/api/runs/r/continuation", strings.NewReader("{}")))
	if w.Code != 502 || strings.Contains(w.Body.String(), `"committed"`) || w.Header().Get("Cache-Control") != "no-store" {
		t.Fatal("oversized response looked committed", w.Code)
	}
	up.Close()
	w = httptest.NewRecorder()
	mux.ServeHTTP(w, httptest.NewRequest("POST", "/api/runs/r/continuation", strings.NewReader("{}")))
	if w.Code != 503 || strings.Contains(w.Body.String(), `"committed"`) {
		t.Fatal("unavailable upstream looked committed", w.Code)
	}
}
