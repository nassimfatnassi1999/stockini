#!/bin/bash
set -e

# =============================================================
# Stockini — Strict Firewall / UFW (Step 4)
# =============================================================
# Run on VPS:  sudo bash deploy/scripts/4_setup_firewall.sh
#
# ⚡ This is the SINGLE source of truth for firewall rules.
#    No other script installs or configures UFW.
#
# Opens ONLY:
#   - Port 22  (SSH)
#   - Port 80  (HTTP — Let's Encrypt + redirect to HTTPS)
#   - Port 443 (HTTPS)
#
# Optional: Cloudflare-only mode (restrict 80/443 to CF IPs)
# =============================================================

source "$(dirname "${BASH_SOURCE[0]}")/_common.sh"
require_root

echo ""
echo "========================================="
echo "  Stockini — Firewall Setup"
echo "========================================="
echo ""

# ── 1. Install UFW if missing ──────────────────────────────
if ! command -v ufw &>/dev/null; then
  log_info "Installing UFW..."
  apt-get update -y && apt-get install -y ufw
  log_ok "UFW installed"
fi

# ── 2. Reset all rules ─────────────────────────────────────
log_info "Resetting UFW rules..."
ufw --force reset
log_ok "UFW reset"

# ── 3. Default policies: deny all incoming, allow outgoing ──
ufw default deny incoming
ufw default allow outgoing
ufw default deny routed
log_ok "Default policies set (deny incoming, allow outgoing)"

# ── 4. Allow SSH ────────────────────────────────────────────
ufw allow 22/tcp comment "SSH"
log_ok "Port 22 (SSH) allowed"

# ── 5. Allow HTTP + HTTPS ──────────────────────────────────
ufw allow 80/tcp comment "HTTP (LetsEncrypt + redirect)"
ufw allow 443/tcp comment "HTTPS"
log_ok "Ports 80 + 443 allowed"

# ── 6. Enable UFW ──────────────────────────────────────────
ufw --force enable
log_ok "UFW enabled"

# ── 7. Optional: Cloudflare-only mode ──────────────────────
echo ""
echo "Do you want to restrict ports 80/443 to Cloudflare IPs only?"
echo "This will hide your real IP from direct access (recommended if using Cloudflare)."
echo ""
read -p "Enable Cloudflare-only mode? (y/N): " CF_MODE

if [[ "$CF_MODE" =~ ^[yY]$ ]]; then
  log_info "Configuring Cloudflare-only mode..."

  # Remove generic 80/443 rules
  ufw delete allow 80/tcp 2>/dev/null || true
  ufw delete allow 443/tcp 2>/dev/null || true

  # Official Cloudflare IPv4 ranges (https://www.cloudflare.com/ips-v4)
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

  # Official Cloudflare IPv6 ranges
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
  log_warn "Make sure your domain is proxied through Cloudflare (orange cloud)!"
else
  log_info "Standard mode — ports 80/443 open to everyone"
fi

# ── 8. Show final rules ────────────────────────────────────
echo ""
ufw status verbose
echo ""

echo "========================================="
echo -e "${GREEN}  Firewall setup complete!${NC}"
echo "========================================="
echo ""
echo "  Rules:"
echo "    ✅ SSH  (22)  — open"
echo "    ✅ HTTP (80)  — open (redirect → HTTPS)"
echo "    ✅ HTTPS(443) — open"
echo "    ❌ Everything else — BLOCKED"
if [[ "$CF_MODE" =~ ^[yY]$ ]]; then
echo "    🟠 Cloudflare-only mode: 80/443 restricted to CF IPs"
fi
echo ""
echo "Next: sudo bash deploy/scripts/5_secure_ssh.sh"
echo ""
