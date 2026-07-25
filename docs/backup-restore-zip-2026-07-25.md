# Fiabilisation de l'import et de la restauration ZIP

## Cause racine

Trois limites incompatibles interrompaient les gros uploads :

- Nginx appliquait `client_max_body_size 50M` à toutes les routes ;
- l'instance Axios globale abandonnait toute requête après 15 secondes ;
- `FileInterceptor('file')` utilisait le stockage mémoire Multer et le contrôleur
  transmettait `file.buffer`, avec une limite backend différente de 500 Mio.

Une coupure du navigateur ou du proxy pendant le multipart arrive dans Multer sous
la forme `Error: Request aborted`. Aucun mapping ne la distinguait d'une erreur
serveur, d'où le HTTP 500 générique. Pour un gros ZIP, plusieurs copies pouvaient
en outre coexister en RAM : buffer Multer, buffer ZIP et buffer de chaque entrée
extraite.

## Correctif

L'endpoint `POST /api/admin/database/restore` utilise maintenant `diskStorage`
dans un volume temporaire dédié. Le nom physique est un UUID et ne reprend jamais
le nom envoyé par le client. La limite d'upload est configurable.

Avant toute mutation, le serveur vérifie :

- extension et MIME pendant le multipart ;
- signature binaire `PK` ;
- structure ZIP et présence du dump/manifest ;
- chemins absolus, `..`, doublons et liens symboliques ;
- périmètre des entrées autorisées ;
- nombre d'entrées, taille décompressée totale et ratio de compression ;
- espace disque disponible ;
- tailles et sommes SHA-256 du manifest.

L'extraction est faite par `unzip` directement vers le disque après validation,
et le calcul SHA-256 lit les fichiers par blocs de 1 Mio. Le ZIP complet et le
dump PostgreSQL ne sont donc plus chargés en RAM. Les objets MinIO sont également
réimportés un par un.

Une seule restauration est acceptée par processus. Le ZIP est entièrement validé
avant la sauvegarde de sécurité et avant toute suppression. Le dump PostgreSQL de
sécurité et le snapshot MinIO sont créés avant mutation ; un rollback PostgreSQL
et MinIO est tenté en cas d'échec. Les espaces de travail et uploads sont nettoyés
dans des blocs `finally`.

Politique de conservation : le ZIP uploadé et les espaces extraits sont toujours
supprimés afin d'éviter de saturer le volume temporaire. Les logs structurés
restent dans la destination de logs Docker. Si une erreur survient après sa
création, le dump PostgreSQL `pre-restore-*.dump` reste dans le répertoire de
backups pour intervention ; le snapshot MinIO temporaire est supprimé après la
tentative de rollback.

Les réponses utilisent désormais notamment :

- `499 BACKUP_UPLOAD_ABORTED` ;
- `413 BACKUP_FILE_TOO_LARGE` ;
- `400 BACKUP_INVALID_ZIP` ;
- `409 BACKUP_RESTORE_IN_PROGRESS` ;
- `507 BACKUP_DISK_SPACE_INSUFFICIENT` ;
- `500 BACKUP_DATABASE_RESTORE_FAILED` ;
- `500 BACKUP_MINIO_RESTORE_FAILED`.

Le serveur journalise en JSON l'UUID de restauration, le nom original, la taille,
les étapes, les durées, le nettoyage et la pile complète. Le frontend ne reçoit
pas les piles ni les secrets.

## Configuration Nginx exacte

La `location` exacte ajoutée avant `location /api/` ne modifie aucune autre route :

```nginx
location = /api/admin/database/restore {
    client_max_body_size 2G;
    proxy_pass http://127.0.0.1:4010/api/admin/database/restore;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_connect_timeout 60s;
    proxy_send_timeout 3600s;
    proxy_read_timeout 3600s;
    send_timeout 3600s;
    proxy_request_buffering off;
    proxy_buffering off;
}
```

## Variables

```dotenv
BACKUP_UPLOAD_DIRECTORY=/opt/stockini/uploads
BACKUP_MAX_UPLOAD_BYTES=2147483648
BACKUP_MAX_EXTRACTED_BYTES=8589934592
```

La limite Nginx doit rester supérieure ou égale à `BACKUP_MAX_UPLOAD_BYTES`.
Le volume d'upload doit pouvoir contenir simultanément le ZIP, son contenu
décompressé, un dump PostgreSQL de sécurité et un snapshot MinIO.

## PostgreSQL et Docker

L'image backend installe maintenant `postgresql16-client` (`pg_dump`,
`pg_restore`, `psql`) et `unzip`. Aucun appel direct à `pg.Client` n'existe dans
`backend/src` : les recherches ne montrent donc aucun `Promise.all` exécutant
plusieurs `client.query()` sur une connexion partagée à corriger. Les accès
applicatifs passent par Prisma et son pool ; les commandes destructives sont
séquentielles après `$disconnect()`, puis `$connect()` dans `finally`. Si
l'avertissement réapparaît après redéploiement, il faut conserver sa pile complète
pour identifier un appel issu d'une dépendance ou d'un ancien conteneur.

Compose crée un volume temporaire séparé et conserve les healthchecks PostgreSQL,
MinIO, backend et frontend. Le conteneur backend actuel s'exécute avec un user
ayant le droit de créer `/opt/stockini/uploads`.

## Déploiement et vérification

Ces commandes ne lancent aucune restauration :

```bash
cp .env .env.rollback-before-backup-fix
docker compose -f deploy-docker/docker-compose.prod.yml \
  --env-file deploy-docker/.env.prod config --quiet
docker compose -f deploy-docker/docker-compose.prod.yml \
  --env-file deploy-docker/.env.prod build stockini-prod-backend stockini-prod-frontend
docker compose -f deploy-docker/docker-compose.prod.yml \
  --env-file deploy-docker/.env.prod up -d
sudo bash deploy/vps/setup_nginx.sh
docker compose -f deploy-docker/docker-compose.prod.yml \
  --env-file deploy-docker/.env.prod ps
```

Tests locaux :

```bash
cd backend
npm run build
npm test -- --runInBand
cd ../frontend
npm run build
cd ..
docker compose config --quiet
git diff --check
```

Pour la recette destructive, utiliser d'abord une stack isolée contenant une
copie des données, jamais la production :

1. créer un backup complet depuis l'interface ;
2. le télécharger et relever sa taille et son SHA-256 ;
3. ajouter dans la stack de recette un enregistrement PostgreSQL et un objet
   MinIO témoins après le backup ;
4. uploader le ZIP via l'interface et vérifier la progression jusqu'à 100 % ;
5. se reconnecter, vérifier les tables métier et les documents MinIO attendus ;
6. confirmer que les deux témoins postérieurs au backup ont disparu ;
7. vérifier l'absence de dossier `restore-*` et de fichier `*.zip.upload` ;
8. archiver les logs portant le même `restoreId`.

Les tests automatisés construisent un ZIP complet PostgreSQL + MinIO, le valident,
restaurent les deux composants avec doubles non destructifs, contrôlent le
rollback, les archives corrompues/incomplètes, le zip-slip, les checksums, la
concurrence, les limites et le nettoyage. Ils ne constituent pas une restauration
réelle de données de production.

## Rollback

```bash
git revert <commit-du-correctif>
cp .env.rollback-before-backup-fix .env
docker compose -f deploy-docker/docker-compose.prod.yml \
  --env-file deploy-docker/.env.prod up -d --build
sudo bash deploy/vps/setup_nginx.sh
```

Le volume temporaire peut être conservé pendant le rollback. Ne pas supprimer les
volumes PostgreSQL, MinIO ou backups. Une suppression éventuelle du seul volume
d'uploads doit être faite uniquement après avoir vérifié qu'aucun import n'est en
cours.
