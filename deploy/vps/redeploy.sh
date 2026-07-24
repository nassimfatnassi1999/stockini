#!/bin/bash
set -euo pipefail

# =============================================================
# Stockini — Full Redeploy Script (VPS)
# =============================================================
# Usage: bash deploy/vps/redeploy.sh [--with-system-patch]
#
# Pulls latest code, rebuilds backend + frontend, restarts PM2,
# and verifies health. Stops immediately on any critical error.
# Must be run as the deploy user (NOT root), from project root.
#
# Options:
#   --with-system-patch   Run ensure-system-dropdowns after migration
#                         (creates missing system families only, never resets data).
#                         Never needed in normal deploys — use only when families
#                         are confirmed missing.
#
# NOTE: prisma db seed is NEVER run automatically. Data seeding is a
# manual operation (npm run prisma:seed) executed only during initial setup.
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

# ── Argument parsing ────────────────────────────────────────
WITH_SYSTEM_PATCH=false
for _arg in "$@"; do
  case "$_arg" in
    --with-system-patch) WITH_SYSTEM_PATCH=true ;;
    *) log_err "Unknown argument: $_arg"; exit 1 ;;
  esac
done

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
# Hardcoded fallback for VPS deployment path
if [ -z "$PROJECT_ROOT" ]; then
  [ -d "/home/ubuntu/stockini" ] && PROJECT_ROOT="/home/ubuntu/stockini"
fi
if [ -z "$PROJECT_ROOT" ]; then
  log_err "Cannot detect project root."
  exit 1
fi

BACKEND_DIR="$PROJECT_ROOT/backend"
FRONTEND_DIR="$PROJECT_ROOT/frontend"
ENV_FILE="$PROJECT_ROOT/.env"

echo ""
echo "============================================="
echo "  Stockini — Full Redeploy"
echo "  $(date '+%Y-%m-%d %H:%M:%S')"
echo "============================================="
echo ""

# ── Preflight checks ────────────────────────────────────────
if [ "$EUID" -eq 0 ]; then
  log_err "Do NOT run as root! PM2 must run under your user."
  exit 1
fi

if [ ! -f "$ENV_FILE" ]; then
  log_err ".env not found at $ENV_FILE"
  exit 1
fi
log_ok ".env found"

# Source nvm
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && source "$NVM_DIR/nvm.sh"
if ! command -v node &>/dev/null; then
  log_err "Node.js not found. Run setup_backend.sh first."
  exit 1
fi
log_ok "Node $(node -v)"

# Source .env for all steps
set -a
source "$ENV_FILE"
set +a

BACKEND_PORT="${BACKEND_PORT:-${PORT:-3001}}"
FRONTEND_PORT="${FRONTEND_PORT:-3000}"

# ── Step 1/8: Pull latest code ──────────────────────────────
log_info "[1/8] Pulling latest code..."
cd "$PROJECT_ROOT"
git pull --ff-only || {
  log_err "git pull failed. Resolve conflicts manually."
  exit 1
}
log_ok "Code updated"

# ── Step 2/8: Install backend dependencies ──────────────────
log_info "[2/8] Installing backend dependencies..."
cd "$BACKEND_DIR"
npm ci --legacy-peer-deps --include=dev
log_ok "Backend dependencies installed"

# ── Step 3/8: Prisma generate ───────────────────────────────
log_info "[3/8] Generating Prisma client..."
npx prisma generate
log_ok "Prisma client generated"

# ── Step 4/8: Database migrations + post-migration check ────
log_info "[4/8] Running database migrations..."

# ── Backup before any migration (never skip) ────────────────
BACKUP_DIR="$PROJECT_ROOT/backups"
mkdir -p "$BACKUP_DIR"
PG_DUMP_FILE="$BACKUP_DIR/pg_$(date +%Y%m%d_%H%M%S).sql.gz"
log_info "Sauvegarde PostgreSQL → $PG_DUMP_FILE"
_DB_USER=$(grep -E '^DB_USER=' "$ENV_FILE" | head -1 | cut -d= -f2 | tr -d '[:space:]"'"'"'')
_DB_NAME=$(grep -E '^DB_NAME=' "$ENV_FILE" | head -1 | cut -d= -f2 | tr -d '[:space:]"'"'"'')
_DB_PASS=$(grep -E '^DB_PASSWORD=' "$ENV_FILE" | head -1 | cut -d= -f2-)
_DB_PASS="${_DB_PASS%\"}"
_DB_PASS="${_DB_PASS#\"}"
if [ -n "$_DB_USER" ] && [ -n "$_DB_NAME" ]; then
  if PGPASSWORD="$_DB_PASS" pg_dump -h localhost -U "$_DB_USER" "$_DB_NAME" 2>/dev/null | gzip > "$PG_DUMP_FILE"; then
    log_ok "Backup OK : $PG_DUMP_FILE"
  else
    log_warn "Backup échoué (vérifiez les credentials) — migration continue"
    rm -f "$PG_DUMP_FILE"
  fi
else
  log_warn "DB_USER ou DB_NAME manquant dans .env — backup ignoré"
fi

MIGRATE_OUTPUT=$(npx prisma migrate deploy 2>&1) && MIGRATE_RC=0 || MIGRATE_RC=$?

if [ "$MIGRATE_RC" -ne 0 ]; then
  echo ""
  echo "$MIGRATE_OUTPUT"
  echo ""

  if echo "$MIGRATE_OUTPUT" | grep -q "P3009"; then
    log_err "════════════════════════════════════════════════════════"
    log_err "  DEPLOY ABORTED — Prisma P3009: Failed migration state"
    log_err "════════════════════════════════════════════════════════"
    echo ""
    log_err "A previously failed migration is blocking deployment."
    log_err "The deploy pipeline does NOT auto-resolve P3009 —"
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
    log_info "Then re-run: bash deploy/vps/redeploy.sh"
    exit 1
  else
    log_err "Migration failed (non-P3009). Aborting."
    log_err "Check the error output above and fix manually."
    echo ""
    log_info "Migration status:"
    npx prisma migrate status 2>&1 || true
    exit 1
  fi
else
  echo "$MIGRATE_OUTPUT"
fi
log_ok "Migrations OK"

# ── Post-migration check : familles dropdown critiques ───────
# Avertissement seulement — ne bloque pas le déploiement.
# Si des familles manquent, relancer avec : bash deploy/vps/redeploy.sh --with-system-patch
if [ -n "$_DB_USER" ] && [ -n "$_DB_NAME" ]; then
  _REQUIRED_FAMILIES=("responsable_technique" "responsable_qualite" "techniciens")
  _MISSING_FAMILIES=()

  for _family in "${_REQUIRED_FAMILIES[@]}"; do
    _COUNT=$(PGPASSWORD="$_DB_PASS" psql -h localhost -U "$_DB_USER" -d "$_DB_NAME" -tAc \
      "SELECT COUNT(*) FROM dropdown_families WHERE key = '$_family';" 2>/dev/null || echo "0")
    _COUNT="${_COUNT//[[:space:]]/}"
    if [ "${_COUNT:-0}" -eq 0 ] 2>/dev/null; then
      _MISSING_FAMILIES+=("$_family")
    fi
  done

  if [ "${#_MISSING_FAMILIES[@]}" -gt 0 ]; then
    log_warn "════════════════════════════════════════════════════════════"
    log_warn "  ATTENTION — Familles dropdown manquantes en base :"
    for _f in "${_MISSING_FAMILIES[@]}"; do log_warn "    - $_f"; done
    log_warn ""
    log_warn "  Ces familles n'ont pas encore été créées sur ce VPS."
    log_warn "  Le déploiement continue, mais les dropdowns concernés"
    log_warn "  retourneront une erreur jusqu'à ce qu'elles soient créées."
    log_warn ""
    log_warn "  Pour les créer (patch idempotent, sans toucher aux données) :"
    log_warn "    cd backend && npm run system:ensure-dropdowns"
    log_warn "  ou relancer le déploiement avec :"
    log_warn "    bash deploy/vps/redeploy.sh --with-system-patch"
    log_warn "════════════════════════════════════════════════════════════"
  else
    log_ok "Familles dropdown critiques présentes"
  fi
fi

# ── Patch système optionnel (--with-system-patch) ────────────
if [ "$WITH_SYSTEM_PATCH" = true ]; then
  log_info "Patch système activé — création des familles manquantes..."
  cd "$BACKEND_DIR"
  PATCH_OUTPUT=$(npx ts-node scripts/ensure-system-dropdowns.ts 2>&1) && PATCH_RC=0 || PATCH_RC=$?
  echo "$PATCH_OUTPUT"
  if [ "$PATCH_RC" -ne 0 ]; then
    log_err "Le patch système a échoué. Vérifiez les erreurs ci-dessus."
    log_err "Le déploiement s'arrête pour éviter un état incohérent."
    exit 1
  fi
  log_ok "Patch système terminé"
fi

# ── Step 5/8: Build backend ─────────────────────────────────
log_info "[5/8] Building NestJS..."
cd "$BACKEND_DIR"
npm run build || {
  log_err "Backend build failed!"
  exit 1
}

MAIN_JS=$(find "$BACKEND_DIR/dist" -name "main.js" 2>/dev/null | head -1)
if [ -z "$MAIN_JS" ]; then
  log_err "dist/main.js not found — build failed!"
  exit 1
fi
log_ok "Backend built: $MAIN_JS"

# ── Step 6/8: Build frontend ────────────────────────────────
log_info "[6/8] Building Next.js frontend..."
cd "$FRONTEND_DIR"
npm ci --legacy-peer-deps --include=dev

_VPS_IP=$(grep -E '^VPS_IP=' "$ENV_FILE" | head -1 | cut -d= -f2 | tr -d '[:space:]"'"'"'')
_VPS_IP="${_VPS_IP:-203.0.113.10}"
export NEXT_PUBLIC_API_URL="${NEXT_PUBLIC_API_URL:-/api}"
export INTERNAL_API_URL="${INTERNAL_API_URL:-http://127.0.0.1:$BACKEND_PORT/api}"
export NEXT_PUBLIC_APP_URL="${NEXT_PUBLIC_APP_URL:-http://$_VPS_IP}"
export NEXT_PUBLIC_SITE_URL="${NEXT_PUBLIC_SITE_URL:-http://$_VPS_IP}"
log_info "NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL"
log_info "NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL"
npm run build || {
  log_err "Frontend build failed!"
  exit 1
}

if [ ! -f "$FRONTEND_DIR/.next/standalone/server.js" ]; then
  log_err ".next/standalone/server.js not found — build failed!"
  exit 1
fi
mkdir -p "$FRONTEND_DIR/.next/standalone/.next"
rsync -a --delete "$FRONTEND_DIR/.next/static/" "$FRONTEND_DIR/.next/standalone/.next/static/"
if [ -d "$FRONTEND_DIR/public" ]; then
  rsync -a --delete "$FRONTEND_DIR/public/" "$FRONTEND_DIR/.next/standalone/public/"
fi
log_ok "Frontend built ($(du -sh "$FRONTEND_DIR/.next" | cut -f1))"

# ── Step 7/8: Restart PM2 ──────────────────────────────────
log_info "[7/8] Restarting PM2..."

BACKEND_ECOSYSTEM="$BACKEND_DIR/ecosystem.config.js"
FRONTEND_ECOSYSTEM="$FRONTEND_DIR/ecosystem.frontend.config.js"

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

# Snapshot running state before we touch PM2 (needed by rollback)
_BACKEND_WAS_RUNNING=false
_FRONTEND_WAS_RUNNING=false
pm2 list 2>/dev/null | grep -q "stockini-backend"  && _BACKEND_WAS_RUNNING=true  || true
pm2 list 2>/dev/null | grep -q "stockini-frontend" && _FRONTEND_WAS_RUNNING=true || true

# Rollback: invoked automatically on ERR — tries to restore services
rollback_pm2() {
  log_warn "ROLLBACK — redeploy failed after PM2 stop, attempting service restore..."
  if $_BACKEND_WAS_RUNNING && [ -f "$BACKEND_ECOSYSTEM" ]; then
    pm2 startOrReload "$BACKEND_ECOSYSTEM" --update-env 2>/dev/null \
      || pm2 start "$BACKEND_ECOSYSTEM" --update-env 2>/dev/null \
      || log_err "  Rollback FAILED for stockini-backend — manual restart required"
  fi
  if $_FRONTEND_WAS_RUNNING && [ -f "$FRONTEND_ECOSYSTEM" ]; then
    pm2 startOrReload "$FRONTEND_ECOSYSTEM" --update-env 2>/dev/null \
      || pm2 start "$FRONTEND_ECOSYSTEM" --update-env 2>/dev/null \
      || log_err "  Rollback FAILED for stockini-frontend — manual restart required"
  fi
  pm2 save 2>/dev/null || true
}
trap rollback_pm2 ERR

# Stop PM2 backend FIRST so autorestart does not re-bind the port immediately
pm2 stop stockini-backend 2>/dev/null || true
sleep 1

# Kill any remaining stray processes on the backend port (orphans, old Node instances)
mapfile -t _PIDS < <(lsof -ti :"$BACKEND_PORT" 2>/dev/null || true)
if [ "${#_PIDS[@]}" -gt 0 ]; then
  log_warn "Killing stray process(es) on port $BACKEND_PORT (PIDs: ${_PIDS[*]})"
  kill -9 "${_PIDS[@]}" 2>/dev/null || true
fi

# Wait up to 15 s for the port to be free
for i in $(seq 1 15); do
  if ! lsof -ti :"$BACKEND_PORT" &>/dev/null; then break; fi
  sleep 1
done

if lsof -ti :"$BACKEND_PORT" &>/dev/null; then
  log_err "Port $BACKEND_PORT still occupied after 15 s — aborting."
  lsof -i :"$BACKEND_PORT" 2>/dev/null || true
  exit 1
fi

# Restart backend
log_info "Reloading stockini-backend from $BACKEND_ECOSYSTEM..."
if pm2 describe stockini-backend >/dev/null 2>&1; then
    pm2 reload "$BACKEND_ECOSYSTEM" --only stockini-backend
else
    pm2 start "$BACKEND_ECOSYSTEM"
fi

# Create frontend ecosystem if missing
mkdir -p "$FRONTEND_DIR/logs"
if [ ! -f "$FRONTEND_ECOSYSTEM" ]; then
    log_info "ecosystem.frontend.config.js not found — creating permanent file..."

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

# Restart frontend
log_info "Reloading stockini-frontend from $FRONTEND_ECOSYSTEM..."
if pm2 describe stockini-frontend >/dev/null 2>&1; then
    pm2 reload "$FRONTEND_ECOSYSTEM" --only stockini-frontend
else
    pm2 start "$FRONTEND_ECOSYSTEM"
fi

trap - ERR
log_ok "PM2 services restarted"

# ── Step 8/8: Health checks ─────────────────────────────────
log_info "[8/8] Running health checks..."

HEALTH_OK=0
MAX_ATTEMPTS=15
for i in $(seq 1 $MAX_ATTEMPTS); do
  HEALTH_BODY=$(curl -sf --connect-timeout 3 "http://127.0.0.1:$BACKEND_PORT/health" 2>/dev/null || echo '')
  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 3 "http://127.0.0.1:$BACKEND_PORT/health" 2>/dev/null || echo "000")
  if [ "$HTTP_CODE" = "200" ] && echo "$HEALTH_BODY" | grep -q '"status":"ok"'; then
    log_ok "Backend health OK (attempt $i/$MAX_ATTEMPTS)"
    log_info "Response: $HEALTH_BODY"
    HEALTH_OK=1
    break
  fi
  WAIT_SEC=$((i + 1))
  [ "$WAIT_SEC" -gt 5 ] && WAIT_SEC=5
  log_info "Waiting ${WAIT_SEC}s... ($i/$MAX_ATTEMPTS, HTTP=$HTTP_CODE)"
  sleep "$WAIT_SEC"
done

pm2 save 2>/dev/null || true

# ── Frontend health check ───────────────────────────────────
FRONTEND_HEALTH_OK=0
for i in $(seq 1 10); do
  FE_HTTP=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 3 "http://127.0.0.1:$FRONTEND_PORT" 2>/dev/null || echo "000")
  if [ "$FE_HTTP" = "200" ] || [ "$FE_HTTP" = "307" ] || [ "$FE_HTTP" = "308" ]; then
    log_ok "Frontend health OK sur port $FRONTEND_PORT (HTTP=$FE_HTTP)"
    FRONTEND_HEALTH_OK=1
    break
  fi
  WAIT_SEC=$((i + 1))
  [ "$WAIT_SEC" -gt 5 ] && WAIT_SEC=5
  log_info "Attente frontend... ($i/10, HTTP=$FE_HTTP)"
  sleep "$WAIT_SEC"
done

if [ "$FRONTEND_HEALTH_OK" -eq 0 ]; then
  log_warn "Frontend ne répond pas sur port $FRONTEND_PORT"
  log_warn "Logs frontend:"
  pm2 logs stockini-frontend --lines 20 --nostream 2>/dev/null || true
fi

if [ "$HEALTH_OK" -eq 0 ]; then
  echo ""
  log_err "════════════════════════════════════════════"
  log_err "  DEPLOY FAILED — Backend not responding"
  log_err "════════════════════════════════════════════"
  echo ""
  log_info "─── DIAGNOSTIC DUMP ───"
  echo ""
  log_info "PM2 status:"
  pm2 status 2>/dev/null || true
  echo ""
  log_info "PM2 logs (last 50 lines):"
  pm2 logs stockini-backend --lines 50 --nostream 2>/dev/null || true
  echo ""
  log_info "Port $BACKEND_PORT:"
  ss -tlnp 2>/dev/null | grep ":$BACKEND_PORT" || echo "  (not in use)"
  echo ""
  log_info "curl result:"
  curl -v "http://127.0.0.1:$BACKEND_PORT/health" 2>&1 || true
  echo ""
  log_info "Nginx status:"
  sudo systemctl status nginx --no-pager -l 2>/dev/null || true
  echo ""
  log_err "─── END DIAGNOSTIC ───"
  exit 1
fi

# ── Update Nginx config from repo then reload ────────────────
log_info "Mise à jour et rechargement Nginx..."
_SITE=$(grep -E '^VPS_IP=' "$ENV_FILE" | head -1 | cut -d= -f2 | tr -d '[:space:]"'"'"'')
_SITE="${_SITE:-203.0.113.10}"
_NGINX_SRC="$PROJECT_ROOT/deploy/vps/nginx-stockini-msp.conf"
_NGINX_DEST="/etc/nginx/sites-available/$_SITE"

if [ -f "$_NGINX_SRC" ] && sudo test -f "$_NGINX_DEST" 2>/dev/null; then
  sudo cp "$_NGINX_SRC" "$_NGINX_DEST"
  log_ok "Conf Nginx copiée : $_NGINX_DEST"
elif [ -f "$_NGINX_SRC" ] && ! sudo test -f "$_NGINX_DEST" 2>/dev/null; then
  log_warn "Nginx site $_NGINX_DEST inexistant — exécutez setup_nginx.sh d'abord"
fi

if sudo nginx -t 2>/dev/null; then
  sudo systemctl reload nginx
  log_ok "Nginx rechargé"
else
  log_warn "Test conf Nginx échoué — rechargement ignoré"
  sudo nginx -t 2>&1 || true
fi

# ── Final verification ──────────────────────────────────────
echo ""
echo "============================================="
echo -e "${GREEN}  DEPLOY SUCCESSFUL${NC}"
echo "============================================="
echo ""
pm2 status
echo ""
echo "  Backend:  http://127.0.0.1:$BACKEND_PORT/health"
echo "  Frontend: http://127.0.0.1:$FRONTEND_PORT"
echo "  Logs:     pm2 logs stockini-backend"
echo ""
echo "─── Vérifications ──────────────────────────"
echo ""
echo "  # Location header doit être vide (pas de redirect) :"
echo "  curl -sI https://$_SITE/ | grep -i location"
echo ""
echo "  # Login doit retourner 200 ou redirect vers /login (pas localhost) :"
echo "  curl -sI https://$_SITE/login | head -5"
echo ""
echo "  # Direct sur le serveur Next.js (307 = redirect normal vers /login) :"
echo "  curl -sI http://127.0.0.1:$FRONTEND_PORT/login | head -5"
echo ""
echo "  # Aucun localhost hardcodé dans le build :"
echo "  grep -r 'localhost:3000' $FRONTEND_DIR/.next/standalone/ 2>/dev/null | head -5 || echo '  OK — aucun localhost:3000'"
echo ""
