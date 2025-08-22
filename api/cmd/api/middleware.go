package main

import (
	"errors"
	"log"
	"net/http"
	"os"
	"time"

	"github.com/fleetctrl/fleetctrl-hub/api/cmd/internal/utils"
)

// withMiddleware applies authentication and logging to handlers.
func withMiddleware(h http.HandlerFunc) http.Handler {
	return loggingMiddleware(authMiddleware(h))
}

func authMiddleware(next http.Handler) http.Handler {
	token := os.Getenv("API_TOKEN")
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if token != "" {
			auth := r.Header.Get("Authorization")
			if auth != "Bearer "+token {
				_ = utils.WriteError(w, http.StatusUnauthorized, errors.New("unauthorized"))
				return
			}
		}
		next.ServeHTTP(w, r)
	})
}

func loggingMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		next.ServeHTTP(w, r)
		log.Printf("%s %s %s", r.Method, r.URL.Path, time.Since(start))
	})
}
