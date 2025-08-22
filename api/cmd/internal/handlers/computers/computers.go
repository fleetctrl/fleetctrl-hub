package computers

import (
	"net/http"
	"time"

	"github.com/fleetctrl/fleetctrl-hub/api/cmd/internal/models"
	"github.com/fleetctrl/fleetctrl-hub/api/cmd/internal/utils"
	"github.com/nedpals/supabase-go"
)

type ComputersService struct {
	sb *supabase.Client
}

type registerPayload struct {
	Name       string `json:"name"`
	RustDeskID string `json:"rustdesk_id"`
}

type rustdeskSyncPaylod struct {
	Name       string `json:"name"`
	RustDeskID string `json:"rustdesk_id"`
	IP         string `json:"ip"`
	OS         string `json:"os"`
	OSVersion  string `json:"os_version"`
	LoginUser  string `json:"login_user"`
}

func NewComputersService(sb *supabase.Client) *ComputersService {
	return &ComputersService{
		sb: sb,
	}
}

func (cs ComputersService) IsComputerRegistered(w http.ResponseWriter, r *http.Request) {
	key := r.PathValue("key")

	var computer []models.Computer
	if err := cs.sb.DB.From("computers").Select("id").
		Eq("key", key).
		Execute(&computer); err != nil {
		_ = utils.WriteError(w, http.StatusInternalServerError, err)
		return
	}
	utils.WriteJSON(w, http.StatusOK, map[string]bool{"registered": len(computer) > 0})
}

func (cs ComputersService) RegisterComputer(w http.ResponseWriter, r *http.Request) {
	key := r.PathValue("key")
	var payload registerPayload

	err := utils.ParseJSON(r, &payload)
	if err != nil {
		utils.WriteError(w, http.StatusBadRequest, err)
		return
	}

	data := map[string]any{
		"name":        payload.Name,
		"rustdesk_id": payload.RustDeskID,
		"key":         key,
	}
	var inserted []any
	if err := cs.sb.DB.From("computers").Insert(data).Execute(&inserted); err != nil {
		_ = utils.WriteError(w, http.StatusConflict, err)
		return
	}
	utils.WriteJSON(w, http.StatusCreated, map[string]bool{"success": len(inserted) > 0})
}

func (cs ComputersService) RustDeskSync(w http.ResponseWriter, r *http.Request) {
	key := r.PathValue("key")

	var payload rustdeskSyncPaylod
	err := utils.ParseJSON(r, &payload)
	if err != nil {
		utils.WriteError(w, http.StatusBadRequest, err)
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
	var updated []models.Computer
	if err := cs.sb.DB.From("computers").
		Update(update).
		Eq("key", key).
		Execute(&updated); err != nil {
		_ = utils.WriteError(w, http.StatusInternalServerError, err)
		return
	}
	utils.WriteJSON(w, http.StatusOK, map[string]bool{"success": len(updated) > 0})
}
