package client

import (
	"errors"
	"fmt"
	"net/http"

	"github.com/fleetctrl/fleetctrl-hub/api/cmd/internal/utils"
	"github.com/nedpals/supabase-go"
)

type ClientService struct {
	sb *supabase.Client
}

func NewClientService(sb *supabase.Client) *ClientService {
	return &ClientService{
		sb: sb,
	}
}

type ClientUpdate struct {
	ID      string `json:"id"`
	Version string `json:"version"`
	Hash    string `json:"hash"`
}

// GetActiveVersion returns the currently active client version
func (cs *ClientService) GetActiveVersion(w http.ResponseWriter, r *http.Request) {
	var versions []ClientUpdate
	err := cs.sb.DB.From("client_updates").
		Select("id,version,hash").
		Limit(1).
		Eq("is_active", "true").
		Execute(&versions)

	if err != nil {
		utils.WriteError(w, http.StatusInternalServerError, errors.New("failed to get active version: "+err.Error()))
		return
	}

	if len(versions) == 0 {
		utils.WriteJSON(w, http.StatusOK, map[string]any{"version": nil})
		return
	}

	utils.WriteJSON(w, http.StatusOK, versions[0])
}

// DownloadClient serves the client binary download
func (cs *ClientService) DownloadClient(w http.ResponseWriter, r *http.Request) {
	// Verify computer is enrolled (X-Computer-ID set by DPoP middleware)
	computerID := r.Header.Get("X-Computer-ID")
	if computerID == "" {
		utils.WriteError(w, http.StatusUnauthorized, errors.New("unauthorized"))
		return
	}

	versionID := r.PathValue("versionID")
	if versionID == "" {
		utils.WriteError(w, http.StatusBadRequest, errors.New("version ID required"))
		return
	}

	// Get version details
	var versions []struct {
		StoragePath   string `json:"storage_path"`
		StorageBucket string `json:"storage_bucket"`
	}
	err := cs.sb.DB.From("client_updates").
		Select("storage_path,storage_bucket").
		Limit(1).
		Eq("id", versionID).
		Execute(&versions)

	if err != nil {
		utils.WriteError(w, http.StatusInternalServerError, errors.New("failed to get version: "+err.Error()))
		return
	}

	if len(versions) == 0 {
		utils.WriteError(w, http.StatusNotFound, errors.New("version not found"))
		return
	}

	v := versions[0]

	// Generate signed URL
	defer func() {
		if rec := recover(); rec != nil {
			utils.WriteError(w, http.StatusInternalServerError, errors.New(fmt.Sprintf("failed to generate download URL (panic): %v", rec)))
		}
	}()

	resp := cs.sb.Storage.From(v.StorageBucket).CreateSignedUrl(v.StoragePath, 3600) // 1 hour expiry
	if resp.SignedUrl == "" {
		utils.WriteError(w, http.StatusInternalServerError, errors.New("failed to generate download URL: empty URL"))
		return
	}

	http.Redirect(w, r, resp.SignedUrl, http.StatusTemporaryRedirect)
}
