# Stockini

Stockini is a spare-parts stock management application with a NestJS API, a Next.js dashboard, PostgreSQL, and Prisma.

## Stack

- Backend: NestJS, Prisma, PostgreSQL, JWT authentication, Swagger
- Frontend: Next.js, React, Tailwind CSS, React Query
- Tooling: Docker Compose, Makefile, ESLint, TypeScript

## Requirements

- Node.js 20+
- npm
- Docker and Docker Compose
- Make

## Quick Start

```bash
cp .env.example .env
make install
make dev
```

The development command starts PostgreSQL, applies Prisma migrations, seeds the database, then runs the backend and frontend.

Local URLs:

- Frontend: http://localhost:3000
- Backend API: http://localhost:3001/api
- Swagger docs: http://localhost:3001/api/docs
- Prisma Studio: http://localhost:5555

## Environment

The root `.env` file is shared by the local development commands.

```env
DATABASE_URL="postgresql://stockpro:stockpro_password@localhost:5432/stockpro?schema=public"
APP_NAME="Stockini"
JWT_SECRET="change_me"
JWT_REFRESH_SECRET="change_me_refresh"
JWT_EXPIRES_IN="15m"
JWT_REFRESH_EXPIRES_IN="7d"
PORT=3001
```

For production, replace the JWT secrets and database credentials with secure values.

## Common Commands

```bash
make help          # Show available commands
make install       # Install backend and frontend dependencies
make dev           # Run the full development stack
make stop          # Stop Docker development services
make build         # Build backend and frontend
make db-up         # Start PostgreSQL
make db-migrate    # Generate Prisma client and apply migrations
make db-seed       # Seed the database
make db-reset      # Reset database and seed again
make studio        # Open Prisma Studio
make logs          # Follow Docker logs
```

## Manual Development

If you do not want to use the Makefile, start the database first:

```bash
docker compose --env-file .env up -d postgres
```

Then run the backend:

```bash
cd backend
npm install
npx prisma generate
npx prisma migrate dev
npm run start:dev
```

In another terminal, run the frontend:

```bash
cd frontend
npm install
NEXT_PUBLIC_API_URL=http://localhost:3001 npm run dev
```

## Project Structure

```text
.
├── backend/           # NestJS API and Prisma schema
├── frontend/          # Next.js dashboard
├── docker-compose.yml # Local PostgreSQL and app services
├── Makefile           # Development, database, and build commands
└── .env.example       # Example environment configuration
```

## Backend

The backend source lives in `backend/src` and exposes the API under `/api`. Swagger documentation is available at `/api/docs` when the backend is running.

Useful backend commands:

```bash
cd backend
npm run start:dev
npm run build
npm run lint
npm run test
```

## Frontend

The frontend source lives in `frontend/src/app`, with shared UI components in `frontend/src/components`.

### Recovering missing Next.js static chunks

Database restore never restores or deletes MinIO objects, `frontend/.next`, `frontend/public`, source files, or runtime files. If HTML was served from an old Next.js process while its build changed, stop every frontend instance and rebuild the cache:

```bash
# Development
cd frontend
npm run clean:next
npm install        # only needed when dependencies may have changed
npm run dev

# PM2 production: use the deployment script so static assets and the server
# come from the same build, with a single stockini-frontend instance.
cd ..
pm2 delete stockini-frontend 2>/dev/null || true
bash deploy/vps/setup_frontend.sh
pm2 status
```

Do not run `next dev` and PM2 on the same port. A `200` response for a page together with `404` responses under `/_next/static/` indicates a stale/mismatched Next build, not a PostgreSQL data error.

### Backup and restore scope

Admin backups are strictly database-only. A new archive contains exactly
`database.dump` (PostgreSQL custom format) and `backup-manifest.json`; MinIO,
PDFs, images, exports and runtime files are never included. Legacy archives
remain readable, but their `minio/`, `documents/` and `uploads/` payloads are
ignored without modifying the active object storage. After PostgreSQL restore,
the backend runs `prisma migrate deploy` and validates the critical tables.
Missing generated PDFs can be regenerated manually from restored business data.

Useful frontend commands:

```bash
cd frontend
npm run dev
npm run build
npm run lint
```
