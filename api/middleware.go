package main

import (
	"errors"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/fleetctrl/fleetctrl-hub/api/auth"
)

var authSvc *auth.Service

// withMiddleware applies security and logging to handlers.
func withMiddleware(h http.HandlerFunc) http.Handler {
	return loggingMiddleware(protoMiddleware(authMiddleware(h)))
}

// withoutAuth applies middleware without auth.
func withoutAuth(h http.HandlerFunc) http.Handler {
	return loggingMiddleware(protoMiddleware(h))
}

func authMiddleware(next http.Handler) http.Handler {
	token := os.Getenv("API_TOKEN")
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		authHeader := r.Header.Get("Authorization")
		if token != "" && authHeader == "Bearer "+token {
			next.ServeHTTP(w, r)
			return
		}
		if authSvc != nil && strings.HasPrefix(authHeader, "Bearer ") {
			if _, err := authSvc.ValidateAccessToken(strings.TrimPrefix(authHeader, "Bearer ")); err == nil {
				next.ServeHTTP(w, r)
				return
			}
		}
		_ = writeError(w, http.StatusUnauthorized, errors.New("unauthorized"))
	})
}

func protoMiddleware(next http.Handler) http.Handler {
	allowed := os.Getenv("API_ALLOWED_PROTO")
	if allowed == "" {
		allowed = "https"
	}
	allowedList := strings.Split(allowed, ",")
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.TLS != nil {
			next.ServeHTTP(w, r)
			return
		}
		proto := r.Header.Get("X-Forwarded-Proto")
		for _, a := range allowedList {
			if proto == a {
				next.ServeHTTP(w, r)
				return
			}
		}
		_ = writeError(w, http.StatusUpgradeRequired, errors.New("insecure transport"))
	})
}

func loggingMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		next.ServeHTTP(w, r)
		log.Printf("%s %s %s", r.Method, r.URL.Path, time.Since(start))
	})
}
