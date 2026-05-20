#!/bin/bash

# =============================================================
# CRM Geodetection — Add Admin User
# =============================================================
# Usage: bash deploy/vps/add_user.sh
# =============================================================

RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

log_ok()  { echo -e "${GREEN}[✓]${NC} $1"; }
log_info(){ echo -e "${BLUE}[INFO]${NC} $1"; }
log_err() { echo -e "${RED}[✗]${NC} $1"; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
ENV_FILE="$PROJECT_ROOT/.env"

set -a; source "$ENV_FILE"; set +a

export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && source "$NVM_DIR/nvm.sh"

echo ""
echo "========================================="
echo "  CRM Geodetection — Add Admin User"
echo "========================================="
echo ""

# Email
read -rp "  Email: " EMAIL
[ -z "$EMAIL" ] && { log_err "Email required"; exit 1; }

# Check doublon (using psql variables to prevent SQL injection)
EXISTS=$(PGPASSWORD="$DB_PASSWORD" psql -h localhost -U "$DB_USER" -d "$DB_NAME" -tAc \
  "SELECT COUNT(*) FROM users WHERE email = \$1;" --set="1=$EMAIL" 2>/dev/null | tr -d '[:space:]')
if [ -z "$EXISTS" ]; then
  # Fallback: use dollar-quoting to safely escape the value
  SAFE_EMAIL=$(printf '%s' "$EMAIL" | sed "s/'/''/g")
  EXISTS=$(PGPASSWORD="$DB_PASSWORD" psql -h localhost -U "$DB_USER" -d "$DB_NAME" -tAc \
    "SELECT COUNT(*) FROM users WHERE email = '$SAFE_EMAIL';" 2>/dev/null | tr -d '[:space:]')
fi
[ "$EXISTS" = "1" ] && { log_err "Email '$EMAIL' already exists"; exit 1; }

# Password
while true; do
  read -rsp "  Password: " PASSWORD; echo ""
  [ ${#PASSWORD} -lt 6 ] && { log_err "Min 6 characters"; continue; }
  read -rsp "  Confirm:  " CONFIRM; echo ""
  [ "$PASSWORD" = "$CONFIRM" ] && break
  log_err "Passwords do not match"
done

# Hash avec bcrypt (pass password via stdin to avoid ps aux exposure)
log_info "Hashing password..."
HASH=$(printf '%s' "$PASSWORD" | node -e "const b=require('$PROJECT_ROOT/backend/node_modules/bcrypt');let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>process.stdout.write(b.hashSync(d,10)))" 2>/dev/null)
[ -z "$HASH" ] && { log_err "bcrypt failed"; exit 1; }

# UUID
UUID=$(cat /proc/sys/kernel/random/uuid 2>/dev/null || node -e "process.stdout.write(require('crypto').randomUUID())")

# Insert (escape single quotes in HASH to prevent injection)
SAFE_EMAIL=$(printf '%s' "$EMAIL" | sed "s/'/''/g")
SAFE_HASH=$(printf '%s' "$HASH" | sed "s/'/''/g")
PGPASSWORD="$DB_PASSWORD" psql -h localhost -U "$DB_USER" -d "$DB_NAME" -c "
  INSERT INTO users (id, email, password, \"firstName\", \"lastName\", role, active, \"failedLoginAttempts\", \"createdAt\", \"updatedAt\")
  VALUES ('$UUID', '$SAFE_EMAIL', '$SAFE_HASH', 'Admin', 'CRM', 'ADMIN', true, 0, NOW(), NOW());
" 2>&1

echo ""
log_ok "Admin user created!"
echo ""
echo "  Email: $EMAIL"
echo "  Role:  ADMIN"
echo "  URL:   https://${DOMAIN:-stockini-msp.tn}"
echo ""
