# Ajouter un utilisateur

`add-user.sh` crée un utilisateur Stockini en respectant le modèle Prisma et le
hashage du backend. Il ne réalise aucune insertion SQL brute et n'affiche jamais
le mot de passe ni son hash.

## Prérequis

- Node.js et les dépendances de `backend/` installées ; ou
- un service backend déjà actif dans l'un des fichiers Docker Compose du projet ;
- un `DATABASE_URL` exporté, défini dans `backend/.env` ou dans `.env`.

Le script teste réellement la connexion. Si la connexion locale échoue, il
cherche un service dont le nom contient `backend` dans les fichiers Compose
existants, vérifie qu'il est actif et exécute l'auxiliaire dans ce conteneur.
Il ne démarre, ne reconstruit et ne migre aucun conteneur.

## Utilisation interactive

Depuis la racine du projet :

```bash
make add-user
```

La target vérifie la présence et le droit d'exécution du script, puis lui
transmet directement le terminal. Elle fonctionne également avec :

```bash
make -C /chemin/vers/stockini add-user
```

Le script demande le nom complet, l'email, le téléphone facultatif, le rôle
(liste lue depuis la table `Role`), le statut et deux fois le mot de passe. La
confirmation finale vaut « non » par défaut.

Les libellés et les rôles attendus proviennent de
`backend/prisma/role-definitions.ts`, également utilisé par le seed Prisma.
L'assistant synchronise automatiquement ces rôles de façon idempotente avant
d'afficher le menu : les rôles absents sont créés et les permissions des rôles
existants sont actualisées. Une sélection accepte le numéro ou le nom du rôle,
sans tenir compte de la casse.

En mode Docker, le script utilise `.env` avec le Compose de développement et
`deploy-docker/.env.prod` avec le Compose de production. Les appels Docker sont
réservés aux contrôles et à l'écriture transactionnelle ; l'assistant lui-même
reste attaché au terminal de `make`.

## Options d'automatisation

```bash
printf '%s\n' "$NOUVEAU_MOT_DE_PASSE" | scripts/add-user.sh \
  --name "Administrateur" \
  --email admin@example.com \
  --role ADMIN \
  --active \
  --password-stdin \
  --yes
```

Options : `--name`, `--email`, `--phone`, `--role`, `--active`, `--inactive`,
`--password-stdin` et `--yes`. Avec `--password-stdin`, tous les champs
obligatoires doivent être fournis en options afin que l'entrée standard reste
réservée au secret. `--yes` est une confirmation explicite destinée à
l'automatisation ; sans cette option, la confirmation finale reste obligatoire.
Ne placez jamais un mot de passe dans la ligne de commande, car il serait visible
dans l'historique et la liste des processus. Préférez un gestionnaire de secrets
qui écrit sur l'entrée standard.

## Sécurité et erreurs courantes

- Ne lancez pas le script avec `sudo`.
- Le mot de passe doit contenir au moins 8 caractères, comme dans le DTO backend.
- L'email est normalisé en minuscules et doit être unique.
- Le rôle doit déjà exister dans la base ; aucun rôle n'est créé implicitement.
- Une erreur `DATABASE_URL est absent` indique qu'aucun environnement utilisable
  n'a été trouvé.
- Une erreur de connexion exige de démarrer PostgreSQL ou le backend Compose,
  puis de relancer le script.
- Une erreur de rôle signifie généralement que le seed Prisma n'a pas encore
  créé les rôles.

La création, ses vérifications et le journal d'audit `USER_CREATED` sont exécutés
dans une même transaction Prisma. Le journal identifie explicitement
`scripts/add-user.sh` comme source technique, sans attribuer l'action à un
utilisateur existant. Une erreur annule toute modification.

## Vérification

```bash
cd backend
npx jest src/scripts/add-user.spec.ts --runInBand
npm run build
npx eslint src/scripts/add-user.ts src/scripts/add-user.spec.ts src/users/password.util.ts

cd ..
bash -n scripts/add-user.sh
scripts/add-user.sh --help
```
