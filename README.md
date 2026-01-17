# FleetCtrl Hub

FleetCtrl Hub is a modern device management (MDM/Fleet Management) platform that enables centralized management of computers, groups, applications, and releases.

## 🛠 Technologies

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

## Docker (Produciton Build)
 
 The project includes a `Dockerfile` and `docker-compose.yaml` to build and run the application in a containerized environment.
 
 **Prerequisites for Docker Build:**
 1. Make sure you have a valid `.env` file in the root directory. It must contain:
    - `CONVEX_SITE_URL`
    - `NEXT_PUBLIC_CONVEX_SITE_URL` (usually identical to CONVEX_SITE_URL)
    - `NEXT_PUBLIC_CONVEX_URL`
    - Other necessary secrets
 
 2. **Deploy the backend first!**
    The Docker container runs the Next.js frontend in standalone mode. It does **not** run the Convex backend or sync schema changes. Before building or running the container, ensure your Convex backend is live and updated:
    ```bash
    npx convex deploy
    ```
 
 3. Build and run:
    ```bash
    docker compose up -d --build
    ```
 
 The application will be available at [http://localhost:3000](http://localhost:3000).
