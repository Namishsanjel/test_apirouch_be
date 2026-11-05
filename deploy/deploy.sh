#!/usr/bin/env bash
#
# Production deploy script. Runs ON THE VPS, invoked over SSH by
# .github/workflows/deploy.yml (piped through `bash -s`).
#
# It is idempotent and safe to run repeatedly:
#   1. fetch + hard-reset to origin/main
#   2. npm ci (all deps, so the Strapi admin build works)
#   3. build (admin panel included)
#   4. restart PM2
#   5. local health check
#
# If a step fails the script exits non-zero BEFORE touching the running
# process, so the previous build keeps serving traffic.
#
# Configuration is read from the environment (PM2 systemd unit sets APP_DIR
# and APP_NAME). Sensible defaults are provided.

set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/apitours/app}"
APP_NAME="${APP_NAME:-apitours-api}"
BRANCH="${DEPLOY_BRANCH:-main}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:1337/_health}"
PM2_BIN="${PM2_BIN:-pm2}"

log() { printf '[deploy] %s\n' "$*"; }
fail() { printf '[deploy] ERROR: %s\n' "$*" >&2; exit 1; }

cd "$APP_DIR" || fail "app dir not found: $APP_DIR"

log "Fetching origin/$BRANCH"
git fetch --prune origin "$BRANCH"

# Hard reset is intentional: the server checkout is a read-only mirror of
# origin/main. Nothing is committed on the server. The production .env lives
# outside the repo (or is gitignored) and survives this.
log "Resetting to origin/$BRANCH"
git reset --hard "origin/$BRANCH"

log "Installing dependencies (npm ci)"
# All dependencies are installed so `strapi build` can build the admin panel;
# runtime code still runs under NODE_ENV=production from the ecosystem file.
npm ci --include=dev

log "Building (NODE_ENV=production)"
NODE_ENV=production npm run build

# Strapi applies schema changes automatically on start. If the project adds
# explicit migrations to database/migrations, run them here, e.g.:
#   npm run migrate --if-present
npm run migrate --if-present

log "Reloading PM2 app: $APP_NAME"
# startOrReload: first run starts it, later runs do a zero-downtime reload.
"$PM2_BIN" startOrReload ecosystem.config.js --only "$APP_NAME" --update-env
"$PM2_BIN" save

log "Health check: $HEALTH_URL"
for attempt in $(seq 1 15); do
  # Strapi responds 204 on /_health when ready.
  if curl -fsS -o /dev/null -w '%{http_code}' "$HEALTH_URL" | grep -qE '^20[04]$'; then
    log "Health check OK"
    exit 0
  fi
  sleep 2
done

fail "health check failed after retries — run: $PM2_BIN logs $APP_NAME --lines 100"
