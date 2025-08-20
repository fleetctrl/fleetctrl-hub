package main

import (
    "encoding/json"
    "errors"
    "net/http"
    "strconv"
    "time"
)

type registerPayload struct {
	Name       string `json:"name"`
	RustDeskID string `json:"rustdesk_id"`
	Key        string `json:"key"`
}

func isComputerRegistered(w http.ResponseWriter, r *http.Request) {
	key := r.PathValue("key")

	var computer []Computer
	if err := sb.DB.From("computers").Select("id").
		Eq("key", key).
		Execute(&computer); err != nil {
		_ = writeError(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"registered": len(computer) > 0})
}

func registerComputer(w http.ResponseWriter, r *http.Request) {
	var payload registerPayload

	err := parseJSON(r, &payload)
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}

	data := map[string]any{
		"name":        payload.Name,
		"rustdesk_id": payload.RustDeskID,
		"key":         payload.Key,
	}
	var inserted []any
	if err := sb.DB.From("computers").Insert(data).Execute(&inserted); err != nil {
		_ = writeError(w, http.StatusConflict, err)
		return
	}
	writeJSON(w, http.StatusCreated, map[string]bool{"success": len(inserted) > 0})
}

func updateComputer(w http.ResponseWriter, r *http.Request) {
    if r.Method != http.MethodPost {
        _ = writeError(w, http.StatusMethodNotAllowed, errors.New("method not allowed"))
        return
    }
	var req struct {
		Name           string    `json:"name"`
		RustdeskID     int       `json:"rustdesk_id"`
		Key            string    `json:"key"`
		IP             *string   `json:"ip"`
		OS             *string   `json:"os"`
		OSVersion      *string   `json:"os_version"`
		LoginUser      *string   `json:"login_user"`
		LastConnection time.Time `json:"last_connection"`
	}
    if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
        _ = writeError(w, http.StatusBadRequest, err)
        return
    }
	update := map[string]interface{}{
		"name":            req.Name,
		"ip":              req.IP,
		"os":              req.OS,
		"os_version":      req.OSVersion,
		"login_user":      req.LoginUser,
		"last_connection": req.LastConnection,
	}
	var updated []Computer
    if err := sb.DB.From("computers").
        Update(update).
        Eq("rustdesk_id", strconv.Itoa(req.RustdeskID)).
        Eq("key", req.Key).
        Execute(&updated); err != nil {
        _ = writeError(w, http.StatusInternalServerError, err)
        return
    }
	writeJSON(w, map[string]bool{"success": len(updated) > 0})
}
