#!/bin/bash
set -euo pipefail

# =============================================================
# Stockini — Backend Setup (VPS)
# =============================================================
# Usage: bash deploy/vps/setup_backend.sh
#
# Installs nvm + Node 20, builds NestJS, configures PM2.
# Must be run as the deploy user (NOT root), from project root.
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

# ── Resolve project root ────────────────────────────────────
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
BACKEND_DIR="$PROJECT_ROOT/backend"

echo ""
echo "========================================="
echo "  Stockini — Backend Setup"
echo "========================================="
echo ""

# ── Root check (PM2 must NOT run as root) ────────────────────
if [ "$EUID" -eq 0 ]; then
  log_err "Do NOT run this script as root/sudo!"
  log_err "PM2 must run under your user, not root."
  log_err "Usage: bash deploy/vps/setup_backend.sh"
  exit 1
fi

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
log_ok ".env found at $ENV_FILE"

# ── 0b. Validate critical env variables ─────────────────────
validate_env_setup() {
  local env_file="$1"
  local errors=0

  local _JWT _DB_URL _USE_REDIS _REDIS_URL
  _JWT=$(grep -E '^JWT_SECRET=' "$env_file" 2>/dev/null | head -1 | cut -d= -f2-)
  _DB_URL=$(grep -E '^DATABASE_URL=' "$env_file" 2>/dev/null | head -1 | cut -d= -f2-)
  _USE_REDIS=$(grep -E '^USE_REDIS=' "$env_file" 2>/dev/null | head -1 | cut -d= -f2- | tr -d '[:space:]')
  _REDIS_URL=$(grep -E '^REDIS_URL=' "$env_file" 2>/dev/null | head -1 | cut -d= -f2-)

  if [ -z "$_JWT" ] || [ "$_JWT" = "changeme" ] || [ "$_JWT" = "your-secret-here" ]; then
    log_err "JWT_SECRET missing or insecure default in .env"
    log_warn "  → Generate one: openssl rand -base64 48"
    errors=$((errors + 1))
  else
    log_ok "JWT_SECRET set"
  fi

  if [ -z "$_DB_URL" ]; then
    log_err "DATABASE_URL missing in .env"
    errors=$((errors + 1))
  else
    log_ok "DATABASE_URL set"
  fi

  if [ "$_USE_REDIS" = "true" ] && [ -z "$_REDIS_URL" ]; then
    log_err "USE_REDIS=true but REDIS_URL missing in .env"
    log_warn "  → Add REDIS_URL=redis://:password@127.0.0.1:6379"
    errors=$((errors + 1))
  fi

  if [ "$errors" -gt 0 ]; then
    log_err "$errors critical variable(s) missing — fix .env before deploying"
    exit 1
  fi
}

validate_env_setup "$ENV_FILE"

# ── 0c. Validate backup tools and directory permissions ───
if ! command -v pg_dump >/dev/null 2>&1 || ! command -v pg_restore >/dev/null 2>&1; then
  log_err "pg_dump/pg_restore missing. Install postgresql-client-16 first."
  exit 1
fi

BACKUP_DIR_VALUE=$(grep -E '^BACKUP_DIRECTORY=' "$ENV_FILE" 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"')
BACKUP_DIR_VALUE=${BACKUP_DIR_VALUE:-/opt/stockini/backups}
if [[ "$BACKUP_DIR_VALUE" != /* ]]; then
  log_err "BACKUP_DIRECTORY must be an absolute path: $BACKUP_DIR_VALUE"
  exit 1
fi
log_info "Preparing backup directory: $BACKUP_DIR_VALUE"
sudo install -d -m 0750 -o "$USER" -g "$(id -gn)" "$BACKUP_DIR_VALUE"
if [ ! -r "$BACKUP_DIR_VALUE" ] || [ ! -w "$BACKUP_DIR_VALUE" ] || [ ! -x "$BACKUP_DIR_VALUE" ]; then
  log_err "Backup directory is not readable/writable by $USER: $BACKUP_DIR_VALUE"
  exit 1
fi
log_ok "Backup tools and directory permissions verified"

# ── 1. Install nvm + Node 20 ───────────────────────────────
export NVM_DIR="$HOME/.nvm"

if [ ! -d "$NVM_DIR" ]; then
  log_info "Installing nvm..."
  curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
  log_ok "nvm installed"
fi

# Source nvm
[ -s "$NVM_DIR/nvm.sh" ] && source "$NVM_DIR/nvm.sh"

if ! command -v nvm &>/dev/null; then
  log_err "nvm not found after install. Try: source ~/.bashrc && re-run this script"
  exit 1
fi

NODE_VERSION="20"
if nvm ls "$NODE_VERSION" &>/dev/null; then
  log_ok "Node $NODE_VERSION already installed"
else
  log_info "Installing Node $NODE_VERSION..."
  nvm install "$NODE_VERSION"
  log_ok "Node $NODE_VERSION installed"
fi

nvm use "$NODE_VERSION"
nvm alias default "$NODE_VERSION"
log_ok "Using Node $(node -v) / npm $(npm -v)"

# ── 2. Install PM2 globally ────────────────────────────────
if command -v pm2 &>/dev/null; then
  log_ok "PM2 already installed ($(pm2 -v))"
else
  log_info "Installing PM2 globally..."
  npm install -g pm2
  log_ok "PM2 installed"
fi

# ── 3. Install backend dependencies ────────────────────────
log_info "Installing backend dependencies..."
cd "$BACKEND_DIR"
# Ensure devDependencies are installed (needed for build tools like nest/tsc/ts-node)
npm ci --legacy-peer-deps --include=dev
log_ok "Dependencies installed"

# ── 4. Generate Prisma client ──────────────────────────────
log_info "Generating Prisma client..."
npx prisma generate
log_ok "Prisma client generated"

# ── 5. Run database migrations ─────────────────────────────
log_info "Running Prisma migrations..."
# Prisma needs DATABASE_URL — source the .env
set -a
source "$ENV_FILE"
set +a

# Attempt migrate deploy; fail-fast on P3009 or any error
MIGRATE_OUTPUT=$(npx prisma migrate deploy 2>&1) && MIGRATE_RC=0 || MIGRATE_RC=$?

if [ "$MIGRATE_RC" -ne 0 ]; then
  echo ""
  echo "$MIGRATE_OUTPUT"
  echo ""

  if echo "$MIGRATE_OUTPUT" | grep -q "P3009"; then
    log_err "════════════════════════════════════════════════════════"
    log_err "  SETUP ABORTED — Prisma P3009: Failed migration state"
    log_err "════════════════════════════════════════════════════════"
    echo ""
    log_err "A previously failed migration is blocking deployment."
    log_err "The setup script does NOT auto-resolve P3009 —"
    log_err "blindly marking a migration as applied is dangerous."
    echo ""
    log_info "─── MIGRATION DIAGNOSTICS ───"
    npx prisma migrate status 2>&1 || true
    echo ""
    log_info "─── HOW TO FIX ───"
    log_info "Run the migration recovery script:"
    echo ""
    echo "    bash deploy/vps/fix-migration.sh"
    echo ""
    log_info "Or manually (from backend/):"
    echo "    npx prisma migrate status"
    echo "    # If the migration SQL was already applied to the DB:"
    echo "    npx prisma migrate resolve --applied <migration_name>"
    echo "    # If the migration SQL was NOT applied:"
    echo "    npx prisma migrate resolve --rolled-back <migration_name>"
    echo "    npx prisma migrate deploy"
    echo ""
    log_info "Then re-run: bash deploy/vps/setup_backend.sh"
    exit 1
  else
    log_err "Prisma migrate deploy failed (non-P3009 error). Aborting."
    echo ""
    log_info "Migration status:"
    npx prisma migrate status 2>&1 || true
    exit 1
  fi
else
  echo "$MIGRATE_OUTPUT"
  log_ok "Migrations applied"
fi

# ── 5b. Backfill isActive for historical certificates ───────
# Without this, legacy databases will have isActive=true for all rows,
# and the Archive page (which filters isActive=false) will show 0 records.
if [ -f "$BACKEND_DIR/prisma/backfill-isActive.ts" ]; then
  log_info "Backfilling isActive (historical certificates)..."
  npx ts-node prisma/backfill-isActive.ts
  log_ok "Backfill completed"
else
  log_warn "backfill-isActive.ts not found — skipping backfill"
fi

# ── 6. Build NestJS ────────────────────────────────────────
log_info "Building NestJS application..."
npm run build
log_ok "Build complete"

# Verify build output
MAIN_JS=$(find "$BACKEND_DIR/dist" -name "main.js" 2>/dev/null | head -1)
if [ -z "$MAIN_JS" ]; then
  log_err "main.js not found under dist/ — build failed!"
  log_err "Contents of backend/:"
  ls -la "$BACKEND_DIR/"
  exit 1
fi
log_ok "Verified: $MAIN_JS"


# ── 7. Seed database (creates default admin) ─────────────────
log_info "Seeding database with default admin user..."
npx ts-node prisma/seed.ts
log_ok "Database seeded"

# ── 8. Create PM2 ecosystem config ─────────────────────────
BACKEND_ECOSYSTEM="$BACKEND_DIR/ecosystem.config.js"

if [ ! -f "$BACKEND_ECOSYSTEM" ]; then
    log_info "ecosystem.config.js not found — creating permanent file..."
    mkdir -p "$BACKEND_DIR/logs"

    cat > "$BACKEND_ECOSYSTEM" <<'EOF'
module.exports = {
  apps: [
    {
      name: "stockini-backend",
      cwd: "/home/ubuntu/stockini/backend",
      script: "dist/main.js",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      watch: false,
      max_memory_restart: "500M",
      env: {
        NODE_ENV: "production",
        PORT: 3001
      }
    }
  ]
};
EOF

    log_ok "ecosystem.config.js created permanently"
fi

# ── 9. Start with PM2 ─────────────────────────────────────
log_info "Starting backend with PM2..."

# Kill any stray process still holding port 3001
BACKEND_PORT=$(grep BACKEND_PORT "$ENV_FILE" | cut -d= -f2 | tr -d '[:space:]')
BACKEND_PORT="${BACKEND_PORT:-3001}"
PORT_PID=$(lsof -ti :"$BACKEND_PORT" 2>/dev/null || true)
if [ -n "$PORT_PID" ]; then
  log_warn "Port $BACKEND_PORT still occupied by PID(s): $PORT_PID — killing..."
  kill -9 $PORT_PID 2>/dev/null || true
  sleep 1
fi

# Wait until port is actually free (max 10s)
for i in $(seq 1 10); do
  if ! lsof -ti :"$BACKEND_PORT" &>/dev/null; then
    break
  fi
  log_info "Waiting for port $BACKEND_PORT to be released... ($i/10)"
  sleep 1
done

if lsof -ti :"$BACKEND_PORT" &>/dev/null; then
  log_err "Port $BACKEND_PORT still in use after 10 seconds. Aborting."
  exit 1
fi

if pm2 describe stockini-backend >/dev/null 2>&1; then
    pm2 reload "$BACKEND_ECOSYSTEM" --only stockini-backend
else
    pm2 start "$BACKEND_ECOSYSTEM"
fi
log_ok "Backend started with PM2"

# Show status
pm2 status

# ── 9b. Post-deploy health check ──────────────────────────
log_info "Waiting for backend to respond on port $BACKEND_PORT..."
HEALTH_OK=0
MAX_ATTEMPTS=10
for i in $(seq 1 $MAX_ATTEMPTS); do
  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 3 "http://127.0.0.1:$BACKEND_PORT/health" 2>/dev/null || echo "000")
  if [ "$HTTP_CODE" = "200" ]; then
    HEALTH_BODY=$(curl -sf --connect-timeout 3 "http://127.0.0.1:$BACKEND_PORT/health" 2>/dev/null || echo '{}')
    log_ok "Backend health check OK on port $BACKEND_PORT (attempt $i/$MAX_ATTEMPTS)"
    log_info "Response: $HEALTH_BODY"
    HEALTH_OK=1
    break
  fi
  if [ "$i" -lt "$MAX_ATTEMPTS" ]; then
    # Progressive wait: 2s, 3s, 4s...
    WAIT_SEC=$((i + 1))
    [ "$WAIT_SEC" -gt 5 ] && WAIT_SEC=5
    log_info "Waiting ${WAIT_SEC}s... (attempt $i/$MAX_ATTEMPTS, HTTP=$HTTP_CODE)"
    sleep "$WAIT_SEC"
  fi
done

if [ "$HEALTH_OK" -eq 0 ]; then
  log_err "FATAL: Backend NOT responding on port $BACKEND_PORT after $MAX_ATTEMPTS attempts"
  echo ""
  log_err "─── DIAGNOSTIC DUMP ───"
  echo ""
  log_info "PM2 status:"
  pm2 status 2>/dev/null || true
  echo ""
  log_info "PM2 restart count:"
  pm2 jlist 2>/dev/null | grep -o '"restart_time":[0-9]*' | head -1 || true
  echo ""
  log_info "Last 30 PM2 logs:"
  pm2 logs stockini-backend --lines 30 --nostream 2>/dev/null || true
  echo ""
  log_info "Port $BACKEND_PORT status:"
  ss -tlnp 2>/dev/null | grep ":$BACKEND_PORT" || lsof -i :"$BACKEND_PORT" 2>/dev/null || echo "  (port not in use)"
  echo ""
  log_err "─── END DIAGNOSTIC ───"
  log_err "Fix the issue above and re-run this script."
  exit 1
fi

# ── 10. PM2 auto-start on reboot ──────────────────────────
log_info "Configuring PM2 auto-start on reboot..."
pm2 save || log_warn "pm2 save returned non-zero (non-fatal)"

# Generate startup script (needs sudo separately)
# IMPORTANT: grep exits 1 when no match — || true prevents set -e from aborting
PM2_STARTUP_OUTPUT=$(pm2 startup systemd -u "$USER" --hp "$HOME" 2>&1 || true)
STARTUP_CMD=$(echo "$PM2_STARTUP_OUTPUT" | grep "sudo" | head -1 || true)
if [ -n "$STARTUP_CMD" ]; then
  echo ""
  log_warn "Run this command manually to enable auto-start on reboot:"
  echo ""
  echo "  $STARTUP_CMD"
  echo ""
else
  log_ok "PM2 startup already configured (or no sudo command needed)"
fi

# ── Summary ─────────────────────────────────────────────────
echo ""
echo "========================================="
echo -e "${GREEN}  Backend setup complete!${NC}"
echo "========================================="
echo ""
echo "  PM2 app:    stockini-backend"
echo "  Port:       $BACKEND_PORT"
echo "  Logs:       pm2 logs stockini-backend"
echo "  Restart:    pm2 restart stockini-backend"
echo "  Status:     pm2 status"
echo ""
echo "  Next: bash deploy/vps/setup_frontend.sh"
echo ""
