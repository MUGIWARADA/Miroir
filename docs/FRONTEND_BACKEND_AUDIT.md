# Miroir Frontend + Backend Audit — Historical Archive

> **Do not use this report as the current implementation contract.** It records a superseded local backend/frontend copy from 2026-11-04. That backend was removed and rebuilt; the current UI was refreshed from public `main` at `4af930f` and integrated against the rebuilt API afterward. Earlier claims below about Python scoring, PGlite, CSV routes/UI, endpoint counts, review status codes, and file paths may not apply to the current project. Use `BACKEND_REBUILD_PLAN.md` for the current state.

**Audit date:** 2026-11-04  
**Historical working copy:** `/home/user/miroir-workflow/`  
**Historical source:** Drive Frontend folder `1zo_gbn7h_BWhrNBg2UcmXIOny1QJ1wt0`  
**Status:** Preserved for traceability only. No Drive source was edited by that historical audit.

## Executive summary

The current Drive frontend initially selected the fixture adapter in `src/api.js`; its real Node API routes were commented out. The bodyless review call in that dormant client would have set `Content-Type: application/json`, matching the reported `400 BAD_REQUEST`.

That cause was confirmed against the copied backend. An empty review POST with the JSON content-type returned `400`; the same bodyless request without that header returned `201`, created a saved deterministic review, and returned a score/coverage of 100/100 for the integration probe. The assembled local frontend now uses the real backend by default and keeps the mock adapter available as an explicit `VITE_API_MODE=mock` option.

The local browser flow was verified end to end: demo session creation, stats/progress retrieval, manual trade creation, and deterministic review. The review-history screen lists backend trades. The CSV UI now previews backend validation and requires an explicit confirm before commit; a valid one-row preview and commit returned `201` each. No code or document was changed in Google Drive.

Backend-only read routes now expose Roqqu RAS staging status, balances, and transaction history through the Node API. The API key is read from `ROQQU_STAGING_API_KEY`; no key is configured in this copy and no live Roqqu request was sent. The 40-endpoint documentation inventory and mocked client suite remain in place. RAS documents describe wallet/ledger activity rather than complete exchange fills, so history is not mapped into canonical Miroir trades. The existing PostgreSQL adapter and migration pipeline support `DATABASE_URL` and `MIGRATION_DATABASE_URL`, but no team-server database host/credentials are available here. Production PostgreSQL and deployment remain unverified.

## Current integration contract

| Flow | Status | Evidence |
|---|---|---|
| Frontend → Node API | **Verified locally** | Vite `/v1` proxy and real API client; browser created a session, fetched stats/progress, saved a trade, and displayed a saved review. |
| Bodyless review request | **400 fixed in local working copy** | JSON content-type + no body: `400 BAD_REQUEST`; no content-type + no body: `201`. The client only sets JSON content-type when it sends a body. |
| Node API → Python scorer | **Verified locally** | The review result came through the real FastAPI deterministic scorer. Backend/Python tests also pass. |
| Node API → database | **Verified locally with PGlite** | Migrations applied to isolated `backend/.data/pglite`; demo, trade, review, stats, progress and import routes responded. |
| CSV preview/commit | **Verified** | Preview returned `201` with one validated row; bodyless commit returned `201` with one imported trade. Backend unit tests cover validation and idempotent commit. |
| Roqqu RAS | **Read-only backend routes implemented; live connection not configured** | `status`, `balances`, and `history` routes exist; tests use injected mock fetch. No runtime key is configured and no live request was sent. RAS ledger records are not imported as complete trade fills. |
| Server-local PostgreSQL / deployment | **Not verified** | No approved server connection or deployment environment was used. Production configuration requires persistent PostgreSQL, direct migration URL, strong service token and explicit CORS. |
| GitHub remote / push | **Not done** | No usable GitHub remote/connector is available for this work. A root CI workflow is present locally but was not run by GitHub Actions. |

## Current Drive-source findings

- `src/api.js` in the Drive Frontend selects `mockApi`; the real `/v1` calls are commented. The mock was intentional and is retained in the local project as an explicit UI-only mode.
- The backend review endpoint is `POST /v1/trades/:id/review`, authenticated with a bearer token and intentionally bodyless. Sending zero bytes while declaring JSON causes Fastify to return `400 BAD_REQUEST`.
- The backend returns reviews as `{ review: { result }, cached }`; `TradeReview.jsx` correctly reads `data.review.result`.
- Manual trade fields map to the backend contract (`strategy_version_id`, `symbol`, `direction`, quantity/prices/timestamps, optional risk and evidence). The demo-session response provides the strategy-version ID.
- The Drive `read_file_text` result for `index.html` showed a normal Vite module entry, while the raw downloaded file under `/home/user/google_drive/` contained a Cloudflare Rocket Loader-transformed script tag. This is a source/download discrepancy; it is not treated as proof that Drive's current source is malformed. The local copy uses a clean Vite module entry and builds normally.
- No `public/` asset folder was listed in the current Drive Frontend. A small local favicon asset was added to the working copy to satisfy its HTML reference.
- The Drive frontend's CSV tab was a placeholder, although backend preview/commit routes were implemented.

## Changes in `/home/user/miroir-workflow/`

Existing trade/scoring data models remain unchanged. The backend now registers read-only RAS routes while preserving manual trade entry as authoritative. All changes below are local working-copy changes only:

- `frontend/src/api.js` — real `/v1` client is default; bearer-token storage; structured API errors; JSON content-type only when a request body exists; mock remains opt-in; trade list and CSV methods are exposed.
- `frontend/vite.config.js` — `/v1` proxy to the API, configurable target, bind to `0.0.0.0`, and local/preview host allowance.
- `frontend/src/Entry.jsx` — labels this as a demo workspace and deterministic coach; explicitly states Roqqu connectivity is not configured.
- `frontend/src/Dashboard.jsx` — labels seeded/demo data, displays null decision-quality values as unavailable rather than zero, and handles fetch errors.
- `frontend/src/Progress.jsx` — removed fabricated historical chart points; renders the backend's trend, sample size, coverage, and followed/broken/cannot-assess counts.
- `frontend/src/TradeReview.jsx` — preserves `score_pct: null` rather than drawing it as zero and clarifies that unassessable dimensions are not breaches.
- `frontend/src/ReviewHistory.jsx` and `frontend/src/App.jsx` — added a trade/review list and replaced the invalid `/review/1` navigation target with `/reviews`.
- `frontend/src/TradeEntry.jsx` — manual entry remains; live net P&L preview subtracts fees; CSV tab reads a selected template, calls backend preview, displays row-level validation errors, and commits only after confirmation.
- `frontend/index.html`, `frontend/public/favicon.svg`, `.env.example`, and `.gitignore` — clean local Vite entry, local favicon, non-secret API configuration template, and local-env ignore rules.
- Root `README.md`, `.gitignore`, and `.github/workflows/ci.yml` — local quick-start, generated-file exclusions, and frontend/backend/scoring CI jobs.
- `backend/src/services/roqqu-ras-contract.ts`, `backend/src/routes/roqqu.ts`, and `backend/test/roqqu-ras-contract.test.ts` — 40-endpoint doc inventory, pinned server-side RAS client, and read-only status/balances/history routes. Upstream behavior is covered by injected mocks; the client does not send live requests without a configured staging key.
- `docs/ROQQU_RAS_CONTRACT_REVIEW.md` — endpoint scope, documentation inconsistencies, and limits of the mocked tests.
- `docs/INITIAL_FRONTEND_BACKEND_AUDIT.md` — preserved prior audit draft; `docs/FRONTEND_BACKEND_AUDIT.md` is the current report.

## Verification results

| Check | Result |
|---|---|
| Frontend `npm ci` (Node 22.23.4) | Passed. npm reports 6 moderate dependency audit findings; no `npm audit fix` was applied. |
| Frontend `npm run lint` | Passed. |
| Frontend `npm run build` | Passed; 608 modules transformed. Vite warns that the minified JS bundle is about 706 KB, above its 500 KB advisory threshold. |
| Backend `npm ci` | Passed; npm reported 0 vulnerabilities. |
| Backend `npm test` | **32/32 passed**, including mocked RAS-route and preview-auth coverage. |
| Backend `npm run typecheck`, `npm run build`, `npm run lint` | All passed. |
| Mocked Roqqu RAS contracts | 40 endpoints inventoried; mocked fetch coverage exercises 39 documented request encodings. Wallet-delete request is deliberately rejected because docs do not define its encoding. No real fetch, API key, or ledger/account mutation. |
| Python scorer `pytest scoring/tests -q` | **15 passed**; one upstream Starlette/httpx deprecation warning. |
| API review header reproduction | With JSON header and no body: `400 BAD_REQUEST`. Without JSON header/body: `201`, saved deterministic review, 100 score and 100 coverage. |
| Browser manual-trade flow | Passed through the local frontend: demo session → manual trade → review page. |
| Browser stats/progress/history views | Passed; display actual backend demo data and review/trade records. |
| CSV API preview/commit probe | Preview `201` / one row; commit `201` / one imported trade. |
| Production PostgreSQL, Roqqu, deployment, hosted GitHub CI | Not run/not verified. |

The frontend build remains successful but could benefit from code splitting for the larger bundle. The root CI workflow is authored but requires a GitHub remote and push to execute on GitHub Actions.

## Safe local run

The working-copy setup is documented in the root `README.md`. In brief: install Node dependencies in `backend/` and `frontend/`; install Python requirements in `backend/.venv`; run backend migrations; start the Python scorer and Node API; then start the Vite frontend. The local API uses `backend/.data/pglite/` unless a database URL is explicitly configured. Never use local PGlite as a production database or as an assumed failover for server-local PostgreSQL.

## Documentation items preserved for follow-up

- `frontend/README.md` was updated for the assembled app and local API workflow; root `README.md` is the full stack guide.
- The uploaded `frontend/AGENTS.md`, `frontend/github-collaboration.md`, `backend/AGENTS.md`, and `backend/github-collaboration.md` were preserved. Some contain prior foundation/hackathon or CI-guidance language that may need a maintainer's review. They were not deleted or silently rewritten in this integration pass.
- Backend `README.md`, API fixtures, OpenAPI spec, migrations, lockfiles, and the original audit draft were retained.

## Not changed / not claimed

- No Drive file was changed, moved, deleted, or shared.
- No GitHub push, hosted CI run, PR, or deployment occurred.
- No server-local PostgreSQL or Neon service was accessed.
- No Roqqu credentials or undocumented exchange behavior were used.
- No exposed credential was copied into this working copy or repeated here.
