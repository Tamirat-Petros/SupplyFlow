# SupplyFlow

SupplyFlow is a distribution management system for medium-sized Ethiopian product distributors. See [the planning documents](docs/DEVELOPMENT_ROADMAP.md) for scope and milestones.

## Prerequisites

- Node.js 22 or later
- Docker Desktop for local PostgreSQL

## Local setup

1. Copy `apps/api/.env.example` to `apps/api/.env` and set non-development secrets.
2. Start PostgreSQL with `docker compose up -d`.
3. Install packages with `npm install`.
4. Create the database schema using `npm run prisma:migrate -w @supplyflow/api`.
5. Start development servers using `npm run dev`.

The API listens on `http://localhost:3000` by default. `GET /api/v1/health` reports readiness.

