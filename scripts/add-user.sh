#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
readonly SCRIPT_DIR
PROJECT_ROOT="$(cd -- "${SCRIPT_DIR}/.." && pwd)"
readonly PROJECT_ROOT
readonly BACKEND_DIR="${PROJECT_ROOT}/backend"
readonly HELPER_SOURCE="${BACKEND_DIR}/src/scripts/add-user.ts"
readonly PASSWORD_HELPER_SOURCE="${BACKEND_DIR}/src/users/password.util.ts"
readonly ROLE_DEFINITIONS_SOURCE="${BACKEND_DIR}/prisma/role-definitions.ts"
readonly PASSWORD_MIN_LENGTH=8

RUN_MODE=""
COMPOSE_FILE=""
COMPOSE_PROJECT_DIR=""
COMPOSE_ENV_FILE=""
COMPOSE_SERVICE=""
DOCKER_CONTAINER=""
EMAIL=""
FULL_NAME=""
PHONE=""
ROLE=""
ACTIVE=""
PASSWORD_STDIN=false
ASSUME_YES=false

die() {
  printf "Erreur : %s\nAucune modification n’a été effectuée.\n" "$1" >&2
  exit "${2:-1}"
}

on_interrupt() {
  unset PASSWORD PASSWORD_CONFIRM 2>/dev/null || true
  printf "\nCréation annulée.\nAucune modification n’a été effectuée.\n" >&2
  exit 0
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

if [[ "$PASSWORD_STDIN" == false && "${NODE_ENV:-}" != test && ! -t 0 ]]; then
  die "Cette commande nécessite un terminal interactif. Lancez-la avec : make add-user" 2
fi

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
  docker compose \
    --project-directory "$COMPOSE_PROJECT_DIR" \
    --env-file "$COMPOSE_ENV_FILE" \
    -f "$COMPOSE_FILE" "$@"
}

run_docker_compose() {
  compose exec -T \
    -e TS_NODE_TRANSPILE_ONLY=true \
    -e 'TS_NODE_COMPILER_OPTIONS={"module":"CommonJS","moduleResolution":"Node"}' \
    -e NODE_PATH=/app/node_modules \
    "$COMPOSE_SERVICE" ./node_modules/.bin/ts-node /tmp/stockini-add-user/src/scripts/add-user.ts "$@"
}

run_docker_exec() {
  docker exec -i \
    -e TS_NODE_TRANSPILE_ONLY=true \
    -e 'TS_NODE_COMPILER_OPTIONS={"module":"CommonJS","moduleResolution":"Node"}' \
    -e NODE_PATH=/app/node_modules \
    "$DOCKER_CONTAINER" ./node_modules/.bin/ts-node /tmp/stockini-add-user/src/scripts/add-user.ts "$@"
}

install_helper_with_compose() {
  local compose_container
  compose exec -T "$COMPOSE_SERVICE" mkdir -p \
    /tmp/stockini-add-user/src/scripts \
    /tmp/stockini-add-user/src/users \
    /tmp/stockini-add-user/prisma
  compose_container="$(compose ps -q "$COMPOSE_SERVICE")"
  [[ -n "$compose_container" ]] || die "Le conteneur du service $COMPOSE_SERVICE est introuvable."
  docker cp -q "$HELPER_SOURCE" "${compose_container}:/tmp/stockini-add-user/src/scripts/add-user.ts"
  docker cp -q "$PASSWORD_HELPER_SOURCE" "${compose_container}:/tmp/stockini-add-user/src/users/password.util.ts"
  docker cp -q "$ROLE_DEFINITIONS_SOURCE" "${compose_container}:/tmp/stockini-add-user/prisma/role-definitions.ts"
}

install_helper_with_docker() {
  docker exec "$DOCKER_CONTAINER" mkdir -p \
    /tmp/stockini-add-user/src/scripts \
    /tmp/stockini-add-user/src/users \
    /tmp/stockini-add-user/prisma
  docker cp "$HELPER_SOURCE" "${DOCKER_CONTAINER}:/tmp/stockini-add-user/src/scripts/add-user.ts" >/dev/null
  docker cp "$PASSWORD_HELPER_SOURCE" "${DOCKER_CONTAINER}:/tmp/stockini-add-user/src/users/password.util.ts" >/dev/null
  docker cp "$ROLE_DEFINITIONS_SOURCE" "${DOCKER_CONTAINER}:/tmp/stockini-add-user/prisma/role-definitions.ts" >/dev/null
}

configure_compose_candidate() {
  COMPOSE_FILE="$1"
  COMPOSE_PROJECT_DIR="$(dirname "$COMPOSE_FILE")"
  case "$COMPOSE_FILE" in
    "${PROJECT_ROOT}/deploy-docker/"*)
      COMPOSE_ENV_FILE="${PROJECT_ROOT}/deploy-docker/.env.prod"
      ;;
    *)
      COMPOSE_ENV_FILE="${PROJECT_ROOT}/.env"
      ;;
  esac
  [[ -f "$COMPOSE_ENV_FILE" ]]
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

  local candidate service container_id container_name container_service
  for candidate in "${PROJECT_ROOT}/docker-compose.yml" "${PROJECT_ROOT}/docker-compose.yaml" \
    "${PROJECT_ROOT}/compose.yml" "${PROJECT_ROOT}/compose.yaml" \
    "${PROJECT_ROOT}/docker-compose.prod.yml" "${PROJECT_ROOT}/docker-compose.prod.yaml" \
    "${PROJECT_ROOT}/compose.prod.yml" "${PROJECT_ROOT}/compose.prod.yaml" \
    "${PROJECT_ROOT}/deploy-docker/docker-compose.prod.yml" "${PROJECT_ROOT}/deploy-docker/docker-compose.prod.yaml"; do
    [[ -f "$candidate" ]] || continue
    if ! configure_compose_candidate "$candidate"; then
      printf "Fichier d’environnement ignoré car absent pour %s : %s\n" "$candidate" "$COMPOSE_ENV_FILE" >&2
      continue
    fi
    while IFS= read -r service; do
      [[ "$service" == *backend* ]] || continue
      if compose ps --status running --services | grep -Fxq "$service"; then
        COMPOSE_SERVICE="$service"
        install_helper_with_compose
        if run_docker_compose health >/dev/null; then
          RUN_MODE=docker-compose
          return
        fi
      fi
    done < <(compose config --services)
  done

  while IFS=$'\t' read -r container_id container_name container_service; do
    [[ "$container_name" == *backend* || "$container_service" == *backend* ]] || continue
    DOCKER_CONTAINER="$container_id"
    install_helper_with_docker
    if run_docker_exec health >/dev/null; then
      RUN_MODE=docker-exec
      return
    fi
  done < <(docker ps --format '{{.ID}}\t{{.Names}}\t{{.Label "com.docker.compose.service"}}')

  die "Impossible de joindre PostgreSQL, localement ou via un backend Docker Compose actif."
}

run_helper() {
  if [[ "$RUN_MODE" == local ]]; then
    run_local "$@"
  elif [[ "$RUN_MODE" == docker-compose ]]; then
    run_docker_compose "$@"
  elif [[ "$RUN_MODE" == docker-exec ]]; then
    run_docker_exec "$@"
  else
    "$ADD_USER_TEST_HELPER" "$@"
  fi
}

prompt_required() {
  local variable_name="$1" label="$2" value
  while true; do
    IFS= read -r -p "$label : " value || on_interrupt
    value="${value#"${value%%[![:space:]]*}"}"
    value="${value%"${value##*[![:space:]]}"}"
    if [[ -n "$value" ]]; then
      printf -v "$variable_name" '%s' "$value"
      return
    fi
    printf 'Cette valeur est obligatoire.\n' >&2
  done
}

validate_email() {
  [[ "$1" =~ ^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$ ]]
}

printf '%s\n' '========================================'
printf "%s\n" "       Création d’un utilisateur"
printf '%s\n\n' '========================================'
detect_runner
case "$RUN_MODE" in
  local)
    printf 'Environnement détecté : Local\nBackend actif          : dépendances locales\n'
    ;;
  docker-compose)
    printf 'Environnement détecté : Docker Compose\nBackend actif          : %s\n' "$COMPOSE_SERVICE"
    ;;
  docker-exec)
    printf 'Environnement détecté : Docker\nBackend actif          : %s\n' "$DOCKER_CONTAINER"
    ;;
  test)
    printf 'Environnement détecté : Test\nBackend actif          : auxiliaire de test\n'
    ;;
esac
printf 'Connexion PostgreSQL   : OK\n\n'

[[ -n "$FULL_NAME" ]] || prompt_required FULL_NAME 'Nom complet'
while true; do
  [[ -n "$EMAIL" ]] || prompt_required EMAIL 'Email'
  EMAIL="$(printf '%s' "$EMAIL" | tr '[:upper:]' '[:lower:]')"
  validate_email "$EMAIL" && break
  printf 'Format email invalide.\n' >&2
  EMAIL=""
done

if [[ -z "$PHONE" && "$PASSWORD_STDIN" == false ]]; then
  IFS= read -r -p 'Téléphone (facultatif) : ' PHONE || on_interrupt
fi

declare -a ROLE_NAMES=()
declare -a ROLE_DESCRIPTIONS=()
declare -a MISSING_ROLE_NAMES=()
declare -a MISSING_ROLE_DESCRIPTIONS=()
while IFS=$'\t' read -r role_status _role_id role_name role_description; do
  case "$role_status" in
    AVAILABLE)
      ROLE_NAMES[${#ROLE_NAMES[@]}]="$role_name"
      ROLE_DESCRIPTIONS[${#ROLE_DESCRIPTIONS[@]}]="$role_description"
      ;;
    MISSING)
      MISSING_ROLE_NAMES[${#MISSING_ROLE_NAMES[@]}]="$role_name"
      MISSING_ROLE_DESCRIPTIONS[${#MISSING_ROLE_DESCRIPTIONS[@]}]="$role_description"
      ;;
  esac
done < <(run_helper roles)

((${#ROLE_NAMES[@]} > 0)) || die "Aucun rôle n’est disponible dans la base."

printf '\n==========================================\n'
printf '          RÔLES DISPONIBLES\n'
printf '==========================================\n\n'
for ((role_index = 0; role_index < ${#ROLE_NAMES[@]}; role_index++)); do
  printf '%d) %s\n' "$((role_index + 1))" "${ROLE_NAMES[role_index]}"
  if [[ -n "${ROLE_DESCRIPTIONS[role_index]}" ]]; then
    printf '   %s\n' "${ROLE_DESCRIPTIONS[role_index]}"
  fi
  printf '\n'
done
printf '%s\n' '------------------------------------------'

if ((${#MISSING_ROLE_NAMES[@]} > 0)); then
  if ((${#ROLE_NAMES[@]} == 1)); then
    printf '\nAvertissement : le seed prévoit %d rôles, mais un seul est présent en base.\n' \
      "$(( ${#ROLE_NAMES[@]} + ${#MISSING_ROLE_NAMES[@]} ))" >&2
  else
    printf '\nAvertissement : le seed prévoit %d rôles, mais seuls %d sont présents en base.\n' \
      "$(( ${#ROLE_NAMES[@]} + ${#MISSING_ROLE_NAMES[@]} ))" "${#ROLE_NAMES[@]}" >&2
  fi
  printf 'Rôles prévus mais indisponibles :\n' >&2
  for ((missing_index = 0; missing_index < ${#MISSING_ROLE_NAMES[@]}; missing_index++)); do
    printf '  - %s' "${MISSING_ROLE_NAMES[missing_index]}" >&2
    if [[ -n "${MISSING_ROLE_DESCRIPTIONS[missing_index]}" ]]; then
      printf ' — %s' "${MISSING_ROLE_DESCRIPTIONS[missing_index]}" >&2
    fi
    printf '\n' >&2
  done
  printf 'Exécutez manuellement « npm run prisma:seed-roles » dans le backend pour les synchroniser.\n\n' >&2
fi

role_exists=false
if [[ -n "$ROLE" ]]; then
  normalized_role="$(printf '%s' "$ROLE" | tr '[:lower:]' '[:upper:]')"
  for role_name in "${ROLE_NAMES[@]}"; do
    if [[ "$normalized_role" == "$role_name" ]]; then
      ROLE="$role_name"
      role_exists=true
      break
    fi
  done
  [[ "$role_exists" == true ]] || die "Rôle invalide. Veuillez choisir un rôle existant."
else
  while true; do
    IFS= read -r -p 'Choisissez un rôle : ' choice || on_interrupt
    if [[ "$choice" =~ ^[0-9]+$ ]] && ((choice >= 1 && choice <= ${#ROLE_NAMES[@]})); then
      ROLE="${ROLE_NAMES[choice-1]}"
      break
    fi
    normalized_role="$(printf '%s' "$choice" | tr '[:lower:]' '[:upper:]')"
    for role_name in "${ROLE_NAMES[@]}"; do
      if [[ "$normalized_role" == "$role_name" ]]; then
        ROLE="$role_name"
        role_exists=true
        break
      fi
    done
    [[ "$role_exists" == true ]] && break
    printf 'Rôle invalide.\nVeuillez choisir un rôle existant.\n' >&2
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
    *) unset PASSWORD; printf "Création annulée. Aucune modification n’a été effectuée.\n"; exit 0 ;;
  esac
fi

set +e
RESULT="$(printf '%s\0%s\0%s\0%s\0%s\0%s' "$FULL_NAME" "$EMAIL" "$PHONE" "$PASSWORD" "$ROLE" "$ACTIVE" | run_helper create 2> >(sed -E 's/^ADD_USER_ERROR:[^:]+://' >&2))"
status=$?
set -e
unset PASSWORD
((status == 0)) || die "La création de l’utilisateur a échoué." "$status"

printf '\nUtilisateur créé avec succès.\n\n'
# Le programme JavaScript est volontairement littéral : Bash ne doit rien y développer.
# shellcheck disable=SC2016
printf '%s' "$RESULT" | node -e '
let s=""; process.stdin.on("data",c=>s+=c).on("end",()=>{
  const u=JSON.parse(s);
  console.log(`ID       : ${u.id}`);
  console.log(`Nom      : ${u.fullName}`);
  console.log(`Email    : ${u.email}`);
  console.log(`Rôle     : ${u.role.name}`);
  console.log(`Statut   : ${u.isActive ? "Actif" : "Inactif"}`);
});'
