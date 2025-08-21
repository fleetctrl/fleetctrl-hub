package auth

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/fleetctrl/fleetctrl-hub/api/cmd/pkgs/utils"
	"github.com/lestrrat-go/jwx/v2/jwk"
	"github.com/lestrrat-go/jwx/v2/jws"
)

type dpopPayload struct {
	HTU string `json:"htu"`
	HTM string `json:"htm"`
	IAT int64  `json:"iat"`
	JTI string `json:"jti"`
}

func DPoPRequired(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		dpop := r.Header.Get("DPoP")
		if dpop == "" {
			utils.WriteError(w, http.StatusUnauthorized, errors.New("dpop_required"))
			return
		}

		msg, err := jws.Parse([]byte(dpop))
		if err != nil || len(msg.Signatures()) == 0 {
			utils.WriteError(w, http.StatusUnauthorized, errors.New("dpop_required"))
			return
		}
		h := msg.Signatures()[0].ProtectedHeaders()
		jwkVal, ok := h.Get("jwk")
		if !ok {
			utils.WriteError(w, http.StatusUnauthorized, errors.New("dpop_missing_jwk"))
			return
		}
		pub, ok := jwkVal.(jwk.Key)
		if !ok {
			utils.WriteError(w, http.StatusUnauthorized, errors.New("dpop_bad_jwk"))
			return
		}

		// Verify signature using embedded JWK
		if _, err := jws.Verify([]byte(dpop), jws.WithKey(pub.Algorithm(), pub)); err != nil {
			utils.WriteError(w, http.StatusUnauthorized, errors.New("dpop_bad_sig"))
			return
		}

		// Validate payload: htu/htm match, iat fresh
		var pl dpopPayload
		if err := json.Unmarshal(msg.Payload(), &pl); err != nil {
			utils.WriteError(w, http.StatusUnauthorized, errors.New("dpop_bad_payload"))
			return
		}

		// Expected values
		expHTU := strings.ToLower(r.URL.Scheme + "://" + r.Host + r.URL.Path) // pokud je za proxy, slož z X-Forwarded-Proto/Host
		if xfproto := r.Header.Get("X-Forwarded-Proto"); xfproto != "" {
			expHTU = strings.ToLower(xfproto + "://" + r.Host + r.URL.Path)
		}
		if pl.HTU != expHTU || !strings.EqualFold(pl.HTM, r.Method) {
			utils.WriteError(w, http.StatusUnauthorized, errors.New("dpop_mismatch"))
			return
		}
		now := time.Now().Unix()
		if abs := now - pl.IAT; abs < -60 || abs > 60 {
			utils.WriteError(w, http.StatusUnauthorized, errors.New("dpop_iat_skew"))
			return
		}

		// Compare jkt with JWT cnf.jkt extracted by your Bearer auth middleware
		jktFromDPoP, _ := base64urlSha256JWK(pub)
		jktFromJWT := cnfJKTFromContext(r.Context()) // nastav v AuthBearer, když parsuješ JWT
		if jktFromJWT == "" || jktFromDPoP != jktFromJWT {
			utils.WriteError(w, http.StatusUnauthorized, errors.New("dpop_jkt_mismatch"))
			return
		}

		next.ServeHTTP(w, r)
	})
}
