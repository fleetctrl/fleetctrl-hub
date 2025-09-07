package models

import (
	"encoding/json"
	"time"
)

type Computer struct {
	ID             string     `json:"id"`
	RustdeskID     *int       `json:"rustdesk_id"`
	Name           *string    `json:"name"`
	IP             *string    `json:"ip,omitempty"`
	LastConnection *time.Time `json:"last_connection"`
	OS             *string    `json:"os,omitempty"`
	OSVersion      *string    `json:"os_version,omitempty"`
	CreatedAt      time.Time  `json:"created_at"`
	LoginUser      *string    `json:"login_user,omitempty"`
	FingeprintHash string     `json:"fingerprint_hash"`
	Jkt            string     `json:"jkt"`
}

type TaskStatus string

const (
	taskStatusPending TaskStatus = "PENDING"
	taskStatusSuccess TaskStatus = "SUCCESS"
	taskStatusError   TaskStatus = "ERROR"
)

type Task struct {
	ID        string          `json:"id"`
	CreatedAt time.Time       `json:"created_at"`
	Status    TaskStatus      `json:"status"`
	Task      string          `json:"task"`
	TaskData  json.RawMessage `json:"task_data"`
}

type EnrollmentToken struct {
	Token        string     `json:"token"`
	CreatedAt    time.Time  `json:"created_at"`
	RemainingUse int8       `json:"remaining_uses"`
	Disabled     bool       `json:"disabled"`
	CreatedBy    *string    `json:"created_by"`
	LastUsedAt   *time.Time `json:"last_used_at"`
	ExpiresAt    time.Time  `json:"expires_at"`
}

type RefreshToken struct {
	ID         string    `json:"id"`
	FamilyID   string    `json:"family_id"`
	TokenHash  string    `json:"token_hash"`
	ParentJti  string    `json:"parent_jti"`
	ComputerID string    `json:"computer_id"`
	CreatedAt  time.Time `json:"created_at"`
	ExpiresAt  time.Time `json:"expires_at"`
	LastUsedAt time.Time `json:"last_used_at"`
	RevokedAt  time.Time `json:"revoked_at"`
}
