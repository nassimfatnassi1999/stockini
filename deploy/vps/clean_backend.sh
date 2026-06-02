#!/bin/bash

# =============================================================
# Stockini — Clean & Restart Backend
# =============================================================
# Usage: bash deploy/vps/clean_backend.sh
#
# Kills any process on port, stops PM2, and restarts from
# ecosystem.config.js with a health check.
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

APP_NAME="stockini-backend"

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
  log_err "Cannot detect project root. Run from inside the repo."
  exit 1
fi

# ── Resolve .env ────────────────────────────────────────────
ENV_FILE="$PROJECT_ROOT/.env"
if [ ! -f "$ENV_FILE" ] && [ -f "$PROJECT_ROOT/backend/.env" ]; then
  ENV_FILE="$PROJECT_ROOT/backend/.env"
fi

PORT=3001
if [ -f "$ENV_FILE" ]; then
  _PORT=$(grep -E '^BACKEND_PORT=' "$ENV_FILE" 2>/dev/null | head -1 | cut -d= -f2 | tr -d '[:space:]')
  [ -n "$_PORT" ] && PORT="$_PORT"
fi

ECOSYSTEM="$PROJECT_ROOT/ecosystem.config.js"

echo ""
echo "========================================="
echo "  Stockini — Clean & Restart Backend"
echo "========================================="
echo ""

# ── 1. Stop PM2 app (user only — never sudo pm2) ────────────
log_info "Arrêt de PM2 $APP_NAME..."
pm2 stop "$APP_NAME" 2>/dev/null || true
pm2 delete "$APP_NAME" 2>/dev/null || true

# ── 2. Kill stray process on port ───────────────────────────
log_info "Nettoyage du port $PORT..."
PORT_PID=$(lsof -ti :"$PORT" 2>/dev/null || true)
if [ -n "$PORT_PID" ]; then
  log_warn "PID trouvé sur le port $PORT: $PORT_PID — kill..."
  kill -9 $PORT_PID 2>/dev/null || true
  sleep 1
else
  log_ok "Port $PORT libre"
fi

# Wait until port is actually free (max 10s)
for i in $(seq 1 10); do
  if ! lsof -ti :"$PORT" &>/dev/null; then
    break
  fi
  log_info "Attente libération port $PORT... ($i/10)"
  sleep 1
done

if lsof -ti :"$PORT" &>/dev/null; then
  log_err "Port $PORT encore occupé après 10s !"
  lsof -i :"$PORT" 2>/dev/null || true
  exit 1
fi
log_ok "Port $PORT libéré"

# ── 3. Start via ecosystem.config.js ────────────────────────
if [ ! -f "$ECOSYSTEM" ]; then
  log_err "ecosystem.config.js non trouvé à $ECOSYSTEM"
  log_err "Lancez d'abord: bash deploy/vps/setup_backend.sh"
  exit 1
fi

log_info "Démarrage de $APP_NAME via ecosystem.config.js..."
cd "$PROJECT_ROOT"
pm2 start ecosystem.config.js
log_ok "PM2 process lancé"

# ── 4. Health check ─────────────────────────────────────────
log_info "Health check: http://127.0.0.1:$PORT/health ..."
HEALTH_OK=0
MAX_ATTEMPTS=10
for i in $(seq 1 $MAX_ATTEMPTS); do
  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 3 "http://127.0.0.1:$PORT/health" 2>/dev/null || echo "000")
  if [ "$HTTP_CODE" = "200" ]; then
    log_ok "Backend répond sur le port $PORT (tentative $i/$MAX_ATTEMPTS)"
    HEALTH_OK=1
    break
  fi
  WAIT_SEC=$((i + 1))
  [ "$WAIT_SEC" -gt 5 ] && WAIT_SEC=5
  log_info "Attente ${WAIT_SEC}s... ($i/$MAX_ATTEMPTS, HTTP=$HTTP_CODE)"
  sleep "$WAIT_SEC"
done

pm2 save 2>/dev/null || true

echo ""
pm2 status

if [ "$HEALTH_OK" -eq 1 ]; then
  echo ""
  log_ok "Cleanup terminé — backend opérationnel !"
else
  echo ""
  log_err "Backend ne répond pas après $MAX_ATTEMPTS tentatives."
  log_info "Derniers logs PM2:"
  pm2 logs "$APP_NAME" --lines 30 --nostream 2>/dev/null || true
  echo ""
  log_info "Port $PORT:"
  ss -tlnp 2>/dev/null | grep ":$PORT" || lsof -i :"$PORT" 2>/dev/null || echo "  (non utilisé)"
  exit 1
fi
echo ""
