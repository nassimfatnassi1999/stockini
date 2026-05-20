#!/bin/bash
set -e

# =============================================================
# CRM Geodetection — PostgreSQL Setup (VPS)
# =============================================================
# Usage: sudo bash deploy/vps/setup_postgres.sh
#
# Installs PostgreSQL 16, creates user + database.
# Reads DB_USER, DB_PASSWORD, DB_NAME from deploy/.env
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

# ── Resolve project root ────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# ── Load .env ────────────────────────────────────────────────
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
source "$ENV_FILE"

DB_USER="${DB_USER:?DB_USER is required in .env}"
DB_PASSWORD="${DB_PASSWORD:?DB_PASSWORD is required in .env}"
DB_NAME="${DB_NAME:?DB_NAME is required in .env}"

echo ""
echo "========================================="
echo "  CRM Geodetection — PostgreSQL Setup"
echo "========================================="
echo ""

# ── 1. Install PostgreSQL 16 ────────────────────────────────
if command -v psql &>/dev/null; then
  PG_VERSION=$(psql --version | grep -oP '\d+' | head -1)
  log_ok "PostgreSQL $PG_VERSION already installed"
else
  log_info "Installing PostgreSQL 16..."
  apt-get update -y
  apt-get install -y gnupg2 lsb-release
  install -d -m 0755 /etc/apt/keyrings
  curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc \
    | gpg --dearmor -o /etc/apt/keyrings/postgresql.gpg
  echo "deb [signed-by=/etc/apt/keyrings/postgresql.gpg] http://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" \
    > /etc/apt/sources.list.d/pgdg.list
  apt-get update -y
  apt-get install -y postgresql-16 postgresql-client-16
  systemctl enable postgresql
  systemctl start postgresql
  log_ok "PostgreSQL 16 installed and started"
fi

# ── 1.5. Prompt for DB Reset ────────────────────────────────
echo ""
echo -e "${RED}${BOLD}  ╔══════════════════════════════════════════════════════╗${NC}"
echo -e "${RED}${BOLD}  ║  DANGER : RÉINITIALISATION BASE DE DONNÉES           ║${NC}"
echo -e "${RED}${BOLD}  ║  Toutes les données seront DÉFINITIVEMENT perdues.   ║${NC}"
echo -e "${RED}${BOLD}  ║  N'utilisez JAMAIS cette option lors d'un redeploy.  ║${NC}"
echo -e "${RED}${BOLD}  ╚══════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${YELLOW}  Pour confirmer, tapez exactement :  RESET${NC}"
echo -e "${YELLOW}  Tout autre saisie annule l'opération.${NC}"
echo ""
read -rp "  Confirmation : " RESET_CONFIRM
if [ "$RESET_CONFIRM" = "RESET" ]; then
  log_warn "Suppression de la base et de l'utilisateur..."
  sudo -u postgres psql -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$DB_NAME';" &>/dev/null || true
  sudo -u postgres psql -c "DROP DATABASE IF EXISTS $DB_NAME;"
  sudo -u postgres psql -c "DROP USER IF EXISTS $DB_USER;"
  log_ok "Base et utilisateur supprimés."
else
  log_ok "Réinitialisation annulée — les données existantes sont conservées."
fi


# ── 2. Create user ──────────────────────────────────────────
log_info "Creating PostgreSQL user '$DB_USER'..."
if sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='$DB_USER'" | grep -q 1; then
  log_ok "User '$DB_USER' already exists"
  # Update password anyway
  sudo -u postgres psql -c "ALTER USER $DB_USER WITH PASSWORD '$DB_PASSWORD';"
  log_ok "Password updated for '$DB_USER'"
else
  sudo -u postgres psql -c "CREATE USER $DB_USER WITH PASSWORD '$DB_PASSWORD';"
  log_ok "User '$DB_USER' created"
fi

# ── 3. Create database ─────────────────────────────────────
log_info "Creating database '$DB_NAME'..."
if sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='$DB_NAME'" | grep -q 1; then
  log_ok "Database '$DB_NAME' already exists"
else
  sudo -u postgres psql -c "CREATE DATABASE $DB_NAME OWNER $DB_USER;"
  log_ok "Database '$DB_NAME' created"
fi

# ── 4. Grant privileges ────────────────────────────────────
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;"
sudo -u postgres psql -d "$DB_NAME" -c "GRANT ALL ON SCHEMA public TO $DB_USER;"
log_ok "All privileges granted to '$DB_USER' on '$DB_NAME'"

# ── 5. Auto-Update DATABASE_URL in .env ────────────────────
log_info "Updating DATABASE_URL in .env with URL-encoded password..."
# Function to urlencode strings
urlencode() {
  local string="${1}"
  local strlen=${#string}
  local encoded=""
  local pos c o
  for (( pos=0 ; pos<strlen ; pos++ )); do
     c=${string:$pos:1}
     case "$c" in
        [-_.~a-zA-Z0-9] ) o="${c}" ;;
        * )               printf -v o '%%%02x' "'$c"
     esac
     encoded+="${o}"
  done
  echo "${encoded}"
}

ENCODED_PASSWORD=$(urlencode "$DB_PASSWORD")
NEW_DATABASE_URL="postgresql://${DB_USER}:${ENCODED_PASSWORD}@localhost:5432/${DB_NAME}"

# Replace the specific DATABASE_URL line
sed -i "s|^DATABASE_URL=.*|DATABASE_URL=$NEW_DATABASE_URL|" "$ENV_FILE"
log_ok "DATABASE_URL properly encoded and injected into .env"

# ── 6. Verify connection ───────────────────────────────────
log_info "Verifying connection..."
if PGPASSWORD="$DB_PASSWORD" psql -h localhost -U "$DB_USER" -d "$DB_NAME" -c "SELECT 1;" &>/dev/null; then
  log_ok "Connection successful: $DB_USER@localhost/$DB_NAME"
else
  log_err "Connection failed. Check pg_hba.conf for md5/scram-sha-256 auth on localhost"
  log_err "File: /etc/postgresql/16/main/pg_hba.conf"
  log_err "Ensure this line exists: host all all 127.0.0.1/32 md5"
  exit 1
fi

# ── Summary ─────────────────────────────────────────────────
echo ""
echo "========================================="
echo -e "${GREEN}  PostgreSQL setup complete!${NC}"
echo "========================================="
echo ""
echo "  User:     $DB_USER"
echo "  Database: $DB_NAME"
echo "  Host:     localhost:5432"
echo ""
echo "  Next: bash deploy/vps/setup_backend.sh"
echo ""
