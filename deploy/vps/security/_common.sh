#!/bin/bash
# =============================================================
# Stockini — Common Utilities
# =============================================================
# Sourced by all security scripts in this directory.
# Provides: colors, logging helpers, root check.
# =============================================================

# ── Colors ───────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# ── Logging helpers ──────────────────────────────────────────

log_info() {
  echo -e "${BLUE}[INFO]${NC}  $*"
}

log_ok() {
  echo -e "${GREEN}[ OK ]${NC}  $*"
}

log_warn() {
  echo -e "${YELLOW}[WARN]${NC}  $*"
}

log_err() {
  echo -e "${RED}[ERR ]${NC}  $*" >&2
}

# ── Root guard ───────────────────────────────────────────────

require_root() {
  if [ "$(id -u)" -ne 0 ]; then
    log_err "This script must be run as root (use sudo)."
    exit 1
  fi
}
