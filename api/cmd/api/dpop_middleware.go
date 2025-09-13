package main

import (
	"context"
	"crypto"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"net/http"
	"os"
	"strings"
	"time"

	iauth "github.com/fleetctrl/fleetctrl-hub/api/cmd/internal/auth"
	"github.com/fleetctrl/fleetctrl-hub/api/cmd/internal/utils"
	"github.com/golang-jwt/jwt/v5"
	"github.com/lestrrat-go/jwx/v2/jwa"
	"github.com/lestrrat-go/jwx/v2/jws"
)

// dpopClaims represents the expected DPoP proof claims
type dpopClaims struct {
	HTU string `json:"htu"`
	HTM string `json:"htm"`
	IAT int64  `json:"iat"`
	JTI string `json:"jti"`
	ATH string `json:"ath,omitempty"`
}

// withDPoP validates the DPoP proof and its binding to the access token.
// It requires Authorization: Bearer <access_token> and DPoP: <proof> headers.
func withDPoP(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		dpop := r.Header.Get("DPoP")
		if dpop == "" {
			_ = utils.WriteError(w, http.StatusUnauthorized, errors.New("missing DPoP header"))
			return
		}

		authz := r.Header.Get("Authorization")
		if !strings.HasPrefix(authz, "Bearer ") {
			_ = utils.WriteError(w, http.StatusUnauthorized, errors.New("missing bearer token"))
			return
		}
		accessToken := strings.TrimPrefix(authz, "Bearer ")

		// 1) Parse JWS header to extract JWK and header params.
		msg, err := jws.ParseString(dpop)
		if err != nil || len(msg.Signatures()) == 0 {
			_ = utils.WriteError(w, http.StatusUnauthorized, errors.New("invalid DPoP format"))
			return
		}
		hdr := msg.Signatures()[0].ProtectedHeaders()

		// typ must be dpop+jwt
		if typ := hdr.Type(); !strings.EqualFold(typ, "dpop+jwt") {
			_ = utils.WriteError(w, http.StatusUnauthorized, errors.New("invalid DPoP typ"))
			return
		}

		// Extract JWK from header
		jwkKey := hdr.JWK()

		// Reject symmetric keys
		if kty := jwkKey.KeyType(); kty == jwa.OctetSeq {
			_ = utils.WriteError(w, http.StatusUnauthorized, errors.New("invalid DPoP key type"))
			return
		}

		// Enforce allowed algs (no HS*)
		algStr := hdr.Algorithm()
		if strings.HasPrefix(strings.ToUpper(algStr.String()), "HS") {
			_ = utils.WriteError(w, http.StatusUnauthorized, errors.New("DPoP alg not allowed"))
			return
		}

		var pubKey any
		if err := jwkKey.Raw(&pubKey); err != nil {
			_ = utils.WriteError(w, http.StatusUnauthorized, errors.New("invalid DPoP key"))
			return
		}

		// 2) Verify JWS signature
		payload, err := jws.Verify([]byte(dpop), jws.WithKey(jwa.SignatureAlgorithm(algStr), pubKey))
		if err != nil {
			_ = utils.WriteError(w, http.StatusUnauthorized, errors.New("invalid DPoP signature"))
			return
		}

		// 3) Validate payload claims
		var pc dpopClaims
		if err := json.Unmarshal(payload, &pc); err != nil {
			_ = utils.WriteError(w, http.StatusUnauthorized, errors.New("invalid DPoP payload"))
			return
		}

		// iat freshness (15 minutes)
		now := time.Now().UTC()
		iat := time.Unix(pc.IAT, 0).UTC()
		if iat.After(now.Add(2*time.Minute)) || now.Sub(iat) > 15*time.Minute {
			_ = utils.WriteError(w, http.StatusUnauthorized, errors.New("stale DPoP proof"))
			return
		}

		// htm/htu match
		expectedHTU := iauth.DefaultExternalURL(r).String()
		if pc.HTU != expectedHTU {
			_ = utils.WriteError(w, http.StatusUnauthorized, errors.New("htu mismatch"))
			return
		}

		// 4) Anti-replay: jti uniqueness within window
		if rdb != nil {
			key := "dpop:jti:" + pc.JTI
			// 15 min TTL to match freshness window
			ok, err := rdb.SetNX(context.Background(), key, 1, 15*time.Minute).Result()
			if err != nil {
				_ = utils.WriteError(w, http.StatusUnauthorized, errors.New("unable to check replayed DPoP proof"))
				return
			}
			if !ok {
				_ = utils.WriteError(w, http.StatusUnauthorized, errors.New("replayed DPoP proof"))
				return
			}
		}

		// 5) Validate access token and cnf.jkt binding
		jwtSecret := os.Getenv("JWT_SECRET")
		if len(jwtSecret) < 32 {
			_ = utils.WriteError(w, http.StatusUnauthorized, errors.New("server jwt misconfigured"))
			return
		}

		// Compute jkt from DPoP JWK (RFC7638 SHA-256 thumbprint)
		th, err := jwkKey.Thumbprint(crypto.SHA256)
		if err != nil {
			_ = utils.WriteError(w, http.StatusUnauthorized, errors.New("invalid DPoP thumbprint"))
			return
		}
		jkt := base64.RawURLEncoding.EncodeToString(th)

		token, err := jwt.Parse(accessToken, func(t *jwt.Token) (interface{}, error) {
			// enforce HS256
			if t.Method.Alg() != "HS256" {
				return nil, errors.New("unexpected jwt alg")
			}
			return []byte(jwtSecret), nil
		})
		if err != nil || !token.Valid {
			_ = utils.WriteError(w, http.StatusUnauthorized, errors.New("invalid access token"))
			return
		}

		claims, ok := token.Claims.(jwt.MapClaims)
		if !ok {
			_ = utils.WriteError(w, http.StatusUnauthorized, errors.New("invalid token claims"))
			return
		}
		cnf, _ := claims["cnf"].(map[string]any)
		tokenJKT, _ := cnf["jkt"].(string)
		if tokenJKT == "" || tokenJKT != jkt {
			_ = utils.WriteError(w, http.StatusUnauthorized, errors.New("jkt mismatch"))
			return
		}

		// Validate ath if present in proof
		if pc.ATH != "" {
			sum := sha256.Sum256([]byte(accessToken))
			ath := base64.RawURLEncoding.EncodeToString(sum[:])
			if pc.ATH != ath {
				_ = utils.WriteError(w, http.StatusUnauthorized, errors.New("ath mismatch"))
				return
			}
		}

		// Forward useful auth info to downstream handlers
		if sub, ok := claims["sub"].(string); ok && strings.HasPrefix(sub, "device:") {
			computerID := strings.TrimPrefix(sub, "device:")
			// Add to request headers for further use
			r.Header.Set("X-Computer-ID", computerID)
		}

		next(w, r)
	}
}
