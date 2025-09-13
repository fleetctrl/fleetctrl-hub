package auth

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"time"
)

func defaultNow() time.Time { return time.Now().UTC() }

// ExternalURL helper: trusts X-Forwarded-* (adjust to your proxy policy)
func DefaultExternalURL(r *http.Request) *url.URL {
	scheme := r.Header.Get("X-Forwarded-Proto")
	if scheme == "" {
		if os.Getenv("API_HTTPS") == "true" {
			scheme = "https"
		} else {
			scheme = "http"
		}
	}
	host := r.Header.Get("X-Forwarded-Host")
	if host == "" {
		host = r.Host
	}
	u := &url.URL{
		Scheme: scheme,
		Host:   host,
		Path:   r.URL.Path,
	}
	return u
}

func b64urlSHA256(s string) string {
	sum := sha256.Sum256([]byte(s))
	return base64.RawURLEncoding.EncodeToString(sum[:])
}

func newRandomB64url() (string, error) {
	const min = 32
	const max = 48

	// 1. Pick a random size in [min,max].
	var b [1]byte
	if _, err := io.ReadFull(rand.Reader, b[:]); err != nil {
		return "", fmt.Errorf("rng: %w", err)
	}
	n := int(b[0])%(max-min+1) + min // uniform distribution

	// 2. Fill a buffer of that size with secure random bytes.
	buf := make([]byte, n)
	if _, err := io.ReadFull(rand.Reader, buf); err != nil {
		return "", fmt.Errorf("rng: %w", err)
	}

	// 3. Encode without padding using the URL alphabet.
	return base64.RawURLEncoding.EncodeToString(buf), nil
}
