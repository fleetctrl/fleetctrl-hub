package health

import (
	"net/http"

	"github.com/fleetctrl/fleetctrl-hub/api/cmd/pkgs/utils"
)

// Health returns a simple OK response for health checks.
func Health() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		utils.WriteJSON(w, http.StatusOK, "")
	}
}
