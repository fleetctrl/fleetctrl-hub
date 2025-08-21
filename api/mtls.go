package main

import (
	"context"
	"crypto/x509"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"
)

type ctxKey string

const deviceIDKey ctxKey = "device_id"

const (
	certStatusActive  = "ACTIVE"
	certStatusRevoked = "REVOKED"
)

// loadClientCAs reads a PEM bundle and returns a CertPool.
func loadClientCAs(path string) (*x509.CertPool, error) {
	pemData, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	pool := x509.NewCertPool()
	if !pool.AppendCertsFromPEM(pemData) {
		return nil, errors.New("failed to parse CA bundle")
	}
	return pool, nil
}

// verifyDeviceCert is used by tls.Config.VerifyPeerCertificate.
func verifyDeviceCert(rawCerts [][]byte, _ [][]*x509.Certificate) error {
	if len(rawCerts) == 0 {
		return errors.New("mtls_missing")
	}
	cert, err := x509.ParseCertificate(rawCerts[0])
	if err != nil {
		return fmt.Errorf("mtls_bad_chain: %w", err)
	}
	if time.Now().Before(cert.NotBefore) || time.Now().After(cert.NotAfter) {
		return errors.New("mtls_bad_chain: cert expired or not yet valid")
	}
	deviceID, err := extractDeviceID(cert.URIs)
	if err != nil {
		return fmt.Errorf("mtls_bad_chain: %w", err)
	}
	dc, err := fetchDeviceCert(cert.SerialNumber.String())
	if err != nil {
		return fmt.Errorf("mtls_bad_chain: %w", err)
	}
	if dc.DeviceID != deviceID || dc.Status != certStatusActive {
		return errors.New("mtls_revoked")
	}
	return nil
}

// extractDeviceID expects SAN URI in form urn:device:<uuid>.
func extractDeviceID(uris []*url.URL) (string, error) {
	for _, u := range uris {
		if u.Scheme == "urn" && strings.HasPrefix(u.Opaque, "device:") {
			return strings.TrimPrefix(u.Opaque, "device:"), nil
		}
	}
	return "", errors.New("device id missing in SAN")
}

// mtlsMiddleware attaches device_id from the certificate to the request context.
func mtlsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		required := os.Getenv("MTLS_REQUIRED")
		if required != "true" {
			next.ServeHTTP(w, r)
			return
		}
		if r.TLS == nil || len(r.TLS.PeerCertificates) == 0 {
			_ = writeError(w, http.StatusUnauthorized, errors.New("mtls_missing"))
			return
		}
		deviceID, err := extractDeviceID(r.TLS.PeerCertificates[0].URIs)
		if err != nil {
			_ = writeError(w, http.StatusForbidden, err)
			return
		}
		ctx := context.WithValue(r.Context(), deviceIDKey, deviceID)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// fetchDeviceCert retrieves certificate info from database.
type DeviceCert struct {
	Serial    string    `json:"serial"`
	DeviceID  string    `json:"device_id"`
	Status    string    `json:"status"`
	NotBefore time.Time `json:"not_before"`
	NotAfter  time.Time `json:"not_after"`
}

func fetchDeviceCert(serial string) (*DeviceCert, error) {
	var cert []DeviceCert
	if err := sb.DB.From("device_certs").Select("*").Eq("serial", serial).Execute(&cert); err != nil {
		return nil, err
	}
	if len(cert) == 0 {
		return nil, errors.New("certificate not found")
	}
	return &cert[0], nil
}
