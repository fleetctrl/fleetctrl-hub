package main

import (
	"crypto/tls"
	"log"
	"net/http"
	"os"
	"time"

	computers "github.com/fleetctrl/fleetctrl-hub/api/internal/handlers/computers"
	health "github.com/fleetctrl/fleetctrl-hub/api/internal/handlers/health"
	tasks "github.com/fleetctrl/fleetctrl-hub/api/internal/handlers/tasks"
	"github.com/joho/godotenv"
	"github.com/nedpals/supabase-go"
)

var sb *supabase.Client
var runningInDocker string = "false"

func main() {
	if runningInDocker == "false" {
		err := godotenv.Load("../.env")
		if err != nil {
			log.Fatal("Error loading .env file")
		}
	}

	url := os.Getenv("SUPABASE_URL")
	key := os.Getenv("SERVICE_ROLE_KEY")
	if url == "" || key == "" {
		log.Fatal("SUPABASE_URL or SUPABASE_KEY is not set")
	}
	sb = supabase.CreateClient(url, key)

	port := os.Getenv("API_PORT")
	if port == "" {
		port = "8080"
	}
	log.Printf("listening on :%s", port)

	mux := http.NewServeMux()

	mux.Handle("GET /computer/{key}/registered", withMiddleware(computers.IsComputerRegistered(sb)))
	mux.Handle("POST /computer/{key}/register", withMiddleware(computers.RegisterComputer(sb)))
	mux.Handle("PATCH /computer/{key}/rustdesk-sync", withMiddleware(computers.RustDeskSync(sb)))

	mux.Handle("GET /computer/{key}/tasks", withMiddleware(tasks.GetTasksByKey(sb)))
	mux.Handle("PATCH /task/{id}", withMiddleware(tasks.UpdateTaskStatus(sb)))

	mux.Handle("GET /health", withMiddleware(health.Health()))

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
