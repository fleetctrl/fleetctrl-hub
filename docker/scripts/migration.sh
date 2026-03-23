#!/bin/sh
set -e

echo "▶ Deploying Convex schema and functions..."
pnpm convex deploy --url "$CONVEX_SELF_HOSTED_URL" --admin-key "$CONVEX_SELF_HOSTED_ADMIN_KEY" --yes

echo "▶ Running data migrations..."
pnpm convex run convex/migrations.ts:runInstallAggregateBackfill --url "$CONVEX_SELF_HOSTED_URL" --admin-key "$CONVEX_SELF_HOSTED_ADMIN_KEY"
pnpm convex run convex/migrations.ts:runComputerCountAggregateBackfill --url "$CONVEX_SELF_HOSTED_URL" --admin-key "$CONVEX_SELF_HOSTED_ADMIN_KEY"

echo "✓ Migration complete!"
