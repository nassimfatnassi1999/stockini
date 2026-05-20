#!/bin/bash

# =============================================================
# CRM Geodetection — VPS Monitoring Dashboard
# =============================================================
# Usage: bash deploy/vps/monitor.sh
#
# Interactive menu to check status, logs, and health of all
# services: Backend (PM2), Frontend, Nginx, PostgreSQL.
# =============================================================

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

DOMAIN="stockini-msp.tn"

# ── Robust project root detection (handles symlinks / any cwd) ─────────────
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
  # Fallback: if invoked from inside the repo, use current directory
  PROJECT_ROOT="$(resolve_project_root "$PWD" || true)"
fi

# ── Helpers ──────────────────────────────────────────────────
ok()   { echo -e "  ${GREEN}✓${NC} $1"; }
fail() { echo -e "  ${RED}✗${NC} $1"; }
info() { echo -e "  ${BLUE}ℹ${NC} $1"; }
warn() { echo -e "  ${YELLOW}!${NC} $1"; }

separator() {
  echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

header() {
  echo ""
  separator
  echo -e "${BOLD}${CYAN}  $1${NC}"
  separator
}

pause() {
  echo ""
  read -rp "  Press Enter to continue..."
}

# ── Resolve .env (root or backend/) ─────────────────────────
resolve_env() {
  local root="$1"
  if [ -f "$root/.env" ]; then
    echo "$root/.env"
  elif [ -f "$root/backend/.env" ]; then
    echo "$root/backend/.env"
  else
    echo ""
  fi
}

# ── Validate critical .env variables ─────────────────────────
# Returns 0 if all critical vars are set, 1 otherwise.
validate_env() {
  local env_file="$1"
  local errors=0

  if [ -z "$env_file" ] || [ ! -f "$env_file" ]; then
    fail ".env introuvable — impossible de valider les variables"
    return 1
  fi

  # Source env into a subshell to avoid polluting current env
  local _JWT _DB_URL _REDIS_URL _USE_REDIS
  _JWT=$(grep -E '^JWT_SECRET=' "$env_file" 2>/dev/null | head -1 | cut -d= -f2-)
  _DB_URL=$(grep -E '^DATABASE_URL=' "$env_file" 2>/dev/null | head -1 | cut -d= -f2-)
  _USE_REDIS=$(grep -E '^USE_REDIS=' "$env_file" 2>/dev/null | head -1 | cut -d= -f2- | tr -d '[:space:]')
  _REDIS_URL=$(grep -E '^REDIS_URL=' "$env_file" 2>/dev/null | head -1 | cut -d= -f2-)

  # JWT_SECRET is mandatory (fail-fast in app since security patch)
  if [ -z "$_JWT" ] || [ "$_JWT" = "changeme" ] || [ "$_JWT" = "your-secret-here" ]; then
    fail "JWT_SECRET manquant ou valeur par défaut non sécurisée dans .env"
    warn "  → Définissez un secret aléatoire: openssl rand -base64 48"
    errors=$((errors + 1))
  else
    ok "JWT_SECRET défini"
  fi

  # DATABASE_URL is mandatory
  if [ -z "$_DB_URL" ]; then
    fail "DATABASE_URL manquant dans .env"
    errors=$((errors + 1))
  else
    ok "DATABASE_URL défini"
  fi

  # REDIS coherence: if USE_REDIS=true, REDIS_URL must be set
  if [ "$_USE_REDIS" = "true" ]; then
    if [ -z "$_REDIS_URL" ]; then
      fail "USE_REDIS=true mais REDIS_URL manquant dans .env"
      warn "  → Ajoutez REDIS_URL=redis://:password@127.0.0.1:6379"
      errors=$((errors + 1))
    else
      ok "REDIS_URL défini (USE_REDIS=true)"
    fi
  fi

  if [ "$errors" -gt 0 ]; then
    echo ""
    fail "$errors variable(s) critique(s) manquante(s) — corrigez .env avant de déployer"
    return 1
  fi
  return 0
}

# ── Post-deploy health check ────────────────────────────────
# Waits for the backend /health to return HTTP 200 + {"status":"ok"}.
# This is a real health check — not just a port ping.
# 15 attempts with progressive wait (matches redeploy.sh behaviour).
health_check_backend() {
  local port="${1:-3001}"
  local max_attempts=15
  local url="http://127.0.0.1:${port}/health"

  info "Health check: $url ..."
  for i in $(seq 1 "$max_attempts"); do
    local body http_code
    body=$(curl -s --connect-timeout 3 "$url" 2>/dev/null || echo '')
    http_code=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 3 "$url" 2>/dev/null || echo '000')

    if [ "$http_code" = "200" ] && echo "$body" | grep -q '"status":"ok"'; then
      ok "Backend healthy sur le port $port (tentative $i/$max_attempts)"
      info "  → Réponse: $body"
      return 0
    fi

    if [ "$i" -lt "$max_attempts" ]; then
      local wait_sec=$(( i < 5 ? i + 1 : 5 ))
      info "En attente ${wait_sec}s... ($i/$max_attempts, HTTP=${http_code})"
      sleep "$wait_sec"
    fi
  done

  fail "Backend ne répond PAS sur http://127.0.0.1:${port}/health après ${max_attempts} tentatives"
  warn "  → Vérifiez les logs: pm2 logs crm-backend --lines 50"
  return 1
}

# ── Status checks ────────────────────────────────────────────
check_all_status() {
  header "🔍 SERVICE STATUS"
  echo ""

  # PM2 / Backend
  echo -e "  ${BOLD}Backend (PM2)${NC}"
  if command -v pm2 &>/dev/null; then
    PM2_STATUS=$(pm2 jlist 2>/dev/null | grep -o '"status":"[^"]*"' | head -1 | cut -d'"' -f4)
    if [ "$PM2_STATUS" = "online" ]; then
      ok "crm-backend: ${GREEN}online${NC}"
      PM2_MEM=$(pm2 jlist 2>/dev/null | grep -o '"memory":[0-9]*' | head -1 | cut -d: -f2)
      if [ -n "$PM2_MEM" ]; then
        PM2_MEM_MB=$((PM2_MEM / 1024 / 1024))
        info "Memory: ${PM2_MEM_MB} MB"
      fi
      PM2_UPTIME=$(pm2 jlist 2>/dev/null | grep -o '"pm_uptime":[0-9]*' | head -1 | cut -d: -f2)
      if [ -n "$PM2_UPTIME" ]; then
        NOW=$(date +%s%3N)
        UPTIME_SEC=$(( (NOW - PM2_UPTIME) / 1000 ))
        UPTIME_H=$((UPTIME_SEC / 3600))
        UPTIME_M=$(( (UPTIME_SEC % 3600) / 60 ))
        info "Uptime: ${UPTIME_H}h ${UPTIME_M}m"
      fi
    else
      fail "crm-backend: ${RED}${PM2_STATUS:-not found}${NC}"
    fi
  else
    fail "PM2 not installed"
  fi

  # Port 3001
  if curl -sf --connect-timeout 2 http://127.0.0.1:3001/health > /dev/null 2>&1; then
    ok "Port 3001: ${GREEN}responding${NC}"
  else
    fail "Port 3001: ${RED}not responding${NC}"
  fi
  echo ""

  # Nginx
  echo -e "  ${BOLD}Nginx${NC}"
  if systemctl is-active --quiet nginx; then
    ok "Nginx: ${GREEN}active${NC}"
  else
    fail "Nginx: ${RED}inactive${NC}"
  fi
  echo ""

  # Frontend
  echo -e "  ${BOLD}Frontend${NC}"
  if command -v pm2 &>/dev/null && pm2 jlist 2>/dev/null | grep -q '"name":"crm-frontend"'; then
    ok "crm-frontend: ${GREEN}configured in PM2${NC}"
    if curl -sf --connect-timeout 2 http://127.0.0.1:3000 > /dev/null 2>&1; then
      ok "Port 3000: ${GREEN}responding${NC}"
    else
      fail "Port 3000: ${RED}not responding${NC}"
    fi
  else
    fail "crm-frontend: ${RED}not found in PM2${NC}"
  fi
  echo ""

  # PostgreSQL
  echo -e "  ${BOLD}PostgreSQL${NC}"
  if systemctl is-active --quiet postgresql; then
    ok "PostgreSQL: ${GREEN}active${NC}"
  else
    fail "PostgreSQL: ${RED}inactive${NC}"
  fi
  echo ""

  # HTTPS
  echo -e "  ${BOLD}HTTPS${NC}"
  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 5 "https://$DOMAIN" 2>/dev/null)
  if [ "$HTTP_CODE" = "200" ]; then
    ok "https://$DOMAIN: ${GREEN}$HTTP_CODE OK${NC}"
  elif [ -n "$HTTP_CODE" ] && [ "$HTTP_CODE" != "000" ]; then
    warn "https://$DOMAIN: ${YELLOW}$HTTP_CODE${NC}"
  else
    fail "https://$DOMAIN: ${RED}unreachable${NC}"
  fi

  # SSL cert expiry
  CERT_EXPIRY=$(echo | openssl s_client -servername "$DOMAIN" -connect "$DOMAIN:443" 2>/dev/null | openssl x509 -noout -enddate 2>/dev/null | cut -d= -f2)
  if [ -n "$CERT_EXPIRY" ]; then
    info "SSL expires: $CERT_EXPIRY"
  fi
  echo ""

  # Disk
  echo -e "  ${BOLD}Disk & Memory${NC}"
  DISK_USAGE=$(df -h / | awk 'NR==2 {print $5 " used (" $3 "/" $2 ")"}')
  info "Disk: $DISK_USAGE"
  MEM_USED=$(free -m | awk 'NR==2 {print $3}')
  MEM_TOTAL=$(free -m | awk 'NR==2 {print $2}')
  MEM_PCT=$((MEM_USED * 100 / MEM_TOTAL))
  info "RAM: ${MEM_USED}MB / ${MEM_TOTAL}MB (${MEM_PCT}%)"
  echo ""
}

# ── Menu actions ─────────────────────────────────────────────
show_pm2_logs() {
  header "📋 PM2 LOGS (last 50 lines)"
  echo ""
  pm2 logs crm-backend --lines 50 --nostream 2>/dev/null || fail "No PM2 logs"
  pause
}

show_nginx_logs() {
  header "📋 NGINX LOGS"
  echo ""
  echo -e "  ${BOLD}1)${NC} Access logs (last 30)"
  echo -e "  ${BOLD}2)${NC} Error logs (last 30)"
  echo -e "  ${BOLD}3)${NC} Follow access logs (live)"
  echo -e "  ${BOLD}4)${NC} Follow error logs (live)"
  echo -e "  ${BOLD}0)${NC} Back"
  echo ""
  read -rp "  Choose: " choice
  case $choice in
    1) sudo tail -30 /var/log/nginx/access.log 2>/dev/null || fail "No access log"; pause ;;
    2) sudo tail -30 /var/log/nginx/error.log 2>/dev/null || fail "No error log"; pause ;;
    3) echo "  (Ctrl+C to stop)"; sudo tail -f /var/log/nginx/access.log 2>/dev/null ;;
    4) echo "  (Ctrl+C to stop)"; sudo tail -f /var/log/nginx/error.log 2>/dev/null ;;
    *) return ;;
  esac
}

show_pg_status() {
  header "🐘 POSTGRESQL STATUS"
  echo ""
  if command -v psql &>/dev/null; then
    sudo -u postgres psql -c "SELECT datname, numbackends as connections FROM pg_stat_database WHERE datname NOT LIKE 'template%';" 2>/dev/null || fail "Cannot query PostgreSQL"
    echo ""
    sudo -u postgres psql -c "SELECT pg_size_pretty(pg_database_size('geodetection_crm')) AS db_size;" 2>/dev/null
  else
    fail "psql not found"
  fi
  pause
}

restart_backend() {
  header "🔄 RESTART BACKEND"
  echo ""

  # Resolve port from .env
  local env_file
  env_file=$(resolve_env "$PROJECT_ROOT")
  local backend_port=3001
  if [ -n "$env_file" ]; then
    backend_port=$(grep -E '^BACKEND_PORT=' "$env_file" 2>/dev/null | head -1 | cut -d= -f2 | tr -d '[:space:]')
    backend_port="${backend_port:-3001}"
  fi

  pm2 restart crm-backend --update-env 2>/dev/null && ok "Backend restarted" || { fail "Restart failed"; pause; return; }
  echo ""

  # Health check after restart
  if health_check_backend "$backend_port"; then
    echo ""
    pm2 status
    ok "Backend red\u00e9marr\u00e9 et op\u00e9rationnel !"
  else
    echo ""
    pm2 status
    warn "Backend red\u00e9marr\u00e9 MAIS ne r\u00e9pond pas au health check."
  fi
  pause
}

restart_nginx() {
  header "🔄 RESTART NGINX"
  echo ""
  sudo nginx -t 2>&1
  if [ $? -eq 0 ]; then
    sudo systemctl reload nginx && ok "Nginx reloaded" || fail "Reload failed"
  else
    fail "Config test failed — not reloading"
  fi
  pause
}

rebuild_frontend() {
  header "🔨 REBUILD FRONTEND"
  echo ""
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  bash "$SCRIPT_DIR/setup_frontend.sh"
  pause
}

# ── Clear / Clean rebuild ────────────────────────────────────
clear_backend() {
  header "🧹 CLEAR & REBUILD BACKEND"
  echo ""

  if [ -z "$PROJECT_ROOT" ]; then
    fail "Impossible de détecter la racine du projet. Lancez: bash deploy/vps/monitor.sh depuis le repo"
    pause
    return
  fi

  BACKEND_DIR="$PROJECT_ROOT/backend"
  ENV_FILE=$(resolve_env "$PROJECT_ROOT")
  if [ -z "$ENV_FILE" ]; then
    fail ".env non trouvé (ni à la racine ni dans backend/)"
    pause
    return
  fi

  # Validate critical env variables before rebuild
  echo ""
  info "Vérification des variables d'environnement critiques..."
  if ! validate_env "$ENV_FILE"; then
    pause
    return
  fi
  echo ""

  # Source nvm
  export NVM_DIR="$HOME/.nvm"
  [ -s "$NVM_DIR/nvm.sh" ] && source "$NVM_DIR/nvm.sh"

  echo -e "  ${YELLOW}⚠  Ceci va :${NC}"
  echo -e "    • Supprimer ${BOLD}backend/dist/${NC} et ${BOLD}backend/node_modules/${NC}"
  echo -e "    • Réinstaller les dépendances"
  echo -e "    • Régénérer Prisma + rebuild + restart PM2"
  echo ""
  read -rp "  ▸ Continuer ? (O/n) " confirm
  confirm="${confirm:-O}"
  if [[ ! "$confirm" =~ ^[OoYy]$ ]]; then
    info "Annulé."
    pause
    return
  fi

  echo ""

  # Stop PM2
  info "Arrêt de PM2..."
  pm2 stop crm-backend 2>/dev/null || true

  # Clean
  info "Suppression dist/ et node_modules/..."
  rm -rf "$BACKEND_DIR/dist" "$BACKEND_DIR/node_modules"
  ok "Dossiers nettoyés"

  # Reinstall
  info "npm ci..."
  cd "$BACKEND_DIR"
  # Ensure devDependencies are installed (needed for build tools like tsc/nest/vite)
  if npm ci --legacy-peer-deps --include=dev --quiet 2>&1; then
    ok "Dépendances installées"
  else
    fail "npm ci a échoué"
    pause
    return
  fi

  # Prisma
  info "Prisma generate..."
  set -a; source "$ENV_FILE"; set +a
  if npx prisma generate; then
    ok "Client Prisma g\u00e9n\u00e9r\u00e9"
  else
    fail "Prisma generate \u00e9chou\u00e9 ! V\u00e9rifiez le schema et DATABASE_URL."
    pause
    return
  fi

  # Migrate — abort on failure (P3009 must be resolved before rebuild)
  info "Prisma migrate deploy..."
  MIGRATE_OUTPUT=$(npx prisma migrate deploy 2>&1) && MIGRATE_RC=0 || MIGRATE_RC=$?
  echo "$MIGRATE_OUTPUT"
  if [ "$MIGRATE_RC" -ne 0 ]; then
    fail "Prisma migrate deploy a \u00e9chou\u00e9 ! Abandon du rebuild."
    echo ""
    if echo "$MIGRATE_OUTPUT" | grep -q "P3009"; then
      warn "P3009 d\u00e9tect\u00e9 — migration en \u00e9tat \u00e9chou\u00e9 en base."
      warn "Lancez d'abord le script de r\u00e9cup\u00e9ration :"
      echo ""
      echo "    bash deploy/vps/fix-migration.sh"
      echo ""
      warn "Puis relancez l'option 10 (Redeploy complet)."
    else
      warn "V\u00e9rifiez l'erreur ci-dessus et corrigez manuellement."
      warn "Puis relancez l'option 10 (Redeploy complet)."
    fi
    pause
    return
  fi
  ok "Migrations appliqu\u00e9es"

  # Build
  info "npm run build..."
  if npm run build 2>&1; then
    ok "Build terminé"
  else
    fail "Build échoué !"
    pause
    return
  fi

  # Verify
  MAIN_JS=$(find "$BACKEND_DIR/dist" -name "main.js" 2>/dev/null | head -1)
  if [ -n "$MAIN_JS" ]; then
    ok "Vérifié: $MAIN_JS"
  else
    fail "main.js non trouvé — build invalide"
    pause
    return
  fi

  # Recreate ecosystem.config.js with correct path
  MAIN_JS_RELATIVE=$(echo "$MAIN_JS" | sed "s|$BACKEND_DIR/||")
  info "PM2 script: $MAIN_JS_RELATIVE"

  cat > "$PROJECT_ROOT/ecosystem.config.js" <<ECOSYSTEM
module.exports = {
  apps: [
    {
      name: 'crm-backend',
      cwd: '${BACKEND_DIR}',
      script: '${MAIN_JS_RELATIVE}',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
      },
      max_memory_restart: '512M',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      error_file: './logs/pm2-error.log',
      out_file: './logs/pm2-out.log',
      merge_logs: true,
      autorestart: true,
      watch: false,
      max_restarts: 10,
      min_uptime: '10s',
    },
  ],
};
ECOSYSTEM
  ok "ecosystem.config.js recr\u00e9\u00e9 (cwd: $BACKEND_DIR)"
  mkdir -p "$BACKEND_DIR/logs"

  # Start PM2
  cd "$PROJECT_ROOT"
  info "Démarrage PM2..."
  pm2 delete crm-backend 2>/dev/null || true

  # Kill stray process on port
  BACKEND_PORT=$(grep BACKEND_PORT "$ENV_FILE" 2>/dev/null | cut -d= -f2 | tr -d '[:space:]')
  BACKEND_PORT="${BACKEND_PORT:-3001}"
  PORT_PID=$(lsof -ti :"$BACKEND_PORT" 2>/dev/null || true)
  if [ -n "$PORT_PID" ]; then
    warn "Port $BACKEND_PORT occupé par PID $PORT_PID — kill..."
    kill -9 $PORT_PID 2>/dev/null || true
    sleep 1
  fi

  pm2 start ecosystem.config.js
  sleep 3

  PM2_STATUS=$(pm2 jlist 2>/dev/null | grep -o '"status":"[^"]*"' | head -1 | cut -d'"' -f4)
  if [ "$PM2_STATUS" = "online" ]; then
    ok "Backend démarré: ${GREEN}online${NC}"
  else
    fail "Backend status: ${RED}${PM2_STATUS:-inconnu}${NC}"
    warn "Vérifiez: pm2 logs crm-backend"
    pm2 save 2>/dev/null
    pause
    return
  fi

  pm2 save 2>/dev/null

  # Post-deploy health check — verify the app actually responds
  echo ""
  if health_check_backend "$BACKEND_PORT"; then
    echo ""
    pm2 status
    echo ""
    ok "Clear backend terminé — backend opérationnel !"
  else
    echo ""
    pm2 status
    echo ""
    fail "Clear backend terminé MAIS le backend ne répond pas au health check."
    warn "Le processus PM2 tourne mais l'application a probablement une erreur au démarrage."
    warn "Diagnostics :"
    echo ""
    pm2 logs crm-backend --lines 30 --nostream 2>/dev/null || true
  fi
  pause
}

clear_frontend() {
  header "🧹 CLEAR & REBUILD FRONTEND"
  echo ""

  if [ -z "$PROJECT_ROOT" ]; then
    fail "Impossible de détecter la racine du projet. Lancez: bash deploy/vps/monitor.sh depuis le repo"
    pause
    return
  fi

  FRONTEND_DIR="$PROJECT_ROOT/frontend"
  ENV_FILE=$(resolve_env "$PROJECT_ROOT")
  if [ -z "$ENV_FILE" ]; then
    fail ".env non trouvé (ni à la racine ni dans backend/)"
    pause
    return
  fi
  # Source nvm
  export NVM_DIR="$HOME/.nvm"
  [ -s "$NVM_DIR/nvm.sh" ] && source "$NVM_DIR/nvm.sh"

  echo -e "  ${YELLOW}⚠  Ceci va :${NC}"
  echo -e "    • Supprimer ${BOLD}frontend/.next/${NC} et ${BOLD}frontend/node_modules/${NC}"
  echo -e "    • Réinstaller, rebuild et redémarrer ${BOLD}crm-frontend${NC} avec PM2"
  echo ""
  read -rp "  ▸ Continuer ? (O/n) " confirm
  confirm="${confirm:-O}"
  if [[ ! "$confirm" =~ ^[OoYy]$ ]]; then
    info "Annulé."
    pause
    return
  fi

  echo ""

  # Clean
  info "Suppression .next/ et node_modules/..."
  rm -rf "$FRONTEND_DIR/.next" "$FRONTEND_DIR/node_modules"
  ok "Dossiers nettoyés"

  # Reinstall
  info "npm ci..."
  cd "$FRONTEND_DIR"
  # Ensure devDependencies are installed (needed for build tools like tsc/next)
  if npm ci --legacy-peer-deps --include=dev --quiet 2>&1; then
    ok "Dépendances installées"
  else
    fail "npm ci a échoué"
    pause
    return
  fi

  # Build
  info "npm run build..."
  set -a; source "$ENV_FILE"; set +a
  export NEXT_PUBLIC_API_URL="/api"
  export INTERNAL_API_URL="http://127.0.0.1:3001/api"

  if npm run build 2>&1; then
    ok "Build terminé"
  else
    fail "Build échoué !"
    pause
    return
  fi

  # Verify
  if [ ! -f "$FRONTEND_DIR/.next/standalone/server.js" ]; then
    fail ".next/standalone/server.js non trouvé"
    pause
    return
  fi

  BUILD_SIZE=$(du -sh "$FRONTEND_DIR/.next" | cut -f1)
  ok "Build size: $BUILD_SIZE"

  # Prepare and restart PM2 frontend
  info "Redémarrage frontend PM2..."
  cd "$PROJECT_ROOT"
  if bash "$SCRIPT_DIR/setup_frontend.sh"; then
    ok "Frontend Next.js redémarré avec PM2"
  else
    fail "Redémarrage frontend échoué"
    pause
    return
  fi

  # Update Nginx config & reload to clear cache
  local NGINX_CONF="$SCRIPT_DIR/nginx-stockini-msp.conf"
  if [ -f "$NGINX_CONF" ]; then
    info "Mise à jour config Nginx..."
    sudo cp "$NGINX_CONF" /etc/nginx/sites-available/stockini-msp.tn
    if sudo nginx -t 2>&1; then
      sudo systemctl reload nginx
      ok "Nginx rechargé (cache purgé)"
    else
      warn "Config Nginx invalide — pas de reload"
    fi
  else
    info "Rechargement Nginx..."
    sudo systemctl reload nginx && ok "Nginx rechargé" || warn "Rechargement échoué"
  fi

  echo ""
  ok "Clear frontend terminé !"
  pause
}

clear_all() {
  header "🧹 CLEAR & REBUILD — BACKEND + FRONTEND"
  echo ""
  echo -e "  ${YELLOW}⚠  Ceci va nettoyer et reconstruire TOUT (backend + frontend)${NC}"
  echo ""
  read -rp "  ▸ Continuer ? (O/n) " confirm
  confirm="${confirm:-O}"
  if [[ ! "$confirm" =~ ^[OoYy]$ ]]; then
    info "Annulé."
    pause
    return
  fi

  clear_backend
  clear_frontend

  echo ""
  ok "Clear complet terminé (backend + frontend) !"
  pause
}

clear_and_delete() {
  header "🗑️  CLEAR & DELETE (NO REBUILD)"
  echo ""

  if [ -z "$PROJECT_ROOT" ]; then
    fail "Impossible de détecter la racine du projet. Lancez: bash deploy/vps/monitor.sh depuis le repo"
    pause
    return
  fi

  ENV_FILE=$(resolve_env "$PROJECT_ROOT")

  echo -e "  ${RED}╔══════════════════════════════════════════════════════╗${NC}"
  echo -e "  ${RED}║  ⚠  DESTRUCTION TOTALE — DONNÉES IRRÉCUPÉRABLES  ⚠  ║${NC}"
  echo -e "  ${RED}╚══════════════════════════════════════════════════════╝${NC}"
  echo ""
  echo -e "  ${YELLOW}Ceci va :${NC}"
  echo -e "    • Arrêter le backend (PM2)"
  echo -e "    • Supprimer ${BOLD}backend/dist/${NC} et ${BOLD}backend/node_modules/${NC}"
  echo -e "    • Supprimer ${BOLD}frontend/.next/${NC} et ${BOLD}frontend/node_modules/${NC}"
  echo -e "    • Arrêter le frontend (PM2)"
  echo -e "    • ${RED}${BOLD}VIDER ENTIÈREMENT la base de données — TOUTES LES DONNÉES PERDUES${NC}"
  echo ""
  echo -e "  ${YELLOW}Avez-vous fait un backup AVANT ? (option 14 du menu)${NC}"
  echo ""
  read -rp "  ▸ Êtes-vous ABSOLUMENT sûr ? Tapez 'SUPPRIMER' pour confirmer : " confirm

  if [ "$confirm" != "SUPPRIMER" ]; then
    info "Annulé — aucune donnée modifiée."
    pause
    return
  fi

  echo ""
  info "1. Arrêt du backend et frontend (PM2)..."
  pm2 stop crm-backend 2>/dev/null || true
  pm2 delete crm-backend 2>/dev/null || true
  pm2 stop crm-frontend 2>/dev/null || true
  pm2 delete crm-frontend 2>/dev/null || true
  pm2 save --force 2>/dev/null || true

  info "2. Suppression des dossiers backend..."
  rm -rf "$PROJECT_ROOT/backend/dist" "$PROJECT_ROOT/backend/node_modules"

  info "3. Suppression des dossiers frontend locaux..."
  rm -rf "$PROJECT_ROOT/frontend/.next" "$PROJECT_ROOT/frontend/node_modules"

  info "4. Vidage de la base de données PostgreSQL..."
  if [ -n "$ENV_FILE" ]; then
    set -a; source "$ENV_FILE"; set +a
    local DB_NAME_VAL="${DB_NAME:-geodetection_crm}"
    local DB_USER_VAL="${DB_USER:-geodetection}"

    # Drop and recreate public schema
    sudo -u postgres psql -d "$DB_NAME_VAL" -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public; GRANT ALL ON SCHEMA public TO $DB_USER_VAL; GRANT ALL ON SCHEMA public TO public;" >/dev/null 2>&1
    if [ $? -eq 0 ]; then
      ok "Base de données $DB_NAME_VAL vidée (schéma recréé)"
    else
      warn "La base $DB_NAME_VAL n'a pas pu être vidée"
    fi
  else
    warn ".env introuvable, impossible de vider la base de données"
  fi

  echo ""
  ok "Clear & Delete terminé avec succès ! (Pas de rebuild effectué)"
  pause
}

# ── SSL Certificate Renewal ─────────────────────────────────
renew_ssl() {
  header "🔒 RENOUVELLEMENT CERTIFICAT SSL"
  echo ""

  if ! command -v certbot &>/dev/null; then
    fail "Certbot non installé"
    info "Installer: sudo apt install certbot python3-certbot-nginx"
    pause
    return
  fi

  # Show current cert info
  CERT_EXPIRY=$(echo | openssl s_client -servername "$DOMAIN" -connect "$DOMAIN:443" 2>/dev/null | openssl x509 -noout -enddate 2>/dev/null | cut -d= -f2)
  if [ -n "$CERT_EXPIRY" ]; then
    info "Certificat actuel expire: ${BOLD}$CERT_EXPIRY${NC}"

    # Calculate days remaining
    EXPIRY_EPOCH=$(date -d "$CERT_EXPIRY" +%s 2>/dev/null || echo "0")
    NOW_EPOCH=$(date +%s)
    if [ "$EXPIRY_EPOCH" -gt 0 ]; then
      DAYS_LEFT=$(( (EXPIRY_EPOCH - NOW_EPOCH) / 86400 ))
      if [ "$DAYS_LEFT" -le 30 ]; then
        warn "⚠️  Plus que ${BOLD}${DAYS_LEFT} jours${NC} — renouvellement recommandé !"
      else
        ok "Encore ${BOLD}${DAYS_LEFT} jours${NC} de validité"
      fi
    fi
  else
    warn "Impossible de vérifier le certificat"
  fi

  echo ""
  echo -e "  ${BOLD}1)${NC} 🔄  Renouveler maintenant (certbot renew)"
  echo -e "  ${BOLD}2)${NC} 🧪  Test de renouvellement (dry-run)"
  echo -e "  ${BOLD}3)${NC} 📋  Voir les certificats installés"
  echo -e "  ${BOLD}0)${NC} ↩   Retour"
  echo ""
  read -rp "  Choix: " ssl_choice

  case $ssl_choice in
    1)
      echo ""
      info "Renouvellement du certificat..."
      if sudo certbot renew --nginx 2>&1; then
        ok "Certificat renouvelé"
        info "Rechargement Nginx..."
        sudo systemctl reload nginx && ok "Nginx rechargé"
      else
        fail "Renouvellement échoué"
        warn "Essayez: sudo certbot renew --force-renewal"
      fi
      pause
      ;;
    2)
      echo ""
      info "Test de renouvellement (dry-run)..."
      sudo certbot renew --dry-run 2>&1
      pause
      ;;
    3)
      echo ""
      sudo certbot certificates 2>&1
      pause
      ;;
    *)
      return
      ;;
  esac
}

# ── Database Backup ──────────────────────────────────────────
backup_database() {
  header "💾 BACKUP BASE DE DONNÉES"
  echo ""

  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
  ENV_FILE=$(resolve_env "$PROJECT_ROOT")

  # Load env
  if [ -z "$ENV_FILE" ]; then
    fail ".env non trouvé (ni à la racine ni dans backend/)"
    pause
    return
  fi
  set -a; source "$ENV_FILE"; set +a

  local DB_NAME_VAL="${DB_NAME:-geodetection_crm}"
  local DB_USER_VAL="${DB_USER:-geodetection}"
  local BACKUP_BASE="/home/ubuntu/backup-db"

  # Create backup dir
  mkdir -p "$BACKUP_BASE"

  local TIMESTAMP=$(date +'%d%m%Y')
  local BACKUP_FILE="$BACKUP_BASE/backup_geodetection_crm_${TIMESTAMP}.sql"

  # Show current DB size
  DB_SIZE=$(sudo -u postgres psql -tAc "SELECT pg_size_pretty(pg_database_size('$DB_NAME_VAL'));" 2>/dev/null | tr -d '[:space:]')
  if [ -n "$DB_SIZE" ]; then
    info "Taille de la base: ${BOLD}$DB_SIZE${NC}"
  fi

  # Count existing backups
  BACKUP_COUNT=$(ls -1 "$BACKUP_BASE"/backup_*.sql 2>/dev/null | wc -l)
  if [ "$BACKUP_COUNT" -gt 0 ]; then
    LAST_BACKUP=$(ls -1t "$BACKUP_BASE"/backup_*.sql 2>/dev/null | head -1)
    LAST_DATE=$(stat -c %y "$LAST_BACKUP" 2>/dev/null | cut -d. -f1)
    info "Backups existants: ${BOLD}$BACKUP_COUNT${NC}"
    info "Dernier backup: ${BOLD}$LAST_DATE${NC}"
  fi

  echo ""
  echo -e "  ${BOLD}1)${NC} 💾  Sauvegarder maintenant"
  echo -e "  ${BOLD}2)${NC} 📋  Lister les backups existants"
  echo -e "  ${BOLD}3)${NC} 🗑️   Supprimer les anciens backups (garder les 5 derniers)"
  echo -e "  ${BOLD}0)${NC} ↩   Retour"
  echo ""
  read -rp "  Choix: " db_choice

  case $db_choice in
    1)
      echo ""
      info "Sauvegarde de ${BOLD}$DB_NAME_VAL${NC} en cours..."
      echo ""

      if sudo -u postgres pg_dump -Fc "$DB_NAME_VAL" > "$BACKUP_FILE" 2>&1; then
        BACKUP_SIZE=$(du -sh "$BACKUP_FILE" | cut -f1)
        echo ""
        ok "Sauvegarde terminée !"
        echo ""
        echo -e "  ${BOLD}📁 Fichier :${NC}  $BACKUP_FILE"
        echo -e "  ${BOLD}📏 Taille  :${NC}  $BACKUP_SIZE"
        echo ""
        echo -e "  ${BOLD}Restaurer :${NC}"
        echo -e "    sudo -u postgres pg_restore -d $DB_NAME_VAL --clean $BACKUP_FILE"
      else
        fail "Erreur lors de la sauvegarde"
        # Cleanup failed backup
        rm -f "$BACKUP_FILE" 2>/dev/null
      fi
      pause
      ;;
    2)
      echo ""
      if ls -1 "$BACKUP_BASE"/backup_*.sql &>/dev/null; then
        echo -e "  ${BOLD}Backups dans $BACKUP_BASE :${NC}"
        echo ""
        ls -lh "$BACKUP_BASE"/backup_*.sql | awk '{printf "    %-12s  %s\n", $5, $NF}'
        echo ""
        TOTAL_SIZE=$(du -sh "$BACKUP_BASE" | cut -f1)
        info "Taille totale: $TOTAL_SIZE"
      else
        warn "Aucun backup trouvé dans $BACKUP_BASE"
      fi
      pause
      ;;
    3)
      echo ""
      TOTAL=$(ls -1 "$BACKUP_BASE"/backup_*.sql 2>/dev/null | wc -l)
      if [ "$TOTAL" -le 5 ]; then
        info "Seulement $TOTAL backup(s) — rien à supprimer"
      else
        TO_DELETE=$((TOTAL - 5))
        info "Suppression des $TO_DELETE plus anciens backups..."
        ls -1t "$BACKUP_BASE"/backup_*.sql | tail -n "$TO_DELETE" | while read f; do
          rm -f "$f"
          ok "Supprimé: $(basename "$f")"
        done
        info "Il reste 5 backups"
      fi
      pause
      ;;
    *)
      return
      ;;
  esac
}

# ── Database Restore ─────────────────────────────────────────
restore_database() {
  header "♻️  RESTAURATION BASE DE DONNÉES"
  echo ""

  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
  ENV_FILE=$(resolve_env "$PROJECT_ROOT")

  # Load env
  if [ -z "$ENV_FILE" ]; then
    fail ".env non trouvé (ni à la racine ni dans backend/)"
    pause
    return
  fi
  set -a; source "$ENV_FILE"; set +a

  local DB_NAME_VAL="${DB_NAME:-geodetection_crm}"
  local DB_USER_VAL="${DB_USER:-geodetection}"
  local BACKUP_BASE="/home/ubuntu/backup-db"

  # Check backup dir
  if [ ! -d "$BACKUP_BASE" ]; then
    fail "Dossier de backups non trouvé: $BACKUP_BASE"
    pause
    return
  fi

  # Collect backups
  mapfile -t BACKUPS < <(ls -1t "$BACKUP_BASE"/backup_*.sql 2>/dev/null)

  if [ ${#BACKUPS[@]} -eq 0 ]; then
    warn "Aucun backup trouvé dans $BACKUP_BASE"
    pause
    return
  fi

  # Display list
  echo -e "  ${BOLD}Backups disponibles :${NC}"
  echo ""
  for i in "${!BACKUPS[@]}"; do
    FILE="${BACKUPS[$i]}"
    FNAME=$(basename "$FILE")
    FSIZE=$(du -sh "$FILE" 2>/dev/null | cut -f1)
    FDATE=$(stat -c %y "$FILE" 2>/dev/null | cut -d. -f1)
    NUM=$((i + 1))
    echo -e "    ${BOLD}${NUM})${NC}  ${FNAME}  ${CYAN}(${FSIZE}, ${FDATE})${NC}"
  done
  echo ""
  echo -e "    ${BOLD}0)${NC}  ↩  Retour"
  echo ""

  read -rp "  ▸ Sélectionner le backup à restaurer [0-${#BACKUPS[@]}]: " sel

  # Validate selection
  if [ "$sel" = "0" ] || [ -z "$sel" ]; then
    return
  fi

  if ! [[ "$sel" =~ ^[0-9]+$ ]] || [ "$sel" -lt 1 ] || [ "$sel" -gt ${#BACKUPS[@]} ]; then
    fail "Choix invalide"
    pause
    return
  fi

  local SELECTED="${BACKUPS[$((sel - 1))]}"
  local SELECTED_NAME=$(basename "$SELECTED")

  echo ""
  echo -e "  ${YELLOW}⚠  ATTENTION ! Cette opération va :${NC}"
  echo -e "    • ${RED}Écraser${NC} toutes les données actuelles de ${BOLD}$DB_NAME_VAL${NC}"
  echo -e "    • Restaurer depuis: ${BOLD}$SELECTED_NAME${NC}"
  echo ""
  read -rp "  ▸ Êtes-vous sûr ? Tapez 'OUI' pour confirmer: " confirm

  if [ "$confirm" != "OUI" ]; then
    info "Restauration annulée."
    pause
    return
  fi

  echo ""
  info "Restauration de ${BOLD}$SELECTED_NAME${NC} en cours..."
  echo ""

  if sudo -u postgres pg_restore -d "$DB_NAME_VAL" --clean --if-exists -v "$SELECTED" 2>&1; then
    echo ""
    ok "Restauration terminée avec succès !"
    echo ""

    # Show quick verification
    TABLE_COUNT=$(PGPASSWORD="$DB_PASSWORD" psql -U "$DB_USER_VAL" -h localhost -d "$DB_NAME_VAL" -tAc "SELECT count(*) FROM information_schema.tables WHERE table_schema='public';" 2>/dev/null)
    if [ -n "$TABLE_COUNT" ]; then
      info "Tables restaurées: ${BOLD}$TABLE_COUNT${NC}"
    fi

    DB_SIZE=$(PGPASSWORD="$DB_PASSWORD" psql -U "$DB_USER_VAL" -h localhost -d "$DB_NAME_VAL" -tAc "SELECT pg_size_pretty(pg_database_size('$DB_NAME_VAL'));" 2>/dev/null | tr -d '[:space:]')
    if [ -n "$DB_SIZE" ]; then
      info "Taille de la base: ${BOLD}$DB_SIZE${NC}"
    fi
  else
    echo ""
    fail "Erreur lors de la restauration"
    warn "Vérifiez les logs ci-dessus pour plus de détails"
  fi

  pause
}

# ── Database User Management ───────────────────────────────────

list_db_users() {
  header "Lister les Utilisateurs PostgreSQL"
  
  info "Récupération de la liste des rôles PostgreSQL..."
  if ! sudo -u postgres psql -c "\du"; then
    fail "Impossible d'accéder à PostgreSQL."
  fi
  
  pause
}

add_db_user() {
  header "Ajouter un Utilisateur PostgreSQL"
  
  read -rp "  Nom d'utilisateur : " new_user
  if [ -z "$new_user" ]; then
    fail "Le nom d'utilisateur est requis."
    pause
    return
  fi
  
  # Check if user exists
  if sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='$new_user'" | grep -q 1; then
    warn "L'utilisateur '$new_user' existe déjà."
    pause
    return
  fi
  
  read -rsp "  Mot de passe : " new_pass
  echo ""
  if [ -z "$new_pass" ]; then
    fail "Le mot de passe est requis."
    pause
    return
  fi
  
  info "Création de l'utilisateur '$new_user'..."
  if sudo -u postgres psql -c "CREATE USER \"$new_user\" WITH PASSWORD '$new_pass';"; then
    ok "Utilisateur '$new_user' créé avec succès."
    
    echo ""
    read -rp "  Voulez-vous lui accorder tous les privilèges sur la base de données actuelle ($DB_NAME)? (y/N): " grant_priv
    if [[ "$grant_priv" =~ ^[Yy]$ ]]; then
      sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE \"$DB_NAME\" TO \"$new_user\";"
      sudo -u postgres psql -d "$DB_NAME" -c "GRANT ALL ON SCHEMA public TO \"$new_user\";"
      ok "Privilèges accordés."
    else
      info "Aucun privilège accordé, l'utilisateur a été créé avec les droits par défaut."
    fi
  else
    fail "Erreur lors de la création de l'utilisateur."
  fi
  
  pause
}

# ── Full Redeploy (wraps redeploy.sh) ───────────────────────
run_redeploy() {
  header "🚀 FULL REDEPLOY (git pull + migrate + rebuild)"
  echo ""

  if [ -z "$PROJECT_ROOT" ]; then
    fail "Impossible de d\u00e9tecter la racine du projet."
    pause
    return
  fi

  local env_file
  env_file=$(resolve_env "$PROJECT_ROOT")
  if [ -z "$env_file" ]; then
    fail ".env non trouv\u00e9 (ni \u00e0 la racine ni dans backend/)"
    pause
    return
  fi

  echo -e "  ${YELLOW}\u26a0  Ceci va :${NC}"
  echo -e "    \u2022 git pull (derni\u00e8re version du code)"
  echo -e "    \u2022 npm ci (backend + frontend)"
  echo -e "    \u2022 prisma migrate deploy (aborte si \u00e9chec)"
  echo -e "    \u2022 npm run build (backend + frontend)"
  echo -e "    \u2022 red\u00e9marrer PM2 (crm-backend)"
  echo -e "    \u2022 health check /health"
  echo ""
  echo -e "  ${YELLOW}Si une migration P3009 bloque, lancez d'abord :${NC}"
  echo -e "    ${BOLD}bash deploy/vps/fix-migration.sh${NC}"
  echo ""
  read -rp "  \u25b8 Continuer ? (O/n) " confirm
  confirm="${confirm:-O}"
  if [[ ! "$confirm" =~ ^[OoYy]$ ]]; then
    info "Annul\u00e9."
    pause
    return
  fi

  echo ""
  bash "$SCRIPT_DIR/redeploy.sh"
  local rc=$?
  echo ""
  if [ "$rc" -eq 0 ]; then
    ok "Redeploy termin\u00e9 avec succ\u00e8s !"
  else
    fail "Redeploy termin\u00e9 avec des erreurs (code: $rc). V\u00e9rifiez les logs ci-dessus."
  fi
  pause
}

# ── Main menu ────────────────────────────────────────────────
main_menu() {
  while true; do
    clear
    echo ""
    echo -e "${BOLD}${CYAN}  ╔═══════════════════════════════════════════╗${NC}"
    echo -e "${BOLD}${CYAN}  ║   CRM Geodetection — Monitoring Dashboard ║${NC}"
    echo -e "${BOLD}${CYAN}  ╚═══════════════════════════════════════════╝${NC}"
    echo ""

    check_all_status

    separator
    echo ""
    echo -e "  ${BOLD}📋 Logs & Status :${NC}"
    echo -e "    ${BOLD}1)${NC}  PM2 logs (backend)"
    echo -e "    ${BOLD}2)${NC}  Nginx logs"
    echo -e "    ${BOLD}3)${NC}  PostgreSQL status"
    echo -e "    ${BOLD}4)${NC}  PM2 monit (live dashboard)"
    echo ""
    echo -e "  ${BOLD}🔄 Actions :${NC}"
    echo -e "    ${BOLD}5)${NC}  Restart backend (PM2)"
    echo -e "    ${BOLD}6)${NC}  Reload nginx"
    echo -e "    ${BOLD}7)${NC}  Rebuild & deploy frontend"
    echo ""
    echo -e "  ${BOLD}🚀 Deploy :${NC}"
    echo -e "   ${BOLD}10)${NC}  ${GREEN}Full Redeploy${NC}   ${CYAN}(git pull + migrate + rebuild + restart)${NC}"
    echo ""
    echo -e "  ${BOLD}🧹 Clear & Rebuild :${NC}"
    echo -e "    ${BOLD}8)${NC}  Clear backend   ${CYAN}(rm dist + node_modules, rebuild)${NC}"
    echo -e "    ${BOLD}9)${NC}  Clear frontend  ${CYAN}(rm dist + node_modules, rebuild)${NC}"
    echo -e "   ${BOLD}11)${NC}  Clear ALL       ${CYAN}(backend + frontend)${NC}"
    echo -e "   ${BOLD}12)${NC}  Clear & Delete  ${CYAN}(Delete front, back, db - NO REBUILD)${NC}"
    echo ""
    echo -e "  ${BOLD}🔧 Maintenance :${NC}"
    echo -e "   ${BOLD}13)${NC}  🔒 Renouveler certificat SSL"
    echo -e "   ${BOLD}14)${NC}  💾 Backup base de données"
    echo -e "   ${BOLD}15)${NC}  ♻️  Restaurer base de données"
    echo ""
    echo -e "  ${BOLD}👥 Utilisateurs (BDD) :${NC}"
    echo -e "   ${BOLD}16)${NC}  Lister les utilisateurs PostgreSQL"
    echo -e "   ${BOLD}17)${NC}  Ajouter un utilisateur PostgreSQL"
    echo ""
    echo -e "    ${BOLD}0)${NC}  ❌ Exit"
    echo ""
    read -rp "  Choose [0-17]: " choice

    case $choice in
      1) show_pm2_logs ;;
      2) show_nginx_logs ;;
      3) show_pg_status ;;
      4) pm2 monit ;;
      5) restart_backend ;;
      6) restart_nginx ;;
      7) rebuild_frontend ;;
      8) clear_backend ;;
      9) clear_frontend ;;
      10) run_redeploy ;;
      11) clear_all ;;
      12) clear_and_delete ;;
      13) renew_ssl ;;
      14) backup_database ;;
      15) restore_database ;;
      16) list_db_users ;;
      17) add_db_user ;;
      0|q) echo ""; echo "  Bye!"; echo ""; exit 0 ;;
      *) warn "Invalid choice" ; sleep 1 ;;
    esac
  done
}

# ── Entry point ──────────────────────────────────────────────
case "${1:-}" in
  --status|-s)
    # Non-interactive: just print status and exit
    check_all_status
    ;;
  --help|-h)
    echo "Usage: $0 [options]"
    echo ""
    echo "Options:"
    echo "  (none)        Interactive dashboard"
    echo "  --status, -s  Print status and exit"
    echo "  --help, -h    Show this help"
    ;;
  *)
    main_menu
    ;;
esac
