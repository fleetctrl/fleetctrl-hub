# FleetCtrl Hub

FleetCtrl Hub is a modern device management (MDM/Fleet Management) platform that enables centralized management of computers, groups, applications, and releases.

## Technologies

The project is built on the following technologies:

- **Frontend:** [Next.js 15](https://nextjs.org/) (App Router)
- **Backend & Database:** [Convex](https://convex.dev/)
- **Authentication:** [Better Auth](https://better-auth.com/) (integrated with Convex)
- **Styling:** [Tailwind CSS](https://tailwindcss.com/) & [Radix UI](https://www.radix-ui.com/)
- **Validation:** [Zod](https://zod.dev/)

## Getting Started

### Requirements

- **Node.js**: version 20 or newer
- **pnpm**: recommended package manager (version 10+)

### Installation

1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd fleetctrl-hub
   ```

2. Install dependencies:
   ```bash
   pnpm install
   ```

3. Environment setup:
   The project uses Convex. To initialize the development environment, log in to your Convex account:
   ```bash
   npx convex dev
   ```
   This command will prompt you to create a new project or link to an existing one and will generate the necessary configuration files (such as `.env.local` with `CONVEX_DEPLOYMENT` and `NEXT_PUBLIC_CONVEX_URL`).

### Running Development

For local development, two processes need to be running:

1. **Convex Backend** (syncing schema changes and functions):
   ```bash
   npx convex dev
   ```

2. **Next.js Frontend** (web application):
   ```bash
   pnpm dev
   ```

The application will then be available at [http://localhost:3000](http://localhost:3000).

## Docker Production Setup

For a production-style Docker deployment you do not need to clone the whole repository. Run the bootstrap script over `curl`; it downloads the required files and starts the interactive setup through `manage.sh`.

```bash
curl -fsSL https://raw.githubusercontent.com/fleetctrl/fleetctrl-hub/main/docker/install.sh | bash
```

Notes:

- The script creates a `fleetctrl-hub-docker` directory in your current location, downloads the required files into it, and runs `./manage.sh setup`.
- It saves `docker-compose.production.yml` as `docker-compose.yml`, because `manage.sh` uses `docker compose` without an explicit `-f` flag.
- It downloads both `Caddyfile.proxy` and `Caddyfile.standalone`; the setup script selects the correct one based on your answers.

If you want a different target directory, run:

```bash
curl -fsSL https://raw.githubusercontent.com/fleetctrl/fleetctrl-hub/main/docker/install.sh | INSTALL_DIR=my-fleetctrl bash
```

After setup completes, FleetCtrl Hub and the self-hosted Convex stack will be available on the URL you entered during the setup wizard.
