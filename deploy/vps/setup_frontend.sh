#!/bin/bash
set -e

# =============================================================
# Stockini — Frontend Setup (VPS)
# =============================================================
# Usage: bash deploy/vps/setup_frontend.sh
#
# Builds the Next.js app and configures it under PM2.
# Must be run as the deploy user, from project root.
# =============================================================

RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_ok()   { echo -e "${GREEN}[✓]${NC} $1"; }
log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[!]${NC} $1"; }
log_err()  { echo -e "${RED}[✗]${NC} $1"; }

# ── Resolve paths ───────────────────────────────────────────
resolve_project_root() {
  local start_dir="$1"
  local dir="$start_dir"
  while [ -n "$dir" ] && [ "$dir" != "/" ]; do
    if [ -d "$dir/backend" ] && [ -d "$dir/frontend" ] && [ -d "$dir/deploy/vps" ]; then
      echo "$dir"
      return 0
    fi
    dir="$(dirname "$dir")"
  done
  return 1
}

SCRIPT_PATH="$(readlink -f "${BASH_SOURCE[0]}")"
SCRIPT_DIR="$(cd "$(dirname "$SCRIPT_PATH")" && pwd)"
PROJECT_ROOT="$(resolve_project_root "$SCRIPT_DIR" || true)"
if [ -z "$PROJECT_ROOT" ]; then
  PROJECT_ROOT="$(resolve_project_root "$PWD" || true)"
fi
if [ -z "$PROJECT_ROOT" ]; then
  log_err "Cannot detect project root. Run this script from inside the repo."
  exit 1
fi
FRONTEND_DIR="$PROJECT_ROOT/frontend"

echo ""
echo "========================================="
echo "  Stockini — Frontend Setup"
echo "========================================="
echo ""

# ── 0. Check .env ───────────────────────────────────────────
ENV_FILE="$PROJECT_ROOT/.env"
if [ ! -f "$ENV_FILE" ]; then
  log_warn ".env not found at $ENV_FILE"
  if [ -f "$PROJECT_ROOT/deploy/vps/.env.prod.vps" ]; then
    log_info "Auto-copying from deploy/vps/.env.prod.vps..."
    cp "$PROJECT_ROOT/deploy/vps/.env.prod.vps" "$ENV_FILE"
    log_ok ".env created. Please review it later."
  else
    log_err "Example .env.prod.vps not found! Cannot auto-create .env"
    exit 1
  fi
fi

# ── 1. Source nvm ───────────────────────────────────────────
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && source "$NVM_DIR/nvm.sh"

if ! command -v node &>/dev/null; then
  log_err "Node.js not found. Run setup_backend.sh first to install nvm + Node."
  exit 1
fi
log_ok "Using Node $(node -v)"

# ── 2. Install frontend dependencies ──────────────────────
log_info "Installing frontend dependencies..."
cd "$FRONTEND_DIR"
# Ensure devDependencies are installed (needed for build tools like tsc/vite)
npm ci --legacy-peer-deps --include=dev
log_ok "Dependencies installed"

# ── 3. Build Next.js app ───────────────────────────────────
log_info "Building Next.js app..."

# Source .env for Next.js variables
set -a
source "$ENV_FILE"
set +a

_VPS_IP=$(grep -E '^VPS_IP=' "$ENV_FILE" | head -1 | cut -d= -f2 | tr -d '[:space:]"'"'"'')
_VPS_IP="${_VPS_IP:-51.178.46.89}"
export NEXT_PUBLIC_API_URL="${NEXT_PUBLIC_API_URL:-/api}"
export INTERNAL_API_URL="${INTERNAL_API_URL:-http://127.0.0.1:${BACKEND_PORT:-${PORT:-3001}}/api}"
export NEXT_PUBLIC_APP_URL="${NEXT_PUBLIC_APP_URL:-http://$_VPS_IP}"
export NEXT_PUBLIC_SITE_URL="${NEXT_PUBLIC_SITE_URL:-http://$_VPS_IP}"
log_info "NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL"
log_info "NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL"

npm run build
log_ok "Next.js build complete"

# Verify build output
if [ ! -f "$FRONTEND_DIR/.next/standalone/server.js" ]; then
  log_err ".next/standalone/server.js not found — build failed or output: 'standalone' missing"
  exit 1
fi
log_ok "Verified: .next/standalone/server.js exists"

# Show build size
BUILD_SIZE=$(du -sh "$FRONTEND_DIR/.next" | cut -f1)
log_info "Build size: $BUILD_SIZE"

# ── 4. Prepare standalone runtime ─────────────────────────
log_info "Preparing Next.js standalone runtime..."
mkdir -p "$FRONTEND_DIR/.next/standalone/.next"
rsync -a --delete "$FRONTEND_DIR/.next/static/" "$FRONTEND_DIR/.next/standalone/.next/static/"
if [ -d "$FRONTEND_DIR/public" ]; then
  rsync -a --delete "$FRONTEND_DIR/public/" "$FRONTEND_DIR/.next/standalone/public/"
fi
log_ok "Standalone runtime prepared"

# ── 5. Create PM2 config ──────────────────────────────────
FRONTEND_PORT="${FRONTEND_PORT:-3000}"
BACKEND_PORT="${BACKEND_PORT:-${PORT:-3001}}"
FRONTEND_ECOSYSTEM="$FRONTEND_DIR/ecosystem.frontend.config.js"

if [ ! -f "$FRONTEND_ECOSYSTEM" ]; then
    log_info "ecosystem.frontend.config.js not found — creating permanent file..."
    mkdir -p "$FRONTEND_DIR/logs"

    cat > "$FRONTEND_ECOSYSTEM" <<'EOF'
module.exports = {
  apps: [
    {
      name: "stockini-frontend",
      cwd: "/home/ubuntu/stockini/frontend",
      script: "node_modules/next/dist/bin/next",
      args: "start -p 3000",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      watch: false,
      env: {
        NODE_ENV: "production",
        PORT: 3000
      }
    }
  ]
};
EOF

    log_ok "ecosystem.frontend.config.js created permanently"
fi

# ── 6. Start with PM2 ─────────────────────────────────────
log_info "Starting frontend with PM2..."
cd "$PROJECT_ROOT"

PORT_PID=$(lsof -ti :"$FRONTEND_PORT" 2>/dev/null || true)
if [ -n "$PORT_PID" ]; then
  log_info "Killing stale process on port $FRONTEND_PORT (PID: $PORT_PID)"
  kill -9 $PORT_PID 2>/dev/null || true
  sleep 1
fi

if pm2 describe stockini-frontend >/dev/null 2>&1; then
    pm2 reload "$FRONTEND_ECOSYSTEM" --only stockini-frontend
else
    pm2 start "$FRONTEND_ECOSYSTEM"
fi
pm2 save 2>/dev/null || true
log_ok "Frontend started with PM2"

# ── 7. Health check ───────────────────────────────────────
log_info "Waiting for frontend to respond on port $FRONTEND_PORT..."
FRONTEND_OK=0
for i in $(seq 1 15); do
  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 3 "http://127.0.0.1:$FRONTEND_PORT" 2>/dev/null || echo "000")
  if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "307" ] || [ "$HTTP_CODE" = "308" ]; then
    log_ok "Frontend responds on port $FRONTEND_PORT (HTTP=$HTTP_CODE)"
    FRONTEND_OK=1
    break
  fi
  sleep 2
done

if [ "$FRONTEND_OK" -eq 0 ]; then
  log_err "Frontend is not responding on port $FRONTEND_PORT"
  pm2 logs stockini-frontend --lines 40 --nostream 2>/dev/null || true
  exit 1
fi

# ── Summary ─────────────────────────────────────────────────
echo ""
echo "========================================="
echo -e "${GREEN}  Frontend setup complete!${NC}"
echo "========================================="
echo ""
echo "  PM2 app:    stockini-frontend"
echo "  Port:       $FRONTEND_PORT"
echo "  Logs:       pm2 logs stockini-frontend"
echo ""
echo "  Next: sudo bash deploy/vps/setup_nginx.sh"
echo "    or: copy deploy/vps/nginx-stockini-msp.conf manually"
echo ""
