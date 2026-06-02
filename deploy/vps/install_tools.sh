#!/bin/bash
set -euo pipefail

# =============================================================
# Stockini — VPS tools installer (no production Docker)
# =============================================================
# Usage: sudo bash deploy/vps/install_tools.sh
#
# Installs the system tools required to run production directly
# on the VPS: Node.js 20, PM2, PostgreSQL 16, Redis, Nginx,
# Certbot, and MinIO. (PDFs are generated with pdfkit — no
# Chromium/Puppeteer needed.)
# =============================================================

RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_ok()   { echo -e "${GREEN}[OK]${NC} $1"; }
log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_err()  { echo -e "${RED}[ERR]${NC} $1"; }

if [ "$EUID" -ne 0 ]; then
  log_err "Run as root: sudo bash deploy/vps/install_tools.sh"
  exit 1
fi

if [ -f /etc/os-release ]; then
  . /etc/os-release
  if [ "${ID:-}" != "ubuntu" ] && [ "${ID_LIKE:-}" != "ubuntu" ]; then
    log_warn "This script is tested on Ubuntu 22.04/24.04. Detected: ${PRETTY_NAME:-unknown}"
  fi
fi

export DEBIAN_FRONTEND=noninteractive

install_base_packages() {
  log_info "Installing base packages..."
  apt-get update -y
  apt-get install -y \
    ca-certificates curl gnupg lsb-release software-properties-common \
    git build-essential make openssl unzip rsync lsof htop logrotate \
    nginx certbot python3-certbot-nginx ufw fail2ban
  log_ok "Base packages installed"
}

install_node() {
  if command -v node >/dev/null 2>&1 && node -v | grep -q '^v20\.'; then
    log_ok "Node.js $(node -v) already installed"
  else
    log_info "Installing Node.js 20..."
    install -d -m 0755 /etc/apt/keyrings
    curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key \
      | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg
    echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_20.x nodistro main" \
      > /etc/apt/sources.list.d/nodesource.list
    apt-get update -y
    apt-get install -y nodejs
    log_ok "Node.js $(node -v) installed"
  fi

  if command -v pm2 >/dev/null 2>&1; then
    log_ok "PM2 $(pm2 -v) already installed"
  else
    log_info "Installing PM2..."
    npm install -g pm2
    log_ok "PM2 installed"
  fi
}

install_postgres() {
  if command -v psql >/dev/null 2>&1; then
    log_ok "PostgreSQL client already installed ($(psql --version | awk '{print $3}'))"
    systemctl enable --now postgresql >/dev/null 2>&1 || true
    return
  fi

  log_info "Installing PostgreSQL 16..."
  install -d -m 0755 /etc/apt/keyrings
  curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc \
    | gpg --dearmor -o /etc/apt/keyrings/postgresql.gpg
  echo "deb [signed-by=/etc/apt/keyrings/postgresql.gpg] http://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" \
    > /etc/apt/sources.list.d/pgdg.list
  apt-get update -y
  apt-get install -y postgresql-16 postgresql-client-16
  systemctl enable --now postgresql
  log_ok "PostgreSQL 16 installed"
}

install_redis() {
  log_info "Installing Redis..."
  apt-get install -y redis-server
  systemctl enable --now redis-server
  log_ok "Redis installed"
}

install_minio() {
  if command -v minio >/dev/null 2>&1; then
    log_ok "MinIO already installed"
  else
    log_info "Installing MinIO server..."
    curl -fsSL https://dl.min.io/server/minio/release/linux-amd64/minio \
      -o /usr/local/bin/minio
    chmod +x /usr/local/bin/minio
    log_ok "MinIO server installed"
  fi

  if command -v mc >/dev/null 2>&1; then
    log_ok "MinIO client already installed"
  else
    log_info "Installing MinIO client..."
    curl -fsSL https://dl.min.io/client/mc/release/linux-amd64/mc \
      -o /usr/local/bin/mc
    chmod +x /usr/local/bin/mc
    log_ok "MinIO client installed"
  fi

  id -u minio-user >/dev/null 2>&1 || useradd --system --home /var/lib/minio --shell /usr/sbin/nologin minio-user
  mkdir -p /var/lib/minio /etc/minio
  chown -R minio-user:minio-user /var/lib/minio /etc/minio

  if [ ! -f /etc/default/minio ]; then
    cat >/etc/default/minio <<'MINIO_ENV'
MINIO_VOLUMES="/var/lib/minio"
MINIO_OPTS="--address :9000 --console-address :9001"
MINIO_ROOT_USER="CHANGE_ME_MINIO_ACCESS_KEY"
MINIO_ROOT_PASSWORD="CHANGE_ME_MINIO_SECRET_KEY"
MINIO_ENV
    chmod 600 /etc/default/minio
    log_warn "Edit /etc/default/minio and replace CHANGE_ME values before exposing MinIO."
  fi

  cat >/etc/systemd/system/minio.service <<'MINIO_SERVICE'
[Unit]
Description=MinIO object storage
Documentation=https://min.io/docs/minio/linux/index.html
Wants=network-online.target
After=network-online.target

[Service]
User=minio-user
Group=minio-user
EnvironmentFile=/etc/default/minio
ExecStart=/usr/local/bin/minio server $MINIO_OPTS $MINIO_VOLUMES
Restart=always
LimitNOFILE=65536

[Install]
WantedBy=multi-user.target
MINIO_SERVICE

  systemctl daemon-reload
  systemctl enable minio
  log_ok "MinIO service installed. Start after setting credentials: sudo systemctl restart minio"
}

install_base_packages
install_node
install_postgres
install_redis
install_minio

systemctl enable --now nginx
systemctl enable fail2ban >/dev/null 2>&1 || true

echo ""
log_ok "VPS tools installed without production Docker Compose."
echo "Next:"
echo "  1. cp deploy/vps/.env.prod.vps .env && nano .env"
echo "  2. sudo bash deploy/vps/setup_postgres.sh"
echo "  3. sudo bash deploy/vps/setup_redis.sh"
echo "  4. sudo systemctl restart minio"
echo "  5. bash deploy/vps/setup_backend.sh"
echo "  6. bash deploy/vps/setup_frontend.sh"
echo "  7. sudo bash deploy/vps/setup_nginx.sh"
