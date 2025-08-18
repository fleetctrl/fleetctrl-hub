package main

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

type Task struct {
	UUID      string          `json:"uuid"`
	CreatedAt time.Time       `json:"created_at"`
	Status    string          `json:"status"`
	Task      string          `json:"task"`
	TaskData  json.RawMessage `json:"task_data"`
}
