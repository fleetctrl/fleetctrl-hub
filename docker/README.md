# Local Docker Environment

This directory contains a fully local setup for the Fleetctrl Hub, including a self-hosted Convex instance and an HTTPS proxy provided by Caddy.

## Services

- **Hub**: The Next.js application (production build).
- **Convex**: A self-hosted instance of the Convex backend.
- **Proxy**: Caddy handling HTTPS termination and routing.
- **Convex CLI**: A utility container for running Convex commands (e.g., deployment).

## Prerequisites

- Docker and Docker Compose installed.

## Usage

### Automated Setup (Recommended)

Run the setup script to initialize the environment, generate necessary keys, and deploy the Convex schema automatically.

```bash
./setup.sh
```

This script will:
1. Create `.env` from `.env.example` if missing.
2. Start all services.
3. Wait for Convex backend to be ready.
4. Generate an Admin Key from the Convex backend.
5. Save the Admin Key to `.env` (as `CONVEX_DEPLOY_KEY`).
6. Set required environment variables on the Convex backend.
7. Deploy the Convex schema and functions from the local source code to the containerized backend.

### Manual Usage

1.  Navigate to the `docker` directory:
    ```bash
    cd docker
    ```

2.  Create the environment file:
    ```bash
    cp .env.example .env
    ```

3.  Start the services:
    ```bash
    docker compose up -d
    ```

4.  Deploy Schema:
    You need to generate an admin key and run the deploy command.
    ```bash
    # Generate Key
    KEY=$(docker compose exec convex ./generate_admin_key.sh | tr -d '\r')
    
    # Deploy
    docker compose exec convex-cli npx convex deploy --url http://convex:3210 --admin-key $KEY --yes
    ```

5.  Access the application:
    - **Hub**: [https://localhost](https://localhost)
    - **Convex API**: [https://localhost/api](https://localhost/api)
    - **Convex Admin**: [https://convex.localhost](https://convex.localhost)

## Update

Run the update script to update the environment, generate necessary keys, and deploy the Convex schema automatically.

```bash
./update.sh
```

This script will:
1. Pull the latest changes from the repository.
2. Start all services.
3. Deploy the Convex schema and functions from the local source code to the containerized backend.

## Convex Push

Use this when you only need to deploy Convex schema and functions without running the full update or setup.

```bash
./convex-push.sh
```

## Configuration

- **Hub**: Configured in `docker-compose.yml`. Use `.env` to adjust variables.
- **Persistence**: Convex data is stored in the `convex-data` Docker volume. Caddy certificates are in `caddy_data`.

## Troubleshooting

- **Certificate Warnings**: Normalized for self-signed certificates (Caddy auto-generates them).
- **Convex Connection**: If Hub logs errors about connecting to Convex, ensure `CONVEX_URL` is correct and the initial schema deployment (step 4 / setup script) succeeded.
- **Rebuilding**: If you change the code, you need to rebuild the containers:
  ```bash
  docker compose build
  docker compose up -d
  ```
  And potentially re-run deployment if schema changed:
  ```bash
  docker compose exec convex-cli npx convex deploy ...
  ```
