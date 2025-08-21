package main

import (
	"crypto/tls"
	"fmt"
	"log"
	"net/http"
	"os"
	"time"

	"github.com/joho/godotenv"
	"github.com/nedpals/supabase-go"
)

var sb *supabase.Client

func main() {
	docker := os.Getenv("RUNNING_IN_DOCKER")
	if docker == "true" {
	} else {
		err := godotenv.Load("../.env")
		if err != nil {
			log.Fatal("Error loading .env file")
		}
	}

	url := os.Getenv("SUPABASE_URL")
	key := os.Getenv("SERVICE_ROLE_KEY")

	fmt.Printf("url: %s\n", url)
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

	// coputers
	mux.Handle("GET /computer/{key}/registered", withMiddleware(isComputerRegistered))
	mux.Handle("POST /computer/{key}/register", withMiddleware(registerComputer))
	mux.Handle("PATCH /computer/{key}/rustdesk-sync", withMiddleware(rustDeskSync))

	// tasks
	mux.Handle("GET /computer/{key}/tasks", withMiddleware(getTasksByKey))
	mux.Handle("PATCH /task/{id}", withMiddleware(updateTaskStatus))

	// cert management
	mux.Handle("POST /enroll/csr", withMiddleware(enrollCSR))
	mux.Handle("POST /cert/rotate", withMiddleware(rotateCert))

	// other
	mux.Handle("GET /health", withMiddleware(health))

	isHttps := os.Getenv("API_HTTPS")
	if isHttps == "true" {
		certFilePath := os.Getenv("TLS_SERVER_CERT")
		keyFilePath := os.Getenv("TLS_SERVER_KEY")

		serverTLSCert, err := tls.LoadX509KeyPair(certFilePath, keyFilePath)
		if err != nil {
			log.Fatal(err)
		}

		tlsConfig := &tls.Config{
			Certificates: []tls.Certificate{serverTLSCert},
			MinVersion:   tls.VersionTLS12,
		}
		if os.Getenv("MTLS_REQUIRED") == "true" {
			caBundle := os.Getenv("TLS_CLIENT_CA_BUNDLE")
			pool, err := loadClientCAs(caBundle)
			if err != nil {
				log.Fatal(err)
			}
			tlsConfig.ClientAuth = tls.RequireAndVerifyClientCert
			tlsConfig.ClientCAs = pool
			tlsConfig.VerifyPeerCertificate = verifyDeviceCert
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
