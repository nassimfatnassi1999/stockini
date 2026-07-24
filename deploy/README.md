# Deploy — Guide complet Stockini MSP

Documentation de déploiement pour l'application **Stockini MSP** sur VPS Ubuntu.

---

## Table des matières

1. [Architecture](#1-architecture)
2. [Prérequis](#2-prérequis)
3. [Structure du dossier deploy/](#3-structure-du-dossier-deploy)
4. [Première installation (setup)](#4-première-installation-setup)
   - [4.1 Préparer le VPS](#41-préparer-le-vps)
   - [4.2 Cloner le projet](#42-cloner-le-projet)
   - [4.3 Configurer le fichier .env](#43-configurer-le-fichier-env)
   - [4.4 Lancer le setup automatique](#44-lancer-le-setup-automatique)
   - [4.5 Ce que fait le setup, étape par étape](#45-ce-que-fait-le-setup-étape-par-étape)
   - [4.6 Activer le SSL (Let's Encrypt)](#46-activer-le-ssl-lets-encrypt)
   - [4.7 Sécuriser le VPS](#47-sécuriser-le-vps)
5. [Redéploiement (mise à jour)](#5-redéploiement-mise-à-jour)
6. [Sauvegarde automatique de la base](#6-sauvegarde-automatique-de-la-base)
7. [Monitoring](#7-monitoring)
8. [Scripts individuels — référence](#8-scripts-individuels--référence)
9. [Variables d'environnement — référence](#9-variables-denvironnement--référence)
10. [Dépannage](#10-dépannage)
11. [Sécurité](#11-sécurité)

---

## 1. Architecture

```
Internet
    │
    ▼
Nginx (80/443)              ← reverse proxy + SSL termination
    │
    ├── /api/*      →  NestJS backend  (PM2, port 3001)
    ├── /socket.io/ →  NestJS backend  (PM2, port 3001, WebSocket)
    └── /*          →  Next.js frontend (PM2, port 3000)

Services locaux (localhost uniquement, pas exposés) :
  PostgreSQL 16   → port 5432
  Redis           → port 6379
  MinIO           → port 9000 (API), 9001 (Console)
```

**Stack :**

| Composant | Technologie | Port interne |
|-----------|-------------|--------------|
| Backend API | NestJS (Node.js 20) | 3001 |
| Frontend | Next.js (standalone) | 3000 |
| Base de données | PostgreSQL 16 | 5432 |
| Cache / sessions | Redis | 6379 |
| Stockage fichiers | MinIO | 9000 |
| Reverse proxy | Nginx | 80 / 443 |
| Process manager | PM2 | — |
| SSL | Let's Encrypt (Certbot) | — |

---

## 2. Prérequis

### VPS
- **OS :** Ubuntu 22.04 LTS (recommandé) ou 24.04
- **RAM :** 2 GB minimum (4 GB recommandé)
- **Disque :** 20 GB minimum libres
- **Accès SSH :** utilisateur non-root avec `sudo`

### DNS
Avant de lancer le setup, le domaine `203.0.113.10` doit pointer vers l'IP du VPS :

```
A    203.0.113.10      →  <IP_DU_VPS>
A    203.0.113.10  →  <IP_DU_VPS>
```

Vérifier la propagation :
```bash
dig 203.0.113.10 +short
# doit retourner l'IP du VPS
```

### Clé SSH
Configurez votre clé SSH avant de commencer (requis pour le SSH hardening) :
```bash
ssh-copy-id votre_user@<IP_DU_VPS>
```

---

## 3. Structure du dossier deploy/

```
deploy/
├── README.md                        ← ce fichier
├── setup.sh                         ← orchestrateur premier déploiement (8 étapes)
├── cron-backup-db.sh                ← sauvegarde automatique PostgreSQL
│
└── vps/
    ├── .env.prod.vps                ← modèle de fichier .env à copier
    ├── nginx-stockini-msp.conf      ← config Nginx production (HTTPS + rate-limiting)
    │
    ├── install_tools.sh             ← étape 1 : Node.js 20, PM2, Postgres, Redis, MinIO, Nginx, Certbot
    ├── setup_postgres.sh            ← étape 2 : création user + base de données + migrations
    ├── setup_redis.sh               ← étape 3 : config Redis (auth, maxmemory)
    ├── setup_minio.sh               ← étape 4 : MinIO service + bucket
    ├── setup_backend.sh             ← étape 5 : build NestJS + PM2
    ├── setup_frontend.sh            ← étape 6 : build Next.js + PM2
    ├── setup_nginx.sh               ← étape 7 : copie config + activation site
    │
    ├── redeploy.sh                  ← mise à jour (git pull → build → PM2 → health check)
    ├── monitor.sh                   ← dashboard interactif de monitoring
    ├── add_user.sh                  ← création d'un utilisateur admin en base
    ├── fix-migration.sh             ← résolution d'une migration Prisma bloquée
    ├── clean_backend.sh             ← nettoyage PM2 + rebuild backend uniquement
    │
    └── security/
        ├── security-politic.sh      ← menu interactif tout-en-un sécurité
        ├── setup_firewall.sh        ← UFW : ports 22/80/443 + mode Cloudflare
        ├── secure_ssh.sh            ← SSH hardening (désactive root + password auth)
        ├── setup_fail2ban.sh        ← Fail2ban : 6 jails (SSH, Nginx, Stockini)
        ├── setup_logging.sh         ← rotation logs + monitoring cron 15min
        ├── _common.sh               ← fonctions partagées entre scripts sécurité
        └── SECURITY_GUIDE.md        ← documentation complète sécurité
```

---

## 4. Première installation (setup)

### 4.1 Préparer le VPS

Connectez-vous au VPS et créez un utilisateur de déploiement si nécessaire :

```bash
ssh ubuntu@<IP_DU_VPS>

# Mettre à jour le système
sudo apt-get update && sudo apt-get upgrade -y
```

### 4.2 Cloner le projet

```bash
# Répertoire de déploiement par convention
cd /home/ubuntu
git clone <URL_DU_REPO> stockini
cd stockini
```

### 4.3 Configurer le fichier .env

Le fichier `deploy/vps/.env.prod.vps` est le modèle à adapter. Le setup le copie automatiquement si `.env` est absent, mais vous pouvez le préparer manuellement :

```bash
cp deploy/vps/.env.prod.vps .env
nano .env
```

**Valeurs obligatoires à remplir (tous les `CHANGE_ME`) :**

```bash
# Base de données
DB_PASSWORD="<YOUR_DATABASE_PASSWORD>"

# JWT — générer avec : openssl rand -base64 64
JWT_SECRET="<YOUR_JWT_SECRET>"
JWT_REFRESH_SECRET="<YOUR_JWT_REFRESH_SECRET>"

# Redis — générer avec : openssl rand -base64 32
REDIS_PASSWORD="<YOUR_REDIS_PASSWORD>"

# MinIO — identifiants d'accès au stockage fichiers
MINIO_ACCESS_KEY="<YOUR_MINIO_ACCESS_KEY>"
MINIO_SECRET_KEY="<YOUR_MINIO_SECRET_KEY>"

# SMTP (email, optionnel mais recommandé) — Gmail
SMTP_USER="noreply@example.com"
SMTP_PASS="<YOUR_SMTP_PASSWORD>"
```

Le domaine et les URLs sont déjà pré-configurés :

```bash
DOMAIN=203.0.113.10
CORS_ORIGIN=http://203.0.113.10
FRONTEND_URL=http://203.0.113.10
NEXT_PUBLIC_APP_URL=http://203.0.113.10
NEXT_PUBLIC_SITE_URL=http://203.0.113.10
MINIO_PUBLIC_ENDPOINT=http://203.0.113.10/storage
SMTP_FROM="noreply@example.com"
```

> **Note :** Le setup valide `.env` avant de commencer et bloque si des `CHANGE_ME` critiques sont détectés.

### 4.4 Lancer le setup automatique

```bash
# Depuis la racine du projet, en tant qu'utilisateur normal (PAS root)
bash deploy/setup.sh
```

Le script vérifie les prérequis (OS, RAM, disque, sudo, `.env`) puis demande confirmation avant de lancer les 8 étapes.

### 4.5 Ce que fait le setup, étape par étape

#### Étape 1/8 — Outils système (`install_tools.sh`, sudo)
Installe tous les outils nécessaires s'ils sont absents :
- Node.js 20 (via NodeSource)
- PM2 (process manager)
- PostgreSQL 16 (via dépôt officiel)
- Redis Server
- MinIO + mc (client MinIO)
- Nginx
- Certbot + plugin Nginx

#### Étape 2/8 — PostgreSQL (`setup_postgres.sh`, sudo)
- Installe PostgreSQL 16 si absent
- Crée l'utilisateur `stockpro` et la base `stockpro`
- Met à jour `DATABASE_URL` dans `.env` avec le mot de passe URL-encodé
- Vérifie la connexion

> **Attention :** Le script demande si vous voulez réinitialiser la base (DROP). Répondez `RESET` uniquement lors d'une toute première installation sur une base vide.

#### Étape 3/8 — Redis (`setup_redis.sh`, sudo)
- Installe Redis et le lie à `127.0.0.1` uniquement
- Configure le mot de passe (`REDIS_PASSWORD` depuis `.env`, ou génère un mot de passe si absent)
- Limite la mémoire à 256 MB avec politique `allkeys-lru`
- Met à jour `REDIS_URL` dans `.env`

#### Étape 4/8 — MinIO (`setup_minio.sh`, sudo)
- Télécharge et installe le binaire MinIO
- Crée l'utilisateur système `minio-user`
- Configure et démarre le service systemd
- Crée le bucket `generated-documents` (ou la valeur de `MINIO_BUCKET` dans `.env`)

#### Étape 5/8 — Backend NestJS (`setup_backend.sh`, user)
- Installe nvm + Node 20 pour l'utilisateur courant
- Installe les dépendances npm
- Génère le client Prisma
- Exécute les migrations Prisma (`prisma migrate deploy`)
- Build NestJS (`npm run build`)
- Configure et démarre PM2 (`stockini-backend`, port 3001)

> **Seed de données :** Le seed (`npm run prisma:seed`) n'est **jamais** lancé automatiquement. Exécutez-le manuellement si nécessaire :
> ```bash
> cd backend && npm run prisma:seed
> ```

#### Étape 6/8 — Frontend Next.js (`setup_frontend.sh`, user)
- Installe les dépendances npm
- Build Next.js en mode standalone
- Copie les assets statiques dans `.next/standalone`
- Configure et démarre PM2 (`stockini-frontend`, port 3000)

#### Étape 7/8 — Nginx (`setup_nginx.sh`, sudo)
- Copie `nginx-stockini-msp.conf` vers `/etc/nginx/sites-available/203.0.113.10`
- Active le site (symlink dans `sites-enabled`)
- Supprime le site `default` de Nginx
- Teste la configuration (`nginx -t`) et recharge Nginx
- Si les certificats SSL sont déjà présents : installe la config HTTPS
- Sinon : installe une config HTTP-only temporaire (pour pouvoir obtenir le certificat)

#### Étape 8/8 — SSL Let's Encrypt (automatique)
- Utilise Certbot pour obtenir un certificat pour `203.0.113.10` et `203.0.113.10`
- Active le renouvellement automatique via `certbot.timer`
- Reconfigure Nginx en HTTPS après obtention du certificat

### 4.6 Activer le SSL (Let's Encrypt)

Le setup l'active automatiquement si le DNS est propagé. Si le certificat n'a pas pu être obtenu :

```bash
# Obtenir le certificat manuellement
sudo certbot certonly --nginx \
  -d 203.0.113.10 -d 203.0.113.10 \
  --non-interactive --agree-tos \
  -m admin@localhost

# Reconfigurer Nginx en HTTPS
sudo bash deploy/vps/setup_nginx.sh
```

Vérifier le renouvellement automatique :
```bash
sudo systemctl status certbot.timer
sudo certbot renew --dry-run
```

### 4.7 Sécuriser le VPS

À faire **après** que l'application est opérationnelle :

```bash
# Menu interactif tout-en-un
sudo bash deploy/vps/security/security-politic.sh
# → Choisir option 5 : COMPLETE HARDENING (Firewall + SSH + Fail2ban + Logging)
```

Ou script par script :

```bash
# Firewall UFW (ports 22, 80, 443 uniquement)
sudo bash deploy/vps/security/setup_firewall.sh

# SSH Hardening (désactive root login et auth par mot de passe)
# ⚠️ Assurez-vous d'avoir votre clé SSH AVANT d'exécuter !
sudo bash deploy/vps/security/secure_ssh.sh

# Fail2ban (protection brute-force SSH, Nginx, Stockini)
sudo bash deploy/vps/security/setup_fail2ban.sh

# Rotation des logs + monitoring cron
sudo bash deploy/vps/security/setup_logging.sh
```

> Voir [deploy/vps/security/SECURITY_GUIDE.md](vps/security/SECURITY_GUIDE.md) pour la documentation complète.

---

## 5. Redéploiement (mise à jour)

Après chaque push de code, pour mettre à jour le VPS :

```bash
# Depuis la racine du projet, en tant qu'utilisateur normal (PAS root)
bash deploy/vps/redeploy.sh
```

### Ce que fait le redeploy (8 étapes)

| Étape | Action |
|-------|--------|
| 1/8 | `git pull --ff-only` — récupère le dernier code |
| 2/8 | `npm ci` — installe les dépendances backend |
| 3/8 | `npx prisma generate` — régénère le client Prisma |
| 4/8 | `npx prisma migrate deploy` — applique les nouvelles migrations (avec backup PostgreSQL automatique avant) |
| 5/8 | `npm run build` — compile NestJS |
| 6/8 | `npm ci` + `npm run build` — compile Next.js |
| 7/8 | `pm2 reload` — redémarre backend et frontend sans interruption |
| 8/8 | Health check — vérifie que le backend répond sur `/health` |

### Sauvegarde automatique avant migration

Le redeploy crée automatiquement un backup PostgreSQL dans `backups/pg_<date>.sql.gz` avant chaque migration. En cas de problème, restaurer avec :
```bash
gunzip -c backups/pg_<date>.sql.gz | psql -h localhost -U stockpro stockpro
```

### Option `--with-system-patch`

Utilisez ce flag si le redeploy avertit que des familles dropdown sont manquantes :

```bash
bash deploy/vps/redeploy.sh --with-system-patch
```

Cela exécute `npm run system:ensure-dropdowns` qui crée les familles système manquantes sans toucher aux données existantes.

> **Important :** `prisma db seed` n'est **jamais** exécuté automatiquement. C'est une opération manuelle intentionnelle.

### Rollback automatique

En cas d'échec après l'arrêt de PM2, le script tente un rollback automatique des services. Si le rollback échoue :

```bash
pm2 start backend/ecosystem.config.js
pm2 start frontend/ecosystem.frontend.config.js
pm2 save
```

---

## 6. Sauvegarde automatique de la base

### Backup manuel

```bash
bash deploy/cron-backup-db.sh
```

Le backup est stocké dans `/home/ubuntu/backup-automatique-db/backup.sql`.

### Activer le cron (toutes les 72h à 02:00)

```bash
bash deploy/cron-backup-db.sh --setup
```

Cette commande ajoute automatiquement la tâche dans le crontab :
```
0 2 */3 * * /chemin/vers/cron-backup-db.sh >> /home/ubuntu/backup-automatique-db/backup.log 2>&1
```

### Backup chiffré (optionnel)

Si `BACKUP_GPG_RECIPIENT` est défini dans `.env`, le backup est chiffré automatiquement avec GPG :

```bash
BACKUP_GPG_RECIPIENT=votre.email@example.com
```

### Restaurer un backup

```bash
# Identifier les backups disponibles
ls -lh /home/ubuntu/backup-automatique-db/

# Restaurer
sudo -u postgres pg_restore -d stockpro /home/ubuntu/backup-automatique-db/backup.sql
```

Après une restauration, vérifier l'alignement Prisma :

```bash
cd backend
npx prisma generate
npx prisma migrate deploy
npx prisma migrate status
```

Si les pages répondent mais que `/_next/static/*` retourne 404, le build Next.js est désynchronisé. Cette panne est indépendante des données PostgreSQL :

```bash
pm2 delete stockini-frontend 2>/dev/null || true
cd frontend
npm run clean:next
npm install  # seulement si les dépendances ont changé
cd ..
bash deploy/vps/setup_frontend.sh
pm2 status
```

La sauvegarde depuis l'interface admin produit un ZIP `FULL_SYSTEM` contenant
`database/postgres.dump`, `manifest.json` et tous les objets du bucket dans
`minio/<bucket>/`. Les chemins relatifs, tailles, compteurs et checksums SHA-256
sont vérifiés avant publication. La restauration valide entièrement l'archive,
crée des sauvegardes de sécurité PostgreSQL et MinIO, puis restaure et vérifie
les deux stockages. Les anciens ZIP complets v1 et PostgreSQL-seul v3 restent
lisibles.

---

## 7. Monitoring

### Dashboard interactif

```bash
bash deploy/vps/monitor.sh
```

Menu avec 13 options :

| Option | Action |
|--------|--------|
| 1 | Statut global (tous les services) |
| 2 | Santé backend (health check API) |
| 3 | Statut PM2 |
| 4 | Logs backend (temps réel) |
| 5 | Logs frontend (temps réel) |
| 6 | Statut PostgreSQL |
| 7 | Statut Redis |
| 8 | Statut MinIO |
| 9 | Statut Nginx |
| 10 | Utilisation disque |
| 11 | Utilisation mémoire / CPU |
| 12 | Vérification certificat SSL |
| 13 | Renouveler le certificat SSL |

### Commandes utiles rapides

```bash
# État des services PM2
pm2 status

# Logs en temps réel
pm2 logs stockini-backend
pm2 logs stockini-frontend

# Redémarrer un service
pm2 restart stockini-backend
pm2 restart stockini-frontend

# Statut Nginx
sudo systemctl status nginx
sudo nginx -t                  # tester la configuration

# Statut PostgreSQL
sudo systemctl status postgresql
sudo -u postgres psql -c "\l"  # lister les bases

# Statut Redis
redis-cli -a "$REDIS_PASSWORD" ping   # doit retourner PONG

# Statut MinIO
sudo systemctl status minio
mc alias set local http://127.0.0.1:9000 "$MINIO_ACCESS_KEY" "$MINIO_SECRET_KEY"
mc ls local/

# Santé du backend
curl http://127.0.0.1:3001/health

# Certificat SSL — date d'expiration
sudo certbot certificates
echo | openssl s_client -servername 203.0.113.10 -connect 203.0.113.10:443 2>/dev/null \
  | openssl x509 -noout -enddate
```

---

## 8. Scripts individuels — référence

### `setup.sh`
**Rôle :** Orchestrateur du premier déploiement complet.  
**Exécution :** `bash deploy/setup.sh`  
**Droits :** utilisateur normal avec sudo  
**Ce qu'il fait :** Vérifie les prérequis, copie `.env` si absent, enchaîne les 8 scripts dans l'ordre, obtient le certificat SSL.

---

### `vps/install_tools.sh`
**Rôle :** Installation de tous les outils système.  
**Exécution :** `sudo bash deploy/vps/install_tools.sh`  
**Ce qu'il installe :** Node.js 20, npm, PM2, PostgreSQL 16, Redis, MinIO, mc, Nginx, Certbot, git, curl, rsync, lsof, htop.  
**Idempotent :** oui — ne réinstalle pas ce qui est déjà présent.

---

### `vps/setup_postgres.sh`
**Rôle :** Configuration PostgreSQL (user + base + privileges).  
**Exécution :** `sudo bash deploy/vps/setup_postgres.sh`  
**Lit depuis `.env` :** `DB_USER`, `DB_PASSWORD`, `DB_NAME`  
**Modifie `.env` :** met à jour `DATABASE_URL` avec le mot de passe URL-encodé.  
**Attention :** demande confirmation pour RESET (DROP DATABASE) — répondre `RESET` efface toutes les données.

---

### `vps/setup_redis.sh`
**Rôle :** Installation et configuration Redis.  
**Exécution :** `sudo bash deploy/vps/setup_redis.sh`  
**Ce qu'il configure :** bind 127.0.0.1, requirepass, maxmemory 256 MB, politique allkeys-lru.  
**Modifie `.env` :** `REDIS_PASSWORD`, `REDIS_URL`.

---

### `vps/setup_minio.sh`
**Rôle :** Installation MinIO + création du bucket.  
**Exécution :** `sudo bash deploy/vps/setup_minio.sh`  
**Lit depuis `.env` :** `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY`, `MINIO_BUCKET`  
**Crée :** service systemd `minio`, user système `minio-user`, répertoires `/var/lib/minio`, bucket S3.

---

### `vps/setup_backend.sh`
**Rôle :** Build NestJS + démarrage PM2 backend.  
**Exécution :** `bash deploy/vps/setup_backend.sh` (pas sudo)  
**Ce qu'il fait :** installe nvm/Node, `npm ci`, `prisma generate`, `prisma migrate deploy`, `npm run build`, configure PM2.  
**PM2 name :** `stockini-backend` (port 3001)

---

### `vps/setup_frontend.sh`
**Rôle :** Build Next.js + démarrage PM2 frontend.  
**Exécution :** `bash deploy/vps/setup_frontend.sh` (pas sudo)  
**Ce qu'il fait :** `npm ci`, `npm run build`, copie des assets statiques, configure PM2.  
**PM2 name :** `stockini-frontend` (port 3000)

---

### `vps/setup_nginx.sh`
**Rôle :** Installation et activation de la configuration Nginx.  
**Exécution :** `sudo bash deploy/vps/setup_nginx.sh`  
**Source config :** `deploy/vps/nginx-stockini-msp.conf`  
**Destination :** `/etc/nginx/sites-available/203.0.113.10`
**Comportement :** installe la config HTTPS si les certificats existent, sinon HTTP-only.

---

### `vps/redeploy.sh`
**Rôle :** Mise à jour complète en production.  
**Exécution :** `bash deploy/vps/redeploy.sh [--with-system-patch]`  
**Droits :** utilisateur normal (pas sudo)  
**Option :** `--with-system-patch` crée les familles dropdown manquantes après migration.

---

### `vps/monitor.sh`
**Rôle :** Dashboard interactif de monitoring.  
**Exécution :** `bash deploy/vps/monitor.sh`  
**Droits :** utilisateur normal

---

### `vps/add_user.sh`
**Rôle :** Création d'un utilisateur admin directement en base.  
**Exécution :** `bash deploy/vps/add_user.sh`  
**Utilité :** créer le premier compte administrateur sans passer par l'interface.

---

### `vps/fix-migration.sh`
**Rôle :** Résolution d'une migration Prisma bloquée (état P3009).  
**Exécution :** `bash deploy/vps/fix-migration.sh`  
**Quand l'utiliser :** uniquement quand `redeploy.sh` s'arrête avec l'erreur `P3009 — Failed migration state`.

---

### `vps/clean_backend.sh`
**Rôle :** Nettoyage et rebuild du backend uniquement (sans frontend).  
**Exécution :** `bash deploy/vps/clean_backend.sh`  
**Utile pour :** debugger un problème backend isolé sans relancer tout le redeploy.

---

### `nginx-stockini-msp.conf`
**Rôle :** Configuration Nginx de production.  
**Contenu :**
- Rate limiting : global (20 r/s), API (30 r/s), login (1 r/s)
- Redirection HTTP → HTTPS
- SSL/TLS : TLS 1.2 + 1.3, ciphers modernes
- Headers de sécurité : HSTS, X-Frame-Options, X-Content-Type-Options, etc.
- Proxy vers backend (port 3001) pour `/api/` et `/socket.io/`
- Proxy vers frontend (port 3000) pour tout le reste
- Rate limit strict sur `/api/auth/login` et `/api/auth/forgot-password`
- Blocage des scanners (`.env`, `.git`, `wp-admin`, etc.)

---

### `cron-backup-db.sh`
**Rôle :** Backup PostgreSQL automatique.  
**Exécution manuelle :** `bash deploy/cron-backup-db.sh`  
**Setup cron :** `bash deploy/cron-backup-db.sh --setup`  
**Stockage :** `/home/ubuntu/backup-automatique-db/backup.sql` (un seul backup conservé, écrasé à chaque exécution)

---

## 9. Variables d'environnement — référence

Toutes les variables sont dans `.env` à la racine du projet. Le modèle est `deploy/vps/.env.prod.vps`.

| Variable | Exemple | Description |
|----------|---------|-------------|
| `DOMAIN` | `203.0.113.10` | Domaine principal |
| `NODE_ENV` | `production` | Environnement Node |
| `PORT` | `3001` | Port backend NestJS |
| `BACKEND_PORT` | `3001` | Port backend (redondant, utilisé par les scripts) |
| `FRONTEND_PORT` | `3000` | Port frontend Next.js |
| `DB_USER` | `stockpro` | Utilisateur PostgreSQL |
| `DB_PASSWORD` | `...` | Mot de passe PostgreSQL |
| `DB_NAME` | `stockpro` | Nom de la base PostgreSQL |
| `DATABASE_URL` | `postgresql://...` | URL complète PostgreSQL (auto-générée par setup_postgres.sh) |
| `USE_REDIS` | `true` | Activer Redis |
| `REDIS_PASSWORD` | `...` | Mot de passe Redis (auto-généré si absent) |
| `REDIS_URL` | `redis://:pass@localhost:6379` | URL Redis (auto-générée) |
| `JWT_SECRET` | `openssl rand -base64 64` | Clé signature tokens JWT |
| `JWT_REFRESH_SECRET` | `openssl rand -base64 64` | Clé refresh tokens JWT |
| `JWT_EXPIRES_IN` | `15m` | Durée token d'accès |
| `JWT_REFRESH_EXPIRES_IN` | `7d` | Durée token de rafraîchissement |
| `CORS_ORIGIN` | `http://203.0.113.10` | Origines CORS autorisées |
| `FRONTEND_URL` | `http://203.0.113.10` | URL frontend (pour les liens dans les emails) |
| `NEXT_PUBLIC_API_URL` | `/api` | Chemin API côté browser |
| `INTERNAL_API_URL` | `http://127.0.0.1:3001/api` | URL API interne (SSR Next.js) |
| `NEXT_PUBLIC_APP_URL` | `http://203.0.113.10` | URL publique de l'app |
| `NEXT_PUBLIC_SITE_URL` | `http://203.0.113.10` | URL du site (Next.js metadata) |
| `NEXT_PUBLIC_APP_NAME` | `Stockini` | Nom affiché de l'application |
| `MINIO_ENDPOINT` | `127.0.0.1` | Adresse MinIO |
| `MINIO_PORT` | `9000` | Port MinIO API |
| `MINIO_USE_SSL` | `false` | SSL MinIO (false = connexion locale) |
| `MINIO_BUCKET` | `generated-documents` | Nom du bucket |
| `MINIO_ACCESS_KEY` | `...` | Clé d'accès MinIO |
| `MINIO_SECRET_KEY` | `...` | Clé secrète MinIO |
| `MINIO_PUBLIC_ENDPOINT` | `http://203.0.113.10/storage` | URL publique MinIO (liens de téléchargement) |
| `UPLOAD_DIR` | `/home/ubuntu/stockini/uploads` | Répertoire uploads local |
| `SMTP_HOST` | `smtp.gmail.com` | Hôte SMTP |
| `SMTP_PORT` | `587` | Port SMTP |
| `SMTP_SECURE` | `false` | TLS implicite — `false` pour le port 587 (STARTTLS), `true` pour 465 |
| `SMTP_REQUIRE_TLS` | `true` | Force STARTTLS sur le port 587 |
| `SMTP_FORCE_IPV4` | `true` | Force IPv4 (évite `ENETUNREACH` sur VPS sans IPv6) |
| `SMTP_USER` | `...` | Utilisateur SMTP |
| `SMTP_PASS` | `...` | Mot de passe SMTP (App Password Gmail) |
| `SMTP_FROM` | `noreply@example.com` | Expéditeur des emails |
| `COMPANY_NAME` | `Moumna spare part` | Nom société (en-tête PDF) |
| `COMPANY_ADDRESS` | `...` | Adresse société (PDF) |
| `COMPANY_PHONE` | `...` | Téléphone société (PDF) |
| `COMPANY_EMAIL` | `...` | Email société (PDF) |
| `COMPANY_TAX_ID` | `...` | Matricule fiscal (PDF) |
| `COMPANY_LOGO_URL` | `...` | URL logo société (PDF) |
| `COMPANY_BANK_RIB` | `...` | RIB société (PDF, optionnel) |
| `BACKUP_GPG_RECIPIENT` | `admin@example.com` | Email GPG pour chiffrement backup (optionnel) |
| `ADMIN_EMAIL` | `admin@localhost` | Email contact Let's Encrypt |

---

## 10. Dépannage

### Le backend ne démarre pas

```bash
# Voir les logs PM2
pm2 logs stockini-backend --lines 100

# Vérifier le port 3001
ss -tlnp | grep 3001
lsof -i :3001

# Tuer un processus qui occupe le port
kill -9 $(lsof -ti :3001)

# Redémarrer
pm2 restart stockini-backend
pm2 logs stockini-backend
```

### Erreur de migration Prisma (P3009)

```bash
cd backend
npx prisma migrate status

# Si la migration SQL a été appliquée en base mais pas marquée :
npx prisma migrate resolve --applied <nom_de_la_migration>

# Si la migration SQL n'a pas été appliquée :
npx prisma migrate resolve --rolled-back <nom_de_la_migration>
npx prisma migrate deploy

# Ou utiliser le script dédié :
bash deploy/vps/fix-migration.sh
```

### Nginx retourne 502 Bad Gateway

```bash
# Vérifier que le backend tourne
curl http://127.0.0.1:3001/health

# Tester la config Nginx
sudo nginx -t

# Voir les logs Nginx
sudo tail -50 /var/log/nginx/error.log
```

### Nginx retourne 404 ou mauvaise config

```bash
# Reconfigurer Nginx
sudo bash deploy/vps/setup_nginx.sh

# Voir le site actif
ls -la /etc/nginx/sites-enabled/
```

### SSL expire ou certificat manquant

```bash
# Voir les certificats
sudo certbot certificates

# Renouveler manuellement
sudo certbot renew

# Renouveler un domaine spécifique
sudo certbot renew --cert-name 203.0.113.10

# Recharger Nginx après renouvellement
sudo systemctl reload nginx
```

### MinIO inaccessible

```bash
sudo systemctl status minio
sudo journalctl -u minio -n 50

# Redémarrer
sudo systemctl restart minio

# Vérifier les credentials
cat /etc/default/minio
```

### Redis ne répond pas

```bash
sudo systemctl status redis-server
redis-cli ping                          # doit retourner PONG (sans mot de passe si local)

# Avec mot de passe
REDIS_PASS=$(grep '^REDIS_PASSWORD=' .env | cut -d= -f2)
redis-cli -a "$REDIS_PASS" ping
```

### PostgreSQL connexion refusée

```bash
sudo systemctl status postgresql

# Vérifier l'auth locale
sudo nano /etc/postgresql/16/main/pg_hba.conf
# La ligne suivante doit exister :
# host  all  all  127.0.0.1/32  md5

sudo systemctl reload postgresql
```

### PM2 ne redémarre pas au boot

```bash
pm2 save
pm2 startup
# Copier-coller la commande sudo que PM2 affiche
```

---

## 11. Sécurité

### Architecture réseau

- PostgreSQL, Redis et MinIO ne sont accessibles que depuis `localhost` (pas exposés à Internet)
- MinIO n'a pas de SSL direct — il est accessible via Nginx sur `/storage` (HTTPS)
- Nginx filtre et rate-limite toutes les requêtes entrantes

### Firewall UFW

Après setup :
```
22/tcp   → SSH
80/tcp   → HTTP (redirection vers HTTPS)
443/tcp  → HTTPS
```
Tout autre port est bloqué.

### Fail2ban — Jails actifs

| Jail | Cible | Ban après | Durée |
|------|-------|-----------|-------|
| `sshd` | SSH brute-force | 5 échecs | 1h |
| `sshd-aggressive` | SSH répété | 3 échecs | 24h |
| `nginx-botsearch` | Scanners | 10 hits | 10min |
| `nginx-badbots` | User-agents malveillants | 2 hits | 24h |
| `nginx-http-auth` | Auth HTTP | 5 échecs | 1h |
| `stockini-login` | Login Stockini | 5 échecs | 30min |

```bash
# Voir les IPs bannies
sudo fail2ban-client status sshd

# Débannir une IP
sudo fail2ban-client set sshd unbanip <IP>
```

### Logs importants

| Fichier | Contenu |
|---------|---------|
| `/var/log/nginx/access.log` | Toutes les requêtes HTTP/HTTPS |
| `/var/log/nginx/error.log` | Erreurs Nginx (502, 404...) |
| `/var/log/auth.log` | Tentatives SSH, sudo |
| `/var/log/fail2ban.log` | IPs bannies |
| `/var/log/ufw.log` | Connexions bloquées par firewall |
| `/var/log/stockini/security-alerts.log` | Alertes sécurité Stockini |
| `/home/ubuntu/backup-automatique-db/backup.log` | Logs des backups |

---

*Documentation maintenue dans `deploy/README.md`. Pour toute modification du domaine ou de la configuration, mettre à jour `deploy/vps/.env.prod.vps` et relancer `sudo bash deploy/vps/setup_nginx.sh`.*
