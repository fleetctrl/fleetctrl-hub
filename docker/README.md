# Local Docker Environment

This directory contains a fully local setup for the Fleetctrl Hub, including a self-hosted Convex instance and an HTTPS proxy provided by Caddy.

## Services

- **Hub**: The Next.js application (production build).
- **Convex**: A self-hosted instance of the Convex backend.
- **RustFS**: S3-compatible object storage used by Convex for file and snapshot storage.
- **Proxy**: Caddy handling HTTPS termination and routing.
- **Convex Migration**: A utility container for running Convex deployment, env sync, backup, restore, and migration commands.

## Prerequisites

- Docker and Docker Compose installed.

## Usage

### Local Dev Mode (No Rebuild on Code Change)

Use the dev override compose file to run Next.js in watch mode with source mounted from your host.

```bash
cd docker
./dev.sh up
```

Notes:

- `hub` runs `pnpm dev` inside the container (hot reload enabled).
- Source code is mounted via bind volume, so code changes are reflected immediately.
- Open the app via proxy at `https://localhost` (or your configured `SITE_URL`).
- First start may take longer because dependencies are installed into the `hub-node-modules` volume.

Useful commands:

- `./dev.sh up --build` rebuild image layers if needed.
- `./dev.sh up --sync-convex` also sync env variables to Convex and deploy functions/schema.
- `./dev.sh sync-convex` run Convex env sync + deploy without restarting the whole stack.
- `./dev.sh logs hub` follow app logs.
- `./dev.sh down` stop the dev stack.

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
5. Save the Admin Key to `.env` (as `CONVEX_DEPLOY_KEY`, which the `convex-migration` container maps to `CONVEX_SELF_HOSTED_ADMIN_KEY`).
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

    This starts RustFS, waits for the required S3 buckets to be created, and only then starts Convex.

4.  Deploy Schema:
    You need to generate an admin key and run the deploy command.

    ```bash
    # Generate Key
    KEY=$(docker compose exec -T convex ./generate_admin_key.sh | tr -d '\r' | tail -n 1)

    # Deploy
    docker compose exec convex-migration npx convex deploy --url http://convex:3210 --admin-key $KEY --yes
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
- **Invalid Convex deploy key / requests to `api.convex.dev`**: In the Docker setup, `convex-migration` must use the self-hosted variables `CONVEX_SELF_HOSTED_URL` and `CONVEX_SELF_HOSTED_ADMIN_KEY`. Passing `CONVEX_DEPLOY_KEY` directly into that container makes the CLI try the hosted Convex cloud flow instead.
- **Rebuilding**: If you change the code, you need to rebuild the containers:
  ```bash
  docker compose build
  docker compose up -d
  ```
  For local development without rebuilding on each code change, use:
  ```bash
  ./dev.sh up
  ```
  For env/schema sync to Convex during dev:
  ```bash
  ./dev.sh up --sync-convex
  ```
  And potentially re-run deployment if schema changed:
  ```bash
  ./dev.sh sync-convex
  ```
