package auth

// Device represents a registered device capable of obtaining tokens.
type Device struct {
	ID         string
	SecretHash []byte
	Families   map[string]string // familyID -> refreshTokenHash
}
