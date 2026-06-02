#!/bin/bash
set -e

# =============================================================
# Stockini — Nginx Setup (VPS)
# =============================================================
# Usage: sudo bash deploy/vps/setup_nginx.sh
#
# Copies nginx config, enables the site, tests and reloads.
# Nginx must already be installed. SSL is used automatically when
# certificates are present.
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

# ── Root check ───────────────────────────────────────────────
if [ "$EUID" -ne 0 ]; then
  log_err "Run this script as root: sudo bash $0"
  exit 1
fi

# ── Resolve paths ───────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NGINX_CONF_SRC="$SCRIPT_DIR/nginx-stockini-msp.conf"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
ENV_FILE="$PROJECT_ROOT/.env"
SITE_NAME="stockini-msp.tn"
if [ -f "$ENV_FILE" ]; then
  ENV_DOMAIN=$(grep -E '^DOMAIN=' "$ENV_FILE" 2>/dev/null | head -1 | cut -d= -f2 | tr -d '[:space:]"'"'"'')
  [ -n "$ENV_DOMAIN" ] && SITE_NAME="$ENV_DOMAIN"
fi
NGINX_AVAILABLE="/etc/nginx/sites-available/$SITE_NAME"
NGINX_ENABLED="/etc/nginx/sites-enabled/$SITE_NAME"

echo ""
echo "========================================="
echo "  Stockini — Nginx Setup"
echo "========================================="
echo ""

# ── 1. Verify nginx is installed ───────────────────────────
if ! command -v nginx &>/dev/null; then
  log_err "Nginx is not installed. Install it first: sudo apt install nginx"
  exit 1
fi
log_ok "Nginx installed ($(nginx -v 2>&1 | cut -d/ -f2))"

# ── 2. Check SSL certificates ─────────────────────────────
SSL_CERT="/etc/letsencrypt/live/$SITE_NAME/fullchain.pem"
SSL_KEY="/etc/letsencrypt/live/$SITE_NAME/privkey.pem"

SSL_ENABLED=1
if [ ! -f "$SSL_CERT" ] || [ ! -f "$SSL_KEY" ]; then
  SSL_ENABLED=0
  log_warn "SSL certificates not found for $SITE_NAME. Installing HTTP-only config first."
else
  log_ok "SSL certificates found"
fi

# ── 3. Verify frontend is running ─────────────────────────
if curl -s http://127.0.0.1:3000 > /dev/null 2>&1; then
  log_ok "Frontend is running on port 3000"
else
  log_warn "Frontend not responding on port 3000"
  log_warn "Run setup_frontend.sh first, or / will fail"
fi

# ── 4. Verify backend is running ──────────────────────────
if curl -s http://127.0.0.1:3001/health > /dev/null 2>&1; then
  log_ok "Backend is running on port 3001"
else
  log_warn "Backend not responding on port 3001"
  log_warn "Run setup_backend.sh first, or API calls will fail"
fi

# ── 5. Backup existing config ─────────────────────────────
if [ -f "$NGINX_AVAILABLE" ]; then
  BACKUP="$NGINX_AVAILABLE.backup.$(date +%Y%m%d_%H%M%S)"
  cp "$NGINX_AVAILABLE" "$BACKUP"
  log_info "Existing config backed up to: $BACKUP"
fi

# ── 6. Install config ─────────────────────────────────────
if [ ! -f "$NGINX_CONF_SRC" ]; then
  log_err "Source config not found: $NGINX_CONF_SRC"
  exit 1
fi

if [ "$SSL_ENABLED" -eq 1 ]; then
  sed "s/stockini-msp.tn/$SITE_NAME/g" "$NGINX_CONF_SRC" > "$NGINX_AVAILABLE"
  log_ok "HTTPS config written to $NGINX_AVAILABLE"
else
  cat > "$NGINX_AVAILABLE" <<HTTP_ONLY
server {
    listen 80;
    server_name $SITE_NAME www.$SITE_NAME;

    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:3001/api/;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        client_max_body_size 50M;
    }

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
HTTP_ONLY
  log_ok "HTTP-only config written to $NGINX_AVAILABLE"
fi

# ── 7. Enable site ────────────────────────────────────────
ln -sf "$NGINX_AVAILABLE" "$NGINX_ENABLED"
log_ok "Site enabled: $NGINX_ENABLED"

# Remove default site if it exists
if [ -f "/etc/nginx/sites-enabled/default" ]; then
  rm -f /etc/nginx/sites-enabled/default
  log_info "Removed default site"
fi

# ── 8. Test nginx config ──────────────────────────────────
log_info "Testing nginx configuration..."
if nginx -t 2>&1; then
  log_ok "Nginx config test passed"
else
  log_err "Nginx config test FAILED — restoring backup"
  if [ -n "${BACKUP:-}" ] && [ -f "$BACKUP" ]; then
    cp "$BACKUP" "$NGINX_AVAILABLE"
    log_info "Backup restored"
  fi
  exit 1
fi

# ── 9. Reload nginx ───────────────────────────────────────
systemctl reload nginx
log_ok "Nginx reloaded"

# ── Summary ────────────────────────────────────────────────
echo ""
echo "========================================="
echo -e "${GREEN}  Nginx setup complete!${NC}"
echo "========================================="
echo ""
if [ "$SSL_ENABLED" -eq 1 ]; then
  echo "  Site:     https://$SITE_NAME"
else
  echo "  Site:     http://$SITE_NAME (run deploy/setup.sh or certbot, then rerun setup_nginx.sh for HTTPS)"
fi
echo "  Config:   $NGINX_AVAILABLE"
echo "  Frontend: 127.0.0.1:3000       → /"
echo "  Backend:  127.0.0.1:3001       → /api/"
echo ""
echo "  Test:     curl -I https://$SITE_NAME"
echo ""
