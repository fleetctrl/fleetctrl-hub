package apps

import (
	"net/http"

	"github.com/fleetctrl/fleetctrl-hub/api/cmd/internal/utils"
	"github.com/nedpals/supabase-go"
)

type AppsService struct {
	sb *supabase.Client
}

func NewAppsService(sb *supabase.Client) *AppsService {
	return &AppsService{
		sb: sb,
	}
}

type AssignedRelease struct {
	ID         string `json:"id"`
	Version    string `json:"version"`
	AssignType string `json:"assign_type"`
	Action     string `json:"action"`
}

type AssignedApp struct {
	ID          string            `json:"id"`
	DisplayName string            `json:"display_name"`
	Publisher   string            `json:"publisher"`
	Releases    []AssignedRelease `json:"releases"`
}

func (as AppsService) GetAssignedApps(w http.ResponseWriter, r *http.Request) {
	computerID := r.Header.Get("X-Computer-ID")
	if computerID == "" {
		utils.WriteError(w, http.StatusUnauthorized, nil)
		return
	}

	// 1. Get group IDs
	var groupMembers []struct {
		GroupID string `json:"group_id"`
	}
	err := as.sb.DB.From("computer_group_members").Select("group_id").Eq("computer_id", computerID).Execute(&groupMembers)
	if err != nil {
		utils.WriteError(w, http.StatusInternalServerError, err)
		return
	}

	if len(groupMembers) == 0 {
		utils.WriteJSON(w, http.StatusOK, map[string][]AssignedApp{"assignedApps": {}})
		return
	}

	groupIDs := make([]string, len(groupMembers))
	for i, gm := range groupMembers {
		groupIDs[i] = gm.GroupID
	}

	// 2. Get releases for these groups
	var groupReleases []struct {
		ReleaseID  string `json:"release_id"`
		AssignType string `json:"assign_type"`
		Action     string `json:"action"`
		Release    struct {
			ID      string `json:"id"`
			Version string `json:"version"`
			AppID   string `json:"app_id"`
			App     struct {
				ID          string `json:"id"`
				DisplayName string `json:"display_name"`
				Publisher   string `json:"publisher"`
			} `json:"apps"`
		} `json:"releases"`
	}

	err = as.sb.DB.From("computer_group_releases").
		Select("release_id, assign_type, action, releases!inner(id, version, app_id, apps(id, display_name, publisher))").
		In("group_id", groupIDs).
		Is("releases.disabled_at", "null").
		Execute(&groupReleases)

	if err != nil {
		utils.WriteError(w, http.StatusInternalServerError, err)
		return
	}

	// Flatten and De-duplicate
	assignedAppsMap := make(map[string]*AssignedApp)
	for _, gr := range groupReleases {
		appID := gr.Release.App.ID
		if _, ok := assignedAppsMap[appID]; !ok {
			assignedAppsMap[appID] = &AssignedApp{
				ID:          gr.Release.App.ID,
				DisplayName: gr.Release.App.DisplayName,
				Publisher:   gr.Release.App.Publisher,
				Releases:    []AssignedRelease{},
			}
		}

		// Check for duplicate release in this app
		duplicate := false
		for _, r := range assignedAppsMap[appID].Releases {
			if r.ID == gr.Release.ID {
				duplicate = true
				break
			}
		}
		if !duplicate {
			assignedAppsMap[appID].Releases = append(assignedAppsMap[appID].Releases, AssignedRelease{
				ID:         gr.Release.ID,
				Version:    gr.Release.Version,
				AssignType: gr.AssignType,
				Action:     gr.Action,
			})
		}
	}

	finalApps := make([]AssignedApp, 0, len(assignedAppsMap))
	for _, app := range assignedAppsMap {
		finalApps = append(finalApps, *app)
	}

	utils.WriteJSON(w, http.StatusOK, map[string][]AssignedApp{
		"assignedApps": finalApps,
	})
}