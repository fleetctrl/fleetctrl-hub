package auth

import (
	"context"
	"crypto"
	"encoding/base64"
	"encoding/json"
	"errors"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/fleetctrl/fleetctrl-hub/api/cmd/internal/models"
	"github.com/fleetctrl/fleetctrl-hub/api/cmd/internal/utils"
	"github.com/golang-jwt/jwt/v5"
	"github.com/lestrrat-go/jwx/v2/jwa"
	"github.com/lestrrat-go/jwx/v2/jwk"
	"github.com/lestrrat-go/jwx/v2/jws"
	"github.com/nedpals/supabase-go"
	"github.com/redis/go-redis/v9"
)

type dpopPayload struct {
	HTU string `json:"htu"`
	HTM string `json:"htm"`
	IAT int64  `json:"iat"`
	JTI string `json:"jti"`
}

type refreshTokensPayload struct {
	RefreshToken string `json:"refresh_token"`
}

type TokenPair struct {
	AccessToken   string `json:"access_token"`
	RefreshToken  string `json:"refresh_token"`
	RecoveryToken string `json:"recovery_token"`
	ExpiresIn     int64  `json:"expires_in"`
}

type DPoPResult struct {
	JWK       jwk.Key
	JKT       string
	Method    string
	URL       string
	JTI       string
	IssuedAt  time.Time
	ATH       string
	HeaderAlg string
}

type EnrollPayload struct {
	Name            string `json:"name"`
	FingerPrintHash string `json:"fingerprint_hash"`
	Jkt             string `json:"jkt"`
}

type AuthService struct {
	sb        *supabase.Client
	redis     *redis.Client
	ATTTL     time.Duration
	RTTTL     time.Duration
	signAlg   string
	signKey   any
	verifyKey any
}

func NewAuthService(sb *supabase.Client, redis *redis.Client, ATTTL time.Duration, RTTTL time.Duration, singAlg string, signKey any, verifyKey any) *AuthService {
	return &AuthService{
		sb:        sb,
		redis:     redis,
		ATTTL:     ATTTL,
		RTTTL:     RTTTL,
		signAlg:   singAlg,
		signKey:   signKey,
		verifyKey: verifyKey,
	}
}

func (as *AuthService) IsEnrolled(w http.ResponseWriter, r *http.Request) {
	fingeprintHash := r.PathValue("fingerprintHash")

	var selected []any
	if err := as.sb.DB.From("computers").Select("id").Eq("fingerprint_hash", fingeprintHash).Execute(&selected); err != nil {
		_ = utils.WriteError(w, http.StatusBadRequest, err)
		return
	}

	if len(selected) > 0 {
		_ = utils.WriteJSON(w, http.StatusOK, map[string]any{
			"is_enrolled": true,
		})
		return
	}

	_ = utils.WriteJSON(w, http.StatusNotFound, map[string]any{
		"is_enrolled": false,
	})
}

func (as *AuthService) Enroll(w http.ResponseWriter, r *http.Request) {
	enrollToken := r.Header.Get("enrollment-token")
	if enrollToken == "" {
		_ = utils.WriteError(w, http.StatusBadRequest, errors.New("missing enrollment-token"))
		return
	}
	var payload EnrollPayload
	if err := utils.ParseJSON(r, &payload); err != nil {
		_ = utils.WriteError(w, http.StatusBadRequest, err)
		return
	}

	// check if computer is already enrolled
	var computer []models.Computer
	if err := as.sb.DB.From("computers").Select("id").Limit(1).Eq("fingerprint_hash", payload.FingerPrintHash).Execute(&computer); err != nil {
		_ = utils.WriteError(w, http.StatusInternalServerError, err)
		return
	}
	if len(computer) > 0 {
		_ = utils.WriteError(w, http.StatusConflict, errors.New("this computer is already enrolled"))
		return
	}

	// check that enrolmentKey is valid
	var dbToken []models.EnrollmentToken
	if err := as.sb.DB.From("enrollment_tokens").Select("*").Eq("token", enrollToken).Execute(&dbToken); err != nil {
		_ = utils.WriteError(w, http.StatusBadRequest, err)
		return
	}

	if dbToken[0].RemainingUse == 0 {
		_ = utils.WriteError(w, http.StatusUnauthorized, errors.New("enrollment token is not valid"))
		return
	}

	// use token if not multiple use
	if dbToken[0].RemainingUse != -1 {
		newRemainig := max(dbToken[0].RemainingUse-1, 0)

		var updated []models.EnrollmentToken
		// update db row
		if err := as.sb.DB.From("enrollment_tokens").Update(map[string]any{
			"remaining_uses": newRemainig,
		}).Eq("token", dbToken[0].Token).Execute(&updated); err != nil {
			_ = utils.WriteError(w, http.StatusInternalServerError, err)
			return
		}
		if len(updated) == 0 {
			_ = utils.WriteError(w, http.StatusInternalServerError, errors.New("no rows were updated"))
			return
		}
	}

	// register computer
	newComputer := map[string]any{
		"name":             payload.Name,
		"fingerprint_hash": payload.FingerPrintHash,
		"jkt":              payload.Jkt, // prepare for DPoP: these can be set during first key-bound call/rotate
	}
	var inserted []models.Computer
	if err := as.sb.DB.From("computers").Insert(newComputer).Execute(&inserted); err != nil || len(inserted) != 1 {
		_ = utils.WriteError(w, http.StatusInternalServerError, err)
		return
	}

	computerID := inserted[0].ID
	// generate JWT + RT (+ recovery for now; TODO: replace with JWT assertion recovery)
	sub := "device:" + computerID

	tokens, err := as.issueTokens(sub, computerID, payload.Jkt)
	if err != nil {
		_ = utils.WriteError(w, http.StatusInternalServerError, err)
		return
	}

	utils.WriteJSON(w, http.StatusCreated, map[string]any{
		"tokens": tokens,
	})
}

func (as *AuthService) RefreshTokens(w http.ResponseWriter, r *http.Request) {
	// Parse payload
	var payload refreshTokensPayload
	if err := utils.ParseJSON(r, &payload); err != nil {
		_ = utils.WriteError(w, http.StatusBadRequest, err)
		return
	}
	if payload.RefreshToken == "" {
		_ = utils.WriteError(w, http.StatusBadRequest, errors.New("missing refresh_token"))
		return
	}

	// Lookup refresh token by hash
	hash := b64urlSHA256(payload.RefreshToken)
	type rtRow struct {
		ID         string     `json:"id"`
		ComputerID string     `json:"computer_id"`
		Jkt        string     `json:"jkt"`
		ExpiresAt  time.Time  `json:"expires_at"`
		Status     string     `json:"status"`
		GraceUntil *time.Time `json:"grace_until"`
		LastUsedAt *time.Time `json:"last_used_at"`
	}

	var rows []rtRow
	if err := as.sb.DB.From("refresh_tokens").
		Select("id,computer_id,jkt,expires_at,status,grace_until,last_used_at").
		Limit(1).
		Eq("token_hash", hash).
		Execute(&rows); err != nil {
		_ = utils.WriteError(w, http.StatusInternalServerError, err)
		return
	}
	if len(rows) == 0 {
		_ = utils.WriteError(w, http.StatusUnauthorized, errors.New("invalid refresh token"))
		return
	}

	now := defaultNow()
	rt := rows[0]

	// Grace period support
	graceTTL := 2 * time.Minute

	if rt.Status == "ACTIVE" {
		// Active and not expired is required for first-time rotation
		if !rt.ExpiresAt.IsZero() && now.After(rt.ExpiresAt) {
			_ = utils.WriteError(w, http.StatusUnauthorized, errors.New("refresh token expired"))
			return
		}

		// Rotate: revoke old token and set grace_until
		var updated []map[string]any
		if err := as.sb.DB.From("refresh_tokens").
			Update(map[string]any{"status": "REVOKED", "grace_until": now.Add(graceTTL)}).
			Eq("id", rt.ID).
			Execute(&updated); err != nil {
			_ = utils.WriteError(w, http.StatusInternalServerError, err)
			return
		}
		if len(updated) == 0 {
			_ = utils.WriteError(w, http.StatusInternalServerError, errors.New("failed to update refresh token status"))
			return
		}
	} else {
		// Allow exactly one extra use within grace window if not already used
		if rt.GraceUntil == nil || now.After(*rt.GraceUntil) {
			_ = utils.WriteError(w, http.StatusUnauthorized, errors.New("refresh token not in grace period"))
			return
		}
		if rt.LastUsedAt != nil {
			_ = utils.WriteError(w, http.StatusUnauthorized, errors.New("refresh token grace already used"))
			return
		}
		// Mark grace usage
		var updated []map[string]any
		if err := as.sb.DB.From("refresh_tokens").
			Update(map[string]any{"last_used_at": now}).
			Eq("id", rt.ID).
			Execute(&updated); err != nil {
			_ = utils.WriteError(w, http.StatusInternalServerError, err)
			return
		}
		if len(updated) == 0 {
			_ = utils.WriteError(w, http.StatusInternalServerError, errors.New("failed to mark grace usage"))
			return
		}
	}

	sub := "device:" + rt.ComputerID
	tokens, err := as.issueTokens(sub, rt.ComputerID, rt.Jkt)
	if err != nil {
		_ = utils.WriteError(w, http.StatusInternalServerError, err)
		return
	}

	_ = utils.WriteJSON(w, http.StatusOK, map[string]any{
		"tokens": tokens,
	})
}

func (as *AuthService) Recover(w http.ResponseWriter, r *http.Request) {
	// Expect a DPoP proof as proof-of-access (no bearer/RT required)
	dpop := r.Header.Get("DPoP")
	if dpop == "" {
		_ = utils.WriteError(w, http.StatusUnauthorized, errors.New("missing DPoP header"))
		return
	}

	// Parse the DPoP JWS and verify signature
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

	// Extract JWK and enforce asymmetric algs
	jwkKey := hdr.JWK()
	if jwkKey == nil {
		_ = utils.WriteError(w, http.StatusUnauthorized, errors.New("missing DPoP jwk"))
		return
	}
	if kty := jwkKey.KeyType(); kty == jwa.OctetSeq {
		_ = utils.WriteError(w, http.StatusUnauthorized, errors.New("invalid DPoP key type"))
		return
	}
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
	payload, err := jws.Verify([]byte(dpop), jws.WithKey(jwa.SignatureAlgorithm(algStr), pubKey))
	if err != nil {
		_ = utils.WriteError(w, http.StatusUnauthorized, errors.New("invalid DPoP signature"))
		return
	}

	// Validate payload claims
	var pc dpopPayload
	if err := json.Unmarshal(payload, &pc); err != nil {
		_ = utils.WriteError(w, http.StatusUnauthorized, errors.New("invalid DPoP payload"))
		return
	}

	now := defaultNow()
	iat := time.Unix(pc.IAT, 0).UTC()
	if iat.After(now.Add(2*time.Minute)) || now.Sub(iat) > 15*time.Minute {
		_ = utils.WriteError(w, http.StatusUnauthorized, errors.New("stale DPoP proof"))
		return
	}
	// Method/URL binding
	if !strings.EqualFold(pc.HTM, r.Method) {
		_ = utils.WriteError(w, http.StatusUnauthorized, errors.New("htm mismatch"))
		return
	}
	expectedHTU := DefaultExternalURL(r).String()
	if pc.HTU != expectedHTU {
		_ = utils.WriteError(w, http.StatusUnauthorized, errors.New("htu mismatch"))
		return
	}

	// Anti-replay on jti
	if as.redis != nil {
		key := "dpop:jti:" + pc.JTI
		ok, err := as.redis.SetNX(context.Background(), key, 1, 15*time.Minute).Result()
		if err != nil || !ok {
			_ = utils.WriteError(w, http.StatusUnauthorized, errors.New("replayed DPoP proof"))
			return
		}
	}

	// Compute jkt from DPoP jwk (RFC7638)
	th, err := jwkKey.Thumbprint(crypto.SHA256)
	if err != nil {
		_ = utils.WriteError(w, http.StatusUnauthorized, errors.New("invalid DPoP thumbprint"))
		return
	}
	jkt := base64.RawURLEncoding.EncodeToString(th)

	// Find the enrolled device by jkt
	var devices []models.Computer
	if err := as.sb.DB.From("computers").Select("id", "jkt").Eq("jkt", jkt).Execute(&devices); err != nil {
		_ = utils.WriteError(w, http.StatusInternalServerError, err)
		return
	}
	if len(devices) == 0 {
		_ = utils.WriteError(w, http.StatusNotFound, errors.New("unknown device jkt"))
		return
	}
	computerID := devices[0].ID

	// Revoke any active refresh tokens for this device (cut off lost tokens)
	var updated []map[string]any
	if err := as.sb.DB.From("refresh_tokens").
		Update(map[string]any{"status": "REVOKED"}).
		Eq("computer_id", computerID).
		Eq("status", "ACTIVE").
		Execute(&updated); err != nil {
		_ = utils.WriteError(w, http.StatusInternalServerError, err)
		return
	}

	// Issue fresh AT/RT bound to the same jkt
	sub := "device:" + computerID
	tokens, err := as.issueTokens(sub, computerID, jkt)
	if err != nil {
		_ = utils.WriteError(w, http.StatusInternalServerError, err)
		return
	}

	_ = utils.WriteJSON(w, http.StatusOK, map[string]any{
		"tokens": tokens,
	})
}

func (as AuthService) issueTokens(sub string, computerID string, jkt string) (TokenPair, error) {
	now := defaultNow()
	atExp := now.Add(as.ATTTL)
	rtExp := now.Add(as.RTTTL)

	apiUrl := os.Getenv("API_URL")

	atClaims := jwt.MapClaims{
		"iss": apiUrl,
		"aud": apiUrl,
		"sub": sub,
		"iat": now.Unix(),
		"nbf": now.Unix(),
		"exp": atExp.Unix(),
		"cnf": map[string]any{"jkt": jkt},
	}
	at := jwt.NewWithClaims(jwt.GetSigningMethod(as.signAlg), atClaims)
	access, err := at.SignedString(as.signKey)
	if err != nil {
		return TokenPair{}, err
	}

	refresh, err := newRandomB64url()
	if err != nil {
		return TokenPair{}, err
	}

	newRefreshToken := map[string]any{
		"jkt":         jkt,
		"expires_at":  rtExp,
		"computer_id": computerID,
		"token_hash":  b64urlSHA256(refresh),
		"status":      "ACTIVE",
	}

	var insertedToken []models.RefreshToken

	if err = as.sb.DB.From("refresh_tokens").Insert(newRefreshToken).Execute(&insertedToken); err != nil {
		return TokenPair{}, err
	}

	return TokenPair{
		AccessToken:  access,
		RefreshToken: refresh,
		ExpiresIn:    int64(as.ATTTL.Seconds()),
	}, nil
}
