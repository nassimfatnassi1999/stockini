#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
readonly SCRIPT_DIR
PROJECT_ROOT="$(cd -- "${SCRIPT_DIR}/.." && pwd)"
readonly PROJECT_ROOT
readonly BACKEND_DIR="${PROJECT_ROOT}/backend"
readonly HELPER_SOURCE="${BACKEND_DIR}/src/scripts/add-user.ts"
readonly PASSWORD_HELPER_SOURCE="${BACKEND_DIR}/src/users/password.util.ts"
readonly PASSWORD_MIN_LENGTH=8

RUN_MODE=""
COMPOSE_FILE=""
COMPOSE_SERVICE=""
EMAIL=""
FULL_NAME=""
PHONE=""
ROLE=""
ACTIVE=""
PASSWORD_STDIN=false
ASSUME_YES=false

die() {
  printf 'Erreur : %s\nAucune modification n’a été effectuée.\n' "$1" >&2
  exit "${2:-1}"
}

on_interrupt() {
  printf '\nOpération annulée. Aucune modification n’a été effectuée.\n' >&2
  exit 130
}
trap on_interrupt INT TERM

usage() {
  cat <<'EOF'
Usage : scripts/add-user.sh [options]

Options :
  --email ADRESSE       Adresse email
  --name NOM            Nom complet
  --phone TELEPHONE     Téléphone facultatif
  --role ROLE           Nom du rôle existant
  --active              Créer un compte actif
  --inactive            Créer un compte inactif
  --password-stdin      Lire le mot de passe sur l'entrée standard
  --yes                 Confirmer explicitement la création (automatisation)
  -h, --help            Afficher cette aide

Le mot de passe ne peut jamais être fourni en argument.
EOF
}

while (($#)); do
  case "$1" in
    --email|--name|--phone|--role)
      (($# >= 2)) || die "Valeur manquante pour $1." 2
      case "$1" in
        --email) EMAIL="$2" ;;
        --name) FULL_NAME="$2" ;;
        --phone) PHONE="$2" ;;
        --role) ROLE="$2" ;;
      esac
      shift 2
      ;;
    --active) ACTIVE=true; shift ;;
    --inactive) ACTIVE=false; shift ;;
    --password-stdin) PASSWORD_STDIN=true; shift ;;
    --yes) ASSUME_YES=true; shift ;;
    -h|--help) usage; exit 0 ;;
    *) die "Option inconnue : $1" 2 ;;
  esac
done

if [[ "$PASSWORD_STDIN" == true ]]; then
  [[ -n "$FULL_NAME" ]] || die "--name est obligatoire avec --password-stdin." 2
  [[ -n "$EMAIL" ]] || die "--email est obligatoire avec --password-stdin." 2
  [[ -n "$ROLE" ]] || die "--role est obligatoire avec --password-stdin." 2
  [[ -n "$ACTIVE" ]] || die "--active ou --inactive est obligatoire avec --password-stdin." 2
fi

[[ -d "$BACKEND_DIR" ]] || die "Le dossier backend est introuvable."
[[ -f "${BACKEND_DIR}/prisma/schema.prisma" ]] || die "Le schéma Prisma est introuvable."
[[ -f "$HELPER_SOURCE" ]] || die "L’auxiliaire TypeScript est introuvable."
command -v node >/dev/null 2>&1 || die "Node.js doit être installé."

if [[ ${EUID:-$(id -u)} -eq 0 ]]; then
  printf 'Attention : ce script ne nécessite normalement pas sudo.\n' >&2
fi

load_database_url() {
  [[ -n "${DATABASE_URL:-}" ]] && return
  local env_file
  for env_file in "${BACKEND_DIR}/.env" "${PROJECT_ROOT}/.env"; do
    [[ -f "$env_file" ]] || continue
    DATABASE_URL="$(cd "$BACKEND_DIR" && node -e \
      "const d=require('dotenv').config({path:process.argv[1]}); if(d.error) process.exit(1); process.stdout.write(d.parsed?.DATABASE_URL||'')" \
      "$env_file")"
    if [[ -n "$DATABASE_URL" ]]; then
      export DATABASE_URL
      return
    fi
  done
}

run_local() {
  (cd "$BACKEND_DIR" && ./node_modules/.bin/ts-node "$HELPER_SOURCE" "$@")
}

compose() {
  (cd "$(dirname "$COMPOSE_FILE")" && docker compose -f "$(basename "$COMPOSE_FILE")" "$@")
}

run_docker() {
  compose exec -T \
    -e TS_NODE_TRANSPILE_ONLY=true \
    -e NODE_PATH=/app/node_modules \
    "$COMPOSE_SERVICE" ./node_modules/.bin/ts-node /tmp/stockini-add-user/scripts/add-user.ts "$@"
}

detect_runner() {
  if [[ "${NODE_ENV:-}" == test && -n "${ADD_USER_TEST_HELPER:-}" ]]; then
    [[ -x "$ADD_USER_TEST_HELPER" ]] || die "Auxiliaire de test inexécutable."
    RUN_MODE="test"
    return
  fi
  [[ -d "${BACKEND_DIR}/node_modules" ]] || true
  load_database_url
  if [[ -x "${BACKEND_DIR}/node_modules/.bin/ts-node" ]] && run_local health >/dev/null 2>&1; then
    RUN_MODE=local
    return
  fi

  command -v docker >/dev/null 2>&1 || die "Base locale inaccessible et Docker indisponible."
  docker compose version >/dev/null 2>&1 || die "Le plugin Docker Compose est indisponible."

  local candidate service
  for candidate in "${PROJECT_ROOT}/docker-compose.yml" "${PROJECT_ROOT}/docker-compose.yaml" \
    "${PROJECT_ROOT}/deploy-docker/docker-compose.prod.yml" "${PROJECT_ROOT}/deploy-docker/docker-compose.prod.yaml"; do
    [[ -f "$candidate" ]] || continue
    COMPOSE_FILE="$candidate"
    while IFS= read -r service; do
      [[ "$service" == *backend* ]] || continue
      if compose ps --status running --services 2>/dev/null | grep -Fxq "$service"; then
        COMPOSE_SERVICE="$service"
        compose exec -T "$COMPOSE_SERVICE" mkdir -p /tmp/stockini-add-user/scripts /tmp/stockini-add-user/users
        compose cp "$HELPER_SOURCE" "${COMPOSE_SERVICE}:/tmp/stockini-add-user/scripts/add-user.ts" >/dev/null
        compose cp "$PASSWORD_HELPER_SOURCE" "${COMPOSE_SERVICE}:/tmp/stockini-add-user/users/password.util.ts" >/dev/null
        if run_docker health >/dev/null 2>&1; then
          RUN_MODE=docker
          return
        fi
      fi
    done < <(compose config --services 2>/dev/null || true)
  done
  die "Impossible de joindre PostgreSQL, localement ou via un backend Docker Compose actif."
}

run_helper() {
  if [[ "$RUN_MODE" == local ]]; then
    run_local "$@"
  elif [[ "$RUN_MODE" == docker ]]; then
    run_docker "$@"
  else
    "$ADD_USER_TEST_HELPER" "$@"
  fi
}

prompt_required() {
  local label="$1" value
  while true; do
    IFS= read -r -p "$label : " value || on_interrupt
    value="${value#"${value%%[![:space:]]*}"}"
    value="${value%"${value##*[![:space:]]}"}"
    [[ -n "$value" ]] && { printf '%s' "$value"; return; }
    printf 'Cette valeur est obligatoire.\n' >&2
  done
}

validate_email() {
  [[ "$1" =~ ^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$ ]]
}

detect_runner
printf 'Connexion à PostgreSQL établie (%s).\n\n' "$RUN_MODE"

while [[ -z "$FULL_NAME" ]]; do FULL_NAME="$(prompt_required 'Nom complet')"; done
while true; do
  [[ -n "$EMAIL" ]] || EMAIL="$(prompt_required 'Email')"
  EMAIL="$(printf '%s' "$EMAIL" | tr '[:upper:]' '[:lower:]')"
  validate_email "$EMAIL" && break
  printf 'Format email invalide.\n' >&2
  EMAIL=""
done

if [[ -z "$PHONE" && "$PASSWORD_STDIN" == false ]]; then
  IFS= read -r -p 'Téléphone (facultatif) : ' PHONE || on_interrupt
fi

declare -a ROLE_ROWS=()
while IFS= read -r row; do ROLE_ROWS[${#ROLE_ROWS[@]}]="$row"; done < <(run_helper roles)
((${#ROLE_ROWS[@]} > 0)) || die "Aucun rôle n’est disponible dans la base."
declare -a ROLE_NAMES=()
printf '\nRôles disponibles :\n\n'
for row in "${ROLE_ROWS[@]}"; do
  ROLE_NAMES[${#ROLE_NAMES[@]}]="${row#*$'\t'}"
  printf '%d) %s\n' "${#ROLE_NAMES[@]}" "${ROLE_NAMES[${#ROLE_NAMES[@]}-1]}"
done

role_exists=false
if [[ -n "$ROLE" ]]; then
  for role_name in "${ROLE_NAMES[@]}"; do [[ "$ROLE" == "$role_name" ]] && role_exists=true; done
  [[ "$role_exists" == true ]] || die "Le rôle « $ROLE » n’existe pas."
else
  while true; do
    IFS= read -r -p 'Choisissez un rôle : ' choice || on_interrupt
    if [[ "$choice" =~ ^[0-9]+$ ]] && ((choice >= 1 && choice <= ${#ROLE_NAMES[@]})); then
      ROLE="${ROLE_NAMES[choice-1]}"
      break
    fi
    printf 'Sélection invalide.\n' >&2
  done
fi

if [[ -z "$ACTIVE" ]]; then
  while true; do
    IFS= read -r -p 'Compte actif ? [O/n] ' answer || on_interrupt
    answer="$(printf '%s' "$answer" | tr '[:upper:]' '[:lower:]')"
    case "$answer" in
      ''|o|oui|y|yes) ACTIVE=true; break ;;
      n|non|no) ACTIVE=false; break ;;
      *) printf 'Répondez par oui ou non.\n' >&2 ;;
    esac
  done
fi

if [[ "$PASSWORD_STDIN" == true ]]; then
  IFS= read -r PASSWORD || die "Impossible de lire le mot de passe sur l’entrée standard."
  [[ ${#PASSWORD} -ge $PASSWORD_MIN_LENGTH ]] || die "Le mot de passe doit contenir au moins $PASSWORD_MIN_LENGTH caractères."
else
  while true; do
    IFS= read -r -s -p 'Mot de passe : ' PASSWORD || on_interrupt
    printf '\n'
    IFS= read -r -s -p 'Confirmer le mot de passe : ' PASSWORD_CONFIRM || on_interrupt
    printf '\n'
    [[ ${#PASSWORD} -ge $PASSWORD_MIN_LENGTH ]] || { printf 'Le mot de passe doit contenir au moins %d caractères.\n' "$PASSWORD_MIN_LENGTH" >&2; continue; }
    [[ "$PASSWORD" == "$PASSWORD_CONFIRM" ]] && break
    printf 'Les mots de passe ne correspondent pas.\n' >&2
  done
  unset PASSWORD_CONFIRM
fi

printf '\nRésumé du nouvel utilisateur\n\n'
printf 'Nom          : %s\nEmail        : %s\nTéléphone    : %s\nRôle         : %s\nStatut       : %s\nMot de passe : ********\n\n' \
  "$FULL_NAME" "$EMAIL" "${PHONE:-(non renseigné)}" "$ROLE" "$([[ "$ACTIVE" == true ]] && printf Actif || printf Inactif)"
if [[ "$ASSUME_YES" == false ]]; then
  IFS= read -r -p 'Confirmer la création ? [o/N] ' confirmation || on_interrupt
  confirmation="$(printf '%s' "$confirmation" | tr '[:upper:]' '[:lower:]')"
  case "$confirmation" in
    o|oui|y|yes) ;;
    *) unset PASSWORD; printf 'Création annulée. Aucune modification n’a été effectuée.\n'; exit 0 ;;
  esac
fi

set +e
RESULT="$(printf '%s\0%s\0%s\0%s\0%s\0%s' "$FULL_NAME" "$EMAIL" "$PHONE" "$PASSWORD" "$ROLE" "$ACTIVE" | run_helper create 2> >(sed -E 's/^ADD_USER_ERROR:[^:]+://' >&2))"
status=$?
set -e
unset PASSWORD
((status == 0)) || die "La création de l’utilisateur a échoué." "$status"

printf '\nUtilisateur créé avec succès.\n\n'
printf '%s' "$RESULT" | node -e '
let s=""; process.stdin.on("data",c=>s+=c).on("end",()=>{
  const u=JSON.parse(s);
  console.log(`ID       : ${u.id}`);
  console.log(`Nom      : ${u.fullName}`);
  console.log(`Email    : ${u.email}`);
  console.log(`Rôle     : ${u.role.name}`);
  console.log(`Statut   : ${u.isActive ? "Actif" : "Inactif"}`);
});'
