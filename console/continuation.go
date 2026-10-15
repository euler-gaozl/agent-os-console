package console

import (
	"net/http"
	"strings"

	"github.com/euler-gaozl/agent-os-console/internal/webproxy"
	"github.com/euler-gaozl/agent-os-sdk/servicehttp"
)

// The Runtime owns validation, admission and durable receipts. These specific
// routes preserve escaped task IDs and bound both sides of the transport.
func (s *Server) continuationRoutes(mux *http.ServeMux) {
	for _, path := range []string{
		"/api/runs/{id}/continuation/request-context",
		"/api/runs/{id}/continuation",
		"/api/runs/{id}/continuation/requests/{request_id}",
	} {
		mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Cache-Control", "no-store")
			if r.URL.RawQuery != "" || r.URL.ForceQuery {
				servicehttp.JSONResponse(w, 400, map[string]string{"error": "continuation takes no query parameters"})
				return
			}
			target := s.Client.RuntimeURL + strings.Replace(r.URL.EscapedPath(), "/api/", "/v1/", 1)
			webproxy.ProxyLimits(w, r, target, s.Client.Token, 1024, 16<<10)
		})
	}
}
