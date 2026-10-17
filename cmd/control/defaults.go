package main

import "os"

// Called after configuration loading and before any client or background task.
// These are this service's legacy local addresses, never SDK-wide role policy.
func applyLocalDefaults() error {
	for key, value := range map[string]string{"RUNTIME_URL": "http://127.0.0.1:8094", "REGISTRY_URL": "http://127.0.0.1:8096", "TOOLHUB_URL": "http://127.0.0.1:8091"} {
		if os.Getenv(key) == "" {
			if err := os.Setenv(key, value); err != nil {
				return err
			}
		}
	}
	// The local owner layout has a sibling Futures BFF. Do not infer this
	// address outside explicit local-dev mode; production must configure it.
	if os.Getenv("DEV_LOCAL") == "1" && os.Getenv("FUTURES_PUBLIC_URL") == "" {
		if err := os.Setenv("FUTURES_PUBLIC_URL", "http://127.0.0.1:8098/"); err != nil {
			return err
		}
	}
	return nil
}
