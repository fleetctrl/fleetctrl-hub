package computers

import (
	"errors"
	"net/http"
	"time"

	"github.com/fleetctrl/fleetctrl-hub/api/cmd/internal/models"
	"github.com/fleetctrl/fleetctrl-hub/api/cmd/internal/pkg/cache"
	"github.com/fleetctrl/fleetctrl-hub/api/cmd/internal/utils"
	"github.com/nedpals/supabase-go"
)

type ComputersService struct {
	sb    *supabase.Client
	cache *cache.Service
}

type rustdeskSyncPaylod struct {
	Name       string `json:"name"`
	RustDeskID string `json:"rustdesk_id"`
	IP         string `json:"ip"`
	OS         string `json:"os"`
	OSVersion  string `json:"os_version"`
	LoginUser  string `json:"login_user"`
}

func NewComputersService(sb *supabase.Client, cache *cache.Service) *ComputersService {
	return &ComputersService{
		sb:    sb,
		cache: cache,
	}
}

func (cs ComputersService) RustDeskSync(w http.ResponseWriter, r *http.Request) {
	computerID := r.Header.Get("X-Computer-ID")

	type ComputerRow struct {
		ID string `json:"id"`
	}

	// Helper to check existence
	checkExistence := func() (bool, error) {
		var computer []ComputerRow
		if err := cs.sb.DB.From("computers").Select("id").Eq("id", computerID).Execute(&computer); err != nil {
			return false, err
		}
		return len(computer) > 0, nil
	}

	// Use cache for existence check (key: computer:exists:{id})
	exists, err := cache.WithCache(r.Context(), cs.cache, "computer:exists:"+computerID, 1*time.Hour, checkExistence)

	if err != nil {
		_ = utils.WriteError(w, http.StatusInternalServerError, err)
		return
	}

	if !exists {
		_ = utils.WriteError(w, http.StatusBadRequest, errors.New("no computer was found"))
		return
	}

	var payload rustdeskSyncPaylod
	if err := utils.ParseJSON(r, &payload); err != nil {
		utils.WriteError(w, http.StatusBadRequest, err)
		return
	}

	nowUTC := time.Now().UTC()

	update := map[string]any{
		"name":            payload.Name,
		"rustdesk_id":     payload.RustDeskID,
		"ip":              payload.IP,
		"os":              payload.OS,
		"os_version":      payload.OSVersion,
		"login_user":      payload.LoginUser,
		"last_connection": nowUTC,
	}
	var updated []models.Computer
	if err := cs.sb.DB.From("computers").
		Update(update).
		Eq("id", computerID).
		Execute(&updated); err != nil {
		_ = utils.WriteError(w, http.StatusInternalServerError, err)
		return
	}
	if len(updated) == 0 {
		_ = utils.WriteError(w, http.StatusInternalServerError, errors.New("no record updated"))
		return
	}
	utils.WriteJSON(w, http.StatusOK, map[string]bool{"success": len(updated) > 0})
}
