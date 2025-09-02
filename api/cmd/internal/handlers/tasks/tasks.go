package tasks

import (
	"net/http"
	"time"

	"github.com/fleetctrl/fleetctrl-hub/api/cmd/internal/models"
	"github.com/fleetctrl/fleetctrl-hub/api/cmd/internal/utils"
	"github.com/nedpals/supabase-go"
)

type TasksService struct {
	sb *supabase.Client
}

type updateTaskPayload struct {
	Status string `json:"status"`
	Error  string `json:"error"`
}

func NewTasksService(sb *supabase.Client) *TasksService {
	return &TasksService{
		sb: sb,
	}
}

func (ts TasksService) GetTasks(w http.ResponseWriter, r *http.Request) {
	computerID := r.Header.Get("X-Computer-ID")

	var tasks []models.Task
	if err := ts.sb.DB.From("tasks").
		Select("id", "created_at", "status", "task", "task_data").
		Eq("computer_id", computerID).
		Eq("status", "PENDING").
		Execute(&tasks); err != nil {
		_ = utils.WriteError(w, http.StatusInternalServerError, err)
		return
	}

	utils.WriteJSON(w, http.StatusOK, map[string]any{
		"tasks": tasks,
	})
}

func (ts TasksService) UpdateTaskStatus(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	computerID := r.Header.Get("X-Computer-ID")
	var payload updateTaskPayload

	err := utils.ParseJSON(r, &payload)
	if err != nil {
		_ = utils.WriteError(w, http.StatusBadRequest, err)
	}

	now := time.Now().UTC()

	var update map[string]any
	if payload.Status == "SUCCESS" || payload.Status == "ERROR" {
		update = map[string]any{"status": payload.Status, "error": payload.Error, "finish_at": now}
	} else {
		update = map[string]any{"status": payload.Status, "error": payload.Error, "started_at": now}
	}

	var updated []models.Task
	if err := ts.sb.DB.From("tasks").
		Update(update).
		Eq("id", id).
		Eq("computer_id", computerID).
		Execute(&updated); err != nil {
		_ = utils.WriteError(w, http.StatusInternalServerError, err)
		return
	}
	utils.WriteJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}
