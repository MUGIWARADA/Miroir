# Miroir Workflow Project

This folder is an isolated working copy of the current Miroir frontend and backend. The original Google Drive source files have not been changed.

## Product scope

- Manual trade entry is independently usable and remains available without an exchange connection.
- The current workspace is a **demo**: creating one seeds sample trades and saved reviews, alongside any trades you enter manually.
- Reviews use the backend's deterministic Python scorer. Decision Quality is not profitability; missing evidence is `cannot_assess`, not a zero or a breach.
- The backend has read-only Roqqu RAS staging routes for configuration status, balances, and ledger history. An authorized live staging balance check succeeded (HTTP 200; 20 assets); the key was not saved in project files. History was not live-tested. RAS ledger history is supplemental data, not auto-imported as canonical trade fills; trading, sending, refunding, and account mutations remain out of scope.
- Development uses local PGlite by default. The chosen demo deployment target is server-local PostgreSQL. Neon, if used later, is a separate environment—not a synchronized backup or failover.

## Project layout

```text
frontend/                  React + Vite application
backend/                   Fastify API, PostgreSQL/PGlite migrations, Python scorer
.github/workflows/ci.yml   Root workflow for frontend + backend checks
docs/FRONTEND_BACKEND_AUDIT.md
```

Both npm lockfiles are retained. Install dependencies with `npm ci`; do not check in `node_modules`, `.venv`, build output, runtime databases, or environment credentials.

## Local quick start

Requirements: Node.js 22+, npm, Python 3.11+. The commands below use a Linux/macOS shell; Windows PowerShell equivalents for PostgreSQL, Python virtual environments, and service startup are in the [backend export runbook](docs/BACKEND_EXPORT_RUNBOOK.md).

### 1. Install and initialize the backend

From `backend/`:

```bash
npm ci
python3 -m venv .venv
.venv/bin/pip install -r scoring/requirements.txt -r scoring/requirements-dev.txt
cp .env.example .env    # optional; defaults are local-only
npm run migrate
```

### 2. Start the scoring service and API

Use separate terminals from `backend/`:

```bash
.venv/bin/python -m uvicorn scoring.app.main:app --host 0.0.0.0 --port 8001
```

```bash
npm run dev:api
```

The API defaults to `http://localhost:8080`. Check `GET /health`; OpenAPI docs are at `/docs`.

### 3. Start the frontend

From `frontend/`:

```bash
npm ci
npm run dev
```

Vite serves the UI on `http://localhost:5173` and proxies `/v1` to `http://127.0.0.1:8080`. Set `VITE_API_PROXY_TARGET` if the API is listening elsewhere. `VITE_API_BASE_URL` can point a built frontend at a public API origin; it must not contain credentials.

The default API mode is the real backend. To deliberately use the existing fixture adapter during UI-only work, set `VITE_API_MODE=mock`. Mock mode is not a Roqqu connection and does not persist real trades.

The API's local PGlite data is stored under `backend/.data/` and is ignored by Git. To reset local demo data, stop the API and remove that directory; doing so is destructive to that local database.

## Export and run the backend elsewhere

The code-container PostgreSQL database is for verification only; its live data is not included in an export. A recipient runs PostgreSQL on their own machine/server, applies the checked-in migrations, then starts the API and scorer. Step-by-step instructions are in [`docs/BACKEND_EXPORT_RUNBOOK.md`](docs/BACKEND_EXPORT_RUNBOOK.md). No team server or Neon account is required to prepare or export the project.

## API integration notes

- Demo session: `POST /v1/demo/session` returns a bearer token and the current strategy-version ID, and sets an HttpOnly same-site session cookie as a fallback when an embedded browser cannot attach its bearer header. The frontend continues to send the bearer token when available. An optional anonymous identity fallback can be enabled only for an isolated preview (`DEMO_AUTH_FALLBACK_ENABLED=true`); it is disabled by default and rejected in production.
- Trade save: `POST /v1/trades`.
- Review: bodyless `POST /v1/trades/:id/review`. Do not send an empty JSON body or a `Content-Type: application/json` header—the backend returns `400 BAD_REQUEST` for a zero-byte JSON request. The frontend only adds the JSON header when it sends a body.
- Trade list/review history: `GET /v1/trades`; opening a review uses the idempotent review endpoint.
- CSV import: `POST /v1/trade-imports/preview`, then confirm with `POST /v1/trade-imports/:id/commit`. The frontend displays backend validation details before commit.
- Dashboard stats and rule-adherence progress are returned by `GET /v1/stats?currency=USD` and `GET /v1/progress` respectively.
- Read-only Roqqu RAS routes are `GET /v1/integrations/roqqu/status`, `/balances`, and `/history`. They require a backend-only `ROQQU_STAGING_API_KEY`; balances/history call the official RAS host and return RAS data without mapping it into Miroir trades. The status endpoint only reports whether a key is configured; it does not make a network request. See the [Roqqu API quick start](docs/ROQQU_API_QUICKSTART.md) for step-by-step Swagger and curl examples.

## Checks

Frontend, from `frontend/`:

```bash
npm ci
npm run lint
npm run build
```

Backend, from `backend/`:

```bash
npm ci
npm test
npm run typecheck
npm run lint
npm run build
.venv/bin/python -m pytest scoring/tests -q
```

## Deployment cautions

The API enforces a persistent PostgreSQL runtime URL, a direct migration URL, a unique scoring-service token, and exact CORS origins in production. Provide those values only through the deployment secret manager. PGlite is for local development/testing and is not a persistent production failover. Confirm durable database storage and backups with the server operator before deploying.

No GitHub remote or deployment was configured as part of this local working-copy task. The existing files under the current Drive source are unchanged.
