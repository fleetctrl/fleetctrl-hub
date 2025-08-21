package main

import (
	"crypto/rand"
	"crypto/x509"
	"encoding/pem"
	"errors"
	"math/big"
	"net/http"
	"os"
	"strconv"
	"time"
)

type csrPayload struct {
	CSRPem string `json:"csr_pem"`
}

// enrollCSR issues a new client certificate for a device.
func enrollCSR(w http.ResponseWriter, r *http.Request) {
	var req csrPayload
	if err := parseJSON(r, &req); err != nil {
		_ = writeError(w, http.StatusBadRequest, err)
		return
	}
	certPEM, caPEM, notAfter, _, err := signCSR(req.CSRPem)
	if err != nil {
		_ = writeError(w, http.StatusBadRequest, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{
		"cert_pem":     string(certPEM),
		"ca_chain_pem": string(caPEM),
		"not_after":    notAfter.Format(time.RFC3339),
	})
}

// rotateCert rotates an existing certificate; expects mTLS + device id in context.
func rotateCert(w http.ResponseWriter, r *http.Request) {
	deviceID, ok := r.Context().Value(deviceIDKey).(string)
	if !ok {
		_ = writeError(w, http.StatusUnauthorized, errors.New("mtls_missing"))
		return
	}
	var req csrPayload
	if err := parseJSON(r, &req); err != nil {
		_ = writeError(w, http.StatusBadRequest, err)
		return
	}
	certPEM, caPEM, notAfter, csrDeviceID, err := signCSR(req.CSRPem)
	if err != nil {
		_ = writeError(w, http.StatusBadRequest, err)
		return
	}
	if csrDeviceID != deviceID {
		_ = writeError(w, http.StatusForbidden, errors.New("mtls_device_mismatch"))
		return
	}
	// revoke old cert
	oldSerial := r.TLS.PeerCertificates[0].SerialNumber.String()
	_ = sb.DB.From("device_certs").Update(map[string]any{
		"status":     certStatusRevoked,
		"revoked_at": time.Now(),
	}).Eq("serial", oldSerial).Execute(nil)
	writeJSON(w, http.StatusOK, map[string]string{
		"cert_pem":     string(certPEM),
		"ca_chain_pem": string(caPEM),
		"not_after":    notAfter.Format(time.RFC3339),
		"device_id":    deviceID,
	})
}

// signCSR validates and signs the CSR using the CA key.
func signCSR(pemStr string) ([]byte, []byte, time.Time, string, error) {
	block, _ := pem.Decode([]byte(pemStr))
	if block == nil || block.Type != "CERTIFICATE REQUEST" {
		return nil, nil, time.Time{}, "", errors.New("invalid csr")
	}
	csr, err := x509.ParseCertificateRequest(block.Bytes)
	if err != nil {
		return nil, nil, time.Time{}, "", err
	}
	if err := csr.CheckSignature(); err != nil {
		return nil, nil, time.Time{}, "", err
	}
	if csr.PublicKeyAlgorithm != x509.ECDSA {
		return nil, nil, time.Time{}, "", errors.New("csr must use ecdsa")
	}
	deviceID, err := extractDeviceID(csr.URIs)
	if err != nil {
		return nil, nil, time.Time{}, "", err
	}
	validity := 30
	if v := os.Getenv("CERT_VALIDITY_DAYS"); v != "" {
		if days, err := strconv.Atoi(v); err == nil {
			validity = days
		}
	}
	caCertPEM, err := os.ReadFile(os.Getenv("TLS_CLIENT_CA_BUNDLE"))
	if err != nil {
		return nil, nil, time.Time{}, "", err
	}
	caKeyPEM, err := os.ReadFile(os.Getenv("CERT_CA_KEY_PATH"))
	if err != nil {
		return nil, nil, time.Time{}, "", err
	}
	caBlock, _ := pem.Decode(caKeyPEM)
	if caBlock == nil {
		return nil, nil, time.Time{}, "", errors.New("invalid ca key")
	}
	caKey, err := x509.ParseECPrivateKey(caBlock.Bytes)
	if err != nil {
		return nil, nil, time.Time{}, "", err
	}
	caCertBlock, _ := pem.Decode(caCertPEM)
	if caCertBlock == nil {
		return nil, nil, time.Time{}, "", errors.New("invalid ca cert")
	}
	caCert, err := x509.ParseCertificate(caCertBlock.Bytes)
	if err != nil {
		return nil, nil, time.Time{}, "", err
	}
	serialLimit := new(big.Int).Lsh(big.NewInt(1), 128)
	serial, err := rand.Int(rand.Reader, serialLimit)
	if err != nil {
		return nil, nil, time.Time{}, "", err
	}
	tmpl := &x509.Certificate{
		SerialNumber: serial,
		Subject:      csr.Subject,
		NotBefore:    time.Now().Add(-time.Minute),
		NotAfter:     time.Now().Add(time.Duration(validity) * 24 * time.Hour),
		KeyUsage:     x509.KeyUsageDigitalSignature,
		ExtKeyUsage:  []x509.ExtKeyUsage{x509.ExtKeyUsageClientAuth},
		URIs:         csr.URIs,
	}
	certDER, err := x509.CreateCertificate(rand.Reader, tmpl, caCert, csr.PublicKey, caKey)
	if err != nil {
		return nil, nil, time.Time{}, "", err
	}
	certPEM := pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: certDER})
	// persist mapping
	data := map[string]any{
		"serial":     tmpl.SerialNumber.String(),
		"device_id":  deviceID,
		"status":     certStatusActive,
		"not_before": tmpl.NotBefore,
		"not_after":  tmpl.NotAfter,
	}
	if err := sb.DB.From("device_certs").Insert(data).Execute(nil); err != nil {
		return nil, nil, time.Time{}, "", err
	}
	return certPEM, caCertPEM, tmpl.NotAfter, deviceID, nil
}
