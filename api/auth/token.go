package auth

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

// TokenManager handles access and refresh token creation.
type TokenManager struct {
	jwtSecret  []byte
	atLifetime time.Duration
}

// NewTokenManager creates a TokenManager.
func NewTokenManager(secret []byte, lifetime time.Duration) *TokenManager {
	return &TokenManager{jwtSecret: secret, atLifetime: lifetime}
}

// GenerateAccessToken creates a signed JWT for the given device.
func (t *TokenManager) GenerateAccessToken(deviceID string) (string, error) {
	claims := jwt.MapClaims{
		"sub": deviceID,
		"exp": time.Now().Add(t.atLifetime).Unix(),
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString(t.jwtSecret)
}

// ValidateAccessToken validates the JWT and returns the deviceID.
func (t *TokenManager) ValidateAccessToken(tok string) (string, error) {
	parsed, err := jwt.Parse(tok, func(token *jwt.Token) (interface{}, error) {
		return t.jwtSecret, nil
	})
	if err != nil || !parsed.Valid {
		return "", errors.New("invalid token")
	}
	claims, ok := parsed.Claims.(jwt.MapClaims)
	if !ok {
		return "", errors.New("invalid token")
	}
	sub, ok := claims["sub"].(string)
	if !ok {
		return "", errors.New("invalid token")
	}
	return sub, nil
}

// GenerateRefreshToken returns a refresh token, its hash, and family ID.
func GenerateRefreshToken() (token, hashVal, familyID string, err error) {
	familyID, err = randomString(16)
	if err != nil {
		return
	}
	token, hashVal, err = newRefreshTokenWithFamily(familyID)
	return
}

// RotateRefreshToken rotates the refresh token within a family.
func RotateRefreshToken(familyID string) (token, hashVal string, err error) {
	return newRefreshTokenWithFamily(familyID)
}

func newRefreshTokenWithFamily(familyID string) (token, hashVal string, err error) {
	t, err := randomString(32)
	if err != nil {
		return
	}
	hashVal = hash(t)
	token = familyID + "." + t
	return
}

func randomString(n int) (string, error) {
	b := make([]byte, n)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(b), nil
}

func hash(data string) string {
	sum := sha256.Sum256([]byte(data))
	return base64.RawURLEncoding.EncodeToString(sum[:])
}

// HashSecret hashes a device secret for storage.
func HashSecret(secret string) []byte {
	h := sha256.Sum256([]byte(secret))
	return h[:]
}
