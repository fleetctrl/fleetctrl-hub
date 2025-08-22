package models

import (
	"encoding/json"
	"time"
)

type Computer struct {
	ID             int64     `json:"id"`
	RustdeskID     int       `json:"rustdesk_id"`
	Name           string    `json:"name"`
	IP             *string   `json:"ip,omitempty"`
	LastConnection time.Time `json:"last_connection"`
	OS             *string   `json:"os,omitempty"`
	OSVersion      *string   `json:"os_version,omitempty"`
	CreatedAt      time.Time `json:"created_at"`
	Key            string    `json:"key"`
	LoginUser      *string   `json:"login_user,omitempty"`
}

type TaskStatus string

const (
	taskStatusPending TaskStatus = "PENDING"
	taskStatusSuccess TaskStatus = "SUCCESS"
	taskStatusError   TaskStatus = "ERROR"
)

type Task struct {
	UUID      string          `json:"uuid"`
	CreatedAt time.Time       `json:"created_at"`
	Status    TaskStatus      `json:"status"`
	Task      string          `json:"task"`
	TaskData  json.RawMessage `json:"task_data"`
}
