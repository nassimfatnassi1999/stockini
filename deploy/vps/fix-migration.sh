#!/bin/bash
set -euo pipefail

# =============================================================
# Stockini — Prisma Migration Recovery (P3009)
# =============================================================
# Usage: bash deploy/vps/fix-migration.sh
#
# Automatically resolves failed Prisma migrations by checking
# the actual database state. No interactive prompts.
#
# Logic per failed migration:
#   ADD COLUMN  → column exists?  yes → --applied
#                                  no  → run SQL + --applied
#   CREATE TABLE → table exists?  yes → --applied
#                                  no  → run SQL + --applied
#   Generic      → mark --rolled-back (migration retries on next deploy)
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

# ── Resolve project root ────────────────────────────────────
resolve_project_root() {
  local dir="$1"
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
  log_err "Cannot detect project root."
  exit 1
fi

BACKEND_DIR="$PROJECT_ROOT/backend"
ENV_FILE="$PROJECT_ROOT/.env"

echo ""
echo "============================================="
echo "  Stockini — Migration Recovery"
echo "  $(date '+%Y-%m-%d %H:%M:%S')"
echo "============================================="
echo ""

# ── Source .env ──────────────────────────────────────────────
if [ -f "$ENV_FILE" ]; then
  set -a; source "$ENV_FILE"; set +a
elif [ -f "$BACKEND_DIR/.env" ]; then
  ENV_FILE="$BACKEND_DIR/.env"
  set -a; source "$ENV_FILE"; set +a
else
  log_err ".env not found at $ENV_FILE or $BACKEND_DIR/.env"
  exit 1
fi
log_ok ".env loaded"

if [ -z "${DATABASE_URL:-}" ]; then
  log_err "DATABASE_URL is not set in .env"
  exit 1
fi

# Source nvm
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && source "$NVM_DIR/nvm.sh"

cd "$BACKEND_DIR"

# ── Step 1: Show migration status ───────────────────────────
log_info "Step 1: Current migration status"
echo ""
npx prisma migrate status 2>&1 || true
echo ""

# ── Step 2: Query _prisma_migrations for failed entries ─────
log_info "Step 2: Checking for failed migrations in database..."
echo ""

if ! command -v psql &>/dev/null; then
  log_err "psql not found. Install postgresql-client:"
  log_err "  sudo apt-get install -y postgresql-client"
  exit 1
fi

# Collect failed migration names into an array (avoids pipe stdin issue)
mapfile -t FAILED_MIGRATIONS < <(
  psql "$DATABASE_URL" -t -A -c \
    "SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NULL ORDER BY started_at;" \
    2>/dev/null || true
)

if [ ${#FAILED_MIGRATIONS[@]} -eq 0 ] || [ -z "${FAILED_MIGRATIONS[0]:-}" ]; then
  log_ok "No failed migrations detected in _prisma_migrations."
  echo ""
  log_info "Running prisma migrate deploy to apply any pending migrations..."
  npx prisma migrate deploy
  log_ok "Done!"
  exit 0
fi

log_warn "Found ${#FAILED_MIGRATIONS[@]} failed migration(s):"
for m in "${FAILED_MIGRATIONS[@]}"; do
  [ -n "$m" ] && log_warn "  • $m"
done
echo ""

# ── Step 3: Auto-resolve each failed migration ──────────────
RESOLVED=0
ERRORS=0

for MIGRATION in "${FAILED_MIGRATIONS[@]}"; do
  [ -z "$MIGRATION" ] && continue

  echo ""
  log_info "═══════════════════════════════════════════════════"
  log_info "  Resolving: $MIGRATION"
  log_info "═══════════════════════════════════════════════════"

  MIGRATION_FILE="$BACKEND_DIR/prisma/migrations/${MIGRATION}/migration.sql"
  if [ ! -f "$MIGRATION_FILE" ]; then
    log_err "Migration SQL file not found: $MIGRATION_FILE"
    log_err "Marking as rolled-back so it retries on next deploy."
    if npx prisma migrate resolve --rolled-back "$MIGRATION"; then
      log_ok "Marked as rolled-back."
      RESOLVED=$((RESOLVED + 1))
    else
      log_err "Could not resolve $MIGRATION — manual intervention needed."
      ERRORS=$((ERRORS + 1))
    fi
    continue
  fi

  echo ""
  log_info "SQL:"
  echo "────────────────────────────────────────"
  cat "$MIGRATION_FILE"
  echo ""
  echo "────────────────────────────────────────"
  echo ""

  # ── ADD COLUMN ────────────────────────────────────────────
  if grep -qi "ADD COLUMN" "$MIGRATION_FILE"; then
    TABLE=$(grep -oP 'ALTER TABLE\s+"?\K[^"\s]+' "$MIGRATION_FILE" | head -1 || true)
    COLUMN=$(grep -oP 'ADD COLUMN\s+(?:IF NOT EXISTS\s+)?"?\K[^"\s]+' "$MIGRATION_FILE" | head -1 || true)

    if [ -n "$TABLE" ] && [ -n "$COLUMN" ]; then
      log_info "Detected: ADD COLUMN \"$COLUMN\" on table \"$TABLE\""

      # Check if the table itself exists first — if not, the column can't exist either.
      # Mark as rolled-back so a baseline migration can create the table, then this
      # migration retries (ADD COLUMN IF NOT EXISTS becomes a no-op).
      TABLE_EXISTS=$(psql "$DATABASE_URL" -t -A -c \
        "SELECT table_name FROM information_schema.tables
         WHERE table_name='$TABLE' AND table_schema='public';" 2>/dev/null || echo "")

      if [ -z "$TABLE_EXISTS" ]; then
        log_warn "Table '$TABLE' does not exist — cannot add column yet."
        log_warn "Marking as rolled-back so it retries after missing tables are created."
        npx prisma migrate resolve --rolled-back "$MIGRATION"
        log_ok "Marked as rolled-back."
        RESOLVED=$((RESOLVED + 1))
      else
        COL_EXISTS=$(psql "$DATABASE_URL" -t -A -c \
          "SELECT column_name FROM information_schema.columns
           WHERE table_name='$TABLE' AND column_name='$COLUMN';" 2>/dev/null || echo "")

        if [ -n "$COL_EXISTS" ]; then
          log_ok "Column '$COLUMN' already exists in '$TABLE' — marking as applied."
          npx prisma migrate resolve --applied "$MIGRATION"
          log_ok "Migration '$MIGRATION' marked as applied."
          RESOLVED=$((RESOLVED + 1))
        else
          log_warn "Column '$COLUMN' does NOT exist in '$TABLE' — applying SQL now..."
          if psql "$DATABASE_URL" --set ON_ERROR_STOP=1 -f "$MIGRATION_FILE"; then
            log_ok "SQL applied successfully."
            npx prisma migrate resolve --applied "$MIGRATION"
            log_ok "Migration '$MIGRATION' marked as applied."
            RESOLVED=$((RESOLVED + 1))
          else
            log_err "SQL execution failed for '$MIGRATION'!"
            log_err "Fix the SQL issue manually, then re-run this script."
            ERRORS=$((ERRORS + 1))
          fi
        fi
      fi
    else
      log_warn "Could not parse table/column name from ADD COLUMN migration."
      log_warn "Marking as rolled-back so it retries cleanly on next deploy."
      npx prisma migrate resolve --rolled-back "$MIGRATION"
      log_ok "Marked as rolled-back."
      RESOLVED=$((RESOLVED + 1))
    fi

  # ── CREATE TABLE ─────────────────────────────────────────
  elif grep -qi "CREATE TABLE" "$MIGRATION_FILE"; then
    TABLE=$(grep -oP 'CREATE TABLE\s+(?:IF NOT EXISTS\s+)?"?\K[^"\s(]+' "$MIGRATION_FILE" | head -1 || true)

    if [ -n "$TABLE" ]; then
      log_info "Detected: CREATE TABLE \"$TABLE\""

      TABLE_EXISTS=$(psql "$DATABASE_URL" -t -A -c \
        "SELECT table_name FROM information_schema.tables
         WHERE table_name='$TABLE' AND table_schema='public';" 2>/dev/null || echo "")

      if [ -n "$TABLE_EXISTS" ]; then
        log_ok "Table '$TABLE' already exists — marking as applied."
        npx prisma migrate resolve --applied "$MIGRATION"
        log_ok "Migration '$MIGRATION' marked as applied."
        RESOLVED=$((RESOLVED + 1))
      else
        log_warn "Table '$TABLE' does NOT exist — applying SQL now..."
        if psql "$DATABASE_URL" --set ON_ERROR_STOP=1 -f "$MIGRATION_FILE"; then
          log_ok "SQL applied successfully."
          npx prisma migrate resolve --applied "$MIGRATION"
          log_ok "Migration '$MIGRATION' marked as applied."
          RESOLVED=$((RESOLVED + 1))
        else
          log_err "SQL execution failed for '$MIGRATION' (likely missing FK dependency)."
          log_warn "Cleaning up any partial objects and marking as rolled-back..."
          # Drop the primary table if it was partially created (e.g. FK failed mid-script)
          psql "$DATABASE_URL" -c "DROP TABLE IF EXISTS \"$TABLE\";" 2>/dev/null || true
          npx prisma migrate resolve --rolled-back "$MIGRATION"
          log_ok "Marked as rolled-back (will retry cleanly after dependencies exist)."
          RESOLVED=$((RESOLVED + 1))
        fi
      fi
    else
      log_warn "Could not parse table name. Marking as rolled-back."
      npx prisma migrate resolve --rolled-back "$MIGRATION"
      log_ok "Marked as rolled-back."
      RESOLVED=$((RESOLVED + 1))
    fi

  # ── Generic migration: mark rolled-back (safe retry) ─────
  else
    log_warn "Generic migration — cannot auto-detect DB state."
    log_warn "Marking as rolled-back so it retries cleanly on next deploy."
    npx prisma migrate resolve --rolled-back "$MIGRATION"
    log_ok "Marked as rolled-back."
    RESOLVED=$((RESOLVED + 1))
  fi
done

echo ""
log_info "Resolution summary: ${RESOLVED} resolved, ${ERRORS} errors."
echo ""

if [ "$ERRORS" -gt 0 ]; then
  log_err "Some migrations could not be resolved automatically."
  log_err "Fix the errors above, then re-run this script."
  exit 1
fi

# ── Step 4: Apply all remaining pending migrations ──────────
log_info "Step 4: Running prisma migrate deploy..."
echo ""

if npx prisma migrate deploy; then
  echo ""
  log_ok "All migrations applied successfully!"
else
  echo ""
  log_err "prisma migrate deploy still failing after recovery."
  log_err "Run 'npx prisma migrate status' for details."
  exit 1
fi

echo ""
log_ok "════════════════════════════════════"
log_ok "  Migration recovery complete!"
log_ok "════════════════════════════════════"
echo ""
log_info "You can now redeploy:"
echo "    bash deploy/vps/redeploy.sh"
echo "    OR: bash deploy/vps/monitor.sh  → option 10"
echo ""
