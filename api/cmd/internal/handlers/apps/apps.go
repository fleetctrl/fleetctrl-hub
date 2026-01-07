package apps

import (
	"errors"
	"fmt"
	"net/http"
	"sort"
	"strings"

	"golang.org/x/mod/semver"

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

type Win32Release struct {
	InstallBinaryPath   string `json:"install_binary_path"`
	Hash                string `json:"hash"`
	InstallScript       string `json:"install_script"`
	UninstallScript     string `json:"uninstall_script"`
	InstallBinarySize   int64  `json:"install_binary_size"`
	InstallBinaryBucket string `json:"install_binary_bucket"`
}

type WingetRelease struct {
	WingetID string `json:"winget_id"`
}

type DetectionRule struct {
	Type   string                 `json:"type"`
	Config map[string]interface{} `json:"config"`
}

type ReleaseRequirement struct {
	ID             string `json:"id"`
	TimeoutSeconds int64  `json:"timeout_seconds"`
	RunAsSystem    bool   `json:"run_as_system"`
	Hash           string `json:"hash"`
}

type AssignedRelease struct {
	ID                string               `json:"id"`
	Version           string               `json:"version"`
	AssignType        string               `json:"assign_type"`
	Action            string               `json:"action"`
	InstallerType     string               `json:"installer_type"`
	Win32             *Win32Release        `json:"win32,omitempty"`
	Winget            *WingetRelease       `json:"winget,omitempty"`
	UninstallPrevious bool                 `json:"uninstall_previous"`
	DetectionRules    []DetectionRule      `json:"detection_rules,omitempty"`
	Requirements      []ReleaseRequirement `json:"requirements,omitempty"`
}

type AssignedApp struct {
	ID          string            `json:"id"`
	DisplayName string            `json:"display_name"`
	Publisher   string            `json:"publisher"`
	AutoUpdate  bool              `json:"auto_update"`
	Releases    []AssignedRelease `json:"releases"`
}

func (as AppsService) GetAssignedApps(w http.ResponseWriter, r *http.Request) {
	computerID := r.Header.Get("X-Computer-ID")
	if computerID == "" {
		utils.WriteError(w, http.StatusUnauthorized, errors.New("computer ID not found"))
		return
	}

	// 1. Get group IDs
	var groupMembers []struct {
		GroupID string `json:"group_id"`
	}
	err := as.sb.DB.From("computer_group_members").Select("group_id").Eq("computer_id", computerID).Execute(&groupMembers)
	if err != nil {
		utils.WriteError(w, http.StatusInternalServerError, errors.New("failed to get group members: "+err.Error()))
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
	}
	err = as.sb.DB.From("computer_group_releases").
		Select("release_id,assign_type,action").
		In("group_id", groupIDs).
		Execute(&groupReleases)

	if err != nil {
		utils.WriteError(w, http.StatusInternalServerError, errors.New("failed to get group releases: "+err.Error()))
		return
	}

	if len(groupReleases) == 0 {
		utils.WriteJSON(w, http.StatusOK, map[string][]AssignedApp{"assignedApps": {}})
		return
	}

	releaseIDs := make([]string, len(groupReleases))
	for i, gr := range groupReleases {
		releaseIDs[i] = gr.ReleaseID
	}

	// 3. Get release and app details
	type ReleaseDetail struct {
		ID                string  `json:"id"`
		Version           string  `json:"version"`
		CreatedAt         string  `json:"created_at"`
		AppID             string  `json:"app_id"`
		DisabledAt        *string `json:"disabled_at"`
		InstallerType     string  `json:"installer_type"`
		UninstallPrevious bool    `json:"uninstall_previous"`
		App               struct {
			ID          string `json:"id"`
			DisplayName string `json:"display_name"`
			Publisher   string `json:"publisher"`
			AutoUpdate  bool   `json:"auto_update"`
		} `json:"apps"`
		Win32        *Win32Release        `json:"win32_releases"`
		Winget       *WingetRelease       `json:"winget_releases"`
		Detection    []DetectionRule      `json:"detection_rules"`
		Requirements []ReleaseRequirement `json:"release_requirements"`
	}

	var releasesDetails []ReleaseDetail
	err = as.sb.DB.From("releases").
		Select("id,version,created_at,app_id,disabled_at,installer_type,uninstall_previous,apps(id,display_name,publisher,auto_update),win32_releases(*),winget_releases(*),detection_rules(type,config),release_requirements(id,timeout_seconds,run_as_system,hash)").
		In("id", releaseIDs).
		Execute(&releasesDetails)

	if err != nil {
		utils.WriteError(w, http.StatusInternalServerError, errors.New("failed to get releases: "+err.Error()))
		return
	}

	releasesMap := make(map[string]ReleaseDetail)
	for _, rd := range releasesDetails {
		if rd.DisabledAt == nil {
			releasesMap[rd.ID] = rd
		}
	}

	// Flatten and De-duplicate
	assignedAppsMap := make(map[string]*AssignedApp)
	for _, gr := range groupReleases {
		rd, ok := releasesMap[gr.ReleaseID]
		if !ok {
			continue
		}

		appID := rd.App.ID
		if _, ok := assignedAppsMap[appID]; !ok {
			assignedAppsMap[appID] = &AssignedApp{
				ID:          rd.App.ID,
				DisplayName: rd.App.DisplayName,
				Publisher:   rd.App.Publisher,
				AutoUpdate:  rd.App.AutoUpdate,
				Releases:    []AssignedRelease{},
			}
		}

		// Check for duplicate release in this app
		duplicate := false
		for _, r := range assignedAppsMap[appID].Releases {
			if r.ID == rd.ID {
				duplicate = true
				break
			}
		}
		if !duplicate {
			ar := AssignedRelease{
				ID:                rd.ID,
				Version:           rd.Version,
				AssignType:        gr.AssignType,
				Action:            gr.Action,
				InstallerType:     rd.InstallerType,
				UninstallPrevious: rd.UninstallPrevious,
			}

			ar.Win32 = rd.Win32
			ar.Winget = rd.Winget

			ar.DetectionRules = rd.Detection
			ar.Requirements = rd.Requirements

			assignedAppsMap[appID].Releases = append(assignedAppsMap[appID].Releases, ar)
		}
	}

	finalApps := make([]AssignedApp, 0, len(assignedAppsMap))
	for _, app := range assignedAppsMap {
		// Sort releases by semantic version descending
		sort.Slice(app.Releases, func(i, j int) bool {
			v1 := app.Releases[i].Version
			v2 := app.Releases[j].Version

			// Replace hyphens with dots for semver comparison
			v1 = strings.ReplaceAll(v1, "-", ".")
			v2 = strings.ReplaceAll(v2, "-", ".")

			// Normalize for semver package (ensure 'v' prefix)
			if !strings.HasPrefix(v1, "v") {
				v1 = "v" + v1
			}
			if !strings.HasPrefix(v2, "v") {
				v2 = "v" + v2
			}

			// semver.Compare returns 1 if v1 > v2, -1 if v1 < v2
			return semver.Compare(v1, v2) > 0
		})
		finalApps = append(finalApps, *app)
	}

	utils.WriteJSON(w, http.StatusOK, map[string][]AssignedApp{
		"apps": finalApps,
	})
}

func (as AppsService) DownloadApp(w http.ResponseWriter, r *http.Request) {
	computerID := r.Header.Get("X-Computer-ID")
	if computerID == "" {
		utils.WriteError(w, http.StatusUnauthorized, errors.New("computer ID not found"))
		return
	}

	releaseID := r.PathValue("releaseID")
	if releaseID == "" {
		utils.WriteError(w, http.StatusBadRequest, errors.New("release ID is required"))
		return
	}

	// 1. Verify assignment
	// Get computer's groups
	var groupMembers []struct {
		GroupID string `json:"group_id"`
	}
	err := as.sb.DB.From("computer_group_members").Select("group_id").Eq("computer_id", computerID).Execute(&groupMembers)
	if err != nil {
		utils.WriteError(w, http.StatusInternalServerError, errors.New("failed to get group members: "+err.Error()))
		return
	}

	if len(groupMembers) == 0 {
		utils.WriteError(w, http.StatusForbidden, errors.New("access denied"))
		return
	}

	groupIDs := make([]string, len(groupMembers))
	for i, gm := range groupMembers {
		groupIDs[i] = gm.GroupID
	}

	// Check if any of the computer's groups have this release assigned
	var groupReleases []struct {
		ReleaseID string `json:"release_id"`
	}
	err = as.sb.DB.From("computer_group_releases").
		Select("release_id").
		In("group_id", groupIDs).
		Eq("release_id", releaseID).
		Execute(&groupReleases)

	if err != nil {
		utils.WriteError(w, http.StatusInternalServerError, errors.New("failed to check assignment: "+err.Error()))
		return
	}

	if len(groupReleases) == 0 {
		utils.WriteError(w, http.StatusForbidden, errors.New("release not assigned to this computer"))
		return
	}

	// 2. Get release details to find storage path
	var releases []struct {
		InstallerType string        `json:"installer_type"`
		Win32         *Win32Release `json:"win32_releases"`
	}
	err = as.sb.DB.From("releases").
		Select("installer_type,win32_releases(*)").
		Limit(1).
		Eq("id", releaseID).
		Execute(&releases)

	if err != nil {
		utils.WriteError(w, http.StatusNotFound, errors.New("release not found: "+err.Error()))
		return
	}

	if len(releases) == 0 {
		utils.WriteError(w, http.StatusNotFound, errors.New("release not found"))
		return
	}
	release := releases[0]

	if release.InstallerType != "win32" {
		utils.WriteError(w, http.StatusBadRequest, errors.New("only win32 apps are supported for download"))
		return
	}

	if release.Win32 == nil {
		utils.WriteError(w, http.StatusInternalServerError, errors.New("release info missing"))
		return
	}

	// 3. Generate signed URL
	// CreateSignedUrl returns only the response object, panics on error?
	defer func() {
		if r := recover(); r != nil {
			utils.WriteError(w, http.StatusInternalServerError, errors.New(fmt.Sprintf("failed to generate download URL (panic): %v", r)))
		}
	}()

	resp := as.sb.Storage.From(release.Win32.InstallBinaryBucket).CreateSignedUrl(release.Win32.InstallBinaryPath, 3600) // 1 hour expiry
	// If we got here, we assume it worked?
	if resp.SignedUrl == "" {
		utils.WriteError(w, http.StatusInternalServerError, errors.New("failed to generate download URL: empty URL"))
		return
	}

	http.Redirect(w, r, resp.SignedUrl, http.StatusTemporaryRedirect)
}

func (as AppsService) DownloadRequirement(w http.ResponseWriter, r *http.Request) {
	computerID := r.Header.Get("X-Computer-ID")
	if computerID == "" {
		utils.WriteError(w, http.StatusUnauthorized, errors.New("computer ID not found"))
		return
	}

	requirementID := r.PathValue("requirementID")
	if requirementID == "" {
		utils.WriteError(w, http.StatusBadRequest, errors.New("requirement ID is required"))
		return
	}

	// 1. Verify assignment
	// Get computer's groups
	var groupMembers []struct {
		GroupID string `json:"group_id"`
	}
	err := as.sb.DB.From("computer_group_members").Select("group_id").Eq("computer_id", computerID).Execute(&groupMembers)
	if err != nil {
		utils.WriteError(w, http.StatusInternalServerError, errors.New("failed to get group members: "+err.Error()))
		return
	}

	if len(groupMembers) == 0 {
		utils.WriteError(w, http.StatusForbidden, errors.New("access denied"))
		return
	}

	groupIDs := make([]string, len(groupMembers))
	for i, gm := range groupMembers {
		groupIDs[i] = gm.GroupID
	}

	// Check if any of the computer's groups have a release that uses this requirement
	var groupReleases []struct {
		ReleaseID string `json:"release_id"`
	}
	err = as.sb.DB.From("computer_group_releases").
		Select("release_id").
		In("group_id", groupIDs).
		Execute(&groupReleases)

	if err != nil {
		utils.WriteError(w, http.StatusInternalServerError, errors.New("failed to check assignment: "+err.Error()))
		return
	}

	if len(groupReleases) == 0 {
		utils.WriteError(w, http.StatusForbidden, errors.New("no releases assigned to this computer"))
		return
	}

	assignedReleaseIDs := make([]string, len(groupReleases))
	for i, gr := range groupReleases {
		assignedReleaseIDs[i] = gr.ReleaseID
	}

	// 2. Verify that the requirement belongs to one of the assigned releases
	var requirements []struct {
		Bucket      string `json:"bucket"`
		StoragePath string `json:"storage_path"`
	}
	err = as.sb.DB.From("release_requirements").
		Select("bucket,storage_path").
		Limit(1).
		Eq("id", requirementID).
		In("release_id", assignedReleaseIDs).
		Execute(&requirements)

	if err != nil {
		utils.WriteError(w, http.StatusInternalServerError, errors.New("failed to check requirement assignment: "+err.Error()))
		return
	}

	if len(requirements) == 0 {
		utils.WriteError(w, http.StatusForbidden, errors.New("requirement not found or not assigned to this computer"))
		return
	}
	req := requirements[0]

	// 3. Generate signed URL
	defer func() {
		if r := recover(); r != nil {
			utils.WriteError(w, http.StatusInternalServerError, errors.New(fmt.Sprintf("failed to generate download URL (panic): %v", r)))
		}
	}()

	resp := as.sb.Storage.From(req.Bucket).CreateSignedUrl(req.StoragePath, 3600) // 1 hour expiry
	if resp.SignedUrl == "" {
		utils.WriteError(w, http.StatusInternalServerError, errors.New("failed to generate download URL: empty URL"))
		return
	}

	http.Redirect(w, r, resp.SignedUrl, http.StatusTemporaryRedirect)
}
