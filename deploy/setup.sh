#!/bin/bash

# =============================================================
# Stockini — First-Time VPS Setup (Orchestrator)
# =============================================================
# Usage: bash deploy/setup.sh
#        (run as non-root user WITH sudo privileges)
#
# Steps executed:
#   1. Outils système  (Node.js 20, PM2, PostgreSQL 16, Redis,
#                       MinIO, Nginx, Certbot)
#   2. PostgreSQL      (utilisateur, base de données, migrations)
#   3. Redis           (mot de passe, limite mémoire)
#   4. MinIO           (credentials, bucket)
#   5. Backend NestJS  (build, PM2, port 3001)
#   6. Frontend Next.js(build, PM2, port 3000)
#   7. Nginx           (reverse proxy, config HTTP)
#   8. SSL             (Certbot Let's Encrypt + reload Nginx HTTPS)
#
# Requires: Ubuntu 22.04+, sudo privileges
# =============================================================

set -e

# ── Colors & Styles ──────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m'

# ── Log functions ────────────────────────────────────────────
log_ok()    { echo -e "  ${GREEN}✅${NC} $1"; }
log_info()  { echo -e "  ${BLUE}ℹ️ ${NC} $1"; }
log_warn()  { echo -e "  ${YELLOW}⚠️ ${NC} $1"; }
log_err()   { echo -e "  ${RED}❌${NC} $1"; }
log_step()  { echo -e "\n  ${CYAN}${BOLD}── $1 ──${NC}\n"; }

separator() {
  echo -e "${CYAN}  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

# ── Resolve paths ────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
VPS_DIR="$SCRIPT_DIR/vps"

# ── Banner ───────────────────────────────────────────────────
show_banner() {
  clear
  echo ""
  echo -e "${CYAN}${BOLD}"
  echo "  ╔═══════════════════════════════════════════════════════╗"
  echo "  ║                                                       ║"
  echo "  ║     █████╗ ██████╗ ██████╗ ██████╗ ███████╗           ║"
  echo "  ║    ██╔══██╗██╔══██╗██╔══██╗██╔══██╗██╔════╝           ║"
  echo "  ║    ███████║██████╔╝██████╔╝██████╔╝█████╗             ║"
  echo "  ║    ██╔══██║██╔═══╝ ██╔═══╝ ██╔══██╗██╔══╝             ║"
  echo "  ║    ██║  ██║██║     ██║     ██║  ██║███████╗            ║"
  echo "  ║    ╚═╝  ╚═╝╚═╝     ╚═╝     ╚═╝  ╚═╝╚══════╝            ║"
  echo "  ║                                                       ║"
  echo "  ║         🚀  First-Time VPS Setup                      ║"
  echo "  ║         Stockini — Production Deployment      ║"
  echo "  ║                                                       ║"
  echo "  ╚═══════════════════════════════════════════════════════╝"
  echo -e "${NC}"
}

# ── Pre-flight checks ───────────────────────────────────────
preflight_checks() {
  log_step "PRÉ-REQUIS"

  # ── Non-root check ───────────────────────────────────────
  if [ "$EUID" -eq 0 ]; then
    log_err "Ne pas lancer ce script en tant que root."
    log_err "Utilisez: bash deploy/setup.sh  (utilisateur normal avec sudo)"
    exit 1
  fi

  # ── Sudo check ───────────────────────────────────────────
  if ! sudo -v 2>/dev/null; then
    log_err "sudo non disponible. Cet utilisateur doit avoir les droits sudo."
    exit 1
  fi
  log_ok "Droits sudo: disponibles"

  local ERRORS=0

  # ── OS check ─────────────────────────────────────────────
  if [ -f /etc/os-release ]; then
    OS_NAME=$(. /etc/os-release && echo "$NAME $VERSION_ID")
    log_ok "OS: $OS_NAME"
  else
    log_warn "Impossible de détecter l'OS (fichier /etc/os-release absent)"
  fi

  # ── RAM check (minimum 1GB) ───────────────────────────────
  TOTAL_RAM=$(free -m | awk 'NR==2 {print $2}')
  if [ "$TOTAL_RAM" -ge 1024 ]; then
    log_ok "RAM: ${TOTAL_RAM} MB"
  else
    log_warn "RAM: ${TOTAL_RAM} MB (recommandé: ≥ 2GB pour ce stack)"
  fi

  # ── Disk check (minimum 5GB free) ────────────────────────
  FREE_DISK=$(df -BG / | awk 'NR==2 {print $4}' | tr -d 'G')
  if [ "$FREE_DISK" -ge 5 ]; then
    log_ok "Disque libre: ${FREE_DISK} GB"
  else
    log_err "Disque libre: ${FREE_DISK} GB (minimum 5GB requis)"
    ERRORS=$((ERRORS + 1))
  fi

  # ── Bootstrap curl + git + lsb-release si absents ────────
  # Ces outils sont nécessaires avant install_tools.sh
  local MISSING_PKGS=()
  command -v curl &>/dev/null           || MISSING_PKGS+=(curl)
  command -v git  &>/dev/null           || MISSING_PKGS+=(git)
  dpkg -s lsb-release &>/dev/null 2>&1 || MISSING_PKGS+=(lsb-release)

  if [ ${#MISSING_PKGS[@]} -gt 0 ]; then
    log_info "Bootstrap apt: installation de ${MISSING_PKGS[*]}..."
    sudo apt-get update -y -qq
    sudo apt-get install -y -qq "${MISSING_PKGS[@]}"
    log_ok "Paquets bootstrap installés"
  fi

  log_ok "curl: $(curl --version | head -1 | cut -d' ' -f1-2)"
  log_ok "git:  $(git --version | cut -d' ' -f3)"

  # ── .env check ───────────────────────────────────────────
  ENV_FILE="$PROJECT_ROOT/.env"
  if [ -f "$ENV_FILE" ]; then
    log_ok ".env trouvé: $ENV_FILE"
  else
    if [ -f "$VPS_DIR/.env.prod.vps" ]; then
      log_warn ".env absent — copie depuis deploy/vps/.env.prod.vps..."
      cp "$VPS_DIR/.env.prod.vps" "$ENV_FILE"
      echo ""
      echo -e "  ${YELLOW}${BOLD}╔══════════════════════════════════════════════════════╗"
      echo -e "  ║  ⚠️  IMPORTANT — Complétez le fichier .env            ║"
      echo -e "  ║                                                      ║"
      echo -e "  ║  nano $ENV_FILE"
      echo -e "  ║                                                      ║"
      echo -e "  ║  Remplacez TOUS les CHANGE_ME par vos valeurs.       ║"
      echo -e "  ║  Générez des secrets forts :                         ║"
      echo -e "  ║    openssl rand -base64 64                           ║"
      echo -e "  ╚══════════════════════════════════════════════════════╝${NC}"
      echo ""
      read -rp "  ▸ Appuyez sur Entrée après avoir complété .env..."
    else
      log_err ".env introuvable et aucun exemple disponible (deploy/vps/.env.prod.vps)"
      ERRORS=$((ERRORS + 1))
    fi
  fi

  # ── Validate critical env variables ───────────────────────
  if [ -f "$ENV_FILE" ]; then
    local _JWT _DB_URL _DOMAIN _MINIO_KEY _MINIO_SECRET

    _JWT=$(grep -E '^JWT_SECRET=' "$ENV_FILE" 2>/dev/null | head -1 | cut -d= -f2-)
    _DB_URL=$(grep -E '^DATABASE_URL=' "$ENV_FILE" 2>/dev/null | head -1 | cut -d= -f2-)
    _DOMAIN=$(grep -E '^DOMAIN=' "$ENV_FILE" 2>/dev/null | head -1 | cut -d= -f2- | tr -d '[:space:]"'"'"'')
    _MINIO_KEY=$(grep -E '^MINIO_ACCESS_KEY=' "$ENV_FILE" 2>/dev/null | head -1 | cut -d= -f2-)
    _MINIO_SECRET=$(grep -E '^MINIO_SECRET_KEY=' "$ENV_FILE" 2>/dev/null | head -1 | cut -d= -f2-)

    if [ -z "$_JWT" ] || [[ "$_JWT" == CHANGE_ME* ]] || [ "$_JWT" = "changeme" ]; then
      log_err "JWT_SECRET manquant ou valeur par défaut — générez: openssl rand -base64 64"
      ERRORS=$((ERRORS + 1))
    else
      log_ok "JWT_SECRET: défini"
    fi

    if [ -z "$_DB_URL" ]; then
      log_err "DATABASE_URL manquant dans .env"
      ERRORS=$((ERRORS + 1))
    elif [[ "$_DB_URL" == *"CHANGE_ME"* ]]; then
      log_err "DATABASE_URL contient encore CHANGE_ME — mettez le vrai mot de passe"
      ERRORS=$((ERRORS + 1))
    else
      log_ok "DATABASE_URL: défini"
    fi

    if [ -z "$_DOMAIN" ]; then
      log_warn "DOMAIN non défini dans .env — l'étape SSL sera ignorée"
    else
      log_ok "DOMAIN: $_DOMAIN"
    fi

    if [[ "$_MINIO_KEY" == CHANGE_ME* ]] || [[ "$_MINIO_SECRET" == CHANGE_ME* ]]; then
      log_err "MINIO_ACCESS_KEY / MINIO_SECRET_KEY contiennent encore CHANGE_ME"
      ERRORS=$((ERRORS + 1))
    elif [ -n "$_MINIO_KEY" ]; then
      log_ok "MinIO credentials: définis"
    fi
  fi

  if [ "$ERRORS" -gt 0 ]; then
    echo ""
    log_err "$ERRORS erreur(s) détectée(s). Corrigez .env avant de continuer."
    exit 1
  fi

  echo ""
  log_ok "Tous les pré-requis sont validés !"
}

# ── Step runner ──────────────────────────────────────────────
run_step() {
  local STEP_NUM="$1"
  local STEP_NAME="$2"
  local SCRIPT="$3"
  local RUN_AS="$4"   # "sudo" or "user"

  echo ""
  separator
  echo -e "  ${BOLD}${MAGENTA}ÉTAPE $STEP_NUM${NC} │ ${BOLD}$STEP_NAME${NC}"
  separator
  echo ""

  if [ ! -f "$SCRIPT" ]; then
    log_err "Script non trouvé: $SCRIPT"
    return 1
  fi

  if [ "$RUN_AS" = "sudo" ]; then
    if sudo bash "$SCRIPT"; then
      echo ""
      log_ok "$STEP_NAME — Terminé !"
      return 0
    else
      log_err "$STEP_NAME — ÉCHEC !"
      return 1
    fi
  else
    if bash "$SCRIPT"; then
      echo ""
      log_ok "$STEP_NAME — Terminé !"
      return 0
    else
      log_err "$STEP_NAME — ÉCHEC !"
      return 1
    fi
  fi
}

# ── SSL Setup ────────────────────────────────────────────────
setup_ssl() {
  log_step "SSL DÉSACTIVÉ — ACCÈS PAR IP"
  log_warn "Configuration IP-only: Let's Encrypt/Certbot n'est pas utilisé."
  return 0

  local DOMAIN
  DOMAIN=$(grep -E '^DOMAIN=' "$PROJECT_ROOT/.env" 2>/dev/null | head -1 | cut -d= -f2 | tr -d '[:space:]"'"'"'')

  if [ -z "$DOMAIN" ]; then
    log_warn "DOMAIN non défini dans .env — SSL ignoré."
    log_warn "Pour l'activer ultérieurement :"
    log_warn "  1. Ajoutez DOMAIN=votre-domaine.com dans .env"
    log_warn "  2. sudo certbot certonly --nginx -d votre-domaine.com"
    log_warn "  3. sudo bash deploy/vps/setup_nginx.sh"
    return 0
  fi

  if [ -f "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" ]; then
    log_ok "Certificat SSL déjà présent pour $DOMAIN"
    return 0
  fi

  # Certbot est installé par install_tools.sh — vérification de sécurité
  if ! command -v certbot &>/dev/null; then
    log_info "Installation de Certbot..."
    sudo apt-get install -y -qq certbot python3-certbot-nginx
    log_ok "Certbot installé"
  fi

  local ADMIN_EMAIL
  ADMIN_EMAIL=$(grep -E '^ADMIN_EMAIL=' "$PROJECT_ROOT/.env" 2>/dev/null | head -1 | cut -d= -f2 | tr -d '[:space:]"'"'"'')
  ADMIN_EMAIL="${ADMIN_EMAIL:-admin@$DOMAIN}"

  log_info "Demande de certificat pour $DOMAIN (contact: $ADMIN_EMAIL)..."
  log_info "Assurez-vous que le DNS de $DOMAIN pointe vers cette IP."
  echo ""

  if sudo certbot certonly --nginx \
      -d "$DOMAIN" -d "www.$DOMAIN" \
      --non-interactive --agree-tos \
      -m "$ADMIN_EMAIL"; then

    log_ok "Certificat SSL obtenu pour $DOMAIN"

    # Renouvellement automatique
    sudo systemctl enable certbot.timer 2>/dev/null || true
    log_ok "Renouvellement automatique activé (certbot.timer)"

    # Reload Nginx avec config HTTPS
    log_info "Reconfiguration de Nginx en mode HTTPS..."
    sudo bash "$VPS_DIR/setup_nginx.sh"
    log_ok "Nginx configuré en HTTPS"
  else
    log_warn "Obtention du certificat échouée."
    log_warn "Causes possibles : DNS pas encore propagé, port 80 bloqué."
    log_warn "Réessayez après propagation DNS :"
    log_warn "  sudo certbot certonly --nginx -d $DOMAIN -d www.$DOMAIN"
    log_warn "  sudo bash deploy/vps/setup_nginx.sh"
  fi
}

# ── Summary ──────────────────────────────────────────────────
show_summary() {
  local DOMAIN
  DOMAIN=$(grep -E '^DOMAIN=' "$PROJECT_ROOT/.env" 2>/dev/null | head -1 | cut -d= -f2 | tr -d '[:space:]"'"'"'')
  DOMAIN="${DOMAIN:-<votre-domaine>}"

  echo ""
  echo ""
  echo -e "${GREEN}${BOLD}"
  echo "  ╔═══════════════════════════════════════════════════════╗"
  echo "  ║                                                       ║"
  echo "  ║     ✅  INSTALLATION TERMINÉE AVEC SUCCÈS !           ║"
  echo "  ║                                                       ║"
  echo "  ╚═══════════════════════════════════════════════════════╝"
  echo -e "${NC}"
  echo ""

  echo -e "  ${BOLD}📊 Status des services :${NC}"
  separator
  echo ""

  if systemctl is-active --quiet postgresql 2>/dev/null; then
    log_ok "PostgreSQL    : actif"
  else
    log_err "PostgreSQL    : inactif"
  fi

  if systemctl is-active --quiet redis-server 2>/dev/null; then
    log_ok "Redis         : actif"
  else
    log_err "Redis         : inactif"
  fi

  if systemctl is-active --quiet minio 2>/dev/null; then
    log_ok "MinIO         : actif"
  else
    log_warn "MinIO         : inactif"
  fi

  if command -v pm2 &>/dev/null; then
    PM2_BACK=$(pm2 jlist 2>/dev/null | python3 -c \
      "import sys,json; apps=json.load(sys.stdin); \
       a=next((x for x in apps if x['name']=='stockini-backend'),None); \
       print(a['pm2_env']['status'] if a else 'absent')" 2>/dev/null || echo "absent")
    if [ "$PM2_BACK" = "online" ]; then
      log_ok "Backend (PM2) : online"
    else
      log_warn "Backend (PM2) : ${PM2_BACK}"
    fi
  fi

  if curl -sf --connect-timeout 3 http://127.0.0.1:3001/health > /dev/null 2>&1; then
    log_ok "API Port 3001 : répond"
  else
    log_warn "API Port 3001 : pas de réponse"
  fi

  if command -v pm2 &>/dev/null && pm2 jlist 2>/dev/null | grep -q '"name":"stockini-frontend"'; then
    log_ok "Frontend      : PM2 configuré"
  else
    log_warn "Frontend      : non trouvé dans PM2"
  fi

  if systemctl is-active --quiet nginx 2>/dev/null; then
    log_ok "Nginx         : actif"
  else
    log_err "Nginx         : inactif"
  fi

  # Certbot parfois crée /live/domain-0001/ au lieu de /live/domain/
  _SSL_OK=0
  if find /etc/letsencrypt/live/ -maxdepth 2 -name "fullchain.pem" 2>/dev/null \
      | grep -qE "/${DOMAIN}(-[0-9]+)?/fullchain\.pem"; then
    _SSL_OK=1
  fi
  if [ "$_SSL_OK" -eq 1 ]; then
    log_ok "SSL           : activé"
  else
    log_warn "SSL           : non configuré (HTTP seulement)"
  fi

  echo ""
  separator
  echo ""
  echo -e "  ${BOLD}🔗 Accès :${NC}"
  if [ "$_SSL_OK" -eq 1 ]; then
    echo -e "     https://$DOMAIN"
  else
    echo -e "     http://$DOMAIN  (HTTPS non encore activé)"
  fi
  echo ""
  echo -e "  ${BOLD}📋 Commandes utiles :${NC}"
  echo -e "     ${DIM}pm2 status${NC}                       — État des services"
  echo -e "     ${DIM}pm2 logs stockini-backend${NC}             — Logs backend temps réel"
  echo -e "     ${DIM}pm2 logs stockini-frontend${NC}            — Logs frontend temps réel"
  echo -e "     ${DIM}bash deploy/vps/redeploy.sh${NC}      — Redéployer une mise à jour"
  echo -e "     ${DIM}bash deploy/vps/monitor.sh${NC}       — Dashboard monitoring"
  echo ""
  echo -e "  ${BOLD}🔒 Sécurité (recommandé après déploiement) :${NC}"
  echo -e "     ${DIM}sudo bash deploy/vps/security/setup_firewall.sh${NC}"
  echo -e "     ${DIM}sudo bash deploy/vps/security/secure_ssh.sh${NC}"
  echo -e "     ${DIM}sudo bash deploy/vps/security/setup_fail2ban.sh${NC}"
  echo ""
}

# ── Main ─────────────────────────────────────────────────────
main() {
  show_banner

  echo -e "  ${BOLD}Ce script va installer et configurer :${NC}"
  echo ""
  echo -e "    ${CYAN}1.${NC} Outils système (Node.js 20, PM2, PostgreSQL 16, Redis, MinIO, Nginx, Certbot)"
  echo -e "    ${CYAN}2.${NC} PostgreSQL — configuration (utilisateur, base de données, migrations)"
  echo -e "    ${CYAN}3.${NC} Redis — configuration (mot de passe, limite mémoire)"
  echo -e "    ${CYAN}4.${NC} MinIO — configuration (credentials, bucket)"
  echo -e "    ${CYAN}5.${NC} Backend NestJS (build, PM2, port 3001)"
  echo -e "    ${CYAN}6.${NC} Frontend Next.js (build, PM2, port 3000)"
  echo -e "    ${CYAN}7.${NC} Nginx (reverse proxy, config HTTP)"
  echo -e "    ${CYAN}8.${NC} SSL Let's Encrypt (certbot + reload Nginx HTTPS)"
  echo ""

  read -rp "  ▸ Continuer ? (O/n) " CONFIRM
  CONFIRM="${CONFIRM:-O}"
  if [[ ! "$CONFIRM" =~ ^[OoYy]$ ]]; then
    echo ""
    log_info "Installation annulée."
    exit 0
  fi

  START_TIME=$(date +%s)

  # ── Pre-flight (OS/RAM/Disk + bootstrap apt + .env) ──────────
  preflight_checks

  # ── Step 1/8: Install all tools ──────────────────────────────
  if ! run_step "1/8" \
      "Outils système (Node.js 20, PM2, PostgreSQL 16, Redis, MinIO, Nginx, Certbot)" \
      "$VPS_DIR/install_tools.sh" "sudo"; then
    log_err "L'installation des outils a échoué. Corrigez l'erreur ci-dessus et relancez."
    exit 1
  fi

  # ── Step 2/8: Configure PostgreSQL ───────────────────────────
  if ! run_step "2/8" "PostgreSQL — configuration" \
      "$VPS_DIR/setup_postgres.sh" "sudo"; then
    log_err "La configuration PostgreSQL a échoué."
    exit 1
  fi

  # ── Step 3/8: Configure Redis ─────────────────────────────────
  if ! run_step "3/8" "Redis — configuration" \
      "$VPS_DIR/setup_redis.sh" "sudo"; then
    log_err "La configuration Redis a échoué."
    exit 1
  fi

  # ── Step 4/8: Configure MinIO ─────────────────────────────────
  if ! run_step "4/8" "MinIO — configuration" \
      "$VPS_DIR/setup_minio.sh" "sudo"; then
    log_err "La configuration MinIO a échoué."
    exit 1
  fi

  # ── Step 5/8: Backend ─────────────────────────────────────────
  if ! run_step "5/8" "Backend NestJS + PM2" \
      "$VPS_DIR/setup_backend.sh" "user"; then
    log_err "Le déploiement du backend a échoué."
    log_err "Vérifiez: pm2 logs stockini-backend"
    exit 1
  fi

  # ── Step 6/8: Frontend ────────────────────────────────────────
  if ! run_step "6/8" "Frontend Next.js + PM2" \
      "$VPS_DIR/setup_frontend.sh" "user"; then
    log_err "Le déploiement du frontend a échoué."
    log_err "Vérifiez: pm2 logs stockini-frontend"
    exit 1
  fi

  # ── Step 7/8: Nginx ───────────────────────────────────────────
  if ! run_step "7/8" "Nginx (reverse proxy)" \
      "$VPS_DIR/setup_nginx.sh" "sudo"; then
    log_err "La configuration Nginx a échoué."
    log_err "Vérifiez: sudo nginx -t"
    exit 1
  fi

  # ── Step 8/8: SSL ─────────────────────────────────────────────
  echo ""
  separator
  echo -e "  ${BOLD}${MAGENTA}ÉTAPE 8/8${NC} │ ${BOLD}SSL Let's Encrypt${NC}"
  separator
  setup_ssl

  # ── Durée totale ──────────────────────────────────────────────
  END_TIME=$(date +%s)
  DURATION=$((END_TIME - START_TIME))
  MINUTES=$((DURATION / 60))
  SECONDS_REMAINING=$((DURATION % 60))

  show_summary

  echo -e "  ${DIM}⏱️  Durée totale: ${MINUTES}m ${SECONDS_REMAINING}s${NC}"
  echo ""
}

# ── Entry point ──────────────────────────────────────────────
main "$@"
