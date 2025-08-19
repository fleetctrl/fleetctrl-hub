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

	mux := http.NewServeMux()

	// coputers
	mux.Handle("GET /computer/{key}", withMiddleware(getComputerByKey))
	mux.Handle("GET /computer/{key}/registered", withMiddleware(isComputerRegistered))
	mux.Handle("POST /computer/register", withMiddleware(registerComputer))
	mux.Handle("PUT /computer/update", withMiddleware(updateComputer))

	// tasks
	mux.Handle("GET /tasks/{key}", withMiddleware(getTasksByRustdeskID))
	mux.Handle("PUT /task/update", withMiddleware(updateTaskStatus))

	// other
	mux.Handle("GET /health", withMiddleware(health))

	isHttps := os.Getenv("API_HTTPS")
	if isHttps == "true" {
		certFilePath := os.Getenv("CERT_FILE_PATH")
		keyFilePath := os.Getenv("KEY_FILE_PATH")

		serverTLSCert, err := tls.LoadX509KeyPair(certFilePath, keyFilePath)
		if err != nil {
			log.Fatal(err)
		}

		tlsConfig := &tls.Config{
			Certificates: []tls.Certificate{serverTLSCert},
		}

		s := &http.Server{
			Addr:         ":" + port,
			Handler:      mux,
			ReadTimeout:  2 * time.Second,
			WriteTimeout: 2 * time.Second,
			IdleTimeout:  5 * time.Second,
			TLSConfig:    tlsConfig,
		}

		log.Println("Starting https server on :" + port)
		if err := s.ListenAndServeTLS("", ""); err != nil && err != http.ErrServerClosed {
			log.Fatal("Server startup failed")
		}
	} else {
		s := &http.Server{
			Addr:         ":" + port,
			Handler:      mux,
			ReadTimeout:  2 * time.Second,
			WriteTimeout: 2 * time.Second,
			IdleTimeout:  5 * time.Second,
		}

		log.Println("Starting http server on :" + port)
		if err := s.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatal("Server startup failed")
		}
	}
}

func health(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, "")
}
