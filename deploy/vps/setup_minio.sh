#!/bin/bash
set -euo pipefail

# =============================================================
# Stockini — MinIO Setup (VPS, no Docker)
# =============================================================
# Usage: sudo bash deploy/vps/setup_minio.sh
# =============================================================

RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

log_ok()   { echo -e "${GREEN}[OK]${NC} $1"; }
log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_err()  { echo -e "${RED}[ERR]${NC} $1"; }

if [ "$EUID" -ne 0 ]; then
  log_err "Run as root: sudo bash deploy/vps/setup_minio.sh"
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
ENV_FILE="$PROJECT_ROOT/.env"

if [ ! -f "$ENV_FILE" ]; then
  log_err ".env not found at $ENV_FILE"
  exit 1
fi

set -a
source "$ENV_FILE"
set +a

MINIO_ACCESS_KEY="${MINIO_ACCESS_KEY:?MINIO_ACCESS_KEY is required in .env}"
MINIO_SECRET_KEY="${MINIO_SECRET_KEY:?MINIO_SECRET_KEY is required in .env}"
MINIO_BUCKET="${MINIO_BUCKET:-generated-documents}"

if [[ "$MINIO_ACCESS_KEY" == CHANGE_ME* ]] || [[ "$MINIO_SECRET_KEY" == CHANGE_ME* ]]; then
  log_err "Replace MINIO_ACCESS_KEY and MINIO_SECRET_KEY in .env before running this script."
  exit 1
fi

install_binary() {
  local name="$1"
  local url="$2"
  if command -v "$name" >/dev/null 2>&1; then
    log_ok "$name already installed"
    return
  fi
  log_info "Installing $name..."
  curl -fsSL "$url" -o "/usr/local/bin/$name"
  chmod +x "/usr/local/bin/$name"
  log_ok "$name installed"
}

install_binary minio https://dl.min.io/server/minio/release/linux-amd64/minio
install_binary mc https://dl.min.io/client/mc/release/linux-amd64/mc

id -u minio-user >/dev/null 2>&1 || useradd --system --home /var/lib/minio --shell /usr/sbin/nologin minio-user
mkdir -p /var/lib/minio /etc/minio
chown -R minio-user:minio-user /var/lib/minio /etc/minio

cat >/etc/default/minio <<MINIO_ENV
MINIO_VOLUMES="/var/lib/minio"
MINIO_OPTS="--address :9000 --console-address :9001"
MINIO_ROOT_USER="$MINIO_ACCESS_KEY"
MINIO_ROOT_PASSWORD="$MINIO_SECRET_KEY"
MINIO_ENV
chmod 600 /etc/default/minio

cat >/etc/systemd/system/minio.service <<'MINIO_SERVICE'
[Unit]
Description=MinIO object storage
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
systemctl enable --now minio
log_ok "MinIO service started"

log_info "Creating bucket '$MINIO_BUCKET' if missing..."
for _ in $(seq 1 20); do
  if mc alias set local http://127.0.0.1:9000 "$MINIO_ACCESS_KEY" "$MINIO_SECRET_KEY" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

mc mb --ignore-existing "local/$MINIO_BUCKET"
log_ok "Bucket ready: $MINIO_BUCKET"
