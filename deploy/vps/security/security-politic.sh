#!/bin/bash
set -e

# =============================================================
# CRM Geodetection — Security Policy Manager (Interactive)
# =============================================================
# Complete security hardening in one beautiful interactive script
# Run: sudo bash deploy/scripts/security-politic.sh
# =============================================================

source "$(dirname "${BASH_SOURCE[0]}")/_common.sh"
require_root

# ── Dialog/Whiptail detection ────────────────────────────────
if command -v dialog &>/dev/null; then
  DIALOG="dialog"
elif command -v whiptail &>/dev/null; then
  DIALOG="whiptail"
else
  log_err "Neither dialog nor whiptail found. Installing dialog..."
  apt-get update -y && apt-get install -y dialog
  DIALOG="dialog"
fi

TEMP_FILE=$(mktemp)
trap "rm -f $TEMP_FILE" EXIT

# ── Helper Functions ─────────────────────────────────────────

show_banner() {
  clear
  echo -e "${BLUE}"
  cat << 'EOF'
╔═══════════════════════════════════════════════════════════════╗
║                                                               ║
║        🛡️  CRM Geodetection — Security Policy Manager  🛡️        ║
║                                                               ║
║             Complete VPS Hardening & Protection              ║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝
EOF
  echo -e "${NC}"
}

show_info() {
  $DIALOG --title "ℹ️  Information" --msgbox "$1" 12 70
}

show_success() {
  $DIALOG --title "✅ Success" --msgbox "$1" 10 70
}

show_error() {
  $DIALOG --title "❌ Error" --msgbox "$1" 10 70
}

confirm() {
  $DIALOG --title "⚠️  Confirmation" --yesno "$1" 10 70
}

get_input() {
  $DIALOG --title "$1" --inputbox "$2" 10 70 "$3" 2>$TEMP_FILE
  cat $TEMP_FILE
}

# ── Security Status Check ────────────────────────────────────

check_security_status() {
  local status_text=""
  
  # UFW Status
  if command -v ufw &>/dev/null && ufw status | grep -q "Status: active"; then
    status_text+="✅ Firewall (UFW): ACTIVE\n"
    status_text+="   $(ufw status | grep -E '^(22|80|443)' | head -3 | awk '{print "   • "$0}')\n\n"
  else
    status_text+="❌ Firewall (UFW): NOT CONFIGURED\n\n"
  fi
  
  # SSH Status
  if [ -f /etc/ssh/sshd_config.d/99-crm-hardening.conf ]; then
    status_text+="✅ SSH Hardening: CONFIGURED\n"
    status_text+="   • Root login disabled\n"
    status_text+="   • Password auth disabled (key-only)\n"
    status_text+="   • Max 3 auth attempts\n\n"
  else
    status_text+="❌ SSH Hardening: NOT CONFIGURED\n\n"
  fi
  
  # Fail2ban Status
  if command -v fail2ban-client &>/dev/null && systemctl is-active --quiet fail2ban; then
    status_text+="✅ Fail2ban: ACTIVE\n"
    local jails=$(fail2ban-client status 2>/dev/null | grep "Jail list" | sed 's/.*://;s/,/ /g')
    status_text+="   Jails: $jails\n\n"
  else
    status_text+="❌ Fail2ban: NOT CONFIGURED\n\n"
  fi
  
  # Logging Status
  if [ -f /usr/local/bin/crm-security-monitor.sh ] && crontab -l 2>/dev/null | grep -q crm-security-monitor; then
    status_text+="✅ Security Monitoring: ACTIVE\n"
    status_text+="   • Log rotation configured\n"
    status_text+="   • Cron monitoring (every 15min)\n\n"
  else
    status_text+="❌ Security Monitoring: NOT CONFIGURED\n\n"
  fi
  
  $DIALOG --title "🔒 Security Status" --msgbox "$status_text" 24 75
}

# ── 1. FIREWALL SETUP ────────────────────────────────────────

setup_firewall() {
  show_banner
  log_info "Starting Firewall (UFW) setup..."
  
  # Install UFW if missing
  if ! command -v ufw &>/dev/null; then
    log_info "Installing UFW..."
    apt-get update -y && apt-get install -y ufw
  fi
  
  # Reset rules
  log_info "Resetting UFW rules..."
  ufw --force reset
  
  # Default policies
  ufw default deny incoming
  ufw default allow outgoing
  ufw default deny routed
  
  # Allow SSH, HTTP, HTTPS
  ufw allow 22/tcp comment "SSH"
  ufw allow 80/tcp comment "HTTP (LetsEncrypt + redirect)"
  ufw allow 443/tcp comment "HTTPS"
  
  # Enable UFW
  ufw --force enable
  
  log_ok "Firewall configured (22, 80, 443 open)"
  
  # Ask about Cloudflare mode
  if confirm "Do you want to restrict ports 80/443 to Cloudflare IPs only?\n\nThis hides your real IP but requires your domain to be proxied through Cloudflare (orange cloud)."; then
    log_info "Configuring Cloudflare-only mode..."
    
    # Remove generic 80/443 rules
    ufw delete allow 80/tcp 2>/dev/null || true
    ufw delete allow 443/tcp 2>/dev/null || true
    
    # Cloudflare IPv4 ranges
    CF_IPV4=(
      "173.245.48.0/20"  "103.21.244.0/22"  "103.22.200.0/22"
      "103.31.4.0/22"    "141.101.64.0/18"  "108.162.192.0/18"
      "190.93.240.0/20"  "188.114.96.0/20"  "197.234.240.0/22"
      "198.41.128.0/17"  "162.158.0.0/15"   "104.16.0.0/13"
      "104.24.0.0/14"    "172.64.0.0/13"    "131.0.72.0/22"
    )
    
    for ip in "${CF_IPV4[@]}"; do
      ufw allow from "$ip" to any port 80,443 proto tcp comment "Cloudflare" 2>/dev/null
    done
    
    # Cloudflare IPv6 ranges
    CF_IPV6=(
      "2400:cb00::/32"  "2606:4700::/32"  "2803:f800::/32"
      "2405:b500::/32"  "2405:8100::/32"  "2a06:98c0::/29"
      "2c0f:f248::/32"
    )
    
    for ip in "${CF_IPV6[@]}"; do
      ufw allow from "$ip" to any port 80,443 proto tcp comment "Cloudflare IPv6" 2>/dev/null
    done
    
    ufw reload
    log_ok "Cloudflare-only mode enabled"
  fi
  
  show_success "Firewall setup complete!\n\nAllowed ports:\n• 22 (SSH)\n• 80 (HTTP)\n• 443 (HTTPS)\n\nEverything else is BLOCKED."
}

# ── 2. SSH HARDENING ─────────────────────────────────────────

setup_ssh_hardening() {
  show_banner
  log_info "Starting SSH hardening..."
  
  SSHD_CONFIG="/etc/ssh/sshd_config"
  SSHD_HARDENING="/etc/ssh/sshd_config.d/99-crm-hardening.conf"
  
  # Safety check
  REAL_USER="${SUDO_USER:-$USER}"
  if [ "$REAL_USER" = "root" ]; then
    REAL_USER=$(get_input "SSH User" "Enter the non-root username with SSH key configured:" "")
    [ -z "$REAL_USER" ] && { show_error "Username required. Aborting."; return; }
  fi
  
  AUTH_KEYS="/home/$REAL_USER/.ssh/authorized_keys"
  if [ ! -f "$AUTH_KEYS" ] || [ ! -s "$AUTH_KEYS" ]; then
    show_error "No SSH key found for user '$REAL_USER'!\n\nBefore hardening SSH, add your public key:\n\n  ssh-copy-id $REAL_USER@<VPS_IP>\n\nThen run this script again."
    return
  fi
  
  log_ok "SSH key found for user '$REAL_USER'"
  
  # Backup
  cp "$SSHD_CONFIG" "${SSHD_CONFIG}.bak.$(date +%Y%m%d%H%M%S)"
  
  # Create hardening config
  cat > "$SSHD_HARDENING" << 'EOF'
# CRM Apprensur — SSH Hardening
PermitRootLogin no
PasswordAuthentication no
ChallengeResponseAuthentication no
UsePAM yes
PermitEmptyPasswords no
MaxAuthTries 3
ClientAliveInterval 300
ClientAliveCountMax 2
X11Forwarding no
AllowTcpForwarding no
LogLevel VERBOSE
EOF
  
  log_ok "SSH hardening config created"
  
  # Optional IP restriction
  if confirm "Do you want to restrict SSH to a specific IP address?\n\nThis adds an extra layer of security but you'll only be able to SSH from that IP.\n\nLeave empty to skip."; then
    MY_IP=$(get_input "SSH IP Restriction" "Enter your fixed IP address (e.g. 86.123.45.67):" "")
    
    if [ -n "$MY_IP" ]; then
      # Modify UFW
      ufw delete allow 22/tcp 2>/dev/null || true
      ufw allow from "$MY_IP" to any port 22 proto tcp comment "SSH from admin IP"
      ufw reload
      
      # Add AllowUsers
      echo "" >> "$SSHD_HARDENING"
      echo "# Restrict to specific user" >> "$SSHD_HARDENING"
      echo "AllowUsers $REAL_USER" >> "$SSHD_HARDENING"
      
      log_ok "SSH restricted to $MY_IP"
    fi
  fi
  
  # Validate and restart
  if sshd -t 2>/dev/null; then
    systemctl restart sshd
    log_ok "sshd restarted"
    
    show_success "SSH hardening complete!\n\nApplied:\n✅ Root login disabled\n✅ Password auth disabled (key-only)\n✅ Max 3 auth attempts\n✅ 5-min idle timeout\n\n⚠️  TEST IN A NEW TERMINAL NOW!\n   ssh $REAL_USER@<VPS_IP>"
  else
    show_error "Invalid SSH config! Restoring backup..."
    rm -f "$SSHD_HARDENING"
    systemctl restart sshd
  fi
}

# ── 3. FAIL2BAN SETUP ────────────────────────────────────────

setup_fail2ban() {
  show_banner
  log_info "Starting Fail2ban setup..."
  
  # Install fail2ban
  if ! command -v fail2ban-client &>/dev/null; then
    log_info "Installing fail2ban..."
    apt-get update -y
    apt-get install -y fail2ban
  fi
  
  # Create jail config
  JAIL_LOCAL="/etc/fail2ban/jail.local"
  
  cat > "$JAIL_LOCAL" << 'EOF'
# CRM Apprensur — Fail2ban Jails

[DEFAULT]
bantime  = 3600
findtime = 600
maxretry = 5
banaction = iptables-multiport

# SSH Protection
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

# Nginx Protection
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

# CRM Login Protection
[crm-login]
enabled  = true
port     = http,https
filter   = crm-login
logpath  = /var/log/nginx/access.log
maxretry = 5
bantime  = 1800
findtime = 300
EOF
  
  log_ok "Jail config created"
  
  # Create CRM login filter
  CRM_FILTER="/etc/fail2ban/filter.d/crm-login.conf"
  cat > "$CRM_FILTER" << 'EOF'
# CRM Login Filter
[Definition]
failregex = ^<HOST> .* "POST /api/auth/login HTTP/.*" 401
            ^<HOST> .* "POST /api/auth/login HTTP/.*" 429
ignoreregex =
EOF
  
  # Create nginx-badbots filter
  BADBOTS_FILTER="/etc/fail2ban/filter.d/nginx-badbots.conf"
  if [ ! -f "$BADBOTS_FILTER" ]; then
    cat > "$BADBOTS_FILTER" << 'EOF'
[Definition]
failregex = ^<HOST> .* "(GET|POST|HEAD) .* HTTP/.*" .* "(.*(?:masscan|sqlmap|nikto|nmap|zgrab|nuclei|dirbuster|gobuster|wpscan|census|httpx).*)"
ignoreregex =
EOF
  fi
  
  log_ok "Filters created"
  
  # Enable and start
  systemctl enable fail2ban
  systemctl restart fail2ban
  
  sleep 2
  
  local status=$(fail2ban-client status 2>/dev/null | grep "Jail list" | sed 's/.*://' || echo "N/A")
  
  show_success "Fail2ban setup complete!\n\nActive jails:$status\n\nProtection enabled for:\n✅ SSH brute force (ban 1h after 5 fails)\n✅ SSH aggressive (ban 24h after 3 fails)\n✅ Nginx bot scanners\n✅ CRM login attempts"
}

# ── 4. LOGGING & MONITORING ──────────────────────────────────

setup_logging() {
  show_banner
  log_info "Starting logging & monitoring setup..."
  
  # Create log directories
  mkdir -p /var/log/nginx
  mkdir -p /var/log/crm-geodetection
  
  # Nginx log rotation
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
  
  log_ok "Log rotation configured"
  
  # Security monitoring script
  MONITOR_SCRIPT="/usr/local/bin/crm-security-monitor.sh"
  cat > "$MONITOR_SCRIPT" << 'MONITOR'
#!/bin/bash
LOG_DIR="/var/log/crm-geodetection"
ALERT_LOG="$LOG_DIR/security-alerts.log"
NGINX_LOG="/var/log/nginx/access.log"
AUTH_LOG="/var/log/auth.log"
TIMESTAMP=$(date "+%Y-%m-%d %H:%M:%S")

mkdir -p "$LOG_DIR"

# SSH brute force
SSH_FAILS=$(grep "Failed password\|authentication failure" "$AUTH_LOG" 2>/dev/null | \
  awk -v d="$(date -d '15 minutes ago' '+%b %d %H:%M')" '$0 >= d' | wc -l)
if [ "$SSH_FAILS" -gt 10 ]; then
  echo "[$TIMESTAMP] ALERT: $SSH_FAILS SSH failures in last 15min" >> "$ALERT_LOG"
fi

# Nginx errors
if [ -f "$NGINX_LOG" ]; then
  ERROR_REQUESTS=$(tail -1000 "$NGINX_LOG" 2>/dev/null | \
    awk '{print $9}' | grep -cE '^(4[0-9]{2}|5[0-9]{2})$' || true)
  if [ "$ERROR_REQUESTS" -gt 200 ]; then
    echo "[$TIMESTAMP] ALERT: $ERROR_REQUESTS error responses" >> "$ALERT_LOG"
  fi
  
  # Top IP scanner detection
  TOP_IP=$(tail -5000 "$NGINX_LOG" 2>/dev/null | \
    awk '{print $1}' | sort | uniq -c | sort -rn | head -1)
  TOP_COUNT=$(echo "$TOP_IP" | awk '{print $1}')
  TOP_ADDR=$(echo "$TOP_IP" | awk '{print $2}')
  if [ "${TOP_COUNT:-0}" -gt 500 ]; then
    echo "[$TIMESTAMP] ALERT: IP $TOP_ADDR made $TOP_COUNT requests" >> "$ALERT_LOG"
  fi
  
  # CRM login failures
  LOGIN_FAILS=$(tail -2000 "$NGINX_LOG" 2>/dev/null | \
    grep "POST /api/auth/login" | awk '{print $9}' | grep -c "401" || true)
  if [ "$LOGIN_FAILS" -gt 20 ]; then
    echo "[$TIMESTAMP] ALERT: $LOGIN_FAILS failed CRM login attempts" >> "$ALERT_LOG"
  fi
fi

# Fail2ban status
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
MONITOR
  
  chmod +x "$MONITOR_SCRIPT"
  log_ok "Monitoring script created"
  
  # Install cron
  CRON_LINE="*/15 * * * * $MONITOR_SCRIPT"
  if ! crontab -l 2>/dev/null | grep -q "crm-security-monitor"; then
    (crontab -l 2>/dev/null; echo "$CRON_LINE") | crontab -
    log_ok "Cron job installed (every 15min)"
  fi
  
  # Optional email alerts
  if confirm "Do you want to configure email alerts for security events?\n\nThis requires SMTP credentials (Brevo, SendGrid, etc.)"; then
    if ! command -v msmtp &>/dev/null; then
      apt-get install -y msmtp msmtp-mta
    fi
    
    SMTP_HOST=$(get_input "SMTP Configuration" "SMTP host (e.g. smtp-relay.brevo.com):" "smtp-relay.brevo.com")
    SMTP_PORT=$(get_input "SMTP Configuration" "SMTP port:" "587")
    SMTP_USER=$(get_input "SMTP Configuration" "SMTP username:" "")
    SMTP_PASS=$(get_input "SMTP Configuration" "SMTP password:" "")
    FROM_EMAIL=$(get_input "SMTP Configuration" "From email:" "security@stockini-msp.tn")
    ALERT_EMAIL=$(get_input "SMTP Configuration" "Alert recipient email:" "admin@stockini-msp.tn")
    
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
    
    # Add email to monitor script
    cat >> "$MONITOR_SCRIPT" << EMAILBLOCK

# Email alerts
LAST_ALERT=\$(tail -1 "$LOG_DIR/security-alerts.log" 2>/dev/null | grep "ALERT" || true)
if [ -n "\$LAST_ALERT" ]; then
  echo -e "Subject: [CRM Security Alert] \$(hostname)\\n\\n\$LAST_ALERT" | \
    msmtp "$ALERT_EMAIL" 2>/dev/null || true
fi
EMAILBLOCK
    
    log_ok "Email alerts configured"
  fi
  
  show_success "Logging & monitoring setup complete!\n\n✅ Nginx log rotation (30 days)\n✅ Security monitor (every 15min)\n✅ Alert log: /var/log/crm-geodetection/security-alerts.log\n\nView alerts:\n  tail -f /var/log/crm-geodetection/security-alerts.log"
}

# ── 5. COMPLETE HARDENING (ALL IN ONE) ──────────────────────

run_complete_hardening() {
  if confirm "This will run ALL security configurations:\n\n1. Firewall (UFW)\n2. SSH Hardening\n3. Fail2ban\n4. Logging & Monitoring\n\nThis may take 5-10 minutes.\n\nContinue?"; then
    setup_firewall
    sleep 2
    setup_ssh_hardening
    sleep 2
    setup_fail2ban
    sleep 2
    setup_logging
    
    show_success "🎉 COMPLETE SECURITY HARDENING FINISHED! 🎉\n\nYour VPS is now fully protected:\n\n✅ Firewall active\n✅ SSH hardened\n✅ Fail2ban monitoring\n✅ Security logging enabled\n\n⚠️  IMPORTANT: Test SSH in a new terminal before closing this session!"
  fi
}

# ── MAIN MENU ────────────────────────────────────────────────

main_menu() {
  while true; do
    show_banner
    
    CHOICE=$($DIALOG --title "🔐 Security Policy Manager" \
      --menu "Choose a security configuration:" 20 75 10 \
      "1" "🔥 Setup Firewall (UFW)" \
      "2" "🔑 Harden SSH Access" \
      "3" "🛡️  Configure Fail2ban" \
      "4" "📊 Setup Logging & Monitoring" \
      "5" "⚡ COMPLETE HARDENING (All-in-One)" \
      "6" "📋 Security Status Report" \
      "7" "❌ Exit" 2>&1 >/dev/tty)
    
    case $CHOICE in
      1) setup_firewall ;;
      2) setup_ssh_hardening ;;
      3) setup_fail2ban ;;
      4) setup_logging ;;
      5) run_complete_hardening ;;
      6) check_security_status ;;
      7) 
        clear
        echo -e "${GREEN}"
        echo "╔═══════════════════════════════════════════════════╗"
        echo "║     Thank you for using Security Manager! 🛡️      ║"
        echo "║           Stay safe, stay secure! 🔒              ║"
        echo "╚═══════════════════════════════════════════════════╝"
        echo -e "${NC}"
        exit 0
        ;;
      *)
        exit 0
        ;;
    esac
  done
}

# ── START ────────────────────────────────────────────────────

# Check if running as root
if [ "$EUID" -ne 0 ]; then
  echo -e "${RED}ERROR: This script must be run as root (sudo).${NC}"
  exit 1
fi

# Launch main menu
main_menu
