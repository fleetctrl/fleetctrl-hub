package auth

import (
	"errors"
	"net/http"
	"os"
	"time"

	"github.com/fleetctrl/fleetctrl-hub/api/cmd/internal/models"
	"github.com/fleetctrl/fleetctrl-hub/api/cmd/internal/utils"
	"github.com/golang-jwt/jwt/v5"
	"github.com/lestrrat-go/jwx/v2/jwk"
	"github.com/nedpals/supabase-go"
	"github.com/redis/go-redis/v9"
)

type dpopPayload struct {
	HTU string `json:"htu"`
	HTM string `json:"htm"`
	IAT int64  `json:"iat"`
	JTI string `json:"jti"`
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
