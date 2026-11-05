# Miroir backend

Provider-neutral Fastify API for the current `frontend--/` application. `DATA_MODE=mock|postgres` selects storage behind one stable HTTP contract:

- `mock`: in-memory demo store with labelled sample Roqqu balances/history.
- `postgres`: persistent PostgreSQL demo and self-managed-user store.

Deterministic rule evaluation is authoritative. The AI explanation adapter defaults to `not_configured`; explanatory text cannot change scores. Roqqu routes are read-only and on-demand. Per-user connections use each user's verified Miroir email; the optional Roqqu staging key remains server-side and is used only with that email. No writes/trades or ledger-to-trade import are implemented.

## Local mock mode

```bash
cp .env.example .env   # optional; DATA_MODE defaults to mock
npm ci
npm run dev
```

Check `http://localhost:8080/health`. Vite proxies API requests to this local address.

## Local PostgreSQL and account auth

Requires Docker Compose or an existing PostgreSQL instance. With Compose:

```bash
docker compose -f compose.yaml up -d postgres
cp .env.example .env
# Change DATA_MODE=postgres in backend/.env; DATABASE_URL matches the Compose service.
npm ci
npm run db:migrate
npm run dev
```

In local development, `EMAIL_DELIVERY_MODE=console` prints a short-lived verification link in the API log. User passwords are scrypt-hashed; verification and session tokens are stored hashed in PostgreSQL. Auth endpoints have in-process rate limits. For hosted environments, use `EMAIL_DELIVERY_MODE=smtp` and configure SMTP settings privately. Do not reuse the sample Compose password outside local development.

The current schema is created by `db/migrations/001_initial.sql`. The migration is idempotent for a fresh rebuild. Keep future schema changes in versioned migration files and extend `src/migrate.js` before deploying a schema change.

## Read-only Roqqu staging

`ROQQU_STAGING_API_KEY` is optional and must be set only in the backend runtime environment. A verified user may connect only the email they verified with Miroir; the backend does not accept an account email from the browser. Live balances/history require PostgreSQL mode, a verified user, a saved per-user connection, and a staging key. The Accounts page refreshes on demand. Polling should be added only after the current official request limits are confirmed. In mock mode, only labelled synthetic sample balances/history are returned.

The RAS adapter pins `https://service.roqqu.com/v1`, uses `x-staging-api-key` and form encoding, applies a timeout, and rejects redirects. It has no mutation methods.

## API surface

- `POST /v1/demo/session`
- `POST /v1/auth/register`, `/login`, `/verify`, `/verification/resend`, `/logout`
- `GET /v1/me`, `GET /v1/strategies`
- `GET /v1/trades`, `POST /v1/trades`, bodyless `POST /v1/trades/:id/review`
- `GET /v1/stats?currency=USD`, `GET /v1/progress`
- `GET /v1/roqqu/status`, `POST /v1/roqqu/connect`, `POST /v1/roqqu/disconnect`, `GET /v1/roqqu/balances`, `GET /v1/roqqu/history`

Errors are returned as `{ error: { code, message } }`. Review POST is bodyless; clients must omit JSON content-type when no body is sent.

## Checks

```bash
npm ci
npm test
npm run lint
npm run build
```

The PostgreSQL/auth integration test runs when `DATABASE_URL` points to a migrated, dedicated PostgreSQL test database. It uses a unique temporary email and cleans up the test identities, but do not point it at a production database. Local PostgreSQL mode must be validated before a deployment; CI is configured with a temporary PostgreSQL service.
