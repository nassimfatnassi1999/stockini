# Déploiement Docker production de Stockini

Ce dossier lance uniquement `stockini-prod-backend` et `stockini-prod-frontend`.
Il ne crée ni PostgreSQL, ni MinIO, ni volume de données. Les ports VPS utilisés
par défaut sont `3010` (frontend) et `4010` (backend).

## 1. Préparer la configuration

Éditer `.env.prod` et remplacer toutes les valeurs `IP_VPS` et `A_REMPLACER`.
`NEXT_PUBLIC_API_URL` doit être l'URL joignable par le navigateur, par exemple
`http://203.0.113.10:4010`. `CORS_ORIGIN` doit être l'URL exacte du frontend,
par exemple `http://203.0.113.10:3010`.

Ne pas utiliser `localhost` dans `DATABASE_URL` ou `MINIO_ENDPOINT` : depuis le
backend, il désigne le backend lui-même.

### Cas A — ports PostgreSQL/MinIO publiés sur le VPS

Conserver `host.docker.internal` dans `.env.prod`. Le mapping Linux nécessaire
est déjà présent dans le compose. Vérifier que PostgreSQL autorise cette connexion
et que son port publié n'est pas limité à une autre interface inaccessible.

### Cas B — PostgreSQL/MinIO via le network Docker

Demander d'abord à Compose de créer son réseau et ses conteneurs sans les démarrer,
puis connecter les conteneurs de données existants à ce réseau :

```bash
docker compose --env-file .env.prod -f docker-compose.prod.yml create
docker network connect stockini-prod-network <postgres_container_name>
docker network connect stockini-prod-network <minio_container_name>
```

Dans `.env.prod`, utiliser ensuite les noms (ou alias) de ces conteneurs comme
hosts. Ces commandes n'arrêtent et ne modifient pas leurs volumes. Si un conteneur
est déjà connecté, Docker peut simplement signaler que l'endpoint existe déjà.

Pour identifier leur configuration réseau et leurs ports :

```bash
docker inspect <postgres_container_name>
docker inspect <minio_container_name>
```

## 2. Vérifier les conflits puis lancer

```bash
sudo ss -tulpn | grep -E '3000|3010|4000|4010|5432|9000|9001'
docker ps
docker compose --env-file .env.prod -f docker-compose.prod.yml config
docker compose --env-file .env.prod -f docker-compose.prod.yml up -d --build
```

Ouvrir ensuite `http://IP_VPS:3010`. Autoriser les ports 3010 et 4010 dans le
pare-feu du VPS si nécessaire. Un changement de `NEXT_PUBLIC_API_URL` exige un
nouveau build du frontend.

## Exploitation

Depuis la racine du projet, les commandes recommandées sont :

```bash
make prod-deploy
make prod-logs
make prod-status
make prod-migrate
make prod-buckets
make prod-restart
make prod-undeploy
```

`make clear` supprime uniquement les ressources Docker Stockini après saisie de
la confirmation explicite `SUPPRIMER`. Il n'utilise aucun prune global.

Voir les logs :

```bash
docker compose -f docker-compose.prod.yml logs -f
```

Vérifier les conteneurs et leur santé :

```bash
docker ps
docker compose -f docker-compose.prod.yml ps
```

Arrêter uniquement Stockini :

```bash
docker compose -f docker-compose.prod.yml down
```

Ne jamais exécuter `docker compose down -v`. Ne pas utiliser le compose racine,
qui contient des services PostgreSQL et MinIO destinés à un autre environnement.
