#!/bin/bash
# Alisu — DigitalOcean deploy script
# Run from the project root on your Droplet after git pull
# First-time setup: see README or run with --setup flag
set -euo pipefail

DOMAIN="${DOMAIN:-YOUR_DOMAIN}"
WEB_ROOT="/var/www/alisu"
APP_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "=== Alisu deploy: $(date) ==="

# ── 1. Build dashboard ────────────────────────────────────────────────────────
echo "[1/4] Building dashboard..."
cd "$APP_DIR/apps/dashboard"
npm ci --prefer-offline
npm run build

echo "      Copying to $WEB_ROOT..."
sudo mkdir -p "$WEB_ROOT"
sudo rsync -a --delete dist/ "$WEB_ROOT/"

# ── 2. Install server deps ────────────────────────────────────────────────────
echo "[2/4] Installing server dependencies..."
cd "$APP_DIR/apps/server"
npm ci --prefer-offline --omit=dev

# ── 3. Restart server via PM2 ────────────────────────────────────────────────
echo "[3/4] Restarting server..."
export NODE_ENV=production
if pm2 describe alisu-server > /dev/null 2>&1; then
  pm2 restart alisu-server
else
  # First deploy: start with ts-node (no build step needed)
  pm2 start --name alisu-server \
    --interpreter "$(which ts-node)" \
    src/index.ts
fi
pm2 save

# ── 4. Reload nginx ───────────────────────────────────────────────────────────
echo "[4/4] Reloading nginx..."
sudo nginx -t && sudo nginx -s reload

echo ""
echo "=== Deploy complete ==="
echo "    Dashboard: https://$DOMAIN"
echo "    API health: https://$DOMAIN/health"
echo ""
echo "PM2 status:"
pm2 status alisu-server
