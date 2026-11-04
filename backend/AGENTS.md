# Miroir backend agent instructions

## Scope

This repository contains the Miroir backend MVP slice:

- Node.js public API with Fastify and TypeScript.
- PostgreSQL schema and migrations, Neon-ready, with row-level security.
- Demo identity and bearer sessions.
- Strategy drafts, user confirmation, and immutable strategy versions.
- Manual trades, fixed-template CSV trade import, evidence, realized P&L, and R multiples.
- Stateless Python scoring service with deterministic demo-v2 checks.
- Saved idempotent reviews, classic stats, and rule-adherence progress.

Frontend code and live AI provider calls are out of scope for this slice. Roqqu sandbox integration is now a required next feature, but it is not implemented yet. Do not guess endpoints or payloads: obtain the official sandbox contract and safe test credentials first. The API lead reports no sandbox IP allowlist is needed and real webhooks are not delivered in the sandbox. Keep manual trade entry and fixed-template CSV working; production/live-account behavior is unconfirmed until official documentation is reviewed.

## Commands

- Install Node dependencies: `npm ci`
- Install Python dependencies: `python -m pip install -r scoring/requirements.txt -r scoring/requirements-dev.txt`
- Run migrations: `npm run migrate`
- Seed demo data: `npm run seed`
- Start both local services: `npm run dev`
- Lint: `npm run lint`
- Typecheck: `npm run typecheck`
- Node tests: `npm test`
- Python tests: `npm run test:scoring`
- Build: `npm run build`
- Generate the public OpenAPI contract: `npm run generate-schema` (alias: `npm run openapi`)

## Boundaries

- Node owns authentication, permissions, permanent records, context assembly, and saving results.
- Python scoring must remain stateless and must not receive database credentials.
- The frontend must not call the Python scoring service directly.
- Deterministic code calculates scores. Any future model output may only explain validated results.
- Missing evidence is `cannot_assess`, never a breach.
- Realized P&L must not change Decision Quality.
- Use transaction-local identity context with `set_config('app.identity_id', $1, true)`. Do not use session-level `SET` with Neon pooled connections.
- The current demo deployment target is server-local PostgreSQL; configure `DATABASE_URL` for runtime and `MIGRATION_DATABASE_URL` for direct migrations. A future Neon environment must be separate, with pooled runtime and direct migration URLs. One running environment uses one database; do not imply automatic sync or failover. Production must not silently fall back to local PGlite.
- The supported Node runtime is 22 or newer; CI and the Render blueprint must match `package.json` engines.
- Keep public API rate limits in place. The in-memory rate-limit store is for a single instance; use shared storage or edge-level limits before scaling.

## Style

- Keep Markdown free of em dashes.
- Use LF line endings, final newlines, and no trailing whitespace.
- Commit subjects use `feat|fix|chore|docs`, optional lowercase scope, lowercase description, max 72 characters, no trailing period.
- Do not commit secrets, `.env`, `.data`, `node_modules`, `dist`, or Python caches.
