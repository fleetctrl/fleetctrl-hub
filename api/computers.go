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
	key := r.PathValue("key")
	var payload registerPayload

	err := parseJSON(r, &payload)
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}

	data := map[string]any{
		"name":        payload.Name,
		"rustdesk_id": payload.RustDeskID,
		"key":         key,
	}
	var inserted []any
	if err := sb.DB.From("computers").Insert(data).Execute(&inserted); err != nil {
		_ = writeError(w, http.StatusConflict, err)
		return
	}
	writeJSON(w, http.StatusCreated, map[string]bool{"success": len(inserted) > 0})
}

func rustDeskSync(w http.ResponseWriter, r *http.Request) {
	key := r.PathValue("key")

	var payload rustdeskSyncPaylod
	err := parseJSON(r, &payload)
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}

	nowUTC := time.Now().UTC()

	update := map[string]any{
		"name":            payload.Name,
		"ip":              payload.IP,
		"os":              payload.OS,
		"os_version":      payload.OSVersion,
		"login_user":      payload.LoginUser,
		"last_connection": nowUTC,
	}
	var updated []Computer
	if err := sb.DB.From("computers").
		Update(update).
		Eq("key", key).
		Execute(&updated); err != nil {
		_ = writeError(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"success": len(updated) > 0})
}
