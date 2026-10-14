package webproxy

import (
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestProxyRejectsIncompleteOrOversizedBeforeSuccess(t *testing.T) {
	for _, mode := range []string{"request", "response", "partial"} {
		t.Run(mode, func(t *testing.T) {
			calls := 0
			up := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				calls++
				if mode == "partial" {
					conn, buf, err := w.(http.Hijacker).Hijack()
					if err != nil {
						t.Error(err)
						return
					}
					defer conn.Close()
					_, _ = fmt.Fprint(buf, "HTTP/1.1 200 OK\r\nContent-Length: 10\r\n\r\n{}")
					_ = buf.Flush()
					return
				}
				_, _ = io.WriteString(w, strings.Repeat("x", 32))
			}))
			defer up.Close()
			input := "{}"
			if mode == "request" {
				input = strings.Repeat("x", 20)
			}
			w := httptest.NewRecorder()
			ProxyLimits(w, httptest.NewRequest("POST", "/", strings.NewReader(input)), up.URL, "fixture", 16, 16)
			want := 502
			if mode == "request" {
				want = 413
				if calls != 0 {
					t.Fatal("oversized input sent upstream")
				}
			}
			if w.Code != want || strings.Contains(w.Body.String(), strings.Repeat("x", 10)) {
				t.Fatal("partial success leaked", w.Code)
			}
		})
	}
}
