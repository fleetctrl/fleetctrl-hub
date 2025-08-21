package auth

import (
	"encoding/json"
	"errors"
	"net/http"
)

// TokenHandler handles OAuth token requests.
type TokenHandler struct {
	Service *Service
	Limiter *RateLimiter
}

// ServeHTTP implements http.Handler.
func (h *TokenHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if err := r.ParseForm(); err != nil {
		writeErr(w, http.StatusBadRequest, err)
		return
	}
	grant := r.FormValue("grant_type")
	deviceID := r.FormValue("device_id")
	switch grant {
	case "client_credentials":
		secret := r.FormValue("device_secret")
		if deviceID == "" || secret == "" {
			writeErr(w, http.StatusBadRequest, errors.New("missing credentials"))
			return
		}
		if h.Limiter != nil && !h.Limiter.Allow(deviceID) {
			writeErr(w, http.StatusTooManyRequests, errors.New("rate limit exceeded"))
			return
		}
		at, rt, err := h.Service.Authenticate(r.Context(), deviceID, secret)
		if err != nil {
			writeErr(w, http.StatusUnauthorized, err)
			return
		}
		writeJSON(w, map[string]any{
			"access_token":  at,
			"refresh_token": rt,
			"token_type":    "bearer",
			"expires_in":    int(h.Service.tokens.atLifetime.Seconds()),
		})
	case "refresh_token":
		rt := r.FormValue("refresh_token")
		if deviceID == "" || rt == "" {
			writeErr(w, http.StatusBadRequest, errors.New("missing credentials"))
			return
		}
		at, newRT, err := h.Service.Refresh(r.Context(), deviceID, rt)
		if err != nil {
			writeErr(w, http.StatusUnauthorized, err)
			return
		}
		writeJSON(w, map[string]any{
			"access_token":  at,
			"refresh_token": newRT,
			"token_type":    "bearer",
			"expires_in":    int(h.Service.tokens.atLifetime.Seconds()),
		})
	default:
		writeErr(w, http.StatusBadRequest, errors.New("unsupported grant_type"))
	}
}

func writeJSON(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(v)
}

func writeErr(w http.ResponseWriter, status int, err error) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
}
