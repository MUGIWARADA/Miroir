# Miroir backend rebuild status

**Baseline:** public GitHub `main` snapshot downloaded on 2026-11-05. The active app directory is `frontend--/`. The old backend copies were removed by request; this is a fresh implementation, not a restoration.

## Implemented (not all externally validated)

- One versioned Fastify API used in both backend storage modes: `DATA_MODE=mock|postgres`.
- Demo sessions, identities, strategies, manual trade creation, trade/review history, deterministic reviews, stats, progress, and read-only Roqqu routes.
- In-memory mock adapter and PostgreSQL adapter/migration for Miroir accounts, hashed email-verification/session tokens, identity-scoped Roqqu connections, strategies, trades, and reviews.
- Self-managed email/password registration and login: salted scrypt password hashes, verified-email flow, opaque server sessions stored by hash, logout/resend routes, and auth rate limits. Local development can log a short-lived verification link; hosted email uses provider-neutral SMTP settings.
- Demo sample trades/reviews are labelled in the UI. P&L and Decision Quality remain separate; missing evidence is `cannot_assess`.
- AI explanation adapter seam defaults to `not_configured`; it can supply bounded explanatory text only and cannot alter deterministic scores.
- Read-only Roqqu RAS client is pinned to the official HTTPS host, uses staging auth/form encoding, timeout, and rejects redirects. Mock mode returns labelled sample balances/history. Live reads are gated on PostgreSQL mode, verified Miroir identity, that identity's saved connection, and a backend-only staging key; request email comes from the verified identity, never browser input.
- Refresh is on demand. No polling or streaming is implemented.
- Latest public UI snapshot (`main` at `4af930f`) is the visual base. `frontend--/src/api.js` calls the rebuilt API; the temporary `mockApi.js` fallback was removed. Review history/Profile use backend data; Accounts has per-user connect/disconnect and on-demand refresh; Entry supports account registration/login/verification. Visual design was preserved rather than redesigned.
- The Drive handoff `Frontend_Integration_Status.pdf` (3 Nov 2026) describes a different/earlier Node+Python service and reports a prior `400 BAD_REQUEST` after trade creation. Its reported create payload fields align with the rebuilt trade API; the review call is bodyless `POST /v1/trades/:id/review`. The rebuilt Fastify API already accepts and tests that exact bodyless call, returning a deterministic review; it does not call a Python scorer. Do not treat the old request ID/error as a current backend trace. The accompanying Drive `openapi.json` is a separate, much larger contract artifact and is not substituted for the rebuilt API contract.
- The handoff says a manual Trade Entry screen exists, but the current `4af930f` UI snapshot contains no trade-entry component/route. Manual trade creation remains available at the API only; the frontend does not claim that UI criterion is complete.
- Vite `/v1` proxy, CI paths for `frontend--/`, PostgreSQL CI service, local Compose config, and current setup/auth docs.

## Current API surface

- `POST /v1/demo/session`
- `POST /v1/auth/register`, `/login`, `/verify`, `/verification/resend`, `/logout`
- `GET /v1/me`, `GET /v1/strategies`
- `GET /v1/trades`, `POST /v1/trades`
- Bodyless `POST /v1/trades/:id/review`
- `GET /v1/stats?currency=USD`, `GET /v1/progress`
- `GET /v1/roqqu/status`, `POST /v1/roqqu/connect`, `POST /v1/roqqu/disconnect`, `GET /v1/roqqu/balances`, `GET /v1/roqqu/history`

## Defaults and safety

- Backend default: `DATA_MODE=mock`, `HOST=127.0.0.1`, `PORT=8080`.
- Frontend default: relative `/v1` requests proxied by Vite to `127.0.0.1:8080`.
- Persistent mode: local PostgreSQL via `backend/compose.yaml` or an existing local PostgreSQL URL; `npm run db:migrate` applies the migration.
- User chose per-Miroir-user Roqqu access. Each connection uses the email the user verified with Miroir. The RAS staging API key is a backend-wide secret, not a browser or per-user key; the server scopes each call to the authenticated user's verified email.
- User chose on-demand refresh initially. Polling may be designed only after Roqqu's current official allowed interval/rate limits are confirmed. No streaming feed is assumed.
- RAS history is wallet-ledger data and is not treated as completed exchange fills. No Roqqu writes/trades or ledger-to-trade imports are implemented.
- Manual trade creation works via API but has no form/screen in current `frontend--/`.
- Hosting remains provider-neutral until a target is selected.

## Verification in this workspace

- Backend test suite: **13 passed, 1 PostgreSQL integration test skipped, 0 failed**. Backend `lint` and `build` pass; this includes a regression test that mock-mode account registration returns the intended 503 response.
- Frontend ESLint and Vite production build pass. Vite reports the built JS chunk (~688 KB minified) exceeds its 500 KB advisory threshold. The API client sends the opaque token in both `Authorization` and `X-Miroir-Session`; Start Demo verifies `/v1/me` before navigating. Dashboard uses safe empty metrics and an inline warning; a top-level React error boundary remains. The exact external preview proxy behavior is still not directly inspectable here.
- The sandbox uses Node 20.20.2, while project requirements declare Node 22+; current checks passed here, but repeat on Node 22 before release.
- Mock browser smoke after the latest UI integration: Start Demo reaches Dashboard with Sample Data; the saved session verifies via `/v1/me`; dashboard metrics and strategy data render from the API. Reviews list uses backend trades and the detail page successfully requests a bodyless review, showing the deterministic score/rule evidence. Accounts labels demo data, loads balances/history only after clicking Refresh, and explicitly marks ledger activity as not trades. No browser console errors were observed in these flows. Registration submission, verification, login/logout, and live per-user Roqqu flow remain untested because PostgreSQL/email/staging credentials are not configured here.
- PostgreSQL migration/persistence/auth test has not run locally because PostgreSQL/Docker binaries are unavailable. The first GitHub Actions run for pushed commit `a21b58d` reached this test and failed at a test assertion: it queried the most-recent session after creating both verification and login sessions, then compared that row to the verification token hash. The test now queries by the expected hash directly. Local tests still skip PostgreSQL without `DATABASE_URL`; the corrected integration test needs a fresh CI run after the fix is pushed.
- No live Roqqu request was made by this rebuilt copy, and no staging key is stored here. Adapter unit tests use mocked upstream responses only.

## Remaining validation and scope

- Run the PostgreSQL migration/integration test on a real local/CI PostgreSQL service and fix any failures.
- Browser-smoke-test account registration, verification link, login/logout, Roqqu connect/disconnect, and refresh using a safe staging setup.
- Manual-trade UI is still absent; do not claim that criterion is complete.
- Confirm current permitted Roqqu request limits before considering polling.
- No exchange-trade import, host-specific deployment config, or deployment has occurred. The integrated ZIP has been pushed to GitHub `main`; its first CI run failed on the PostgreSQL session-hash assertion described above. The corrected follow-up commit has not yet been pushed, so PostgreSQL CI success remains pending.
