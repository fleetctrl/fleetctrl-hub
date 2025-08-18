package main

import (
	"encoding/json"
	"net/http"
	"strconv"
	"time"
)

func getComputerByKey(w http.ResponseWriter, r *http.Request) {
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
	if err := sb.DB.From("computers").
		Select("*").
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
	writeJSON(w, comps[0])
}

func isComputerRegistered(w http.ResponseWriter, r *http.Request) {
	rustdeskIDStr := r.URL.Query().Get("rustdesk_id")
	if rustdeskIDStr == "" {
		http.Error(w, "missing rustdesk_id", http.StatusBadRequest)
		return
	}
	if _, err := strconv.Atoi(rustdeskIDStr); err != nil {
		http.Error(w, "invalid rustdesk_id", http.StatusBadRequest)
		return
	}
	var comps []Computer
	if err := sb.DB.From("computers").Select("id").
		Eq("rustdesk_id", rustdeskIDStr).
		Execute(&comps); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, map[string]bool{"registered": len(comps) > 0})
}

func registerComputer(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var req struct {
		Name       string `json:"name"`
		RustdeskID int    `json:"rustdesk_id"`
		Key        string `json:"key"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	data := map[string]interface{}{
		"name":        req.Name,
		"rustdesk_id": req.RustdeskID,
		"key":         req.Key,
	}
	var inserted []Computer
	if err := sb.DB.From("computers").Insert(data).Execute(&inserted); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, map[string]bool{"success": len(inserted) > 0})
}

func updateComputer(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
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
		http.Error(w, err.Error(), http.StatusBadRequest)
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
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, map[string]bool{"success": len(updated) > 0})
}
