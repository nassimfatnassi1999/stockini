#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd -- "${SCRIPT_DIR}/.." && pwd)"
ENV_FILE="${ENV_FILE:-${SCRIPT_DIR}/.env.prod}"
CONTAINER_NAME="${CONTAINER_NAME:-stockini-prod-postgres}"

if [[ ! -f "$ENV_FILE" ]]; then
  printf 'Erreur : fichier de configuration introuvable : %s\n' "$ENV_FILE" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

: "${DB_USER:?DB_USER doit être défini dans $ENV_FILE}"
: "${DB_PASSWORD:?DB_PASSWORD doit être défini dans $ENV_FILE}"
: "${DB_NAME:?DB_NAME doit être défini dans $ENV_FILE}"

if [[ "$(docker inspect -f '{{.State.Running}}' "$CONTAINER_NAME" 2>/dev/null || true)" != "true" ]]; then
  printf "Erreur : le conteneur '%s' n'est pas démarré.\n" "$CONTAINER_NAME" >&2
  exit 1
fi

ADMIN_USER="$(docker exec "$CONTAINER_NAME" printenv POSTGRES_USER)"
ADMIN_DB="$(docker exec "$CONTAINER_NAME" printenv POSTGRES_DB)"

if [[ -z "$ADMIN_USER" || -z "$ADMIN_DB" ]]; then
  printf 'Erreur : POSTGRES_USER ou POSTGRES_DB est absent du conteneur.\n' >&2
  exit 1
fi

printf "Configuration PostgreSQL de '%s' et de la base '%s'...\n" "$DB_USER" "$DB_NAME"

docker exec -i "$CONTAINER_NAME" psql \
  --username "$ADMIN_USER" \
  --dbname "$ADMIN_DB" \
  --set ON_ERROR_STOP=1 \
  --set target_user="$DB_USER" \
  --set target_password="$DB_PASSWORD" <<'SQL'
SELECT format('CREATE ROLE %I LOGIN PASSWORD %L', :'target_user', :'target_password')
WHERE NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = :'target_user')
\gexec
SELECT format('ALTER ROLE %I WITH LOGIN PASSWORD %L', :'target_user', :'target_password')
\gexec
SQL

docker exec -i "$CONTAINER_NAME" psql \
  --username "$ADMIN_USER" \
  --dbname "$ADMIN_DB" \
  --set ON_ERROR_STOP=1 \
  --set target_user="$DB_USER" \
  --set target_db="$DB_NAME" <<'SQL'
SELECT format('CREATE DATABASE %I OWNER %I', :'target_db', :'target_user')
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = :'target_db')
\gexec
SELECT format('ALTER DATABASE %I OWNER TO %I', :'target_db', :'target_user')
\gexec
SQL

docker exec -i "$CONTAINER_NAME" psql \
  --username "$ADMIN_USER" \
  --dbname "$DB_NAME" \
  --set ON_ERROR_STOP=1 \
  --set target_user="$DB_USER" <<'SQL'
SELECT format('GRANT ALL ON SCHEMA public TO %I', :'target_user')
\gexec
SELECT format('ALTER SCHEMA public OWNER TO %I', :'target_user')
\gexec
SELECT format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public GRANT ALL ON TABLES TO %I', :'target_user', :'target_user')
\gexec
SELECT format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public GRANT ALL ON SEQUENCES TO %I', :'target_user', :'target_user')
\gexec
SELECT format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public GRANT ALL ON FUNCTIONS TO %I', :'target_user', :'target_user')
\gexec
SQL

printf "Terminé : utilisateur '%s', base '%s'.\n" "$DB_USER" "$DB_NAME"
printf 'Connexion Docker : hôte=%s port=5432 base=%s utilisateur=%s\n' \
  "$CONTAINER_NAME" "$DB_NAME" "$DB_USER"

if [[ ! -t 0 ]]; then
  printf "Mode non interactif : création de l'utilisateur applicatif ignorée.\n"
  exit 0
fi

exec "${PROJECT_ROOT}/scripts/add-user.sh"
