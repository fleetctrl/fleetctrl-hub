#!/bin/sh
set -e

print_header() {
  echo ""
  echo "╔════════════════════════════════════════════╗"
  echo "║        FleetCtrl Convex Migration         ║"
  echo "╚════════════════════════════════════════════╝"
}

print_step() {
  echo ""
  echo "▶ $1"
  echo "  └─ $2"
}

print_done() {
  echo ""
  echo "✓ $1"
  echo ""
}

print_header

print_step "Deploying Convex" "Schema and functions"
pnpm convex deploy --url "$CONVEX_SELF_HOSTED_URL" --admin-key "$CONVEX_SELF_HOSTED_ADMIN_KEY" --yes

print_step "Running data migrations" "Executing all registered migration runners"
pnpm convex run convex/migrations:runAll --url "$CONVEX_SELF_HOSTED_URL" --admin-key "$CONVEX_SELF_HOSTED_ADMIN_KEY"
print_done "Migration complete!"
