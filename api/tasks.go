package main

import (
    "encoding/json"
    "errors"
    "net/http"
    "strconv"
)

func getTasksByRustdeskID(w http.ResponseWriter, r *http.Request) {
	rustdeskIDStr := r.URL.Query().Get("rustdesk_id")
	key := r.URL.Query().Get("key")
    if rustdeskIDStr == "" || key == "" {
        _ = writeError(w, http.StatusBadRequest, errors.New("missing parameters"))
        return
    }
    if _, err := strconv.Atoi(rustdeskIDStr); err != nil {
        _ = writeError(w, http.StatusBadRequest, errors.New("invalid rustdesk_id"))
        return
    }
	var comps []Computer
    if err := sb.DB.From("computers").Select("id").
        Eq("rustdesk_id", rustdeskIDStr).
        Eq("key", key).
        Execute(&comps); err != nil {
        _ = writeError(w, http.StatusInternalServerError, err)
        return
    }
    if len(comps) == 0 {
        _ = writeError(w, http.StatusNotFound, errors.New("not found"))
        return
    }
	compIDStr := strconv.FormatInt(comps[0].ID, 10)
	var tasks []Task
    if err := sb.DB.From("tasks").
        Select("uuid,created_at,status,task,task_data").
        Eq("computer_id", compIDStr).
        Eq("status", "PENDING").
        Execute(&tasks); err != nil {
        _ = writeError(w, http.StatusInternalServerError, err)
        return
    }
	writeJSON(w, tasks)
}

func editTaskStatus(w http.ResponseWriter, r *http.Request) {
    if r.Method != http.MethodPost {
        _ = writeError(w, http.StatusMethodNotAllowed, errors.New("method not allowed"))
        return
    }
	var req struct {
		UUID      string `json:"uuid"`
		NewStatus string `json:"new_status"`
	}
    if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
        _ = writeError(w, http.StatusBadRequest, err)
        return
    }
	update := map[string]interface{}{"status": req.NewStatus}
	var updated []Task
    if err := sb.DB.From("tasks").
        Update(update).
        Eq("uuid", req.UUID).
        Execute(&updated); err != nil {
        _ = writeError(w, http.StatusInternalServerError, err)
        return
    }
	writeJSON(w, map[string]string{"status": "ok"})
}
