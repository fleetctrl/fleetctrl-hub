package main

import (
	"bytes"
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

// withInternalMiddleware protects internal endpoints using the SERVICE_ROLE_KEY.
// This is used for server-to-server communication (e.g., Next.js -> Go API).
func withInternalMiddleware(h http.HandlerFunc) http.Handler {
	return loggingMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Use SERVICE_ROLE_KEY or a specific INTERNAL_API_KEY
		secret := os.Getenv("SERVICE_ROLE_KEY")
		if secret == "" {
			// Fallback or specific internal key if preferred
			secret = os.Getenv("INTERNAL_API_KEY")
		}

		auth := r.Header.Get("Authorization")
		if auth != "Bearer "+secret {
			_ = utils.WriteError(w, http.StatusUnauthorized, errors.New("unauthorized internal access"))
			return
		}
		h(w, r)
	}))
}

func loggingMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()

		lrw := &loggingResponseWriter{ResponseWriter: w}
		next.ServeHTTP(lrw, r)

		duration := time.Since(start)
		if lrw.status == 0 {
			lrw.status = http.StatusOK
		}

		// Base access log
		log.Printf("%d %s %s %s", lrw.status, r.Method, r.URL.Path, duration)

		// If an error response was sent, include its body (truncated)
		if lrw.status >= 400 {
			body := lrw.body.String()
			const maxLen = 2048
			if len(body) > maxLen {
				body = body[:maxLen] + "..."
			}
			if body != "" {
				log.Printf("error response: %s", body)
			}
		}
	})
}

// loggingResponseWriter captures status code and body for logging.
type loggingResponseWriter struct {
	http.ResponseWriter
	status int
	body   bytes.Buffer
}

func (lrw *loggingResponseWriter) WriteHeader(statusCode int) {
	lrw.status = statusCode
	lrw.ResponseWriter.WriteHeader(statusCode)
}

func (lrw *loggingResponseWriter) Write(b []byte) (int, error) {
	if lrw.status == 0 {
		lrw.status = http.StatusOK
	}
	_, _ = lrw.body.Write(b)
	return lrw.ResponseWriter.Write(b)
}
