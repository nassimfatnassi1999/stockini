#!/usr/bin/env bash

set -Eeuo pipefail
IFS=$'\n\t'

# ============================================================
# PostgreSQL Docker Restore Assistant
# - Recherche interactive des dumps PostgreSQL sur le VPS
# - Exclut les fichiers de migration et les faux positifs courants
# - Détecte les conteneurs PostgreSQL actifs
# - Supporte .sql, .dump, .backup et fichiers compressés .gz
# - Affiche une animation horizontale pendant les opérations longues
# ============================================================

SCRIPT_NAME="$(basename "$0")"
TMP_DIR=""
SELECTED_DUMP=""
SELECTED_CONTAINER=""
DB_USER=""
DB_NAME=""
DUMP_FORMAT=""
RESTORE_MODE=""
RESTORE_FILE=""
DOCKER=()

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
BOLD='\033[1m'
DIM='\033[2m'
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

    error "Impossible d'accéder à Docker."
    error "Vérifiez que Docker est lancé et que votre utilisateur possède les permissions nécessaires."
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

# ------------------------------------------------------------
# Animation horizontale
# Usage :
#   run_with_progress "Message" commande arg1 arg2...
# La commande s'exécute en arrière-plan et la barre reste animée.
# ------------------------------------------------------------
run_with_progress() {
    local message="$1"
    shift

    local log_file
    log_file="$(mktemp)"
    local start_time
    start_time="$(date +%s)"

    "$@" >"$log_file" 2>&1 &
    local pid=$!

    local width=28
    local pos=0
    local direction=1
    local elapsed=0

    printf "\n"

    while kill -0 "$pid" 2>/dev/null; do
        local bar=""
        local i

        for ((i = 0; i < width; i++)); do
            if (( i == pos )); then
                bar+="█"
            elif (( i == pos - 1 || i == pos + 1 )); then
                bar+="▓"
            else
                bar+="░"
            fi
        done

        elapsed=$(( $(date +%s) - start_time ))

        printf "\r${CYAN}[%s]${RESET} %s ${DIM}%02ds${RESET}" \
            "$bar" "$message" "$elapsed"

        if (( direction == 1 )); then
            ((pos++)) || true
            if (( pos >= width - 1 )); then
                direction=-1
            fi
        else
            ((pos--)) || true
            if (( pos <= 0 )); then
                direction=1
            fi
        fi

        sleep 0.08
    done

    local rc=0
    if wait "$pid"; then
        rc=0
    else
        rc=$?
    fi

    elapsed=$(( $(date +%s) - start_time ))

    if (( rc == 0 )); then
        printf "\r${GREEN}[████████████████████████████]${RESET} %s ${DIM}%02ds${RESET}\n" \
            "$message" "$elapsed"
    else
        printf "\r${RED}[████████████████████████████]${RESET} %s ${DIM}%02ds${RESET}\n" \
            "$message" "$elapsed"
        error "La commande a échoué avec le code $rc."
        if [[ -s "$log_file" ]]; then
            printf "${YELLOW}Détail de l'erreur :${RESET}\n" >&2
            cat "$log_file" >&2
        fi
        rm -f "$log_file"
        return "$rc"
    fi

    cat "$log_file"
    rm -f "$log_file"
}

# ------------------------------------------------------------
# Recherche des dumps
# ------------------------------------------------------------
search_dump_files_internal() {
    local output_file="$1"
    shift
    local roots=("$@")

    {
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
        ! -path '*/vendor/*' \
        ! -path '*/.git/*' \
        ! -path '*/dist/*' \
        ! -path '*/build/*' \
        ! -path '*/coverage/*' \
        ! -path '*/target/*' \
        ! -path '*/cache/*' \
        ! -path '*/caches/*' \
        ! -path '*/tmp/*' \
        ! -path '*/temp/*' \
        ! -path '*/uploads/*' \
        ! -path '*/storage/framework/*' \
        ! -path '*/prisma/migrations/*' \
        ! -path '*/prisma/migration/*' \
        ! -path '*/database/migrations/*' \
        ! -path '*/db/migrations/*' \
        ! -path '*/migrations/*' \
        ! -path '*/migration/*' \
        ! -path '*/flyway/*' \
        ! -path '*/liquibase/*' \
        ! -path '*/typeorm/*' \
        ! -path '*/sequelize/*' \
        ! -path '*/alembic/*' \
        ! -path '*/proc/*' \
        ! -path '*/sys/*' \
        ! -path '*/dev/*' \
        ! -path '*/run/*' \
        2>/dev/null || true
    } \
    | while IFS= read -r file; do
        printf '%s\t%s\n' "$(stat -c '%Y' "$file" 2>/dev/null || echo 0)" "$file"
    done \
    | sort -rn \
    | cut -f2- \
    > "$output_file"
}

is_likely_postgres_sql_dump() {
    local file="$1"
    local sample=""

    if [[ "${file,,}" == *.gz ]]; then
        sample="$(gzip -dc "$file" 2>/dev/null | head -n 120 || true)"
    else
        sample="$(head -n 120 "$file" 2>/dev/null || true)"
    fi

    [[ -n "$sample" ]] || return 1

    if grep -Eqi \
        'PostgreSQL database dump|Dumped from database version|Dumped by pg_dump|SET statement_timeout|SET lock_timeout|SET client_encoding|CREATE DATABASE|CREATE TABLE|COPY .+ FROM stdin|INSERT INTO|ALTER TABLE|CREATE SEQUENCE|SELECT pg_catalog\.set_config' \
        <<< "$sample"; then
        return 0
    fi

    return 1
}

filter_dump_candidates_internal() {
    local raw_file="$1"
    local filtered_file="$2"

    : > "$filtered_file"

    while IFS= read -r file; do
        [[ -f "$file" ]] || continue
        [[ -s "$file" ]] || continue

        case "${file,,}" in
            *.dump|*.backup|*.dump.gz|*.backup.gz)
                printf '%s\n' "$file" >> "$filtered_file"
                ;;
            *.sql|*.sql.gz)
                if is_likely_postgres_sql_dump "$file"; then
                    printf '%s\n' "$file" >> "$filtered_file"
                fi
                ;;
        esac
    done < "$raw_file"
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
        "/backup"
        "/backups"
    )

    for candidate in "${default_roots[@]}"; do
        [[ -d "$candidate" ]] && roots+=("$candidate")
    done

    if [[ ${#roots[@]} -eq 0 ]]; then
        roots=("/")
    fi

    TMP_DIR="$(mktemp -d)"
    local raw_file="$TMP_DIR/raw-dumps.txt"
    local filtered_file="$TMP_DIR/filtered-dumps.txt"

    run_with_progress \
        "Recherche des fichiers dump sur le VPS..." \
        search_dump_files_internal "$raw_file" "${roots[@]}"

    run_with_progress \
        "Filtrage des migrations et faux fichiers SQL..." \
        filter_dump_candidates_internal "$raw_file" "$filtered_file"

    mapfile -t DUMP_FILES < "$filtered_file"

    if [[ ${#DUMP_FILES[@]} -eq 0 ]]; then
        error "Aucun dump PostgreSQL valide trouvé."
        printf "\nExtensions recherchées : .sql, .dump, .backup et versions .gz\n"
        printf "Les répertoires de migrations ont été exclus automatiquement.\n"
        exit 1
    fi

    success "${#DUMP_FILES[@]} dump(s) PostgreSQL valide(s) trouvé(s)."
}

select_dump() {
    printf "\n${BOLD}Dumps PostgreSQL disponibles :${RESET}\n\n"
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

decompress_dump_internal() {
    local source="$1"
    local target="$2"
    gzip -dc "$source" > "$target"
}

prepare_dump() {
    case "${SELECTED_DUMP,,}" in
        *.gz)
            require_command gzip
            local decompressed_name
            decompressed_name="$(basename "${SELECTED_DUMP%.gz}")"
            RESTORE_FILE="$TMP_DIR/$decompressed_name"

            run_with_progress \
                "Décompression temporaire du dump..." \
                decompress_dump_internal "$SELECTED_DUMP" "$RESTORE_FILE"
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
        error "Format non reconnu."
        exit 1
    fi

    success "Format détecté : $DUMP_FORMAT"
}

# ------------------------------------------------------------
# Détection des conteneurs PostgreSQL
# ------------------------------------------------------------
find_postgres_containers_internal() {
    local output_file="$1"

    : > "$output_file"

    "${DOCKER[@]}" ps \
        --format '{{.Names}}\t{{.Image}}\t{{.Status}}' \
    | while IFS=$'\t' read -r name image status; do
        if [[ "${image,,}" == *postgres* ]] ||
           "${DOCKER[@]}" exec "$name" sh -c \
               'command -v psql >/dev/null 2>&1' 2>/dev/null; then
            printf '%s\t%s\t%s\n' "$name" "$image" "$status" >> "$output_file"
        fi
    done
}

find_postgres_containers() {
    local container_file="$TMP_DIR/postgres-containers.txt"

    run_with_progress \
        "Détection des conteneurs PostgreSQL actifs..." \
        find_postgres_containers_internal "$container_file"

    mapfile -t PG_CONTAINERS < "$container_file"

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
            IFS=$'\t' read -r SELECTED_CONTAINER _ _ \
                <<< "${PG_CONTAINERS[$((choice - 1))]}"
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

    [[ -n "$detected" ]] || detected="postgres"

    while true; do
        read -r -p "Utilisateur PostgreSQL [$detected] : " DB_USER
        DB_USER="${DB_USER:-$detected}"

        if "${DOCKER[@]}" exec "$SELECTED_CONTAINER" \
            psql -U "$DB_USER" -d postgres -Atqc 'SELECT 1;' >/dev/null 2>&1; then
            success "Connexion PostgreSQL réussie avec '$DB_USER'."
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
    printf "   Pour un dump custom : --clean --if-exists.\n\n"
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
        "SELECT 1 FROM pg_database WHERE datname = '$DB_NAME';" 2>/dev/null \
    | grep -q '^1$'
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
    printf "  Dump        : %s\n" "$SELECTED_DUMP"
    printf "  Format      : %s\n" "$DUMP_FORMAT"
    printf "  Conteneur   : %s\n" "$SELECTED_CONTAINER"
    printf "  Utilisateur : %s\n" "$DB_USER"
    printf "  Base cible  : %s\n" "$DB_NAME"
    printf "  Mode        : %s\n" "$RESTORE_MODE"

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

recreate_database_internal() {
    terminate_connections || true

    "${DOCKER[@]}" exec "$SELECTED_CONTAINER" \
        psql -U "$DB_USER" -d postgres \
        -v ON_ERROR_STOP=1 \
        -c "DROP DATABASE IF EXISTS \"$DB_NAME\";"

    "${DOCKER[@]}" exec "$SELECTED_CONTAINER" \
        psql -U "$DB_USER" -d postgres \
        -v ON_ERROR_STOP=1 \
        -c "CREATE DATABASE \"$DB_NAME\" OWNER \"$DB_USER\";"
}

recreate_database() {
    run_with_progress \
        "Suppression et recréation de la base '$DB_NAME'..." \
        recreate_database_internal
}

restore_sql_internal() {
    "${DOCKER[@]}" exec -i "$SELECTED_CONTAINER" \
        psql \
        -U "$DB_USER" \
        -d "$DB_NAME" \
        -v ON_ERROR_STOP=1 \
        < "$RESTORE_FILE"
}

restore_sql() {
    run_with_progress \
        "Restauration du dump SQL dans '$DB_NAME'..." \
        restore_sql_internal
}

restore_custom_internal() {
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

    "${DOCKER[@]}" exec -i "$SELECTED_CONTAINER" \
        "${args[@]}" \
        < "$RESTORE_FILE"
}

restore_custom() {
    run_with_progress \
        "Restauration du dump custom dans '$DB_NAME'..." \
        restore_custom_internal
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
    printf "  Tables utilisateur détectées : %s\n" "$table_count"

    printf "\n${BOLD}Premières tables :${RESET}\n"
    "${DOCKER[@]}" exec "$SELECTED_CONTAINER" \
        psql -U "$DB_USER" -d "$DB_NAME" -P pager=off \
        -c "\dt" 2>/dev/null | head -n 25 || true
}

main() {
    print_header

    require_command find
    require_command stat
    require_command du
    require_command head
    require_command grep
    require_command sort
    require_command cut
    require_command mktemp
    require_command date
    require_command sleep

    setup_docker_command
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