#!/bin/bash

# =============================================================
# CRM Geodetection — Automated DB Backup (Every 3 Days)
# =============================================================
# Usage:
#   To run the backup manually: bash deploy/cron-backup-db.sh
#   To setup the cronjob: bash deploy/cron-backup-db.sh --setup
# =============================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
BACKUP_DIR="/home/ubuntu/backup-automatique-db"
BACKUP_FILE="$BACKUP_DIR/backup.sql"

# ── 1. Setup Cron Job ────────────────────────────────────────
if [ "$1" == "--setup" ]; then
    echo "Configuring cron job to run every 3 days..."
    
    # Ensure script is executable
    chmod +x "$SCRIPT_DIR/cron-backup-db.sh"
    
    # Cron expression: 0 2 */3 * * (Run at 02:00 AM every 3 days)
    CRON_CMD="0 2 */3 * * $SCRIPT_DIR/cron-backup-db.sh >> $BACKUP_DIR/backup.log 2>&1"
    
    # Check if already in crontab
    if crontab -l 2>/dev/null | grep -F "cron-backup-db.sh" >/dev/null; then
        echo "Cron job already exists."
    else
        # Add to crontab
        (crontab -l 2>/dev/null; echo "$CRON_CMD") | crontab -
        echo "Cron job added successfully. Backup will run every 3 days at 02:00 AM."
    fi
    exit 0
fi

# ── 2. Perform Backup ────────────────────────────────────────

echo "[$(date)] Starting automated backup..."

# Create backup directory if it does not exist (restrict permissions)
mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

# Resolve .env to get DB name
if [ -f "$PROJECT_ROOT/.env" ]; then
    ENV_FILE="$PROJECT_ROOT/.env"
elif [ -f "$PROJECT_ROOT/backend/.env" ]; then
    ENV_FILE="$PROJECT_ROOT/backend/.env"
elif [ -f "$PROJECT_ROOT/deploy/vps/.env.prod.vps" ]; then
    ENV_FILE="$PROJECT_ROOT/deploy/vps/.env.prod.vps"
else
    echo "[$(date)] Error: .env file not found."
    exit 1
fi

# Load variables safely
set -a; source "$ENV_FILE" 2>/dev/null; set +a

DB_NAME_VAL="${DB_NAME:-geodetection_crm}"

# Overwrite the latest backup (only one backup is stored, naming it backup.sql)
if sudo -u postgres pg_dump -Fc "$DB_NAME_VAL" > "$BACKUP_FILE" 2>/dev/null; then
    # Restrict backup file permissions
    chmod 600 "$BACKUP_FILE"

    # Encrypt backup if GPG key is available
    if command -v gpg &>/dev/null && [ -n "${BACKUP_GPG_RECIPIENT:-}" ]; then
        gpg --batch --yes --recipient "$BACKUP_GPG_RECIPIENT" --encrypt "$BACKUP_FILE" 2>/dev/null
        if [ -f "${BACKUP_FILE}.gpg" ]; then
            rm -f "$BACKUP_FILE"
            chmod 600 "${BACKUP_FILE}.gpg"
            BACKUP_SIZE=$(du -sh "${BACKUP_FILE}.gpg" | cut -f1)
            echo "[$(date)] Backup successful (encrypted): ${BACKUP_FILE}.gpg ($BACKUP_SIZE)"
        else
            BACKUP_SIZE=$(du -sh "$BACKUP_FILE" | cut -f1)
            echo "[$(date)] Backup successful (unencrypted — GPG encryption failed): $BACKUP_FILE ($BACKUP_SIZE)"
        fi
    else
        BACKUP_SIZE=$(du -sh "$BACKUP_FILE" | cut -f1)
        echo "[$(date)] Backup successful: $BACKUP_FILE ($BACKUP_SIZE)"
        echo "[$(date)] WARNING: Backup is NOT encrypted. Set BACKUP_GPG_RECIPIENT env var for encryption."
    fi
else
    echo "[$(date)] Error during backup."
    exit 1
fi
