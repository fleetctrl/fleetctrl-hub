package tasks

import (
	"errors"
	"net/http"
	"strconv"

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

func (ts TasksService) GetTasksByKey(w http.ResponseWriter, r *http.Request) {
	key := r.PathValue("key")

	var computer []models.Computer
	if err := ts.sb.DB.From("computers").Select("id").
		Limit(1).
		Eq("key", key).
		Execute(&computer); err != nil {
		_ = utils.WriteError(w, http.StatusInternalServerError, err)
		return
	}
	if len(computer) == 0 {
		_ = utils.WriteError(w, http.StatusNotFound, errors.New("not found"))
		return
	}

	var tasks []models.Task
	if err := ts.sb.DB.From("tasks").
		Select("uuid,created_at,status,task,task_data").
		Eq("computer_id", strconv.Itoa(int(computer[0].ID))).
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
	var payload updateTaskPayload

	err := utils.ParseJSON(r, &payload)
	if err != nil {
		_ = utils.WriteError(w, http.StatusBadRequest, err)
	}

	update := map[string]interface{}{"status": payload.Status, "error": payload.Error}
	var updated []models.Task
	if err := ts.sb.DB.From("tasks").
		Update(update).
		Eq("uuid", id).
		Execute(&updated); err != nil {
		_ = utils.WriteError(w, http.StatusInternalServerError, err)
		return
	}
	utils.WriteJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}
