package computers

import (
	"errors"
	"fmt"
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

func (cs ComputersService) RustDeskSync(w http.ResponseWriter, r *http.Request) {
	computerID := r.Header.Get("X-Computer-ID")
	fmt.Println(computerID)

	type ComputerRow struct {
		ID string `json:"id"`
	}

	var computer []ComputerRow
	if err := cs.sb.DB.From("computers").Select("id").Eq("id", computerID).Execute(&computer); err != nil {
		_ = utils.WriteError(w, http.StatusInternalServerError, err)
		return
	}
	if len(computer) == 0 {
		_ = utils.WriteError(w, http.StatusBadRequest, errors.New("no computer was found"))
		return
	}

	var payload rustdeskSyncPaylod
	err := utils.ParseJSON(r, &payload)
	if err != nil {
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
		Eq("id", computer[0].ID).
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
