package main

import (
    "encoding/json"
    "net/http"
)

func writeJSON(w http.ResponseWriter, v any) error {
    w.Header().Set("Content-Type", "application/json")
    w.WriteHeader(http.StatusOK)
    return json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, status int, err error) error {
    w.Header().Set("Content-Type", "application/json")
    w.WriteHeader(status)
    return json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
}
