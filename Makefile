# ──────────────────────────────────────────────────────────────────────────────
#  Stockini — Gestion de pièces de rechange
#  Makefile de développement, base de données, Prisma, Docker et production
# ──────────────────────────────────────────────────────────────────────────────

SHELL := /bin/bash
ROOT_DIR := $(abspath $(dir $(lastword $(MAKEFILE_LIST))))
BACKEND := $(ROOT_DIR)/backend
FRONTEND := $(ROOT_DIR)/frontend
ENV_FILE := $(ROOT_DIR)/.env

COMPOSE := docker compose --env-file .env
PROD_ENV_FILE := $(ROOT_DIR)/deploy-docker/.env.prod
PROD_COMPOSE_FILE := $(ROOT_DIR)/deploy-docker/docker-compose.prod.yml
COMPOSE_PROD := docker compose --env-file $(PROD_ENV_FILE) -f $(PROD_COMPOSE_FILE)
PROD_BACKEND_CONTAINER := stockini-prod-backend
PROD_FRONTEND_CONTAINER := stockini-prod-frontend
PROD_POSTGRES_CONTAINER := stockini-prod-postgres
PROD_MINIO_CONTAINER := stockini-prod-minio
PROD_NETWORK := stockini-prod-network
PROD_WAIT_TIMEOUT ?= 60
PROD_WAIT_FRONTEND ?= 1

# Détection robuste du service PostgreSQL: la consigne cible "db",
# le compose actuel peut encore utiliser "postgres".
COMPOSE_SERVICES := $(if $(wildcard $(ENV_FILE)),$(shell docker compose --project-directory "$(ROOT_DIR)" --env-file "$(ENV_FILE)" -f "$(ROOT_DIR)/docker-compose.yml" config --services),)
DB_SERVICE := $(if $(filter db,$(COMPOSE_SERVICES)),db,$(if $(filter postgres,$(COMPOSE_SERVICES)),postgres,db))
MINIO_SERVICE := minio
MINIO_PORT ?= 9000
DB_USER ?= stockpro
DB_NAME ?= stockpro_db
BACKEND_PORT ?= 3001
FRONTEND_PORT ?= 3000

GREEN := \033[0;32m
YELLOW := \033[1;33m
BLUE := \033[0;34m
RED := \033[0;31m
BOLD := \033[1m
NC := \033[0m

-include .env

.DEFAULT_GOAL := help

.PHONY: help add-user install install-backend install-frontend dev preview stop \
	db-up db-down db-wait db-migrate db-seed db-seed-only db-reset studio \
	minio-up minio-down minio-wait \
	logs logs-db logs-minio build clear clean-all \
	prod prod-deploy prod-undeploy prod-logs prod-status prod-restart \
	prod-migrate prod-buckets prod-wait prod-clean \
	env-check deps-check backend-env-check frontend-env-check prod-env-check

help: ## Afficher cette aide
	@echo ""
	@echo -e "$(BLUE)$(BOLD)Stockini — Gestion de pièces de rechange$(NC)"
	@echo -e "$(BLUE)================================================$(NC)"
	@echo ""
	@awk 'BEGIN {FS = ":.*##"; printf "$(BOLD)Commandes disponibles:$(NC)\n\n"} /^[a-zA-Z0-9_-]+:.*##/ {printf "  $(GREEN)%-22s$(NC) %s\n", $$1, $$2}' $(MAKEFILE_LIST)
	@echo ""
	@echo -e "$(YELLOW)Recommandation$(NC)"
	@echo -e "  Utilisez $(BOLD)make preview$(NC) pour tester l'application sans lenteur de compilation Next.js."
	@echo ""
	@echo -e "$(YELLOW)URLs locales$(NC)"
	@echo "  Backend       : http://localhost:$(BACKEND_PORT)/api"
	@echo "  Swagger       : http://localhost:$(BACKEND_PORT)/api/docs"
	@echo "  Frontend      : http://localhost:$(FRONTEND_PORT)"
	@echo "  Prisma Studio : http://localhost:5555"
	@echo "  MinIO Console : http://localhost:9001"
	@echo ""
	@echo -e "$(YELLOW)Environnement$(NC)"
	@echo "  Fichier unique: $(ENV_FILE)"
	@echo "  Service DB    : $(DB_SERVICE)"

add-user: ## Créer un utilisateur de manière interactive
	@echo "Lancement de l'assistant de création d'utilisateur..."
	@if [ ! -f "$(ROOT_DIR)/scripts/add-user.sh" ]; then \
		echo "Erreur : scripts/add-user.sh est introuvable."; \
		exit 1; \
	fi
	@if [ ! -x "$(ROOT_DIR)/scripts/add-user.sh" ]; then \
		echo "Le script n'est pas exécutable. Correction des permissions..."; \
		chmod +x "$(ROOT_DIR)/scripts/add-user.sh"; \
	fi
	@"$(ROOT_DIR)/scripts/add-user.sh"

env-check:
	@if [ ! -f "$(ENV_FILE)" ]; then \
		echo -e "$(YELLOW).env absent, création depuis .env.example...$(NC)"; \
		if [ ! -f "$(ROOT_DIR)/.env.example" ]; then \
			echo -e "$(RED)Erreur: .env.example introuvable.$(NC)"; \
			exit 1; \
		fi; \
		cp "$(ROOT_DIR)/.env.example" "$(ENV_FILE)"; \
	fi

backend-env-check: env-check
	@if [ ! -d "$(BACKEND)" ]; then \
		echo -e "$(RED)Erreur: dossier backend introuvable.$(NC)"; \
		exit 1; \
	fi

frontend-env-check: env-check
	@if [ ! -d "$(FRONTEND)" ]; then \
		echo -e "$(RED)Erreur: dossier frontend introuvable.$(NC)"; \
		exit 1; \
	fi

prod-env-check:
	@if [ ! -f "$(PROD_ENV_FILE)" ]; then \
		echo -e "$(RED)Erreur: deploy-docker/.env.prod introuvable. Créez-le avant tout déploiement.$(NC)"; \
		exit 1; \
	fi
	@if [ ! -f "$(PROD_COMPOSE_FILE)" ]; then \
		echo -e "$(RED)Erreur: deploy-docker/docker-compose.prod.yml introuvable.$(NC)"; \
		exit 1; \
	fi

deps-check: backend-env-check frontend-env-check
	@if [ ! -d "$(BACKEND)/node_modules" ]; then \
		$(MAKE) install-backend; \
	fi
	@if [ ! -d "$(FRONTEND)/node_modules" ]; then \
		$(MAKE) install-frontend; \
	fi

install: install-backend install-frontend ## Installer toutes les dépendances
	@echo -e "$(GREEN)Toutes les dépendances Stockini sont installées.$(NC)"

install-backend: backend-env-check ## Installer les dépendances backend
	@echo -e "$(BLUE)Installation des dépendances backend...$(NC)"
	@cd "$(BACKEND)" && set -a && source "$(ENV_FILE)" && set +a && npm install

install-frontend: frontend-env-check ## Installer les dépendances frontend
	@echo -e "$(BLUE)Installation des dépendances frontend...$(NC)"
	@cd "$(FRONTEND)" && set -a && source "$(ENV_FILE)" && set +a && npm install

dev: env-check deps-check db-up minio-up db-wait minio-wait db-migrate db-seed ## Lancer backend et frontend en développement (HMR)
	@echo -e "$(GREEN)Démarrage Stockini en développement (Mode HMR)...$(NC)"
	@set -a; source "$(ENV_FILE)"; set +a; \
	initial_port="$${PORT:-$(BACKEND_PORT)}"; \
	initial_frontend_port="$(FRONTEND_PORT)"; \
	is_port_busy() { \
		local port="$$1"; \
		if command -v lsof >/dev/null 2>&1; then \
			lsof -iTCP:"$$port" -sTCP:LISTEN -Pn >/dev/null 2>&1 && return 0; \
		fi; \
		if command -v ss >/dev/null 2>&1; then \
			ss -ltn 2>/dev/null | awk -v target=":$$port" '$$4 ~ target "$$" { found = 1 } END { exit !found }' && return 0; \
		fi; \
		(timeout 1 bash -c "cat < /dev/null > /dev/tcp/127.0.0.1/$$port") >/dev/null 2>&1; \
	}; \
	find_free_port() { \
		local port="$$1"; \
		while is_port_busy "$$port"; do \
			port=$$((port + 1)); \
		done; \
		echo "$$port"; \
	}; \
	backend_port="$$(find_free_port "$$initial_port")"; \
	frontend_port="$$(find_free_port "$$initial_frontend_port")"; \
	while [ "$$frontend_port" = "$$backend_port" ]; do \
		frontend_port="$$(find_free_port "$$((frontend_port + 1))")"; \
	done; \
	if [ "$$backend_port" != "$$initial_port" ]; then \
		echo -e "$(YELLOW)⚠ Port $$initial_port occupé → fallback sur $$backend_port$(NC)"; \
	fi; \
	if [ "$$frontend_port" != "$$initial_frontend_port" ]; then \
		echo -e "$(YELLOW)⚠ Port $$initial_frontend_port occupé → fallback sur $$frontend_port$(NC)"; \
	fi; \
	echo -e "$(YELLOW)Backend → http://localhost:$$backend_port/api$(NC)"; \
	echo -e "$(YELLOW)Swagger → http://localhost:$$backend_port/api/docs$(NC)"; \
	echo -e "$(YELLOW)Frontend → http://localhost:$$frontend_port$(NC)"; \
	trap 'kill 0' INT TERM EXIT; \
	(cd "$(BACKEND)" && set -a && source "$(ENV_FILE)" && set +a && PORT="$$backend_port" npm run start:dev 2>&1 | sed -u 's/^/[backend] /') & \
	(cd "$(FRONTEND)" && set -a && source "$(ENV_FILE)" && set +a && PORT="$$frontend_port" NEXT_TELEMETRY_DISABLED=1 NEXT_PUBLIC_API_URL="http://localhost:$$backend_port" npm run dev 2>&1 | sed -u 's/^/[frontend] /') & \
	wait

preview: env-check deps-check db-up minio-up db-wait minio-wait db-migrate db-seed ## Tester l'application sans lenteur (build + start)
	@echo -e "$(GREEN)Démarrage Stockini en mode PREVIEW (Optimisé)...$(NC)"
	@set -a; source "$(ENV_FILE)"; set +a; \
	initial_port="$${PORT:-$(BACKEND_PORT)}"; \
	initial_frontend_port="$(FRONTEND_PORT)"; \
	is_port_busy() { \
		local port="$$1"; \
		if command -v lsof >/dev/null 2>&1; then \
			lsof -iTCP:"$$port" -sTCP:LISTEN -Pn >/dev/null 2>&1 && return 0; \
		fi; \
		if command -v ss >/dev/null 2>&1; then \
			ss -ltn 2>/dev/null | awk -v target=":$$port" '$$4 ~ target "$$" { found = 1 } END { exit !found }' && return 0; \
		fi; \
		(timeout 1 bash -c "cat < /dev/null > /dev/tcp/127.0.0.1/$$port") >/dev/null 2>&1; \
	}; \
	find_free_port() { \
		local port="$$1"; \
		while is_port_busy "$$port"; do \
			port=$$((port + 1)); \
		done; \
		echo "$$port"; \
	}; \
	backend_port="$$(find_free_port "$$initial_port")"; \
	frontend_port="$$(find_free_port "$$initial_frontend_port")"; \
	while [ "$$frontend_port" = "$$backend_port" ]; do \
		frontend_port="$$(find_free_port "$$((frontend_port + 1))")"; \
	done; \
	if [ "$$backend_port" != "$$initial_port" ]; then \
		echo -e "$(YELLOW)⚠ Port $$initial_port occupé → fallback sur $$backend_port$(NC)"; \
	fi; \
	if [ "$$frontend_port" != "$$initial_frontend_port" ]; then \
		echo -e "$(YELLOW)⚠ Port $$initial_frontend_port occupé → fallback sur $$frontend_port$(NC)"; \
	fi; \
	echo -e "$(YELLOW)Backend → http://localhost:$$backend_port/api$(NC)"; \
	echo -e "$(YELLOW)Swagger → http://localhost:$$backend_port/api/docs$(NC)"; \
	echo -e "$(YELLOW)Frontend → http://localhost:$$frontend_port$(NC)"; \
	trap 'kill 0' INT TERM EXIT; \
	(cd "$(BACKEND)" && set -a && source "$(ENV_FILE)" && set +a && PORT="$$backend_port" npm run start:dev 2>&1 | sed -u 's/^/[backend] /') & \
	(cd "$(FRONTEND)" && set -a && source "$(ENV_FILE)" && set +a && NEXT_PUBLIC_API_URL="http://localhost:$$backend_port" npm run build && PORT="$$frontend_port" NEXT_TELEMETRY_DISABLED=1 NEXT_PUBLIC_API_URL="http://localhost:$$backend_port" npm start 2>&1 | sed -u 's/^/[frontend] /') & \
	wait


stop: env-check ## Arrêter PostgreSQL et MinIO (services Docker de développement)
	@echo -e "$(YELLOW)Arrêt des services Docker de développement (PostgreSQL + MinIO)...$(NC)"
	@$(COMPOSE) down

db-up: env-check ## Démarrer PostgreSQL
	@echo -e "$(BLUE)Démarrage PostgreSQL...$(NC)"
	@$(COMPOSE) up -d $(DB_SERVICE)
	@if ! $(COMPOSE) port $(DB_SERVICE) 5432 >/dev/null 2>&1; then \
		echo -e "$(YELLOW)Port PostgreSQL non publié, recréation du conteneur...$(NC)"; \
		$(COMPOSE) up -d --force-recreate $(DB_SERVICE); \
	fi

db-down: env-check ## Arrêter PostgreSQL
	@echo -e "$(YELLOW)Arrêt PostgreSQL...$(NC)"
	@$(COMPOSE) stop $(DB_SERVICE)

minio-up: env-check ## Démarrer MinIO
	@echo -e "$(BLUE)Démarrage MinIO...$(NC)"
	@$(COMPOSE) up -d $(MINIO_SERVICE)

minio-down: env-check ## Arrêter MinIO
	@echo -e "$(YELLOW)Arrêt MinIO...$(NC)"
	@$(COMPOSE) stop $(MINIO_SERVICE)

minio-wait: env-check ## Attendre que MinIO soit prêt
	@echo -e "$(BLUE)Attente de MinIO...$(NC)"
	@until $(COMPOSE) exec -T $(MINIO_SERVICE) curl -sf http://localhost:$(MINIO_PORT)/minio/health/live >/dev/null 2>&1; do \
		sleep 2; \
	done
	@echo -e "$(GREEN)MinIO est prêt.$(NC)"

db-wait: env-check ## Attendre que PostgreSQL soit prêt
	@echo -e "$(BLUE)Attente de PostgreSQL...$(NC)"
	@until $(COMPOSE) exec -T $(DB_SERVICE) pg_isready -U "$(DB_USER)" >/dev/null 2>&1; do \
		sleep 2; \
	done
	@echo -e "$(GREEN)PostgreSQL est prêt.$(NC)"

db-migrate: backend-env-check db-up db-wait ## Appliquer les migrations Prisma
	@echo -e "$(BLUE)Génération du client Prisma...$(NC)"
	@cd "$(BACKEND)" && set -a && source "$(ENV_FILE)" && set +a && npx prisma generate
	@if [ ! -d "$(BACKEND)/prisma/migrations" ] || [ -z "$$(find "$(BACKEND)/prisma/migrations" -mindepth 1 -maxdepth 1 -type d 2>/dev/null)" ]; then \
		echo -e "$(YELLOW)Aucune migration trouvée, création automatique de la migration init...$(NC)"; \
		cd "$(BACKEND)" && set -a && source "$(ENV_FILE)" && set +a && npx prisma migrate dev --name init; \
	else \
		echo -e "$(BLUE)Application des migrations existantes...$(NC)"; \
		cd "$(BACKEND)" && set -a && source "$(ENV_FILE)" && set +a && npx prisma migrate deploy; \
	fi

db-seed: backend-env-check db-up db-wait ## Lancer le seed Prisma si nécessaire
	@echo -e "$(BLUE)Seed Prisma Stockini...$(NC)"
	@$(MAKE) db-seed-only

db-seed-only: backend-env-check ## Exécuter uniquement le seed Prisma
	@cd "$(BACKEND)" && set -a && source "$(ENV_FILE)" && set +a && npx ts-node prisma/seed.ts
	@echo -e "$(GREEN)Seed Prisma terminé.$(NC)"

db-reset: backend-env-check db-up db-wait ## Réinitialiser la base puis relancer le seed
	@echo -e "$(RED)Réinitialisation de la base de données...$(NC)"
	@cd "$(BACKEND)" && set -a && source "$(ENV_FILE)" && set +a && npx prisma migrate reset --force
	@$(MAKE) db-seed-only

studio: backend-env-check ## Ouvrir Prisma Studio
	@echo -e "$(GREEN)Prisma Studio: http://localhost:5555$(NC)"
	@cd "$(BACKEND)" && set -a && source "$(ENV_FILE)" && set +a && npx prisma studio --hostname 0.0.0.0 --port 5555

logs: env-check ## Afficher tous les logs Docker
	@$(COMPOSE) logs -f

logs-db: env-check ## Afficher les logs PostgreSQL
	@$(COMPOSE) logs -f $(DB_SERVICE)

logs-minio: env-check ## Afficher les logs MinIO
	@$(COMPOSE) logs -f $(MINIO_SERVICE)

build: backend-env-check frontend-env-check ## Builder backend et frontend
	@echo -e "$(BLUE)Build backend...$(NC)"
	@cd "$(BACKEND)" && set -a && source "$(ENV_FILE)" && set +a && npm run build
	@echo -e "$(BLUE)Build frontend...$(NC)"
	@cd "$(FRONTEND)" && set -a && source "$(ENV_FILE)" && set +a && NEXT_TELEMETRY_DISABLED=1 npm run build
	@echo -e "$(GREEN)Build Stockini terminé.$(NC)"

clear: ## Supprimer uniquement les ressources Docker stockini-prod (confirmation obligatoire)
	@echo -e "$(RED)Cette action supprime les conteneurs, images, volumes et le réseau préfixés stockini-prod.$(NC)"; \
	read -r -p "Tapez SUPPRIMER pour confirmer : " confirm; \
	if [ "$$confirm" != "SUPPRIMER" ]; then \
		echo "Annulé."; \
		exit 0; \
	fi; \
	set -e; \
	echo -e "$(YELLOW)Suppression strictement limitée aux ressources stockini-prod...$(NC)"; \
	for container in "$(PROD_BACKEND_CONTAINER)" "$(PROD_FRONTEND_CONTAINER)"; do docker rm -f "$$container" 2>/dev/null || true; done; \
	docker images --format '{{.Repository}} {{.ID}}' | awk '$$1 ~ /^stockini-prod-/ {print $$2}' | sort -u | while read -r id; do [ -z "$$id" ] || docker image rm "$$id"; done; \
	docker volume ls --filter 'label=com.docker.compose.project=stockini-prod' --format '{{.Name}}' | awk '$$1 ~ /^stockini-prod-/ {print $$1}' | while read -r volume; do [ -z "$$volume" ] || docker volume rm "$$volume"; done; \
	if docker network inspect "$(PROD_NETWORK)" >/dev/null 2>&1; then \
		if ! docker network rm "$(PROD_NETWORK)"; then \
			echo -e "$(YELLOW)Réseau conservé car encore utilisé (les conteneurs externes ne sont jamais déconnectés).$(NC)"; \
		fi; \
	fi; \
	echo -e "$(GREEN)Nettoyage stockini-prod terminé. PostgreSQL et MinIO externes n'ont pas été touchés.$(NC)"

clean-all: env-check ## Nettoyer node_modules, builds et volumes Docker
	@read -p "Confirmer le nettoyage complet Stockini ? [y/N] " confirm; \
	if [[ "$$confirm" =~ ^[Yy]$$ ]]; then \
		echo -e "$(RED)Nettoyage complet...$(NC)"; \
		$(COMPOSE) down -v --remove-orphans; \
		rm -rf "$(BACKEND)/node_modules" "$(BACKEND)/dist" "$(BACKEND)/coverage" "$(FRONTEND)/node_modules" "$(FRONTEND)/.next" "$(FRONTEND)/dist" "$(FRONTEND)/out"; \
		echo -e "$(GREEN)Nettoyage complet terminé.$(NC)"; \
	else \
		echo "Annulé."; \
	fi

prod: prod-deploy ## Alias de prod-deploy

# Les images sont toujours reconstruites depuis zéro : aucune couche en cache
# n'est réutilisée pendant le build de production. Après un déploiement réussi,
# le cache BuildKit est nettoyé pour empêcher l'utilisation disque d'augmenter
# continuellement.
prod-deploy: prod-env-check ## Builder et déployer Stockini, migrer puis préparer MinIO
	@set -e; \
	echo -e "$(BLUE)Build et démarrage des seuls services Stockini...$(NC)"; \
	$(COMPOSE_PROD) build --no-cache; \
	$(COMPOSE_PROD) up -d; \
	$(MAKE) --no-print-directory prod-wait PROD_WAIT_FRONTEND=0; \
	$(MAKE) --no-print-directory prod-migrate; \
	$(MAKE) --no-print-directory prod-buckets; \
	$(MAKE) --no-print-directory prod-wait; \
	frontend_url="$$(awk -F= '/^CORS_ORIGIN=/{sub(/^[^=]*=/, ""); print; exit}' "$(PROD_ENV_FILE)")"; \
	backend_url="$$(awk -F= '/^NEXT_PUBLIC_API_URL=/{sub(/^[^=]*=/, ""); print; exit}' "$(PROD_ENV_FILE)")"; \
	docker builder prune -af; \
	echo -e "$(GREEN)Stockini production est prêt.$(NC)"; \
	echo "Frontend : $${frontend_url:-http://IP_VPS:3010}"; \
	echo "Backend  : $${backend_url:-http://IP_VPS:4010}"

prod-undeploy: prod-env-check ## Arrêter uniquement frontend/backend Stockini, sans volume
	@set -e; \
	echo -e "$(YELLOW)Arrêt des conteneurs Stockini production...$(NC)"; \
	$(COMPOSE_PROD) down; \
	echo -e "$(GREEN)Stockini arrêté. Aucun volume, PostgreSQL ou MinIO n'a été supprimé.$(NC)"

prod-logs: prod-env-check ## Suivre les logs frontend/backend production
	@$(COMPOSE_PROD) logs -f

prod-status: prod-env-check ## Afficher conteneurs, santé, ports et réseau Stockini
	@echo -e "$(BLUE)Conteneurs Stockini$(NC)"
	@docker ps -a --filter "name=^/stockini-prod-" --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'
	@echo -e "\n$(BLUE)Healthchecks$(NC)"
	@for container in "$(PROD_BACKEND_CONTAINER)" "$(PROD_FRONTEND_CONTAINER)"; do \
		if docker inspect "$$container" >/dev/null 2>&1; then \
			health="$$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}non configuré{{end}}' "$$container")"; \
			echo "$$container: $$health"; \
		else \
			echo "$$container: absent"; \
		fi; \
	done
	@echo -e "\n$(BLUE)Ports publiés$(NC)"
	@docker port "$(PROD_BACKEND_CONTAINER)" 2>/dev/null || true
	@docker port "$(PROD_FRONTEND_CONTAINER)" 2>/dev/null || true
	@echo -e "\n$(BLUE)Réseau Stockini$(NC)"
	@docker network inspect "$(PROD_NETWORK)" --format 'Nom={{.Name}} Driver={{.Driver}} Conteneurs={{len .Containers}}' 2>/dev/null || echo "$(PROD_NETWORK): absent"

prod-wait: prod-env-check ## Attendre les healthchecks configurés (running sinon), maximum 60 s
	@echo -e "$(BLUE)Attente des services requis (maximum $(PROD_WAIT_TIMEOUT) secondes)...$(NC)"
	@set -e; \
	containers="$(PROD_POSTGRES_CONTAINER) $(PROD_MINIO_CONTAINER) $(PROD_BACKEND_CONTAINER)"; \
	if [ "$(PROD_WAIT_FRONTEND)" = "1" ]; then containers="$$containers $(PROD_FRONTEND_CONTAINER)"; fi; \
	deadline=$$((SECONDS + $(PROD_WAIT_TIMEOUT))); \
	while [ $$SECONDS -lt $$deadline ]; do \
		all_ready=true; \
		for container in $$containers; do \
			if ! docker inspect "$$container" >/dev/null 2>&1; then \
				echo "$$container: absent"; \
				all_ready=false; \
				continue; \
			fi; \
			status="$$(docker inspect --format '{{.State.Status}}' "$$container")"; \
			running="$$(docker inspect --format '{{.State.Running}}' "$$container")"; \
			health="$$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$$container")"; \
			if [ "$$container" = "$(PROD_FRONTEND_CONTAINER)" ]; then \
				[ "$$running" = "true" ] && ready=true || ready=false; \
			elif [ "$$health" = "none" ]; then \
				ready="$$running"; \
			else \
				[ "$$health" = "healthy" ] && ready=true || ready=false; \
			fi; \
			echo "$$container: status=$$status health=$$health running=$$running ready=$$ready"; \
			if [ "$$status" = "exited" ] || [ "$$status" = "dead" ]; then \
				echo -e "$(RED)$$container s'est arrêté avant d'être prêt.$(NC)"; \
				docker logs --tail 100 "$$container"; \
				exit 1; \
			fi; \
			[ "$$ready" = "true" ] || all_ready=false; \
		done; \
		if [ "$$all_ready" = true ]; then \
			echo -e "$(GREEN)Tous les services requis sont prêts.$(NC)"; \
			exit 0; \
		fi; \
		sleep 2; \
	done; \
	echo -e "$(RED)Timeout: services non prêts après $(PROD_WAIT_TIMEOUT) secondes.$(NC)"; \
	for container in $$containers; do \
		echo "--- $$container ---"; \
		docker inspect --format '{{json .State.Health}}' "$$container" 2>/dev/null || true; \
		docker logs --tail 100 "$$container" 2>/dev/null || true; \
	done; \
	exit 1

prod-migrate: prod-env-check ## Vérifier et appliquer uniquement les migrations Prisma nécessaires
	@set -e; \
	echo -e "$(BLUE)Vérification des migrations Prisma...$(NC)"; \
	status_output="$$(docker exec "$(PROD_BACKEND_CONTAINER)" npx prisma migrate status 2>&1)" && status_rc=0 || status_rc=$$?; \
	echo "$$status_output"; \
	if [ $$status_rc -eq 0 ]; then \
		echo -e "$(GREEN)Migrations déjà à jour.$(NC)"; \
	elif echo "$$status_output" | grep -Fq 'Following migration have failed:' && \
	     echo "$$status_output" | grep -Fxq '20260715120000_sale_item_financial_snapshots_v2'; then \
		echo -e "$(YELLOW)Réparation ciblée de 20260715120000_sale_item_financial_snapshots_v2...$(NC)"; \
		echo -e "$(BLUE)Création du backup PostgreSQL préalable...$(NC)"; \
		docker exec "$(PROD_BACKEND_CONTAINER)" sh -lc 'set -eu; \
			db_url="$${DATABASE_URL%%\?*}"; \
			stamp="$$(date -u +%Y%m%d-%H%M%S)"; \
			backup_file="$$BACKUP_DIRECTORY/pre-migration-repair-$$stamp.dump"; \
			mkdir -p "$$BACKUP_DIRECTORY"; \
			pg_dump --format=custom --file="$$backup_file" "$$db_url"; \
			pg_restore --list "$$backup_file" >/dev/null; \
			echo "Backup PostgreSQL validé: $$backup_file"'; \
		docker exec "$(PROD_BACKEND_CONTAINER)" npx prisma migrate resolve \
			--rolled-back 20260715120000_sale_item_financial_snapshots_v2; \
		echo -e "$(BLUE)Nouvelle application des migrations...$(NC)"; \
		docker exec "$(PROD_BACKEND_CONTAINER)" npx prisma migrate deploy; \
		docker exec "$(PROD_BACKEND_CONTAINER)" npx prisma migrate status; \
		echo -e "$(GREEN)Migration réparée et appliquée.$(NC)"; \
	elif echo "$$status_output" | grep -Eqi 'not yet been applied|not yet applied|pending migration'; then \
		echo -e "$(BLUE)Application des migrations en attente...$(NC)"; \
		if docker exec "$(PROD_BACKEND_CONTAINER)" npx prisma migrate deploy; then \
			echo -e "$(GREEN)Migrations appliquées.$(NC)"; \
		else \
			echo -e "$(RED)Erreur migration: prisma migrate deploy a échoué.$(NC)"; \
			exit 1; \
		fi; \
	else \
		echo -e "$(RED)Erreur migration: prisma migrate status a échoué sans migration en attente identifiable.$(NC)"; \
		exit $$status_rc; \
	fi; \
	if docker exec "$(PROD_BACKEND_CONTAINER)" node -e "require('@prisma/client').PrismaClient" >/dev/null 2>&1; then \
		echo -e "$(GREEN)Client Prisma déjà généré.$(NC)"; \
	else \
		echo -e "$(BLUE)Génération du client Prisma nécessaire...$(NC)"; \
		docker exec "$(PROD_BACKEND_CONTAINER)" npx prisma generate || { echo -e "$(RED)Erreur: prisma generate a échoué.$(NC)"; exit 1; }; \
	fi

prod-buckets: prod-env-check ## Créer idempotemment les buckets MinIO nécessaires
	@set -e; \
	echo -e "$(BLUE)Préparation des buckets MinIO...$(NC)"; \
	docker exec "$(PROD_BACKEND_CONTAINER)" npm run storage:ensure-buckets; \
	echo -e "$(GREEN)Buckets MinIO prêts.$(NC)"

prod-restart: prod-env-check ## Arrêter puis redéployer complètement Stockini
	@$(MAKE) --no-print-directory prod-undeploy
	@$(MAKE) --no-print-directory prod-deploy

# Alias historiques conservés, limités au compose deploy-docker sans base de données.
prod-up: prod-deploy
prod-down: prod-undeploy
prod-clean: clear
