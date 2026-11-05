# Miroir

Miroir reviews trade-execution evidence against a strategy. This repository snapshot uses the current `frontend--/` app and a clean, provider-neutral backend rebuild. The visual design has not been redesigned; frontend changes wire existing screens to real API data and add the minimal sign-in/account-linking flow needed for per-user Roqqu access.

## Product and safety scope

- Deterministic rule evaluation is authoritative. Missing evidence is `cannot_assess`, not a zero or a breach.
- Profit and Loss (P&L) and Decision Quality remain separate metrics.
- Demo sessions are clearly labelled and seeded with sample trades/reviews. Mock data is intentional and remains available through the same API.
- Manual trade creation is supported by the backend API. The current `frontend--/` snapshot has no manual-trade form. **Open product decision:** decide whether to add a manual trade-entry window for recording trades. This means logging trades independently; it does not imply live order execution or trading integration. Roqqu remains read-only.
- Roqqu RAS is read-only: balances and wallet-ledger history only. Ledger history is supplemental and is not imported as a canonical trade fill. No Roqqu trade/write endpoints are used.
- User accounts are self-managed email/password accounts with scrypt-hashed passwords, verified-email links, rate-limited auth endpoints, and opaque server sessions stored as hashes. Email verification uses a provider-neutral SMTP adapter; local development can print a short-lived verification link to the API log.
- A per-user Roqqu connection is bound to that user's **verified Miroir email**. The Roqqu staging key is one backend-only merchant credential; it never reaches the browser. The server only requests data for the authenticated user's verified email.
- Refresh is on demand. Add polling only after Roqqu's current allowed interval/rate limits are confirmed; no streaming feed is assumed.
- AI explanation has a `not_configured` adapter placeholder. It may provide bounded explanatory text only and cannot change deterministic scores. AI Strategy Chat is out of scope.
- Hosting-provider-specific deployment files are deferred until a target is selected.

## Project layout

```text
frontend--/                 React + Vite application
backend/                    Fastify API, mock/PostgreSQL stores, migrations, scoring, auth, Roqqu read adapter
.github/workflows/ci.yml    CI for the current frontend and backend

docs/                       Preserved project docs and rebuild notes
```

Older audit/runbook docs in `docs/` describe previous backend copies and are retained for reference; current instructions are in this README and `backend/README.md`.

## Requirements

- Node.js 22+ and npm
- PostgreSQL for persistent mode (or Docker Compose to run local PostgreSQL)

## Quick start — mock mode

Run the API in one terminal:

```bash
cd backend
npm ci
cp .env.example .env       # optional; DATA_MODE defaults to mock
npm run dev
```

Run the frontend in a second terminal:

```bash
cd frontend--
npm ci
npm run dev
```

Open `http://localhost:5173`. Vite proxies `/v1` and `/health` to `http://127.0.0.1:8080`. Demo sessions use the same API contract in both storage modes. Mock data lives in the backend and is labelled in the UI; the browser does not silently fall back if the API is unavailable. Account registration/sign-in requires `DATA_MODE=postgres`; mock mode remains available through **Start Demo**.

## Quick start — local PostgreSQL and user accounts

From `backend/`, start the local PostgreSQL service and copy the environment template:

```bash
docker compose -f compose.yaml up -d postgres
cp .env.example .env
```

Set `DATA_MODE=postgres` in `backend/.env` (the template database URL matches the local Compose service), then run:

```bash
npm ci
npm run db:migrate
npm run dev
```

Start `frontend--/` as shown above. PostgreSQL demo records and user accounts persist between API restarts. In local development, `EMAIL_DELIVERY_MODE=console` prints a short-lived verification link in the backend log. Open **Create Account**, register using the email associated with the Roqqu account, then open that link to verify and sign in.

For hosted environments, set `EMAIL_DELIVERY_MODE=smtp` and provide SMTP settings (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`) through the host's secret manager. The implementation is SMTP-based and does not depend on a hosting provider. The sample Compose password is local-development-only; do not reuse it for a hosted database. Removing the `miroir-postgres` volume permanently deletes its data.

For an existing local PostgreSQL install, set `DATABASE_URL`, apply `npm run db:migrate`, and use `DATA_MODE=postgres`.

## API contract

- `POST /v1/demo/session`
- `POST /v1/auth/register`, `/login`, `/verify`, `/verification/resend`, `/logout`
- `GET /v1/me`, `GET /v1/strategies`
- `GET /v1/trades`, `POST /v1/trades`
- Bodyless `POST /v1/trades/:id/review`
- `GET /v1/stats?currency=USD`, `GET /v1/progress`
- `GET /v1/roqqu/status`, `POST /v1/roqqu/connect`, `POST /v1/roqqu/disconnect`, `GET /v1/roqqu/balances`, `GET /v1/roqqu/history`

Errors use `{ "error": { "code", "message" } }`. The review request has no body; do not send `Content-Type: application/json` for it. The frontend only adds JSON content-type when a request body exists.

## Roqqu staging

To enable **staging only**, add `ROQQU_STAGING_API_KEY` privately to `backend/.env`; do not put it in the frontend or commit it. Sign in with a Miroir account whose verified email matches the Roqqu account, then use the Accounts screen to connect and refresh. The API key remains server-side, while each read is scoped to the authenticated user's verified email. No account email is accepted from the browser, and no ledger activity is converted into Miroir trades. No live request was made by this rebuilt copy; the key is not present in the workspace. Historical live staging tests belong to the removed implementation and are not evidence for this new adapter.

## Checks

```bash
cd frontend-- && npm ci && npm run lint && npm run build
cd ../backend && npm ci && npm test && npm run lint && npm run build
```

CI runs a PostgreSQL service for persistence/auth tests. The current sandbox has no PostgreSQL server or Docker executable, so its PostgreSQL integration test is skipped locally and must be verified in CI or on a machine with PostgreSQL/Docker.

## Environment and deployment

Configure `PORT`, `HOST`, `DATA_MODE`, `DATABASE_URL`, `CORS_ORIGIN`, `APP_BASE_URL`, email delivery, and the optional staging key through environment variables. Keep secrets out of source control and the frontend bundle. Host-specific deployment files will be added only after a target is selected.

No GitHub push, hosted CI run, or deployment was performed in this workspace. Review changes locally, then use GitHub Desktop to commit and push when ready.
