package main

import (
	"encoding/json"
	"net/http"
	"strconv"
)

func getTasksByRustdeskID(w http.ResponseWriter, r *http.Request) {
	rustdeskIDStr := r.URL.Query().Get("rustdesk_id")
	key := r.URL.Query().Get("key")
	if rustdeskIDStr == "" || key == "" {
		http.Error(w, "missing parameters", http.StatusBadRequest)
		return
	}
	if _, err := strconv.Atoi(rustdeskIDStr); err != nil {
		http.Error(w, "invalid rustdesk_id", http.StatusBadRequest)
		return
	}
	var comps []Computer
	if err := sb.DB.From("computers").Select("id").
		Eq("rustdesk_id", rustdeskIDStr).
		Eq("key", key).
		Execute(&comps); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if len(comps) == 0 {
		http.NotFound(w, r)
		return
	}
	compIDStr := strconv.FormatInt(comps[0].ID, 10)
	var tasks []Task
	if err := sb.DB.From("tasks").
		Select("uuid,created_at,status,task,task_data").
		Eq("computer_id", compIDStr).
		Eq("status", "PENDING").
		Execute(&tasks); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, tasks)
}

func editTaskStatus(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var req struct {
		UUID      string `json:"uuid"`
		NewStatus string `json:"new_status"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	update := map[string]interface{}{"status": req.NewStatus}
	var updated []Task
	if err := sb.DB.From("tasks").
		Update(update).
		Eq("uuid", req.UUID).
		Execute(&updated); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, map[string]string{"status": "ok"})
}
