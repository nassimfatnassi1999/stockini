#!/bin/bash
set -e

# =============================================================
# Stockini — Redis Setup (VPS)
# =============================================================
# Usage: sudo bash deploy/vps/setup_redis.sh
#
# Installs and configures Redis server directly on the VPS.
# Must be run as root/sudo.
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

if [ "$EUID" -ne 0 ]; then
  log_err "Please run as root (or with sudo)"
  exit 1
fi

echo ""
echo "========================================="
echo "  Stockini — Redis Setup"
echo "========================================="
echo ""

# ── Load .env ────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
ENV_FILE="$PROJECT_ROOT/.env"

if [ -f "$ENV_FILE" ]; then
  set -a
  source "$ENV_FILE"
  set +a
else
  log_warn ".env not found at $ENV_FILE; Redis password will be generated."
fi

log_info "Installing Redis Server..."
apt-get update -y -qq
apt-get install -y -qq redis-server

log_info "Configuring Redis..."

# Bind to localhost only (security)
if grep -qE '^bind ' /etc/redis/redis.conf; then
  sed -i 's/^bind .*/bind 127.0.0.1/' /etc/redis/redis.conf
else
  echo "bind 127.0.0.1" >> /etc/redis/redis.conf
fi
log_ok "Redis: bind 127.0.0.1"

# maxmemory: remove any existing line (commented or not) then append clean value
sed -i '/^[# ]*maxmemory[^-]/d' /etc/redis/redis.conf
echo "maxmemory 256mb" >> /etc/redis/redis.conf

# maxmemory-policy: same approach
sed -i '/^[# ]*maxmemory-policy /d' /etc/redis/redis.conf
echo "maxmemory-policy allkeys-lru" >> /etc/redis/redis.conf

log_ok "Redis: maxmemory=256mb, policy=allkeys-lru"

# Set Redis authentication password
REDIS_PASS="${REDIS_PASSWORD:-}"
if [ -z "$REDIS_PASS" ] || [[ "$REDIS_PASS" == CHANGE_ME* ]]; then
  REDIS_PASS="$(openssl rand -base64 32)"
fi
# Remove any existing requirepass line and add new one
sed -i '/^requirepass /d' /etc/redis/redis.conf
echo "requirepass $REDIS_PASS" >> /etc/redis/redis.conf
log_ok "Redis password configured."

if [ -f "$ENV_FILE" ]; then
  if grep -q '^REDIS_PASSWORD=' "$ENV_FILE"; then
    sed -i "s|^REDIS_PASSWORD=.*|REDIS_PASSWORD=$REDIS_PASS|" "$ENV_FILE"
  else
    echo "REDIS_PASSWORD=$REDIS_PASS" >> "$ENV_FILE"
  fi

  if grep -q '^REDIS_URL=' "$ENV_FILE"; then
    sed -i "s|^REDIS_URL=.*|REDIS_URL=redis://:$REDIS_PASS@localhost:6379|" "$ENV_FILE"
  else
    echo "REDIS_URL=redis://:$REDIS_PASS@localhost:6379" >> "$ENV_FILE"
  fi
  log_ok ".env updated with REDIS_PASSWORD and REDIS_URL"
else
  log_info "Use this in .env: REDIS_URL=redis://:${REDIS_PASS}@localhost:6379"
fi

log_info "Restarting and enabling Redis service..."
systemctl restart redis-server
systemctl enable redis-server

if systemctl is-active --quiet redis-server; then
  log_ok "Redis is active and running!"
else
  log_err "Redis failed to start."
  exit 1
fi

echo ""
echo "========================================="
echo -e "${GREEN}  Redis setup complete!${NC}"
echo "========================================="
echo ""
