package internal_api

import (
	"encoding/json"
	"net/http"

	"github.com/fleetctrl/fleetctrl-hub/api/cmd/internal/pkg/cache"
	"github.com/fleetctrl/fleetctrl-hub/api/cmd/internal/utils"
)

type InternalService struct {
	cache *cache.Service
}

func NewInternalService(cache *cache.Service) *InternalService {
	return &InternalService{
		cache: cache,
	}
}

type InvalidateCacheRequest struct {
	Key string `json:"key"`
}

func (s *InternalService) InvalidateCache(w http.ResponseWriter, r *http.Request) {
	var req InvalidateCacheRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		utils.WriteError(w, http.StatusBadRequest, err)
		return
	}

	if req.Key == "" {
		utils.WriteError(w, http.StatusBadRequest, nil)
		return
	}

	if err := s.cache.Invalidate(r.Context(), req.Key); err != nil {
		utils.WriteError(w, http.StatusInternalServerError, err)
		return
	}

	utils.WriteJSON(w, http.StatusOK, map[string]bool{"success": true})
}
