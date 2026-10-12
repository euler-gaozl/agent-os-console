package main

import (
	"context"
	"github.com/euler-gaozl/agent-os-console/console"
	"github.com/euler-gaozl/agent-os-sdk/servicehost"
	"github.com/euler-gaozl/agent-os-sdk/servicehttp"
	"github.com/jackc/pgx/v5/pgxpool"
	"net/http"
)

func main() {
	servicehost.Main(servicehost.Options{Role: "control", Port: "8090", Database: false, Concurrency: 16, UserFacing: true, PublicPath: console.PublicPath, AdminTokenEnv: "ADMIN_TOKEN"}, func(ctx context.Context, p *pgxpool.Pool, c servicehttp.Config) (http.Handler, func(context.Context) error, error) {
		if err := console.ValidateUserToken(c); err != nil {
			return nil, nil, err
		}
		if err := applyLocalDefaults(); err != nil {
			return nil, nil, err
		}
		return (&console.Server{HTTP: c, Client: servicehost.Client(), SourcesURL: servicehost.Env("SOURCES_URL", "http://127.0.0.1:8101"), StorageURL: servicehost.Env("STORAGE_URL", "http://127.0.0.1:8092"), KnowledgeURL: servicehost.Env("KNOWLEDGE_URL", "http://127.0.0.1:8095"), WebDir: servicehost.Env("WEB_DIR", "web/dist")}).Handler(), nil, nil
	})
}
