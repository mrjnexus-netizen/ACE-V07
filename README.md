# ACE-2026 - Autonomous Composer Ecosystem

A cinematic, full-stack digital portfolio and media pipeline for world-class composers.
Built with React 19, Three.js, Express 5, PostgreSQL 16, and Redis.

## Prerequisites

- **Node.js** 22.11.0 EXACT
- **pnpm** 9.12.3 EXACT
- **Docker** (for PostgreSQL 16 + Redis 7.2)
- **AWS Account** with S3 bucket and CloudFront (for media delivery)
- **OpenAI API keys** for DALL-E 3 and GPT-4o (optional)

## Environment Setup

1. Clone the repository.
2. Copy .env.example to .env and fill in all required values.
3. Install dependencies:
   pnpm install --no-frozen-lockfile
4. Start development servers:
   pnpm run dev:frontend
   pnpm run dev:api
5. Run database migrations (requires Docker):
   docker-compose up -d postgres redis
   pnpm run db:migrate
   pnpm run db:seed

## Production Deployment

docker-compose up -d --build
bash scripts/health-check.sh

## API Keys

API keys for AI services are managed via the **Admin Dashboard > Gatekeeper Hub** (Tab 3).
They are encrypted with AES-256-GCM and stored in the database.

## Troubleshooting

- **TypeScript errors:** Run pnpm run typecheck
- **Lint errors:** Run pnpm run lint
- **Build fails:** Ensure all dependencies are installed and .env is configured.
- **Port already in use:** Free ports 18956, 8080, 5432, or 6379.

## Documentation

- Full system blueprint: PROJECT_BLUEPRINT.md
- Master foundation file: MASTER FOUNDATION FILE v6.0.pdf
- API specification: lib/api-spec/openapi.yaml
