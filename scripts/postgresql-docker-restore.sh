#!/usr/bin/env bash

set -Eeuo pipefail
IFS=$'\n\t'

# ============================================================
# PostgreSQL Docker Restore Assistant
# Recherche les dumps PostgreSQL sur le VPS et les restaure
# dans un conteneur PostgreSQL Docker choisi interactivement.
# ============================================================

SCRIPT_NAME="$(basename "$0")"
TMP_DIR=""
SELECTED_DUMP=""
SELECTED_CONTAINER=""
DB_USER=""
DB_NAME=""
DUMP_FORMAT=""
RESTORE_MODE=""

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
RESET='\033[0m'

info()    { printf "${BLUE}[INFO]${RESET} %s\n" "$*"; }
success() { printf "${GREEN}[OK]${RESET} %s\n" "$*"; }
warn()    { printf "${YELLOW}[ATTENTION]${RESET} %s\n" "$*"; }
error()   { printf "${RED}[ERREUR]${RESET} %s\n" "$*" >&2; }

cleanup() {
    if [[ -n "${TMP_DIR:-}" && -d "$TMP_DIR" ]]; then
        rm -rf "$TMP_DIR"
    fi
}
trap cleanup EXIT
trap 'error "Échec à la ligne $LINENO."; exit 1' ERR

print_header() {
    clear 2>/dev/null || true
    printf "${BOLD}${CYAN}"
    cat <<'EOF'
============================================================
        RESTAURATION POSTGRESQL DANS DOCKER
============================================================
EOF
    printf "${RESET}\n"
}

pause() {
    read -r -p "Appuyez sur Entrée pour continuer..." _
}

require_command() {
    command -v "$1" >/dev/null 2>&1 || {
        error "Commande requise introuvable : $1"
        exit 1
    }
}

setup_docker_command() {
    require_command docker

    if docker info >/dev/null 2>&1; then
        DOCKER=(docker)
        return
    fi

    if command -v sudo >/dev/null 2>&1 && sudo docker info >/dev/null 2>&1; then
        warn "Docker nécessite sudo sur ce VPS."
        DOCKER=(sudo docker)
        return
    fi

    error "Impossible d'accéder à Docker. Vérifiez que Docker est lancé et que votre utilisateur possède les permissions."
    exit 1
}

human_size() {
    local file="$1"
    du -h "$file" 2>/dev/null | awk '{print $1}' || printf "?"
}

file_date() {
    local file="$1"
    stat -c '%y' "$file" 2>/dev/null | cut -d'.' -f1 || printf "Date inconnue"
}

find_dumps() {
    local roots=()
    local candidate
    local default_roots=(
        "/home"
        "/opt"
        "/var/backups"
        "/srv"
        "/root"
        "/tmp"
    )

    info "Recherche des dumps PostgreSQL sur le VPS..."

    for candidate in "${default_roots[@]}"; do
        [[ -d "$candidate" ]] && roots+=("$candidate")
    done

    if [[ ${#roots[@]} -eq 0 ]]; then
        roots=("/")
    fi

    mapfile -t DUMP_FILES < <(
        find "${roots[@]}" \
            -xdev \
            -type f \
            \( \
                -iname '*.sql' \
                -o -iname '*.dump' \
                -o -iname '*.backup' \
                -o -iname '*.sql.gz' \
                -o -iname '*.dump.gz' \
                -o -iname '*.backup.gz' \
            \) \
            ! -path '*/node_modules/*' \
            ! -path '*/.git/*' \
            ! -path '*/proc/*' \
            ! -path '*/sys/*' \
            ! -path '*/dev/*' \
            ! -path '*/run/*' \
            2>/dev/null |
        while IFS= read -r file; do
            printf '%s\t%s\n' "$(stat -c '%Y' "$file" 2>/dev/null || echo 0)" "$file"
        done |
        sort -rn |
        cut -f2-
    )

    if [[ ${#DUMP_FILES[@]} -eq 0 ]]; then
        error "Aucun dump PostgreSQL trouvé."
        printf "\nExtensions recherchées : .sql, .dump, .backup et versions .gz\n"
        exit 1
    fi

    success "${#DUMP_FILES[@]} dump(s) trouvé(s)."
}

select_dump() {
    printf "\n${BOLD}Dumps disponibles :${RESET}\n\n"
    printf "%-5s %-12s %-20s %s\n" "N°" "TAILLE" "DATE" "CHEMIN"
    printf "%-5s %-12s %-20s %s\n" "--" "------" "----" "------"

    local i
    for i in "${!DUMP_FILES[@]}"; do
        printf "%-5s %-12s %-20s %s\n" \
            "$((i + 1)))" \
            "$(human_size "${DUMP_FILES[$i]}")" \
            "$(file_date "${DUMP_FILES[$i]}")" \
            "${DUMP_FILES[$i]}"
    done

    printf "\n0) Quitter\n"

    while true; do
        read -r -p "Choisissez le dump à restaurer : " choice

        if [[ "$choice" == "0" ]]; then
            exit 0
        fi

        if [[ "$choice" =~ ^[0-9]+$ ]] &&
           (( choice >= 1 && choice <= ${#DUMP_FILES[@]} )); then
            SELECTED_DUMP="${DUMP_FILES[$((choice - 1))]}"
            break
        fi

        warn "Choix invalide."
    done

    success "Dump sélectionné : $SELECTED_DUMP"
}

prepare_dump() {
    TMP_DIR="$(mktemp -d)"

    case "${SELECTED_DUMP,,}" in
        *.gz)
            require_command gzip
            info "Décompression temporaire du dump..."
            local decompressed_name
            decompressed_name="$(basename "${SELECTED_DUMP%.gz}")"
            gzip -dc "$SELECTED_DUMP" > "$TMP_DIR/$decompressed_name"
            RESTORE_FILE="$TMP_DIR/$decompressed_name"
            ;;
        *)
            RESTORE_FILE="$SELECTED_DUMP"
            ;;
    esac

    if [[ ! -s "$RESTORE_FILE" ]]; then
        error "Le dump est vide ou illisible : $RESTORE_FILE"
        exit 1
    fi

    if head -c 5 "$RESTORE_FILE" 2>/dev/null | grep -q '^PGDMP'; then
        DUMP_FORMAT="custom"
    elif grep -Iq . "$RESTORE_FILE" 2>/dev/null; then
        DUMP_FORMAT="sql"
    else
        error "Format non reconnu. Le fichier n'est ni un SQL texte ni un dump PostgreSQL custom."
        exit 1
    fi

    success "Format détecté : $DUMP_FORMAT"
}

find_postgres_containers() {
    mapfile -t PG_CONTAINERS < <(
        "${DOCKER[@]}" ps \
            --format '{{.Names}}\t{{.Image}}\t{{.Status}}' |
        while IFS=$'\t' read -r name image status; do
            if [[ "${image,,}" == *postgres* ]] ||
               "${DOCKER[@]}" exec "$name" sh -c 'command -v psql >/dev/null 2>&1' 2>/dev/null; then
                printf '%s\t%s\t%s\n' "$name" "$image" "$status"
            fi
        done
    )

    if [[ ${#PG_CONTAINERS[@]} -eq 0 ]]; then
        error "Aucun conteneur PostgreSQL actif trouvé."
        printf "\nConteneurs actifs :\n"
        "${DOCKER[@]}" ps --format '  - {{.Names}} | {{.Image}} | {{.Status}}'
        exit 1
    fi
}

select_container() {
    printf "\n${BOLD}Conteneurs PostgreSQL actifs :${RESET}\n\n"

    local i name image status
    for i in "${!PG_CONTAINERS[@]}"; do
        IFS=$'\t' read -r name image status <<< "${PG_CONTAINERS[$i]}"
        printf "%d) %s\n" "$((i + 1))" "$name"
        printf "   Image  : %s\n" "$image"
        printf "   Statut : %s\n\n" "$status"
    done

    printf "0) Quitter\n"

    while true; do
        read -r -p "Choisissez le conteneur PostgreSQL : " choice

        if [[ "$choice" == "0" ]]; then
            exit 0
        fi

        if [[ "$choice" =~ ^[0-9]+$ ]] &&
           (( choice >= 1 && choice <= ${#PG_CONTAINERS[@]} )); then
            IFS=$'\t' read -r SELECTED_CONTAINER _ _ <<< "${PG_CONTAINERS[$((choice - 1))]}"
            break
        fi

        warn "Choix invalide."
    done

    success "Conteneur sélectionné : $SELECTED_CONTAINER"
}

detect_default_user() {
    local detected=""

    detected="$("${DOCKER[@]}" exec "$SELECTED_CONTAINER" sh -c \
        'printf "%s" "${POSTGRES_USER:-}"' 2>/dev/null || true)"

    if [[ -z "$detected" ]]; then
        detected="postgres"
    fi

    while true; do
        read -r -p "Utilisateur PostgreSQL [$detected] : " DB_USER
        DB_USER="${DB_USER:-$detected}"

        if "${DOCKER[@]}" exec "$SELECTED_CONTAINER" \
            psql -U "$DB_USER" -d postgres -Atqc 'SELECT 1;' >/dev/null 2>&1; then
            success "Connexion PostgreSQL réussie avec l'utilisateur '$DB_USER'."
            break
        fi

        warn "Connexion impossible avec '$DB_USER'."
        read -r -p "Réessayer avec un autre utilisateur ? [O/n] : " retry
        [[ "${retry,,}" == "n" ]] && exit 1
    done
}

list_databases() {
    mapfile -t DATABASES < <(
        "${DOCKER[@]}" exec "$SELECTED_CONTAINER" \
            psql -U "$DB_USER" -d postgres -Atqc \
            "SELECT datname
             FROM pg_database
             WHERE datistemplate = false
             ORDER BY datname;" 2>/dev/null
    )

    printf "\n${BOLD}Bases disponibles :${RESET}\n\n"

    local i
    for i in "${!DATABASES[@]}"; do
        printf "%d) %s\n" "$((i + 1))" "${DATABASES[$i]}"
    done

    printf "N) Saisir ou créer une autre base\n"
    printf "0) Quitter\n"

    while true; do
        read -r -p "Choisissez la base cible : " choice

        if [[ "$choice" == "0" ]]; then
            exit 0
        fi

        if [[ "${choice,,}" == "n" ]]; then
            read -r -p "Nom de la base cible : " DB_NAME
            if [[ "$DB_NAME" =~ ^[a-zA-Z_][a-zA-Z0-9_-]*$ ]]; then
                break
            fi
            warn "Nom de base invalide."
            continue
        fi

        if [[ "$choice" =~ ^[0-9]+$ ]] &&
           (( choice >= 1 && choice <= ${#DATABASES[@]} )); then
            DB_NAME="${DATABASES[$((choice - 1))]}"
            break
        fi

        warn "Choix invalide."
    done

    success "Base cible : $DB_NAME"
}

choose_restore_mode() {
    printf "\n${BOLD}Mode de restauration :${RESET}\n\n"
    printf "1) Restaurer dans la base existante\n"
    printf "   Le dump est injecté sans supprimer la base.\n\n"
    printf "2) Nettoyer les objets puis restaurer\n"
    printf "   pg_restore --clean pour les dumps custom.\n"
    printf "   Pour un SQL, le script est exécuté tel quel.\n\n"
    printf "3) Supprimer et recréer complètement la base\n"
    printf "   Recommandé pour une restauration complète propre.\n\n"
    printf "0) Quitter\n"

    while true; do
        read -r -p "Choisissez le mode : " RESTORE_MODE
        case "$RESTORE_MODE" in
            0) exit 0 ;;
            1|2|3) break ;;
            *) warn "Choix invalide." ;;
        esac
    done
}

database_exists() {
    "${DOCKER[@]}" exec "$SELECTED_CONTAINER" \
        psql -U "$DB_USER" -d postgres -Atqc \
        "SELECT 1 FROM pg_database WHERE datname = '$DB_NAME';" 2>/dev/null |
        grep -q '^1$'
}

create_database_if_missing() {
    if database_exists; then
        return
    fi

    warn "La base '$DB_NAME' n'existe pas."
    read -r -p "La créer maintenant ? [O/n] : " answer

    if [[ "${answer,,}" == "n" ]]; then
        exit 1
    fi

    "${DOCKER[@]}" exec "$SELECTED_CONTAINER" \
        psql -U "$DB_USER" -d postgres \
        -v ON_ERROR_STOP=1 \
        -c "CREATE DATABASE \"$DB_NAME\" OWNER \"$DB_USER\";"

    success "Base '$DB_NAME' créée."
}

show_summary_and_confirm() {
    printf "\n${BOLD}${YELLOW}Résumé de la restauration${RESET}\n"
    printf "  Dump       : %s\n" "$SELECTED_DUMP"
    printf "  Format     : %s\n" "$DUMP_FORMAT"
    printf "  Conteneur  : %s\n" "$SELECTED_CONTAINER"
    printf "  Utilisateur: %s\n" "$DB_USER"
    printf "  Base cible : %s\n" "$DB_NAME"
    printf "  Mode       : %s\n" "$RESTORE_MODE"

    if [[ "$RESTORE_MODE" == "3" ]]; then
        printf "\n${RED}${BOLD}"
        printf "ATTENTION : la base '%s' sera supprimée avec toutes ses données.\n" "$DB_NAME"
        printf "${RESET}"
        read -r -p "Tapez exactement le nom de la base pour confirmer : " confirmation

        if [[ "$confirmation" != "$DB_NAME" ]]; then
            error "Confirmation incorrecte. Restauration annulée."
            exit 1
        fi
    else
        printf "\n"
        read -r -p "Confirmer la restauration ? [o/N] : " confirmation
        if [[ "${confirmation,,}" != "o" && "${confirmation,,}" != "oui" ]]; then
            warn "Restauration annulée."
            exit 0
        fi
    fi
}

terminate_connections() {
    "${DOCKER[@]}" exec "$SELECTED_CONTAINER" \
        psql -U "$DB_USER" -d postgres \
        -v ON_ERROR_STOP=1 \
        -c "SELECT pg_terminate_backend(pid)
            FROM pg_stat_activity
            WHERE datname = '$DB_NAME'
              AND pid <> pg_backend_pid();" >/dev/null
}

recreate_database() {
    info "Fermeture des connexions à la base..."
    terminate_connections || true

    info "Suppression de la base '$DB_NAME'..."
    "${DOCKER[@]}" exec "$SELECTED_CONTAINER" \
        psql -U "$DB_USER" -d postgres \
        -v ON_ERROR_STOP=1 \
        -c "DROP DATABASE IF EXISTS \"$DB_NAME\";"

    info "Création de la base '$DB_NAME'..."
    "${DOCKER[@]}" exec "$SELECTED_CONTAINER" \
        psql -U "$DB_USER" -d postgres \
        -v ON_ERROR_STOP=1 \
        -c "CREATE DATABASE \"$DB_NAME\" OWNER \"$DB_USER\";"
}

restore_sql() {
    info "Restauration du dump SQL..."

    "${DOCKER[@]}" exec -i "$SELECTED_CONTAINER" \
        psql \
        -U "$DB_USER" \
        -d "$DB_NAME" \
        -v ON_ERROR_STOP=1 \
        < "$RESTORE_FILE"
}

restore_custom() {
    local args=(
        pg_restore
        -U "$DB_USER"
        -d "$DB_NAME"
        --no-owner
        --no-privileges
        --exit-on-error
        --verbose
    )

    if [[ "$RESTORE_MODE" == "2" ]]; then
        args+=(--clean --if-exists)
    fi

    info "Restauration du dump custom PostgreSQL..."

    "${DOCKER[@]}" exec -i "$SELECTED_CONTAINER" \
        "${args[@]}" \
        < "$RESTORE_FILE"
}

verify_restore() {
    printf "\n"
    info "Vérification de la restauration..."

    local table_count
    table_count="$("${DOCKER[@]}" exec "$SELECTED_CONTAINER" \
        psql -U "$DB_USER" -d "$DB_NAME" -Atqc \
        "SELECT COUNT(*)
         FROM information_schema.tables
         WHERE table_schema NOT IN ('pg_catalog', 'information_schema');" \
        2>/dev/null || echo "?")"

    success "Restauration terminée."
    printf "  Base restaurée : %s\n" "$DB_NAME"
    printf "  Nombre de tables utilisateur détectées : %s\n" "$table_count"

    printf "\n${BOLD}Premières tables :${RESET}\n"
    "${DOCKER[@]}" exec "$SELECTED_CONTAINER" \
        psql -U "$DB_USER" -d "$DB_NAME" -P pager=off \
        -c "\dt" 2>/dev/null | head -n 25 || true
}

main() {
    print_header
    setup_docker_command
    require_command find
    require_command stat
    require_command du
    require_command head
    require_command grep
    require_command sort
    require_command cut
    require_command mktemp

    find_dumps
    select_dump
    prepare_dump
    find_postgres_containers
    select_container
    detect_default_user
    list_databases
    choose_restore_mode
    create_database_if_missing
    show_summary_and_confirm

    if [[ "$RESTORE_MODE" == "3" ]]; then
        recreate_database
    fi

    if [[ "$DUMP_FORMAT" == "sql" ]]; then
        restore_sql
    else
        restore_custom
    fi

    verify_restore
}

main "$@"
