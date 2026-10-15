package console

import (
	"errors"
	"net/http"
	"net/url"
	"strings"

	"github.com/euler-gaozl/agent-os-sdk/servicehttp"
)

// PublicFuturesURL validates a browser navigation target, not an internal
// service endpoint. No default host or port can be inferred for a remote user.
func PublicFuturesURL(value string) (string, error) {
	value = strings.TrimSpace(value)
	if value == "" {
		return "", nil
	}
	u, err := url.Parse(value)
	if err != nil || len(value) > 2048 || strings.ContainsAny(value, "\\\r\n\t") ||
		(u.Scheme != "http" && u.Scheme != "https") || u.Hostname() == "" ||
		u.User != nil || u.RawQuery != "" || u.ForceQuery || u.Fragment != "" || strings.Contains(value, "#") {
		return "", errors.New("FUTURES_PUBLIC_URL must be an absolute HTTP(S) browser URL without credentials, query or fragment")
	}
	return value, nil
}

func (s *Server) uiConfig(w http.ResponseWriter, r *http.Request) error {
	entry, err := PublicFuturesURL(s.FuturesPublicURL)
	if err != nil {
		return &servicehttp.StatusError{Status: http.StatusServiceUnavailable, Message: "business entry unavailable"}
	}
	w.Header().Set("Cache-Control", "no-store")
	servicehttp.JSONResponse(w, http.StatusOK, map[string]string{"futures_public_url": entry})
	return nil
}
