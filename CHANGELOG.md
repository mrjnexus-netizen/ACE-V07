# Changelog

All notable changes to ACE-2026 will be documented in this file.

## [1.0.0] - 2026-06-07

### Added
- Initial production release of ACE-2026 Autonomous Composer Ecosystem.
- Linguistic Portal with Three.js starfield and 6-language selection.
- Persistent Glassmorphism Audio Player with Web Audio API.
- Admin Dashboard with 5-tab CMS (Identity, Media Pipeline, API Keys, Staging, Documents).
- AI Media Pipeline with DALL-E 3 art generation and GPT-4o multilingual narration.
- JWT authentication with refresh token rotation.
- PostgreSQL 16 + Drizzle ORM schema with 8 tables.
- Redis-backed rate limiting and BullMQ job queue.
- AES-256-GCM encryption for API keys at rest.
- Docker Compose stack with Nginx reverse proxy.
- Playwright E2E testing infrastructure.
- Zero-downtime CI/CD deployment pipeline.

### Security
- Helmet.js CSP headers on all Express routes.
- CSRF protection on state-mutating endpoints.
- SQL injection prevention via Drizzle ORM.
- XSS sanitization on all user inputs.
- Account lockout after 5 failed login attempts.
