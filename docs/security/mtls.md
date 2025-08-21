# Mutual TLS

This API supports optional mutual TLS for device connections. When `API_HTTPS=true` and `MTLS_REQUIRED=true` the server will require clients to present a certificate issued by the fleetctrl internal CA.

## Certificate profile
- ECDSA P-256 keys
- SAN URI: `urn:device:<uuid>` binds the certificate to a device ID
- Key usage: `DigitalSignature`, extended key usage `ClientAuth`
- Default validity: 30 days (`CERT_VALIDITY_DAYS`)

## Rotation
Clients should renew their certificate when less than 10 days remain. A rotation request is sent to `/cert/rotate` over an existing mTLS session with a valid JWT.

## Endpoints
- `POST /enroll/csr` – enroll a device using a PEM encoded CSR
- `POST /cert/rotate` – rotate the active certificate

## Configuration
- `TLS_SERVER_CERT` / `TLS_SERVER_KEY` – server certificate and key
- `TLS_CLIENT_CA_BUNDLE` – PEM bundle of trusted client CA certificates
- `CERT_CA_KEY_PATH` – private key for signing client certificates
- `MTLS_REQUIRED` – set to `true` to enforce client certificates

## Error codes
- `mtls_missing` – no client certificate presented
- `mtls_bad_chain` – certificate failed validation
- `mtls_revoked` – certificate revoked or inactive
- `mtls_device_mismatch` – device ID in CSR did not match authenticated device
