#!/bin/bash
set -e

# =============================================================
# CRM Geodetection — SSH Hardening (Step 5)
# =============================================================
# Run on VPS:  sudo bash deploy/scripts/5_secure_ssh.sh
#
# ⚡ Run AFTER 4_setup_firewall.sh so UFW is already active.
#    This script only ADDS SSH restrictions to existing rules.
#
# What it does:
#   - Disables root SSH login
#   - Disables password authentication (key-only)
#   - Optional: restricts SSH to a specific IP via UFW
#   - Restarts sshd
#
# ⚠️  BEFORE RUNNING: Ensure your SSH key is in
#     ~/.ssh/authorized_keys for a non-root user!
# =============================================================

source "$(dirname "${BASH_SOURCE[0]}")/_common.sh"
require_root

SSHD_CONFIG="/etc/ssh/sshd_config"
SSHD_HARDENING="/etc/ssh/sshd_config.d/99-crm-hardening.conf"

echo ""
echo "========================================="
echo "  CRM Geodetection — SSH Hardening"
echo "========================================="
echo ""

# ── Safety check: ensure authorized_keys exists ──────────────
REAL_USER="${SUDO_USER:-$USER}"
if [ "$REAL_USER" = "root" ]; then
  log_warn "You are running as root. Make sure a non-root user has SSH keys configured."
  read -p "Non-root username with SSH key: " REAL_USER
fi

AUTH_KEYS="/home/$REAL_USER/.ssh/authorized_keys"
if [ ! -f "$AUTH_KEYS" ] || [ ! -s "$AUTH_KEYS" ]; then
  log_err "No SSH key found in $AUTH_KEYS"
  echo "  Add your public key first:  ssh-copy-id $REAL_USER@<VPS_IP>"
  exit 1
fi
log_ok "SSH key found for user '$REAL_USER'"

# ── Backup current config ────────────────────────────────────
cp "$SSHD_CONFIG" "${SSHD_CONFIG}.bak.$(date +%Y%m%d%H%M%S)"
log_ok "Backup of sshd_config created"

# ── Create hardening drop-in config ──────────────────────────
cat > "$SSHD_HARDENING" << 'EOF'
# =============================================================
# CRM Apprensur — SSH Hardening (drop-in)
# =============================================================
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

log_ok "SSH hardening config written to $SSHD_HARDENING"

# ── Optional: Restrict SSH to specific IP ────────────────────
echo ""
echo "Do you want to restrict SSH access to a specific IP address?"
echo "(Leave empty to skip — SSH will remain open to all IPs via port 22)"
read -p "Your fixed IP (e.g. 86.123.45.67): " MY_IP

if [ -n "$MY_IP" ]; then
  # Modify UFW: remove generic SSH, add IP-restricted SSH
  ufw delete allow 22/tcp 2>/dev/null || true
  ufw allow from "$MY_IP" to any port 22 proto tcp comment "SSH from admin IP"
  ufw reload
  log_ok "SSH restricted to $MY_IP via UFW"

  # Add AllowUsers directive
  echo "" >> "$SSHD_HARDENING"
  echo "# Restrict to specific user" >> "$SSHD_HARDENING"
  echo "AllowUsers $REAL_USER" >> "$SSHD_HARDENING"
  log_ok "AllowUsers set to '$REAL_USER'"
else
  log_info "SSH IP restriction skipped — open to all IPs on port 22"
fi

# ── Validate and restart sshd ────────────────────────────────
log_info "Validating SSH config..."
if sshd -t 2>/dev/null; then
  log_ok "SSH config valid"
  systemctl restart sshd
  log_ok "sshd restarted"
else
  log_err "Invalid SSH config! Restoring backup..."
  rm -f "$SSHD_HARDENING"
  systemctl restart sshd
  exit 1
fi

echo ""
echo "========================================="
echo -e "${GREEN}  SSH hardening complete!${NC}"
echo "========================================="
echo ""
echo "  Applied:"
echo "    ✅ Root login disabled"
echo "    ✅ Password auth disabled (key-only)"
echo "    ✅ Max 3 auth attempts"
echo "    ✅ 5-min idle timeout"
if [ -n "$MY_IP" ]; then
echo "    ✅ SSH restricted to $MY_IP"
fi
echo ""
echo -e "  ${YELLOW}⚠️  TEST SSH IN A NEW TERMINAL before closing this session!${NC}"
echo -e "  ${YELLOW}    ssh $REAL_USER@<VPS_IP>${NC}"
echo ""
echo "Next: sudo bash deploy/scripts/6_setup_fail2ban.sh"
echo ""
