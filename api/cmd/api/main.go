package main

import (
	"crypto/tls"
	"log"
	"net/http"
	"os"
	"time"

	"github.com/fleetctrl/fleetctrl-hub/api/cmd/internal/handlers/computers"
	"github.com/fleetctrl/fleetctrl-hub/api/cmd/internal/handlers/tasks"
	"github.com/fleetctrl/fleetctrl-hub/api/cmd/internal/utils"
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
	redisAddr := os.Getenv("REDIS_HOST") + ":" + os.Getenv("REDIS_PORT")
	if url == "" || key == "" || redisAddr == "" {
		log.Fatal("SUPABASE_URL, SUPABASE_KEY, REDIS_HOST or REDIS_PORT is not set")
	}
	sb = supabase.CreateClient(url, key)

	port := os.Getenv("API_PORT")
	if port == "" {
		port = "8080"
	}
	log.Printf("listening on :%s", port)

	mux := http.NewServeMux()

	// redisPass := os.Getenv("REDIS_PASSWORD")
	// client := redis.NewClient(&redis.Options{
	// 	Addr:     redisAddr,
	// 	Password: redisPass,
	// 	DB:       0, // Use default DB
	// 	Protocol: 2, // Connection protocol
	// })

	// //auth
	// as := auth.NewAuthService(sb, client)

	// coputers
	cs := computers.NewComputersService(sb)
	mux.Handle("GET /computer/{key}/registered", withMiddleware(cs.IsComputerRegistered))
	mux.Handle("POST /computer/{key}/register", withMiddleware(cs.RegisterComputer))
	mux.Handle("PATCH /computer/{key}/rustdesk-sync", withMiddleware(cs.RustDeskSync))

	// tasks
	ts := tasks.NewTasksService(sb)
	mux.Handle("GET /computer/{key}/tasks", withMiddleware(ts.GetTasksByKey))
	mux.Handle("PATCH /task/{id}", withMiddleware(ts.UpdateTaskStatus))

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
	utils.WriteJSON(w, http.StatusOK, "")
}
