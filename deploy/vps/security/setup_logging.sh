#!/bin/bash
set -e

# =============================================================
# CRM Geodetection — Logging & Alerting (Step 7)
# =============================================================
# Run on VPS:  sudo bash deploy/scripts/7_setup_logging.sh
#
# Configures:
#   - Nginx access + error log rotation
#   - Suspicious activity monitoring script (cron)
#   - Optional email alerts via msmtp
# =============================================================

source "$(dirname "${BASH_SOURCE[0]}")/_common.sh"
require_root

echo ""
echo "========================================="
echo "  CRM Geodetection — Logging & Alerting"
echo "========================================="
echo ""

# ── 1. Create log directories ──────────────────────────────
mkdir -p /var/log/nginx
mkdir -p /var/log/crm-geodetection
log_ok "Log directories created"

# ── 2. Nginx log rotation ──────────────────────────────────
LOGROTATE_CONF="/etc/logrotate.d/crm-nginx"
cat > "$LOGROTATE_CONF" << 'EOF'
/var/log/nginx/*.log {
    daily
    missingok
    rotate 30
    compress
    delaycompress
    notifempty
    sharedscripts
    postrotate
        [ -s /run/nginx.pid ] && nginx -s reopen 2>/dev/null || true
    endscript
}
EOF
log_ok "Nginx log rotation configured (30 days)"

# ── 3. Security monitoring script ──────────────────────────
MONITOR_SCRIPT="/usr/local/bin/crm-security-monitor.sh"
cat > "$MONITOR_SCRIPT" << 'MONITOR'
#!/bin/bash
# =============================================================
# CRM Apprensur — Security Monitor (cron every 15min)
# =============================================================

LOG_DIR="/var/log/crm-geodetection"
ALERT_LOG="$LOG_DIR/security-alerts.log"
NGINX_LOG="/var/log/nginx/access.log"
AUTH_LOG="/var/log/auth.log"
TIMESTAMP=$(date "+%Y-%m-%d %H:%M:%S")

mkdir -p "$LOG_DIR"

# ── SSH brute force (last 15 min) ───────────────────────────
SSH_FAILS=$(grep "Failed password\|authentication failure" "$AUTH_LOG" 2>/dev/null | \
  awk -v d="$(date -d '15 minutes ago' '+%b %d %H:%M')" '$0 >= d' | wc -l)

if [ "$SSH_FAILS" -gt 10 ]; then
  echo "[$TIMESTAMP] ALERT: $SSH_FAILS SSH failures in last 15min" >> "$ALERT_LOG"
fi

# ── Nginx 4xx/5xx flood ─────────────────────────────────────
if [ -f "$NGINX_LOG" ]; then
  ERROR_REQUESTS=$(tail -1000 "$NGINX_LOG" 2>/dev/null | \
    awk '{print $9}' | grep -cE '^(4[0-9]{2}|5[0-9]{2})$' || true)

  if [ "$ERROR_REQUESTS" -gt 200 ]; then
    echo "[$TIMESTAMP] ALERT: $ERROR_REQUESTS error responses in recent nginx logs" >> "$ALERT_LOG"
  fi

  # ── Top IP (detect scan) ──────────────────────────────────
  TOP_IP=$(tail -5000 "$NGINX_LOG" 2>/dev/null | \
    awk '{print $1}' | sort | uniq -c | sort -rn | head -1)
  TOP_COUNT=$(echo "$TOP_IP" | awk '{print $1}')
  TOP_ADDR=$(echo "$TOP_IP" | awk '{print $2}')

  if [ "${TOP_COUNT:-0}" -gt 500 ]; then
    echo "[$TIMESTAMP] ALERT: IP $TOP_ADDR made $TOP_COUNT requests (possible scan)" >> "$ALERT_LOG"
  fi

  # ── CRM login failures ────────────────────────────────────
  LOGIN_FAILS=$(tail -2000 "$NGINX_LOG" 2>/dev/null | \
    grep "POST /api/auth/login" | awk '{print $9}' | grep -c "401" || true)

  if [ "$LOGIN_FAILS" -gt 20 ]; then
    echo "[$TIMESTAMP] ALERT: $LOGIN_FAILS failed CRM login attempts in recent logs" >> "$ALERT_LOG"
  fi
fi

# ── Fail2ban status ─────────────────────────────────────────
if command -v fail2ban-client &>/dev/null; then
  TOTAL_BANNED=$(fail2ban-client status 2>/dev/null | \
    grep "Jail list" | sed 's/.*://;s/,/\n/g' | \
    while read jail; do
      jail=$(echo "$jail" | tr -d '[:space:]')
      [ -n "$jail" ] && fail2ban-client status "$jail" 2>/dev/null | \
        grep "Currently banned" | awk '{print $NF}'
    done | paste -sd+ - | bc 2>/dev/null || echo 0)

  if [ "${TOTAL_BANNED:-0}" -gt 0 ]; then
    echo "[$TIMESTAMP] INFO: $TOTAL_BANNED IPs currently banned by Fail2ban" >> "$ALERT_LOG"
  fi
fi

# ── Daily summary (midnight) ────────────────────────────────
HOUR=$(date +%H)
MINUTE=$(date +%M)
if [ "$HOUR" = "00" ] && [ "$MINUTE" -lt "20" ]; then
  echo "[$TIMESTAMP] DAILY SUMMARY:" >> "$ALERT_LOG"
  echo "  - SSH failures (24h): $(grep "Failed password" "$AUTH_LOG" 2>/dev/null | wc -l)" >> "$ALERT_LOG"
  echo "  - Fail2ban banned: ${TOTAL_BANNED:-0}" >> "$ALERT_LOG"
  echo "  - Nginx errors (total): $(awk '{print $9}' "$NGINX_LOG" 2>/dev/null | grep -cE '^[45]' || echo 0)" >> "$ALERT_LOG"
fi
MONITOR

chmod +x "$MONITOR_SCRIPT"
log_ok "Security monitoring script created at $MONITOR_SCRIPT"

# ── 4. Install cron job (every 15 minutes) ──────────────────
CRON_LINE="*/15 * * * * $MONITOR_SCRIPT"
if crontab -l 2>/dev/null | grep -q "crm-security-monitor"; then
  log_ok "Cron job already exists"
else
  (crontab -l 2>/dev/null; echo "$CRON_LINE") | crontab -
  log_ok "Cron job installed (every 15 minutes)"
fi

# ── 5. Optional: email alerting via msmtp ───────────────────
echo ""
echo "Do you want to configure email alerts for security events?"
read -p "(requires SMTP credentials) (y/N): " SETUP_EMAIL

if [[ "$SETUP_EMAIL" =~ ^[yY]$ ]]; then
  if ! command -v msmtp &>/dev/null; then
    apt-get install -y msmtp msmtp-mta
  fi

  read -p "SMTP host (e.g. smtp-relay.brevo.com): " SMTP_HOST
  read -p "SMTP port (e.g. 587): " SMTP_PORT
  read -p "SMTP user: " SMTP_USER
  read -sp "SMTP password: " SMTP_PASS; echo
  read -p "From email: " FROM_EMAIL
  read -p "Alert email (to): " ALERT_EMAIL

  cat > /etc/msmtprc << MSMTP
defaults
auth           on
tls            on
tls_starttls   on
logfile        /var/log/msmtp.log

account        default
host           $SMTP_HOST
port           $SMTP_PORT
from           $FROM_EMAIL
user           $SMTP_USER
password       $SMTP_PASS
MSMTP

  chmod 600 /etc/msmtprc
  log_ok "msmtp configured"

  # Add email sending to the monitor script
  cat >> "$MONITOR_SCRIPT" << EMAILBLOCK

# ── Send alert email if new alerts ───────────────────────────
LAST_ALERT=\$(tail -1 "$LOG_DIR/security-alerts.log" 2>/dev/null | grep "ALERT" || true)
if [ -n "\$LAST_ALERT" ]; then
  echo -e "Subject: [CRM Security Alert] \$(hostname)\\n\\n\$LAST_ALERT" | \
    msmtp "$ALERT_EMAIL" 2>/dev/null || true
fi
EMAILBLOCK

  log_ok "Email alerts configured (to: $ALERT_EMAIL)"
else
  log_info "Email alerts skipped"
fi

echo ""
echo "========================================="
echo -e "${GREEN}  Logging & alerting setup complete!${NC}"
echo "========================================="
echo ""
echo "  Configured:"
echo "    ✅ Nginx log rotation (30 days)"
echo "    ✅ Security monitor (every 15min)"
echo "    ✅ Alert log: /var/log/crm-geodetection/security-alerts.log"
if [[ "$SETUP_EMAIL" =~ ^[yY]$ ]]; then
echo "    ✅ Email alerts to $ALERT_EMAIL"
fi
echo ""
echo "  View alerts:"
echo "    tail -f /var/log/crm-geodetection/security-alerts.log"
echo ""
