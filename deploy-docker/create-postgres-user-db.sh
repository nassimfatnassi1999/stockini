#!/usr/bin/env bash

set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${ENV_FILE:-${SCRIPT_DIR}/.env.prod}"
CONTAINER_NAME="${CONTAINER_NAME:-stockini-prod-postgres}"

if [[ ! -f "$ENV_FILE" ]]; then
    echo "Erreur : fichier de configuration introuvable : $ENV_FILE" >&2
    exit 1
fi

# Charge DB_USER, DB_PASSWORD et DB_NAME depuis la configuration de production.
set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

: "${DB_USER:?DB_USER doit être défini dans $ENV_FILE}"
: "${DB_PASSWORD:?DB_PASSWORD doit être défini dans $ENV_FILE}"
: "${DB_NAME:?DB_NAME doit être défini dans $ENV_FILE}"

if [[ "$(docker inspect -f '{{.State.Running}}' "$CONTAINER_NAME" 2>/dev/null || true)" != "true" ]]; then
    echo "Erreur : le conteneur '$CONTAINER_NAME' n'est pas démarré." >&2
    exit 1
fi

# POSTGRES_USER est le superutilisateur réellement créé lors de l'initialisation
# de l'image officielle. Il ne s'appelle pas nécessairement « postgres ».
ADMIN_USER="$(docker exec "$CONTAINER_NAME" printenv POSTGRES_USER)"
ADMIN_DB="$(docker exec "$CONTAINER_NAME" printenv POSTGRES_DB)"

if [[ -z "$ADMIN_USER" || -z "$ADMIN_DB" ]]; then
    echo "Erreur : POSTGRES_USER ou POSTGRES_DB est absent du conteneur." >&2
    exit 1
fi

echo "Configuration PostgreSQL de '$DB_USER' et de la base '$DB_NAME'..."

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

echo "Terminé : utilisateur '$DB_USER', base '$DB_NAME'."
echo "URL Docker : postgresql://${DB_USER}:***@${CONTAINER_NAME}:5432/${DB_NAME}?schema=public"
