# ──────────────────────────────────────────────────────────────────────────────
#  Stockini — Gestion de pièces de rechange
#  Makefile de développement, base de données, Prisma, Docker et production
# ──────────────────────────────────────────────────────────────────────────────

SHELL := /bin/bash
ROOT_DIR := $(shell pwd)
BACKEND := $(ROOT_DIR)/backend
FRONTEND := $(ROOT_DIR)/frontend
ENV_FILE := $(ROOT_DIR)/.env

COMPOSE := docker compose --env-file .env
COMPOSE_PROD := docker compose -f docker-compose.prod.yml --env-file .env

# Détection robuste du service PostgreSQL: la consigne cible "db",
# le compose actuel peut encore utiliser "postgres".
COMPOSE_SERVICES := $(shell docker compose config --services 2>/dev/null)
DB_SERVICE := $(if $(filter db,$(COMPOSE_SERVICES)),db,$(if $(filter postgres,$(COMPOSE_SERVICES)),postgres,db))
PROD_COMPOSE_SERVICES := $(shell docker compose -f docker-compose.prod.yml config --services 2>/dev/null)
PROD_DB_SERVICE := $(if $(filter db,$(PROD_COMPOSE_SERVICES)),db,$(if $(filter postgres,$(PROD_COMPOSE_SERVICES)),postgres,db))
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

.PHONY: help install install-backend install-frontend dev stop \
	db-up db-down db-wait db-migrate db-seed db-seed-only db-reset studio \
	logs logs-db build clean clean-all \
	prod prod-db prod-build prod-up prod-down prod-logs prod-logs-backend \
	prod-restart prod-migrate prod-wait prod-clean \
	env-check deps-check backend-env-check frontend-env-check prod-env-check

help: ## Afficher cette aide
	@echo ""
	@echo -e "$(BLUE)$(BOLD)Stockini — Gestion de pièces de rechange$(NC)"
	@echo -e "$(BLUE)================================================$(NC)"
	@echo ""
	@awk 'BEGIN {FS = ":.*##"; printf "$(BOLD)Commandes disponibles:$(NC)\n\n"} /^[a-zA-Z0-9_-]+:.*##/ {printf "  $(GREEN)%-22s$(NC) %s\n", $$1, $$2}' $(MAKEFILE_LIST)
	@echo ""
	@echo -e "$(YELLOW)URLs locales$(NC)"
	@echo "  Backend       : http://localhost:$(BACKEND_PORT)/api"
	@echo "  Swagger       : http://localhost:$(BACKEND_PORT)/api/docs"
	@echo "  Frontend      : http://localhost:$(FRONTEND_PORT)"
	@echo "  Prisma Studio : http://localhost:5555"
	@echo ""
	@echo -e "$(YELLOW)Environnement$(NC)"
	@echo "  Fichier unique: $(ENV_FILE)"
	@echo "  Service DB    : $(DB_SERVICE)"

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

prod-env-check: env-check
	@if [ ! -f "$(ROOT_DIR)/docker-compose.prod.yml" ]; then \
		echo -e "$(RED)Erreur: docker-compose.prod.yml introuvable.$(NC)"; \
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

dev: env-check deps-check db-up db-wait db-migrate db-seed ## Lancer backend et frontend en développement
	@echo -e "$(GREEN)Démarrage Stockini en développement...$(NC)"
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

stop: env-check ## Arrêter les services Docker de développement
	@echo -e "$(YELLOW)Arrêt des services Docker de développement...$(NC)"
	@$(COMPOSE) down

db-up: env-check ## Démarrer PostgreSQL
	@echo -e "$(BLUE)Démarrage PostgreSQL...$(NC)"
	@$(COMPOSE) up -d $(DB_SERVICE)

db-down: env-check ## Arrêter PostgreSQL
	@echo -e "$(YELLOW)Arrêt PostgreSQL...$(NC)"
	@$(COMPOSE) stop $(DB_SERVICE)

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
		cd "$(BACKEND)" && set -a && source "$(ENV_FILE)" && set +a && npx prisma migrate dev; \
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

build: backend-env-check frontend-env-check ## Builder backend et frontend
	@echo -e "$(BLUE)Build backend...$(NC)"
	@cd "$(BACKEND)" && set -a && source "$(ENV_FILE)" && set +a && npm run build
	@echo -e "$(BLUE)Build frontend...$(NC)"
	@cd "$(FRONTEND)" && set -a && source "$(ENV_FILE)" && set +a && NEXT_TELEMETRY_DISABLED=1 npm run build
	@echo -e "$(GREEN)Build Stockini terminé.$(NC)"

clean: ## Nettoyer les artefacts locaux
	@read -p "Confirmer le nettoyage local Stockini ? [y/N] " confirm; \
	if [[ "$$confirm" =~ ^[Yy]$$ ]]; then \
		echo -e "$(YELLOW)Nettoyage local...$(NC)"; \
		rm -rf "$(BACKEND)/dist" "$(BACKEND)/coverage" "$(FRONTEND)/.next" "$(FRONTEND)/dist" "$(FRONTEND)/out"; \
		echo -e "$(GREEN)Nettoyage local terminé.$(NC)"; \
	else \
		echo "Annulé."; \
	fi

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

prod: prod-db prod-build prod-up prod-wait prod-migrate ## Déployer Stockini en production
	@echo -e "$(GREEN)Stockini production est prêt.$(NC)"

prod-db: prod-env-check ## Démarrer uniquement PostgreSQL en production
	@echo -e "$(BLUE)Démarrage DB production...$(NC)"
	@$(COMPOSE_PROD) up -d $(PROD_DB_SERVICE)

prod-build: prod-env-check ## Builder les images Docker de production
	@echo -e "$(BLUE)Build Docker production...$(NC)"
	@$(COMPOSE_PROD) build

prod-up: prod-env-check ## Démarrer les services de production
	@echo -e "$(BLUE)Démarrage production...$(NC)"
	@$(COMPOSE_PROD) up -d

prod-down: prod-env-check ## Arrêter les services de production
	@echo -e "$(YELLOW)Arrêt production...$(NC)"
	@$(COMPOSE_PROD) down

prod-logs: prod-env-check ## Afficher les logs production
	@$(COMPOSE_PROD) logs -f

prod-logs-backend: prod-env-check ## Afficher les logs backend production
	@$(COMPOSE_PROD) logs -f backend

prod-restart: prod-env-check ## Redémarrer les services de production
	@echo -e "$(YELLOW)Redémarrage production...$(NC)"
	@$(COMPOSE_PROD) restart

prod-migrate: prod-env-check ## Appliquer les migrations Prisma en production
	@echo -e "$(BLUE)Migrations Prisma production...$(NC)"
	@$(COMPOSE_PROD) exec -T backend sh -lc 'npx prisma generate && npx prisma migrate deploy'

prod-wait: prod-env-check ## Attendre que PostgreSQL production soit prêt
	@echo -e "$(BLUE)Attente PostgreSQL production...$(NC)"
	@until $(COMPOSE_PROD) exec -T $(PROD_DB_SERVICE) pg_isready -U "$(DB_USER)" >/dev/null 2>&1; do \
		sleep 2; \
	done
	@echo -e "$(GREEN)PostgreSQL production est prêt.$(NC)"

prod-clean: prod-env-check ## Nettoyer les ressources Docker de production
	@read -p "Confirmer le nettoyage Docker production Stockini ? [y/N] " confirm; \
	if [[ "$$confirm" =~ ^[Yy]$$ ]]; then \
		echo -e "$(RED)Nettoyage production...$(NC)"; \
		$(COMPOSE_PROD) down --remove-orphans; \
		docker image prune -f; \
		echo -e "$(GREEN)Nettoyage production terminé.$(NC)"; \
	else \
		echo "Annulé."; \
	fi
