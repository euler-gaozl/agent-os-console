package main

import (
	"github.com/euler-gaozl/agent-os-sdk/servicehost"
	"os"
	"testing"
)

func TestLegacyEmptyAddressesAndExplicitConfiguration(t *testing.T) {
	defaults := map[string]string{"RUNTIME_URL": "http://127.0.0.1:8094", "REGISTRY_URL": "http://127.0.0.1:8096", "TOOLHUB_URL": "http://127.0.0.1:8091"}
	for key := range defaults {
		t.Setenv(key, "")
	}
	if err := applyLocalDefaults(); err != nil {
		t.Fatal(err)
	}
	for key, want := range defaults {
		if got := os.Getenv(key); got != want {
			t.Fatalf("default %s not preserved", key)
		}
	}
	if got := servicehost.Client().RuntimeURL; got != "http://127.0.0.1:8094" {
		t.Fatal("heartbeat client did not receive legacy Runtime endpoint")
	}
	for key := range defaults {
		t.Setenv(key, "https://operator.example.invalid/"+key)
	}
	if err := applyLocalDefaults(); err != nil {
		t.Fatal(err)
	}
	for key := range defaults {
		if os.Getenv(key) != "https://operator.example.invalid/"+key {
			t.Fatalf("explicit %s overwritten", key)
		}
	}
	t.Setenv("DEV_LOCAL", "1")
	t.Setenv("FUTURES_PUBLIC_URL", "")
	if err := applyLocalDefaults(); err != nil {
		t.Fatal(err)
	}
	if got := os.Getenv("FUTURES_PUBLIC_URL"); got != "http://127.0.0.1:8098/" {
		t.Fatalf("local Futures entry not defaulted: %q", got)
	}
	t.Setenv("FUTURES_PUBLIC_URL", "https://futures.example.invalid/")
	if err := applyLocalDefaults(); err != nil {
		t.Fatal(err)
	}
	if got := os.Getenv("FUTURES_PUBLIC_URL"); got != "https://futures.example.invalid/" {
		t.Fatalf("explicit Futures entry overwritten: %q", got)
	}
	t.Setenv("DEV_LOCAL", "")
	t.Setenv("FUTURES_PUBLIC_URL", "")
	if err := applyLocalDefaults(); err != nil {
		t.Fatal(err)
	}
	if got := os.Getenv("FUTURES_PUBLIC_URL"); got != "" {
		t.Fatalf("non-dev Futures entry defaulted: %q", got)
	}
}
