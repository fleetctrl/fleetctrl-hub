package auth

import (
	"context"
	"crypto/subtle"
	"errors"
	"strings"
)

// Service provides authentication operations.
type Service struct {
	repo   DeviceRepository
	tokens *TokenManager
}

// NewService creates a Service.
func NewService(r DeviceRepository, tm *TokenManager) *Service {
	return &Service{repo: r, tokens: tm}
}

// Authenticate validates device credentials and issues tokens.
func (s *Service) Authenticate(ctx context.Context, id, secret string) (accessToken, refreshToken string, err error) {
	device, err := s.repo.GetDevice(ctx, id)
	if err != nil {
		return "", "", err
	}
	if len(device.SecretHash) > 0 {
		if secret == "" {
			return "", "", errors.New("invalid secret")
		}
		if subtle.ConstantTimeCompare(device.SecretHash, HashSecret(secret)) != 1 {
			return "", "", errors.New("invalid secret")
		}
	}
	at, err := s.tokens.GenerateAccessToken(id)
	if err != nil {
		return "", "", err
	}
	rt, hashVal, familyID, err := GenerateRefreshToken()
	if err != nil {
		return "", "", err
	}
	if device.Families == nil {
		device.Families = make(map[string]string)
	}
	device.Families[familyID] = hashVal
	if err := s.repo.SaveDevice(ctx, device); err != nil {
		return "", "", err
	}
	return at, rt, nil
}

// Refresh validates and rotates the refresh token.
func (s *Service) Refresh(ctx context.Context, id, refreshToken string) (accessToken, newRefreshToken string, err error) {
	device, err := s.repo.GetDevice(ctx, id)
	if err != nil {
		return "", "", err
	}
	parts := strings.Split(refreshToken, ".")
	if len(parts) != 2 {
		return "", "", errors.New("invalid refresh token")
	}
	familyID, tok := parts[0], parts[1]
	storedHash, ok := device.Families[familyID]
	if !ok {
		return "", "", errors.New("invalid refresh token")
	}
	if subtle.ConstantTimeCompare([]byte(storedHash), []byte(hash(tok))) != 1 {
		delete(device.Families, familyID)
		_ = s.repo.SaveDevice(ctx, device)
		return "", "", errors.New("refresh token reused")
	}
	at, err := s.tokens.GenerateAccessToken(id)
	if err != nil {
		return "", "", err
	}
	newRT, newHash, err := RotateRefreshToken(familyID)
	if err != nil {
		return "", "", err
	}
	device.Families[familyID] = newHash
	if err := s.repo.SaveDevice(ctx, device); err != nil {
		return "", "", err
	}
	return at, newRT, nil
}

// ValidateAccessToken validates an access token and returns the device ID.
func (s *Service) ValidateAccessToken(tok string) (string, error) {
	return s.tokens.ValidateAccessToken(tok)
}
