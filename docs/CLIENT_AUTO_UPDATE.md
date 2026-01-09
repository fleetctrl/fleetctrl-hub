# FleetCtrl Client Auto-Update Implementation Guide

This document describes how to implement automatic update functionality in the FleetCtrl Windows client.

## Overview

The Hub server can notify clients when a new version is available. Clients should check for updates on every API request and handle the update process automatically.

---

## API Contract

### Request Header

The client **MUST** send its current version in every authenticated request:

```
X-Client-Version: v0.4.1
```

**Format**: Semantic version string (e.g., `v0.4.1`, `v1.0.0`, `0.5.0-beta`)

> **Note**: The server stores this version in the `computers.client_version` column for reporting purposes.

### Response Header

When an update is available, the server responds with:

```
X-Client-Update: {"version":"v0.5.0","id":"uuid-here","hash":"sha256-hash-here"}
```

| Field | Type | Description |
|-------|------|-------------|
| `version` | string | New version number |
| `id` | string (UUID) | Version ID for download endpoint |
| `hash` | string | SHA256 hash of the binary for integrity verification |

**Note**: This header is **only present** when the client version differs from the active server version.

---

## Download Endpoint

To download the new client binary:

```
GET /client/download/{versionID}
```

**Authentication**: Requires DPoP authentication (same as other endpoints)

**Response**: `307 Temporary Redirect` to a signed Supabase storage URL

---

## Implementation Steps (Go Example)

### 1. Add Version Header to All Requests

```go
const ClientVersion = "v0.4.1"

func (c *Client) doRequest(req *http.Request) (*http.Response, error) {
    req.Header.Set("X-Client-Version", ClientVersion)
    // ...
}
```

### 2. Check for Update Header in Responses

```go
func checkForUpdate(resp *http.Response) *UpdateInfo {
    updateHeader := resp.Header.Get("X-Client-Update")
    if updateHeader == "" {
        return nil
    }
    // Parse JSON from updateHeader...
}
```

### 3. Download and Verify

Download from `/client/download/{id}`, verify SHA256 hash against the `hash` field in the header.

### 4. Apply the Update

Since the client runs as a service, it should:
1. Download new binary to temp location.
2. Stop service, replace binary, start service (can be done via a helper batch script).

---

## Flow Diagram

```
┌──────────┐          GET /tasks             ┌──────────┐
│  CLIENT  │ ──────────────────────────────> │ Hub API  │
└──────────┘  X-Client-Version: v0.4.0       └──────────┘
      ^                                            │
      │       Response + X-Client-Update           │
      └────────────────────────────────────────────┘
```
