# Miroir Frontend + Backend Audit

> Historical initial audit (2026-11-04) of the previous project snapshot. The backend described here was removed for a clean rebuild; see `BACKEND_REBUILD_PLAN.md` for current status.

**Audit date:** 2026-11-04  
**Scope:** Google Drive frontend snapshot and local backend source under `/home/user/miroir-backend`  
**State:** Findings are from local inspection and tests. No source files or documents were changed in Google Drive or the backend repository. No documents were deleted. An isolated frontend audit copy has three uncommitted proof-of-concept changes noted below; they have not been copied back to Drive.

## Follow-up: assembled local workflow copy (2026-11-04)

The separate working copy at `/home/user/miroir-workflow/` is now connected to the local backend. This status supersedes statements below that describe only the earlier Drive snapshot or `/home/user/miroir-frontend-audit/` proof copy. Google Drive files and `/home/user/miroir-backend/` remain unchanged.

- The local frontend now defaults to real `/v1` calls through a Vite proxy. `VITE_API_MODE=mock` retains the fixture adapter as an explicit UI-only option.
- Confirmed the reported review 400: a bodyless review POST **with** `Content-Type: application/json` returns `400 BAD_REQUEST`; the same POST with authorization and no JSON content-type returns `201` and a saved review (100/100 in the probe). Frontend helper now omits the JSON header for bodyless requests.
- Browser test in the assembled copy: demo session, dashboard stats/progress, manual trade save, and deterministic review all succeeded through the UI; the review displayed 100 score/100 coverage. `GET /v1/trades` also populates the new Reviews history screen.
- CSV workflow UI now calls preview and commit. A local API integration probe returned preview `201` for one valid row and commit `201` with one imported trade. No user file was uploaded.
- Replaced fabricated Progress chart values with the actual backend trend summary; clarified demo data and non-Roqqu status; unassessable dimensions are not converted to zero. Corrected the invalid `/review/1` nav link to a trade/review history route.
- Frontend checks now pass: ESLint and Vite build (608 modules). Vite still warns that the ~706 KB minified JS chunk exceeds 500 KB. Backend Node tests pass 21/21, typecheck/build/lint pass, and Python scorer tests pass 15/15 (one upstream deprecation warning).
- Source discrepancy: Google Drive `read_file_text` returned a normal Vite module entry, while the raw downloaded `index.html` under `/home/user/google_drive/` contained a Cloudflare Rocket Loader transformed script tag. The working copy uses a clean Vite entry. This inconsistency is not proof that the current Drive source itself is malformed; no Drive file was edited.
- Still not done: Roqqu exchange integration, server-local PostgreSQL deployment verification, GitHub push, and a production deployment.

## Executive summary

The backend is a coherent MVP and passed its local API, scoring, build, and lint checks. The Node API owns the records and invokes the stateless Python scorer. Its local PGlite-backed HTTP flow worked after the documented migrations were applied.

The Drive frontend, as downloaded, is **not connected to that backend**: `src/api.js` actively calls fixtures in `mockApi.js`, while the real fetch implementation is commented out. There is also a malformed Vite entry script in the Drive `index.html`; the original production build exits successfully but transforms only two modules and does not bundle the React application. The original frontend lint fails, the frontend CI does not run app checks, and the CSV import tab is a placeholder even though the backend CSV API is implemented.

A local-only proof copy switched the API methods to the Node endpoints, fixed the Vite entry script, and added a local Vite proxy. In that copy, the browser completed demo-session creation, manual trade entry, and a saved Python-scored review against the backend. That proves the basic contract can be wired; it does **not** mean the Drive project or a deployment has been updated.

Roqqu remains unimplemented. The current public Roqqu developer references describe production market, blockchain, wallet, fiat, and ancillary APIs, and bearer-secret authorization for POST requests, but do not provide the required sandbox trading contract. Do not guess endpoints or submit credentials until official sandbox docs/examples are supplied. [Roqqu getting started](https://developers.roqqu.com/reference/getting-started-with-your-api) · [Authorization](https://developers.roqqu.com/reference/authorization)

## Architecture and connection status

| Boundary | Verified status | Evidence / limitation |
|---|---|---|
| React frontend → Node API, as stored in Drive | **Not connected** | Active API methods import `mockApi`; real fetch methods are commented out. |
| React frontend → Node API, isolated proof copy | **Worked locally** | Vite proxy routed `/v1` to Node; browser created a demo session, submitted a manual trade, and loaded its review. Not synced to Drive. |
| Node API → Python scoring | **Connected and locally verified** | Demo-session seed and review requests called the real FastAPI scorer. Python scoring tests passed. |
| Node API → database | **Connected in tests and local smoke test via PGlite** | The schema/migrations ran and HTTP endpoints succeeded. This is not a test of server-local PostgreSQL. |
| Server-local PostgreSQL for the demo | **Not verified** | No approved server connection or deployment host was available. Production config requires PostgreSQL and a direct migration URL. |
| Roqqu sandbox | **Not implemented / contract missing** | No Roqqu client or exchange/trade routes were found in the project. Public API references do not establish the required sandbox contract. |
| Deployment | **Not verified** | Render blueprint has API + private scorer, but does not provision PostgreSQL or persistent storage; no deployment credentials were used. |

## High-priority findings

### F1. Drive frontend uses mocks, so it is not integrated

- **Files:** `src/api.js`, `src/mockApi.js`
- All active methods in the Drive copy call local mock methods. The real calls to `/v1/demo/session`, `/v1/strategies`, `/v1/trades`, `/v1/trades/:id/review`, `/v1/stats`, and `/v1/progress` are commented out.
- The mock uses fixed IDs, fixture values, synthetic stats, and an in-memory last trade. Those paths bypass backend validation, authentication, persistence, and real deterministic scoring.
- The dormant request helper sets JSON content type even for a bodyless review POST. The backend README and a prior API probe confirm that an empty body with `Content-Type: application/json` returns `400 BAD_REQUEST`; a bodyless POST without that header works.
- **Verification:** In an isolated copy only, I enabled real API calls and conditioned `Content-Type` on having a body. The browser then completed demo-session creation, manual trade submission, and review creation.

### F2. Drive `index.html` prevents Vite from bundling the app

- **File:** `index.html`
- The script is stored as `type="b7e228e4fa04f0ad7acd0ef8-module"` rather than `type="module"`, and a Cloudflare Rocket Loader script is included.
- The original `npm run build` exits `0`, but Vite reports that the main script cannot be bundled, transforms only **2 modules**, and produces no app JS/CSS bundles. The HTML therefore gives a false-positive build result and is not a valid Vite app entry as stored.
- **Verification:** Replacing the transformed script with a normal module script and removing the Cloudflare-injected tag in the isolated copy produced a build that transformed **607 modules** and emitted JS/CSS. The JavaScript chunk is about **704 kB**, triggering Vite's >500 kB chunk warning.
- The Drive version is unchanged.

### F3. UI reports invented or misleading connection/data state

- **Files:** `src/Entry.jsx`, `src/Dashboard.jsx`, `src/Progress.jsx`, `src/TradeReview.jsx`
- Entry's **“Connect Roqqu Sandbox”** button only creates a Miroir demo session; it does not call Roqqu. The page does say the integration is illustrative, but that disclaimer conflicts with the primary button label. The same page calls the product an **“AI Decision Coach”** and promises real-time auditing, while the current scorer is deterministic/rule-based and reviews run after trade entry.
- Dashboard always says **“Connected to Sandbox”**, regardless of any Roqqu connection. Its **“Sizing Discipline 80%”** goal is hard-coded rather than returned by the API. The score card converts a null Decision Quality score to `0`.
- Progress constructs four chart values from an average (`average - 10`, `average - 5`, `average - 2`, and current). The backend returns trend eligibility, direction, slope, and sample size, not historical score points. This chart is synthetic. The trend badge also uses a green/up treatment even when the backend direction is `declining` or `flat`.
- TradeReview converts `score_pct: null` to zero and explicitly labels it **“Missing = 0”**. This contradicts the backend contract and product rule that missing evidence is `cannot_assess`, not a failure or zero.
- The “Mark for Progress Tracking” button has no click handler; reviews are already automatically included in progress.
- Demo sessions create six seeded example trades and six reviews. Dashboard stats include them, but the dashboard does not clearly identify the workspace as demo data while displaying the metrics.

### F4. CSV import exists in the backend but not in the frontend

- **Files:** `src/TradeEntry.jsx`, backend `src/routes/trade-imports.ts`, `src/services/trade-imports.ts`
- The frontend CSV tab is only a decorative drop zone; it has no file input, preview, row error display, confirmation, or commit call.
- Backend CSV preview/commit is implemented and covered by tests, including exact row/field validation and idempotent commit. Manual entry remains separately implemented.

### F5. Review navigation is hard-coded to an invalid ID

- **File:** `src/App.jsx`
- The “Reviews” navigation link points to `/review/1`; the review screen expects a UUID and uses it to call the backend. There is no review/trade history screen to choose a valid review. The newly created review route works when reached from manual entry.

## Other frontend findings

| File | Audit result |
|---|---|
| `src/main.jsx` | Standard React root mount; no issue found in the file itself. |
| `src/index.css` | Tailwind theme and dark palette are present. It references web fonts/material symbols from Google; those external assets will not load in the sandboxed file preview, but can load in a normal networked browser. |
| `src/Strategy.jsx` | Fetches the first strategy and renders `draft_rules` under an “Active Version” label. Backend confirmed versions are immutable; if the draft changes, this screen can show rules different from the version used to score a trade. No edit/confirm UI exists, and fetch failures are only logged before a generic “connect” message. The seeded demo's draft and current version initially match. |
| `src/TradeEntry.jsx` | Manual payload shape matches the backend contract in the local end-to-end proof. The UI sets `opened_at` to now, so it is not a historical manual importer. Risk preview uses a hard-coded, non-editable `$50,000` account-equity value; its “Net P&L” preview omits fees. Numeric validation is minimal and a zero risk amount can reach a backend schema that requires a positive value. |
| `src/api.js` | Original Drive file activates mocks; see F1. It does not configure a deployable API origin. A same-origin proxy or `VITE_API_URL` is needed for a hosted browser. |
| `src/mockApi.js` | Synthetic fixture implementation is active in the Drive version. Keep only if there is an explicit, clearly labelled mock/test mode; otherwise it becomes unused after real API wiring. No deletion made. |
| `package.json` | Defines `lint` and `build`, but no application test script. |
| `vite.config.js` | Original file has React/Tailwind plugins only; no API proxy, host binding, or preview host allowance. The audit-only copy adds a `/v1` local proxy and host settings. |
| `eslint.config.js` | ESLint config works, but the current code does not pass it (see test results). |
| `.gitignore` | Ignores `node_modules`/build outputs but not `.env` files. Keep browser-exposed frontend config non-secret; consider ignoring local env files with an `.env.example` exception. |
| `index.html` | Also references `/favicon.svg`, but no favicon asset is present in the downloaded project. |
| `.github/workflows/ci.yml` | Runs repository-policy checks and Python policy tests only; it does not run frontend lint, build, or application tests. |
| `.github/checks.py`, `.github/test_checks.py` | Repository/commit policy tooling only, not application behavior tests. The 7 policy tests pass. |
| `.github/dependabot.yml` | Weekly GitHub Actions updates only; no npm package ecosystem updates are configured. |
| `.github/pull_request_template.md` | Generic but reusable; no deletion candidate by itself. |
| `package-lock.json` | Generated lockfile; installed successfully and checked with `npm audit` rather than reviewed line by line. |

## Backend file-by-file review summary

| Area / files | Result |
|---|---|
| App and configuration: `src/app.ts`, `src/server.ts`, `src/config.ts` | Fastify routes, public health/docs, request validation/error envelope, rate limiting, CORS and production safety checks are present. Production rejects missing PostgreSQL runtime/migration URLs, wildcard CORS, and the development scoring token. |
| Database: `src/db/index.ts`, `migrate.ts`, `migrate-cli.ts`, `pglite.ts`, `postgres.ts`, `seed-cli.ts`, `types.ts` | PGlite is the local fallback; PostgreSQL is used when `DATABASE_URL` is supplied. Migrations are explicit and must run before local API use. Transaction-local identity context is used. |
| API schemas/errors/auth: `src/lib/api-schemas.ts`, `context.ts`, `errors.ts`, `ids.ts`, `money.ts`, `schemas.ts` | Shared TypeBox schemas describe request/response contracts and error envelope. Bearer tokens are hashed at rest; route data uses identity-scoped queries and RLS. |
| Routes: `src/routes/auth.ts`, `strategies.ts`, `trades.ts`, `trade-imports.ts`, `reviews.ts`, `stats.ts` | Demo sessions, strategy CRUD/confirmation/version listing, manual trades, evidence, trade close, fixed CSV import, reviews, stats, and progress routes are implemented. |
| Services: `src/services/demo-data.ts`, `reviews.ts`, `scoring-client.ts`, `stats.ts`, `strategies.ts`, `trade-imports.ts`, `trades.ts` | Demo session seeds six sample trades/reviews; review inputs are hashed and saved idempotently; decimal arithmetic handles realized P&L; CSV preview/commit is identity-scoped and atomic; stats filter closed trades by currency. |
| Python: `scoring/app/main.py`, `models.py`, `scoring.py`, `scoring/tests/test_scoring.py` | Stateless, service-token-protected deterministic scorer; no DB access. Missing evidence is `cannot_assess`; P&L does not affect Decision Quality; schedules use timezone-aware logic. |
| Database migrations: `migrations/001_init.sql`, `002_strategy_trading_schedule.sql`, `003_trade_imports.sql` | Core schema, forced row-level security for owned records, immutable strategy schedule versions, and identity-scoped CSV staging are defined. |
| Tests/contract: `test/api.test.ts`, `test/config.test.ts`, `test/fixtures.test.ts`, `fixtures/api/*`, `generate-schema.mjs`, `openapi.json` | Tests cover demo setup cleanup, error contracts, immutable strategy versions, P&L/R, CSV preview/commit, review idempotency/ownership, stats/progress scope, production config, and JSON fixtures. OpenAPI is generated from route schemas. Generated lock/spec files were evaluated through install, tests, and generator design rather than line-by-line prose review. |
| CI and deployment: `.github/workflows/ci.yml`, `render.yaml`, `.env.example`, `package.json`, `tsconfig.json`, `biome.json`, `.gitignore` | Backend CI runs npm audit, lint, typecheck, API tests, build, OpenAPI freshness, pip-audit, and Python tests. Render defines API + private scorer but requires an externally provisioned persistent PostgreSQL server/database; no PostgreSQL or persistent disk is provisioned by the blueprint. |
| Documentation: `README.md`, `AGENTS.md`, `github-collaboration.md` | Backend README and agent instructions mostly match the agreed demo/server-local DB, separate future Neon, deterministic scoring, and missing Roqqu contract. The collaboration guide has a stale line saying application dependency/deployment gates will be configured when an application/deployment exists, although this backend and CI already exist. |

## Checks and observed results

| Check | Result |
|---|---|
| Backend Node tests (`npm test`, Node 22.23.4) | **21/21 passed** |
| Backend TypeScript build (`npm run build`) | **Passed** |
| Backend Biome lint (`npm run lint`) | **Passed**, 32 files checked |
| Backend `npm ci --include=dev` / npm audit | **0 vulnerabilities** reported |
| Python scorer tests (`python -m pytest scoring/tests -q`) | **15 passed**; one Starlette/httpx deprecation warning, no failures |
| Frontend repository-policy tests | **7/7 passed**; they do not test the app |
| Drive frontend lint (`npm run lint`) | **Failed: 8 errors**: unused React imports in `Dashboard.jsx`, `Entry.jsx`, `Progress.jsx`, `Strategy.jsx`, `TradeEntry.jsx`, `TradeReview.jsx`; unused `err` in `Progress.jsx`; unused `tradeId` in `mockApi.js`. |
| Drive frontend production build | Exit code **0 but not a valid app build**: only 2 modules transformed; malformed module script warnings. |
| Audit-only frontend build after fixing entry HTML | **Passed**, 607 modules transformed; 704.40 kB JS chunk warning (>500 kB). This was before the final API proof edits; the API code was then exercised in Vite dev/E2E. |
| Drive frontend npm audit | **6 moderate findings** in `minimatch@10.2.6` under ESLint dependencies. The advisory is [GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249); `npm audit` reported no available fix. No dependency upgrade was applied. |
| Browser → Node → Python smoke test, audit-only copy | **Passed** with a temporary PGlite database after migrations: health `200`, demo session `201` (6 seeded trades/reviews), strategies `200`, manual trade `201`, review `201` with score/coverage `100/100`, stats `200`, progress `200`. |
| Server-local PostgreSQL, Render deployment, Roqqu sandbox | **Not verified**; no credentials, external services, or official sandbox trading contract were supplied. |

The initial local HTTP smoke attempt returned `500` because the temporary PGlite database had not yet been migrated. After applying the three documented migrations and restarting the API, the complete smoke test passed. The backend quick-start correctly includes `npm run migrate` before startup.

## Audit-only proof changes (not applied to Drive)

In `/home/user/miroir-frontend-audit/` only:

1. `index.html`: restored a normal Vite `type="module"` script and removed the Cloudflare-injected script.
2. `src/api.js`: activated real Node routes, bearer-token storage, standard API error handling, and only sends JSON content type when a body exists.
3. `vite.config.js`: added `0.0.0.0` binding, preview-host allowance, and a local `/v1` proxy to the backend.

These changes were used solely to prove the basic frontend/backend contract. They did not fix the dashboard/progress/review presentation issues, CSV UI, ESLint failures, or Roqqu integration. They have **not** been uploaded to Google Drive or pushed to GitHub.

## Candidate documents/writings for joint review

No item below has been deleted. Suggested action is to **update or supersede** it, not remove it without agreement.

1. **Frontend `README.md`** — default React/Vite template text; it does not describe Miroir, setup, API configuration, or tests.
2. **Frontend `AGENTS.md`** — says the repository is “a foundation only” and instructs contributors not to add application frameworks, although the React application is already present.
3. **Frontend `github-collaboration.md`** — says application checks/dependencies will be added once an application exists; the application exists, but its current CI omits lint/build/app tests. Review whether to replace this with real project guidance.
4. **Backend `github-collaboration.md`** — mostly useful policy, but one CI/dependency sentence is stale because the backend application and CI checks exist. Consider a small correction rather than deleting the guide.
5. **`src/mockApi.js`** (code, not a document) — currently active synthetic implementation. After the real API path is reviewed and approved, decide whether to retain it as an explicit mock mode or move/remove it. No deletion made.

**Keep for now:** backend `README.md`, backend `AGENTS.md`, `.env.example`, `openapi.json`, API fixtures, and the generated review README/PDF/DOCX. They contain current architecture, reproducible test or API contracts, or the selected DB/deployment caveats. The Render blueprint is not deployment-ready for the chosen server-local PostgreSQL target, but it is still a useful template until the host is chosen.

## Not changed / not claimed

- No Google Drive source file was updated or deleted.
- No GitHub branch, push, CI edit, PR, or deployment was performed; no GitHub connector/usable remote is available in this conversation.
- No live PostgreSQL or Neon service was accessed. The exposed Neon credential was not used, copied, or repeated.
- No Roqqu credentials were used and no undocumented Roqqu behavior was implemented.
