package main

import (
	"log"
	"net/http"
	"os"

	"github.com/nedpals/supabase-go"
)

var sb *supabase.Client

func main() {
	url := os.Getenv("SUPABASE_URL")
	key := os.Getenv("SUPABASE_KEY")
	if url == "" || key == "" {
		log.Fatal("SUPABASE_URL or SUPABASE_KEY is not set")
	}
	sb = supabase.CreateClient(url, key)

	http.Handle("/computer", withMiddleware(getComputerByKey))
	http.Handle("/tasks", withMiddleware(getTasksByRustdeskID))
	http.Handle("/is_computer_registered", withMiddleware(isComputerRegistered))
	http.Handle("/register_computer", withMiddleware(registerComputer))
	http.Handle("/update_computer", withMiddleware(updateComputer))
	http.Handle("/edit_task_status", withMiddleware(editTaskStatus))

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	log.Printf("listening on :%s", port)
	log.Fatal(http.ListenAndServe(":"+port, nil))
}
