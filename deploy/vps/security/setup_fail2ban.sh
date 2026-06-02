#!/bin/bash
set -e

# =============================================================
# Stockini — Fail2ban Setup (Step 6)
# =============================================================
# Run on VPS:  sudo bash deploy/scripts/6_setup_fail2ban.sh
#
# ⚡ This is the SINGLE source of truth for Fail2ban.
#    No other script installs or configures Fail2ban.
#
# Protects against:
#   - SSH brute force (ban after 5 attempts, 1h)
#   - Nginx brute force / scanning (ban after 10 attempts, 10min)
#   - Stockini login brute force (ban after 5 attempts, 30min)
# =============================================================

source "$(dirname "${BASH_SOURCE[0]}")/_common.sh"
require_root

echo ""
echo "========================================="
echo "  Stockini — Fail2ban Setup"
echo "========================================="
echo ""

# ── 1. Install fail2ban ──────────────────────────────────────
if command -v fail2ban-client &>/dev/null; then
  log_ok "Fail2ban already installed"
else
  log_info "Installing fail2ban..."
  apt-get update -y
  apt-get install -y fail2ban
  log_ok "Fail2ban installed"
fi

# ── 2. Create local jail config (overrides defaults) ─────────
JAIL_LOCAL="/etc/fail2ban/jail.local"

cat > "$JAIL_LOCAL" << 'EOF'
# =============================================================
# Stockini — Fail2ban Jails
# =============================================================

[DEFAULT]
bantime  = 3600
findtime = 600
maxretry = 5
banaction = iptables-multiport

# ── SSH Protection ───────────────────────────────────────────
[sshd]
enabled  = true
port     = ssh
filter   = sshd
logpath  = /var/log/auth.log
maxretry = 5
bantime  = 3600
findtime = 600

[sshd-aggressive]
enabled  = true
port     = ssh
filter   = sshd[mode=aggressive]
logpath  = /var/log/auth.log
maxretry = 3
bantime  = 86400
findtime = 3600

# ── Nginx Protection ────────────────────────────────────────
[nginx-botsearch]
enabled  = true
port     = http,https
filter   = nginx-botsearch
logpath  = /var/log/nginx/access.log
maxretry = 10
bantime  = 600
findtime = 600

[nginx-badbots]
enabled  = true
port     = http,https
filter   = nginx-badbots
logpath  = /var/log/nginx/access.log
maxretry = 2
bantime  = 86400

[nginx-http-auth]
enabled  = true
port     = http,https
filter   = nginx-http-auth
logpath  = /var/log/nginx/error.log
maxretry = 5
bantime  = 3600

# ── Stockini Login Protection ────────────────────────────────────
[stockini-login]
enabled  = true
port     = http,https
filter   = stockini-login
logpath  = /var/log/nginx/access.log
maxretry = 5
bantime  = 1800
findtime = 300
EOF

log_ok "Jail config written to $JAIL_LOCAL"

# ── 3. Create custom Stockini login filter ───────────────────────
STOCKINI_FILTER="/etc/fail2ban/filter.d/stockini-login.conf"

cat > "$STOCKINI_FILTER" << 'EOF'
# Stockini — Detect failed login attempts (401 on /api/auth/login)
[Definition]
failregex = ^<HOST> .* "POST /api/auth/login HTTP/.*" 401
            ^<HOST> .* "POST /api/auth/login HTTP/.*" 429
ignoreregex =
EOF

log_ok "Stockini login filter created at $STOCKINI_FILTER"

# ── 4. Create nginx-badbots filter if missing ────────────────
BADBOTS_FILTER="/etc/fail2ban/filter.d/nginx-badbots.conf"
if [ ! -f "$BADBOTS_FILTER" ]; then
  cat > "$BADBOTS_FILTER" << 'EOF'
[Definition]
failregex = ^<HOST> .* "(GET|POST|HEAD) .* HTTP/.*" .* "(.*(?:masscan|sqlmap|nikto|nmap|zgrab|nuclei|dirbuster|gobuster|wpscan|census|httpx).*)"
ignoreregex =
EOF
  log_ok "nginx-badbots filter created"
fi

# ── 5. Reminder about nginx log volume ───────────────────────
log_warn "Ensure Nginx writes access logs to /var/log/nginx/ for Fail2ban filters."

# ── 6. Enable and restart fail2ban ───────────────────────────
systemctl enable fail2ban
systemctl restart fail2ban
log_ok "Fail2ban enabled and started"

# ── 7. Show status ──────────────────────────────────────────
echo ""
fail2ban-client status
echo ""

echo "========================================="
echo -e "${GREEN}  Fail2ban setup complete!${NC}"
echo "========================================="
echo ""
echo "  Jails enabled:"
echo "    ✅ sshd            — ban after 5 fails (1h)"
echo "    ✅ sshd-aggressive — ban after 3 fails (24h)"
echo "    ✅ nginx-botsearch — ban scanners (10min)"
echo "    ✅ nginx-badbots   — ban bad UAs (24h)"
echo "    ✅ nginx-http-auth — ban auth fails (1h)"
echo "    ✅ stockini-login       — ban login brute force (30min)"
echo ""
echo "  Useful commands:"
echo "    fail2ban-client status"
echo "    fail2ban-client status sshd"
echo "    fail2ban-client set sshd unbanip <IP>"
echo ""
echo "Next: sudo bash deploy/scripts/7_setup_logging.sh"
echo ""
