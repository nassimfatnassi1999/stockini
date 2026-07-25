# Exports PostgreSQL et MinIO

## Architecture

Le backend utilise `BACKUP_DIRECTORY=/app/backups` dans le conteneur. Docker
monte le répertoire persistant de l'hôte, par défaut
`/opt/stockini/backups`, sur ce chemin interne.

Sous-répertoires créés avec le mode `0750` :

- `postgresql/stockini-postgresql-latest.dump`
- `minio/stockini-minio-latest.zip`
- `complete/` pour les nouveaux backups complets
- `temporary/` pour les imports et verrous
- `safety/` pour les sauvegardes pré-restauration

Les anciens backups complets présents directement à la racine restent
lisibles, téléchargeables et restaurables.

## Planification

`IndependentExportsService.dailyPostgresExport()` est planifié par
`@nestjs/schedule` avec `0 2 * * *`. Le fuseau est `TZ` (par défaut
`Africa/Tunis`). Le cron appelle exactement `createPostgresExport()` comme le
bouton manuel. Un verrou mémoire doublé d'un verrou fichier
`temporary/postgresql.lock` empêche deux créations simultanées.

`POSTGRES_DAILY_EXPORT_ENABLED=false` désactive uniquement ce dump quotidien.
Le cron historique des backups complets reste inchangé.

## Variables

```dotenv
BACKUP_HOST_DIRECTORY=/opt/stockini/backups
BACKUP_DIRECTORY=/app/backups
TZ=Africa/Tunis
MINIO_BUCKETS=generated-documents
POSTGRES_DAILY_EXPORT_ENABLED=true
DATABASE_EXPORT_MAX_UPLOAD_BYTES=2147483648
DATABASE_EXPORT_MAX_EXTRACTED_BYTES=8589934592
DATABASE_EXPORT_MAX_FILES=100000
```

`MINIO_BUCKETS` accepte une liste séparée par des virgules. Si elle est vide,
`MINIO_BUCKET` est utilisé.

## Déploiement

Depuis la racine du projet :

```bash
sudo install -d -m 0750 /opt/stockini/backups
docker compose build backend frontend
docker compose up -d
docker compose ps
docker compose logs --tail=100 backend
```

En production avec le Compose dédié :

```bash
cd deploy-docker
docker compose -f docker-compose.prod.yml build stockini-prod-backend stockini-prod-frontend
docker compose -f docker-compose.prod.yml up -d
```

L'image backend contient déjà `postgresql16-client`, donc `pg_dump` et
`pg_restore`.

## Tests automatisés

```bash
cd backend
npm test -- --runInBand
npm run build

cd ../frontend
npm test
npm run build
```

## Test manuel

1. Se connecter avec un administrateur ayant `database.view`,
   `database.backup` et `database.restore`.
2. Ouvrir **Administration > Base de données > Sauvegardes**.
3. Créer un dump PostgreSQL, actualiser la liste et télécharger le `.dump`.
4. Recréer le dump et vérifier qu'un seul fichier `latest` existe.
5. Créer un export MinIO, afficher son manifeste puis télécharger le ZIP.
6. Ouvrir le ZIP hors production et vérifier `manifest.json`, les buckets, les
   clés complètes et les checksums.
7. Lancer le contrôle de cohérence et vérifier qu'aucun objet orphelin n'est
   supprimé.
8. Sur un environnement de recette, tester les restaurations serveur et
   importées après avoir saisi `RESTAURER`, dans les deux modes MinIO.
9. Vérifier que les documents restaurés sont accessibles depuis leurs écrans
   métier.
10. Vérifier les événements correspondants dans les journaux d'audit.

## Rollback applicatif

1. Conserver `/opt/stockini/backups` : ne pas supprimer le volume.
2. Redéployer l'image backend/frontend précédente.
3. Restaurer l'ancien fichier Compose si nécessaire. Si l'ancienne image
   attend `/opt/stockini/backups` dans le conteneur, monter le même chemin hôte
   sur ce chemin interne.
4. Les backups complets récents sont dans `complete/`. Pour une image ne
   connaissant pas ce sous-répertoire, copier de façon non destructive le ZIP
   choisi à la racine de `/opt/stockini/backups`.
5. En cas d'échec de restauration, ne pas effacer `safety/`; utiliser le dump
   ou le ZIP horodaté pour une reprise contrôlée.

La restauration PostgreSQL crée un dump de sécurité valide avant toute
modification, utilise `pg_restore --single-transaction`, applique les migrations
Prisma puis vérifie la connexion et les tables critiques. Une erreur déclenche
un rollback vers le dump de sécurité. La restauration MinIO crée également un
ZIP de sécurité et le réapplique en cas d'échec partiel.
