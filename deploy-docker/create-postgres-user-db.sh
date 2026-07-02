#!/usr/bin/env bash

set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${ENV_FILE:-${SCRIPT_DIR}/.env.prod}"
CONTAINER_NAME="${CONTAINER_NAME:-stockini-prod-postgres}"
BACKEND_CONTAINER_NAME="${BACKEND_CONTAINER_NAME:-stockini-prod-backend}"

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

if [[ ! -t 0 ]]; then
    echo "Mode non interactif : création de l'utilisateur applicatif ignorée."
    exit 0
fi

if [[ "$(docker inspect -f '{{.State.Running}}' "$BACKEND_CONTAINER_NAME" 2>/dev/null || true)" != "true" ]]; then
    echo "Erreur : le conteneur backend '$BACKEND_CONTAINER_NAME' n'est pas démarré." >&2
    exit 1
fi

echo
echo "Création d'un utilisateur Stockini"
echo "----------------------------------"

while :; do
    read -r -p "Nom complet : " APP_FULL_NAME
    [[ -n "${APP_FULL_NAME//[[:space:]]/}" ]] && break
    echo "Le nom complet est obligatoire."
done

while :; do
    read -r -p "E-mail : " APP_EMAIL
    if [[ "$APP_EMAIL" =~ ^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$ ]]; then
        APP_EMAIL="${APP_EMAIL,,}"
        break
    fi
    echo "Adresse e-mail invalide."
done

read -r -p "Téléphone (facultatif) : " APP_PHONE

while :; do
    read -r -s -p "Mot de passe (8 caractères minimum) : " APP_PASSWORD
    echo
    read -r -s -p "Confirmer le mot de passe : " APP_PASSWORD_CONFIRM
    echo

    if (( ${#APP_PASSWORD} < 8 )); then
        echo "Le mot de passe doit contenir au moins 8 caractères."
    elif [[ "$APP_PASSWORD" != "$APP_PASSWORD_CONFIRM" ]]; then
        echo "Les mots de passe ne correspondent pas."
    else
        break
    fi
done
unset APP_PASSWORD_CONFIRM

ROLES=("ADMIN" "STOCK_MANAGER" "SELLER" "PURCHASE_MANAGER")
echo "Rôles disponibles :"
for index in "${!ROLES[@]}"; do
    printf '  %d) %s\n' "$((index + 1))" "${ROLES[$index]}"
done

while :; do
    read -r -p "Choisir le rôle [1-${#ROLES[@]}] : " ROLE_CHOICE
    if [[ "$ROLE_CHOICE" =~ ^[1-4]$ ]]; then
        APP_ROLE="${ROLES[$((ROLE_CHOICE - 1))]}"
        break
    fi
    echo "Choix invalide."
done

read -r -p "Compte actif ? [O/n] : " ACTIVE_CHOICE
case "${ACTIVE_CHOICE,,}" in
    ""|o|oui|y|yes) APP_IS_ACTIVE="true" ;;
    n|non|no) APP_IS_ACTIVE="false" ;;
    *) echo "Réponse invalide, compte créé actif."; APP_IS_ACTIVE="true" ;;
esac

echo
echo "Création de '$APP_EMAIL' avec le rôle '$APP_ROLE'..."

# Les valeurs sont encodées avant leur passage sur stdin afin de préserver les
# caractères spéciaux. Le mot de passe n'apparaît ni dans la commande ni dans les logs.
{
    printf '%s' "$APP_FULL_NAME" | base64 | tr -d '\n'; printf '\n'
    printf '%s' "$APP_EMAIL" | base64 | tr -d '\n'; printf '\n'
    printf '%s' "$APP_PHONE" | base64 | tr -d '\n'; printf '\n'
    printf '%s' "$APP_PASSWORD" | base64 | tr -d '\n'; printf '\n'
    printf '%s\n' "$APP_ROLE"
    printf '%s\n' "$APP_IS_ACTIVE"
} | docker exec -i "$BACKEND_CONTAINER_NAME" node -e '
const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");
const readline = require("node:readline");
const prisma = new PrismaClient();
const lines = [];
readline.createInterface({ input: process.stdin })
  .on("line", line => lines.push(line))
  .on("close", async () => {
    try {
      const decode = value => Buffer.from(value, "base64").toString("utf8");
      const [fullName64, email64, phone64, password64, roleName, isActive] = lines;
      const email = decode(email64);
      const existing = await prisma.user.findUnique({ where: { email } });
      if (existing) throw new Error(`Un utilisateur avec l’e-mail ${email} existe déjà.`);
      const role = await prisma.role.findUnique({ where: { name: roleName } });
      if (!role) throw new Error(`Le rôle ${roleName} n’existe pas. Exécutez d’abord les migrations et le seed.`);
      const user = await prisma.user.create({
        data: {
          fullName: decode(fullName64),
          email,
          phone: decode(phone64) || null,
          passwordHash: await bcrypt.hash(decode(password64), 10),
          roleId: role.id,
          isActive: isActive === "true",
        },
        select: { email: true, fullName: true, isActive: true, role: { select: { name: true } } },
      });
      console.log(`Utilisateur créé : ${user.fullName} <${user.email}> — ${user.role.name} — ${user.isActive ? "actif" : "inactif"}`);
    } catch (error) {
      console.error(`Erreur : ${error.message}`);
      process.exitCode = 1;
    } finally {
      await prisma.$disconnect();
    }
  });
'

unset APP_PASSWORD
