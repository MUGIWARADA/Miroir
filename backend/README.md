# Miroir Backend MVP Slice

This is the backend-only foundation for Miroir. It runs locally without Docker, without a frontend, and without a live AI provider. Development defaults to embedded PGlite, while the API has also been verified against PostgreSQL 17 in the coding workspace. That workspace database is only for verification and is not included in a source export. A deployment host or recipient must run its own PostgreSQL instance and apply the checked-in migrations; Neon is a separate possible future/staging environment, not an automatic backup or failover.

It includes:

- Node.js public API built with Fastify and TypeScript.
- PostgreSQL schema and migrations with row-level security; local PGlite fallback when `DATABASE_URL` is empty.
- Read-only Roqqu RAS staging routes for status, balances, and history. The authorized live staging balance check succeeded; no key is stored in the project. These routes do not mutate Roqqu or map ledger history into canonical Miroir trades.
- Demo identity creation and bearer-token sessions.
- Strategy drafts, explicit user confirmation, and immutable strategy versions.
- Manual trade entry, evidence attachment, realized P&L, and R multiples.
- Stateless Python scoring service with deterministic `demo-v2` checks.
- Saved idempotent reviews, classic stats, and rule-adherence progress.
- OpenAPI documentation, seed data, tests, CI, and a Render blueprint.

Live AI explanations and frontend code are not part of this slice. The backend includes read-only Roqqu RAS status, balances, and history routes. An authorized staging balances call succeeded with HTTP 200 and 20 assets; no key is stored in the project. Live history was not tested. RAS ledger records remain supplemental and are not imported as canonical trades; trade, send, refund, and other mutation operations are out of scope. Fixed-template CSV trade import remains available alongside manual trade entry.

## Architecture

```text
Frontend or API client
  -> Node.js API (Fastify, TypeScript)
      -> Server-local PostgreSQL (current demo target) / Neon in a separate future environment / local PGlite
      -> Python scoring service (FastAPI, stateless, no database access)
```

Node owns authentication, permissions, permanent records, context assembly, and saving results. Python only validates the scoring request, runs deterministic checks, and returns structured JSON. The frontend must never call the Python service directly.

## Requirements

- Node.js 22 or newer (required by the current production dependency tree).
- Python 3.11 or newer.
- npm.
- PostgreSQL for the current demo deployment (the host must provide a reachable server and durable storage).
- Optional future/staging environment: Neon PostgreSQL, configured separately from the current database.

In production, startup refuses to fall back to local PGlite, requires valid PostgreSQL runtime and direct-migration URLs plus a unique scoring-service token of at least 32 characters, and rejects wildcard CORS. The code accepts standard PostgreSQL URLs; it does not synchronize or fail over between databases. Set `TRUST_PROXY=true` only when the API is behind a trusted reverse proxy; leave it false for direct local access.

## Local quick start

For handing this project to someone else and running it with PostgreSQL on that same machine/server, see the step-by-step [backend export runbook](../docs/BACKEND_EXPORT_RUNBOOK.md). The database in the coding workspace is not included in source exports; the runbook shows how to create a fresh database and apply the migrations.

From this directory:

```bash
npm ci
python -m pip install -r scoring/requirements.txt -r scoring/requirements-dev.txt
cp .env.example .env
npm run migrate
```

For the seeded demo, start the scoring service first:

```bash
npm run dev:scoring
```

In a second terminal, seed the database:

```bash
npm run seed
```

Then start the API in a third terminal:

```bash
npm run dev:api
```

Local URLs:

- API: `http://localhost:8080`
- API docs: `http://localhost:8080/docs`
- Scoring service: `http://localhost:8001`

If you do not need seed data, `npm run dev` starts the API and scoring service together.

If `DATABASE_URL` is empty, the API uses embedded PostgreSQL stored in `.data/pglite`. This is useful for development and tests; do not run the API and seed command against the same `.data/pglite` directory at the same time. For the current demo deployment, set `DATABASE_URL` and `MIGRATION_DATABASE_URL` to the approved server-local PostgreSQL connection URLs. The migration URL must permit direct migrations. For a separate future Neon environment, use its pooled URL for `DATABASE_URL` and direct URL for `MIGRATION_DATABASE_URL`. Each app environment points to one database; there is no automatic sync or failover.

## Seed demo data

With the scoring service running and the API stopped:

```bash
npm run seed
```

The seed command and `POST /v1/demo/session` use the same demo dataset. Each creates a demo identity, confirmed breakout strategy, weekday UTC schedule, six sample trades with evidence, and six saved reviews. The session endpoint returns a strategy/version ID and trade/review counts alongside the bearer token. Public API requests are limited to 120 per minute per client IP; demo-session creation is limited to 3 per minute per IP. The in-memory limiter is suitable for one instance; use a shared store or edge-level limit before scaling across instances. If scoring fails while preparing the demo, the API returns `503 DEMO_SETUP_FAILED` and removes the incomplete identity rather than returning a token for a partly populated workspace. The seed command prints JSON containing the token and record IDs.

Use the printed token like this:

```bash
curl -H "Authorization: Bearer YOUR_TOKEN" http://localhost:8080/v1/me
```

The sample data demonstrates the core product rule: a winning trade can still break rules, and a losing trade can still follow rules.

## Example API flow

Create a demo session. The response includes a bearer token and a ready-to-use workspace with the demo strategy, six trades, and six saved reviews:

```bash
curl -X POST http://localhost:8080/v1/demo/session \
  -H "Content-Type: application/json" \
  -d '{"display_name":"Demo trader"}'
```

The following example creates an additional strategy in that workspace:

Create a strategy draft:

```bash
curl -X POST http://localhost:8080/v1/strategies \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Breakout plan",
    "rules": [
      {
        "id": "risk-limit",
        "dimension": "risk",
        "label": "Risk at most 100 USD",
        "check": {"type":"max_risk_amount","amount":100}
      }
    ]
  }'
```

Confirm the strategy:

```bash
curl -X POST http://localhost:8080/v1/strategies/STRATEGY_ID/confirm \
  -H "Authorization: Bearer YOUR_TOKEN"
```

Record a closed trade:

```bash
curl -X POST http://localhost:8080/v1/trades \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "strategy_version_id":"STRATEGY_VERSION_ID",
    "symbol":"AAPL",
    "direction":"long",
    "quantity":10,
    "entry_price":100,
    "exit_price":104,
    "fees":2,
    "currency":"USD",
    "opened_at":"2026-10-05T09:15:00Z",
    "closed_at":"2026-10-05T11:00:00Z",
    "initial_risk_amount":80,
    "evidence":[
      {"kind":"note","payload":{"setup_note":"Breakout above premarket high."}}
    ]
  }'
```

Review the trade:

```bash
curl -X POST http://localhost:8080/v1/trades/TRADE_ID/review \
  -H "Authorization: Bearer YOUR_TOKEN"
```

The review request has no JSON body. Do not send an empty body with `Content-Type: application/json`: Fastify treats a zero-byte JSON body as malformed and returns `400 BAD_REQUEST`. A bodyless request without that content-type header is accepted.

Read stats and progress:

```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
  "http://localhost:8080/v1/stats?currency=USD"

curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:8080/v1/progress
```

## Main endpoints

Public:

- `GET /health`
- `GET /docs`
- `GET /docs/json`
- `POST /v1/demo/session`

Authenticated:

- `GET /v1/me`
- `POST /v1/auth/logout`
- `POST /v1/strategies`
- `GET /v1/strategies`
- `GET /v1/strategies/:id`
- `PATCH /v1/strategies/:id`
- `POST /v1/strategies/:id/confirm`
- `GET /v1/strategies/:id/versions`
- `POST /v1/trades`
- `POST /v1/trade-imports/preview`
- `POST /v1/trade-imports/:id/commit`
- `GET /v1/trades`
- `GET /v1/trades/:id`
- `POST /v1/trades/:id/evidence`
- `POST /v1/trades/:id/close`
- `POST /v1/trades/:id/review`
- `GET /v1/trades/:id/reviews`
- `GET /v1/stats?currency=USD`
- `GET /v1/progress`

## Manual trade entry and CSV import

Manual entry remains the main trade-entry path at `POST /v1/trades`. CSV is an additional option and does not replace or change that endpoint. Both paths create the same trade records and use the same trade calculations.

CSV uses one fixed, case-sensitive header row in this exact order. The frontend does not map columns or interpret rows; it sends the file text to the backend, and the backend parses and validates it.

```text
symbol,direction,quantity,entry_price,exit_price,fees,currency,opened_at,closed_at,initial_risk_amount,setup_note,emotional_state
```

The import is a two-step process:

1. Send `strategy_version_id` and `csv_text` to `POST /v1/trade-imports/preview`. A valid file returns normalized rows and an `import_id`; it does not create trades yet. The backend accepts up to 500 trade rows per preview.
2. After the user reviews the preview, call `POST /v1/trade-imports/{import_id}/commit`. The backend saves every row in one transaction, or none if the batch cannot be saved. Repeating a successful commit returns the saved result instead of creating duplicate trades.

If CSV validation fails, the API returns the shared `VALIDATION_ERROR` envelope. Each detail identifies the spreadsheet row and field, so the frontend can mark the cell. The fixed template supports optional `setup_note` and `emotional_state` evidence. Leave both `exit_price` and `closed_at` blank for an open trade; provide both to import a closed trade. A blank fee is treated as zero. CSV timestamps must include a timezone.

Examples are in `fixtures/api/trade-import-preview.success.json`, `fixtures/api/trade-import-commit.success.json`, and `fixtures/api/validation-error.csv.json`.

The public Node API's OpenAPI 3.0 contract is available in `openapi.json` and through `GET /docs/json`. Endpoint schemas are defined once in the TypeBox route definitions; those same definitions validate requests and describe success and error responses.

Run `npm run generate-schema` after changing a route or schema. The script builds the app, registers routes without opening a database or calling the scoring service, checks that each public endpoint documents its responses, and rewrites `openapi.json`. CI regenerates the file and fails if the checked-in contract is out of date. `npm run openapi` remains as an alias.

Representative API JSON fixtures live in `fixtures/api/`. The automated tests check that the examples match the shared response schemas. The internal Python service separately generates its own OpenAPI document from its Pydantic models at `http://localhost:8001/openapi.json`; the frontend should call only the Node API.

## Error responses

Every API error uses the same envelope. The request ID is inside `error`, and `details` is always an array. For errors without field-level information, `details` is `[]`.

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Correct the highlighted fields and try again.",
    "request_id": "req_123",
    "details": [
      {
        "field": "entry_price",
        "message": "Enter a valid number."
      }
    ]
  }
}
```

Import validation can also include a `row` number in each detail, so the frontend can highlight the exact CSV row and field.

## Deterministic scoring

The current scoring version is `demo-v2`. Existing `demo-v1` reviews remain saved; a new review uses `demo-v2` so an older cached score is not mistaken for a score from the updated rules.

Weights:

- Risk: 30
- Sizing: 20
- Plan: 25
- Timing: 15
- Emotion: 10

Statuses:

- `followed`
- `broken`
- `cannot_assess`

Rules:

- Missing evidence is never a breach. It becomes `cannot_assess`.
- Emotion requires explicit evidence.
- Realized P&L never changes Decision Quality.
- Score is `100 * earned assessable weight / total assessable weight`.
- The five dimensions always appear in a review. An unassessable dimension has `status: "cannot_assess"` and `score_pct: null`, never a zero score.
- Rules within a dimension share that dimension's weight equally. A followed rule earns its share; a broken rule earns zero; a `cannot_assess` rule earns no score and contributes no assessable weight.
- A dimension's score is the average of its assessable rules. If no rule in the dimension is assessable, its score is `null`.
- Decision Quality is the weighted average of assessable rule results only. Missing evidence never counts as a failure. If nothing is assessable, Decision Quality is `null`.
- Coverage is measured against the full 100-point, five-dimension framework, including dimensions with no configured rule.
- Coaching is labelled `rule_based`, not AI-generated.

Supported deterministic checks:

- `max_risk_amount`
- `max_notional`
- `required_evidence`
- `evidence_equals`

Trading hours are set once in the strategy, rather than entered as a scoring rule. A schedule contains allowed day names, a start time, an end time, and an IANA timezone such as `Africa/Lagos`. Trade timestamps are stored as absolute times and converted to the selected timezone before checking. Start time is included; end time is excluded. For overnight schedules, the selected day is the day the session starts. If a schedule or trade entry time is missing, timing is `cannot_assess`. Older confirmed versions with the previous `trading_window` rule remain readable.

## Stats and progress

Stats use closed realized trades only, include fees, and never mix currencies. The curve is labelled `cumulative_realized_pnl`.

Progress uses the latest saved review per trade, grouped by strategy version. Trend claims require at least five comparable assessed trades on the same strategy version. Before that, the API returns counts and says the trend is not eligible.

## PostgreSQL configuration

For the current demo stage, the agreed target is PostgreSQL running on the deployment server. The backend can connect to ordinary PostgreSQL; Neon is not required for this environment. The API has one active database per environment:

- `DATABASE_URL`: runtime connection.
- `MIGRATION_DATABASE_URL`: direct connection used for migrations and admin tasks. For server-local PostgreSQL, this may target the same server/database as the runtime URL, with permissions appropriate for migrations.

The API sets identity context transaction-locally:

```sql
SELECT set_config('app.identity_id', $1, true);
```

Do not replace this with session-level `SET`; transaction-local context is required for safe pooled connections.

Run migrations against the database intentionally selected for that environment:

```bash
MIGRATION_DATABASE_URL="postgresql://..." npm run migrate
```

Seed the selected environment only when you intentionally want demo data in that database:

```bash
DATABASE_URL="postgresql://..." \
MIGRATION_DATABASE_URL="postgresql://..." \
npm run seed
```

Neon may be used as a separate future/staging environment. In that environment, use the pooled Neon URL for runtime and the direct URL for migrations. The backend does not replicate between the server-local database and Neon, and switching environments does not carry data across automatically.

## Inputs needed before adding optional features

The items below are not implemented in this backend slice. To start one, the product owner should confirm its priority and the team should provide the corresponding inputs:

- **Future Neon environment:** if the team chooses a separate Neon staging/future environment, provide access to the Neon project and configure its pooled `DATABASE_URL` plus direct `MIGRATION_DATABASE_URL` securely. It will not sync with or fail over from server-local PostgreSQL.
- **Live AI coaching:** choose a provider/model, supply the key through a server-side secret manager, and agree on the structured response, allowed inputs, timeouts, rate/spending limits, and fallback behavior.
- **Roqqu write/trading or trade-import expansion:** the current RAS client is read-only and its history is not mapped into canonical trades. Before expanding scope, use official documentation to confirm the exact operation contract and data mapping; no Roqqu mutation is implemented or authorized. Keep manual trade entry and fixed-template CSV working.
- **Broker CSV or other external trade sources:** provide anonymized example exports and agree on field mappings, timezone, currency, fees, and open/closed-trade behavior before building mapping or format detection. The fixed Miroir CSV template remains the only CSV format supported.
- **Frontend integration:** identify the frontend owner and repository, confirm framework, auth method, API URL, allowed frontend origins, and required screens/fields.
- **True account equity curve:** provide timestamped account balances and rules for deposits, withdrawals, open positions, and other cash flows; realized trade P&L alone is insufficient.
- **Hosted deployment:** confirm the deployment host, how server-local PostgreSQL will run and persist data, database network access, backup/restore, frontend origin/domain, and approval to configure server-side secrets and deploy. The current Render Blueprint does not provision a PostgreSQL service or persistent disk.

## Render deployment

`render.yaml` defines two services and uses Render's paid `0.5c-512mb` compute plan: the private scoring service and pre-deploy migration command are not supported on the free compute plan.

- `miroir-api`: public Node.js web service.
- `miroir-scoring`: private Python service.

Set these secret environment variables in Render:

- `DATABASE_URL`: runtime connection URL for the persistent PostgreSQL server chosen for this environment.
- `MIGRATION_DATABASE_URL`: direct migration URL for that PostgreSQL server. The current Render Blueprint does not create this database; provision a reachable database service and durable storage separately before deploying.
- `CORS_ORIGIN`: the frontend origin, for example `https://your-frontend.example`.

The blueprint generates `SCORING_SERVICE_TOKEN` and shares it with the private scoring service. The API runs migrations as a pre-deploy command.

## Tests and checks

```bash
npm run lint
npm run typecheck
npm test
npm run test:scoring
npm run build
npm run generate-schema
npm audit --audit-level=moderate
python -m pip install pip-audit
python -m pip_audit -r scoring/requirements.txt -r scoring/requirements-dev.txt --strict
```

Current local verification:

- Node API, production-configuration, rate-limit, and fixture tests: 21 passed.
- Python scoring tests: 15 passed under Python 3.11 and 3.13; IANA timezone lookup also passed with the OS timezone database disabled, using the packaged `tzdata` fallback.
- TypeScript typecheck and build: passed under Node 22.
- Biome lint: passed.
- OpenAPI generator: passed and documented 22 Node API operations.
- `npm audit` and `pip-audit`: no known vulnerabilities found.
- Real HTTP smoke test passed with the Node API, actual Python scorer, and a temporary local PGlite database.
- Render Blueprint validated against Render's published YAML schema.

## External deployment status

The project can be installed and run outside Arena with Node 22+, Python 3.11+, and the instructions above. The current demo-stage target is PostgreSQL on the deployment server, but no server-local PostgreSQL connection or durable storage has been tested. The Render Blueprint is schema-validated, not deployed, and does not provision PostgreSQL or a persistent disk; deployment still needs a database host/storage plan, exact frontend origin, Render project access, and approval for its paid compute plan. Neon is a separate possible future/staging environment, not an active fallback.

The rate limiter stores counters in the API process. It is suitable for a single instance, not a multi-instance production fleet. Add a shared limiter or edge-level protection before scaling. Backups, monitoring/alerts, data-retention cleanup, and production incident procedures are also not included in this MVP slice.

## Repository conventions

See `AGENTS.md` and `github-collaboration.md`.

Commit subjects use:

```text
type(scope): lowercase description
```

Allowed types are `feat`, `fix`, `chore`, and `docs`. Keep subjects at 72 characters or fewer, lowercase, and without a trailing period.

The CI workflow in `.github/workflows/ci.yml` runs Node dependency auditing, lint, typecheck, API tests, build, OpenAPI freshness checks, Python dependency auditing, and Python scoring tests.

## Important files

- `src/app.ts`: Fastify app, CORS, OpenAPI, error handling.
- `src/server.ts`: local/server entrypoint.
- `src/db/migrate.ts`: migration runner.
- `migrations/001_init.sql`: core schema and row-level security.
- `migrations/002_strategy_trading_schedule.sql`: versioned strategy schedules.
- `migrations/003_trade_imports.sql`: identity-isolated CSV preview staging.
- `src/services/trade-imports.ts`: fixed-template parsing, row validation, and atomic commit.
- `src/services/reviews.ts`: context assembly, idempotency, saved reviews.
- `src/services/stats.ts`: classic stats and progress.
- `scoring/app/scoring.py`: deterministic scoring engine.
- `scoring/app/main.py`: private scoring HTTP service.
- `openapi.json`: generated API contract.
- `render.yaml`: Render blueprint.
