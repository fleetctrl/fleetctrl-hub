#!/usr/bin/env sh

set -e

# Escape sed replacement values so URLs and other special characters stay intact.
escape_sed_replacement() {
  printf '%s' "$1" | sed 's/[\\&|]/\\&/g'
}

# Replace build-time NEXT_PUBLIC placeholders in the generated client assets.
printenv | grep '^NEXT_PUBLIC_' | while IFS= read -r ENV_LINE; do
  ENV_KEY=${ENV_LINE%%=*}
  ENV_VALUE=${ENV_LINE#*=}
  ESCAPED_ENV_VALUE=$(escape_sed_replacement "$ENV_VALUE")

  find .next -type f -exec sed -i "s|_${ENV_KEY}_|${ESCAPED_ENV_VALUE}|g" {} +
done

# Execute the application main command.
exec "$@"
