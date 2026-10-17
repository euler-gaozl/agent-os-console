package console

import (
	"context"
	"net/http"
	"time"

	"github.com/euler-gaozl/agent-os-sdk/servicehttp"
)

func ModelManagementProfile() map[string]any {
	return map[string]any{"format": 1, "requires": "agent-model-native-v1", "requires_final_output": "receipt-field-v1"}
}

// Old Registry versions may silently drop unknown limits fields on save. Refuse
// before forwarding any resource write unless the bound Registry attests support.
// This is also enforced for unmanaged deployments, not only Windows packages.
func (s *Server) modelManagementReady(w http.ResponseWriter, r *http.Request) bool {
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()
	var profile struct {
		Format      int    `json:"format"`
		Provides    string `json:"provides"`
		FinalOutput string `json:"final_output"`
	}
	err := s.Client.Request(ctx, "GET", s.Client.RegistryURL+"/v1/models/capabilities", nil, &profile)
	if err != nil || profile.Format != 1 || profile.Provides != "agent-model-native-v1" || profile.FinalOutput != "receipt-field-v1" {
		servicehttp.JSONResponse(w, 503, map[string]string{"error": "Registry 尚未支持模型原生能力及原文交付配置，请先升级 Registry；本次配置未保存。"})
		return false
	}
	return true
}
