#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd -- "${SCRIPT_DIR}/../.." && pwd)"

if [[ ! -x "${PROJECT_ROOT}/scripts/add-user.sh" ]]; then
  printf 'Erreur : scripts/add-user.sh est introuvable ou inexécutable.\n' >&2
  exit 1
fi

exec "${PROJECT_ROOT}/scripts/add-user.sh" "$@"
