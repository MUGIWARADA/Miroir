# Roqqu RAS API contract review

> Historical contract review (2026-11-04) of the previous backend implementation. The security and API-contract findings remain reference material, but its implementation/test status is superseded by `BACKEND_REBUILD_PLAN.md`.

**Reviewed:** 2026-11-04  
**Source:** [RAS API docs](https://roqqu-api-services.gitbook.io/ras) and the linked endpoint pages.  
**Project status:** The backend exposes read-only staging routes for status, balances, and ledger history. Contract and route tests use mocked `fetch`; no Roqqu request has been sent and no key is configured in this working copy. No sandbox balances or account state were changed.

## What the docs establish

- API base: `https://service.roqqu.com/v1` ([Introduction](https://roqqu-api-services.gitbook.io/ras/introduction.md)).
- Test-mode credential header: `x-staging-api-key`; live mode uses `x-api-key`. The docs say secret keys must stay confidential and on the server ([Authentication](https://roqqu-api-services.gitbook.io/ras/authentication.md)).
- RAS is documented as a merchant wallet/ledger service. It includes balances, wallet/address operations, ledger buy/sell/swap, transaction history, payment links, webhooks, and related admin/analytics APIs.
- Buy/sell/swap are explicitly ledger operations; their success responses return `data: null`, and they do not emit webhooks. The history endpoint returns ledger fields such as token, amount, direction, balance, and timestamps ([Buy](https://roqqu-api-services.gitbook.io/ras/trade/buy.md), [Sell](https://roqqu-api-services.gitbook.io/ras/trade/sell.md), [History](https://roqqu-api-services.gitbook.io/ras/history/get-transaction-history.md)).
- The published contract does not establish a complete exchange fill with a pair, execution price, quantity semantics, fees per fill, or a stable trade/order identifier. It is therefore not safe to map RAS ledger entries directly into Miroir's canonical trade records.

## Mocked test coverage

The contract inventory is `backend/src/services/roqqu-ras-contract.ts`; tests are in `backend/test/roqqu-ras-contract.test.ts`.

- Catalogs **40 documented HTTP endpoints** by method, path, request fields/encoding, auth status, effect category, response data kind, and source page.
- Tests all catalog entries using an injected mock `fetch`—**no external network access**. The 39 requests with documented encodings are serialized and checked; `DELETE /wallets/delete` is intentionally refused because the docs do not specify where/how its required parameters are sent.
- Verifies the test header is used in the mock, the live header is not used, and the key is absent from URLs and bodies.
- Checks required parameters, rejects unexpected fields, validates documented data kinds and selected documented response fields, and checks failure/malformed-response handling without echoing a configured key.
- The client is pinned to HTTPS `service.roqqu.com/v1`; it rejects any other host, port, protocol, or path before using the API key, and refuses HTTP redirects so a redirect cannot forward the key to another host.
- Test result: **32/32 backend tests pass**, including mocked RAS route and contract/security tests. Backend typecheck, lint, and build pass.

These are client/contract tests against the published documentation; they do **not** prove the remote RAS service behaves exactly as documented.

## Documentation gaps/contradictions recorded in the inventory

- Sell prose requires authentication, but its example omits the key header.
- History's example omits authentication and the page does not state its auth policy, despite handling merchant-specific data.
- Swap documents `amount` as an integer even though crypto token amounts can be fractional; its auth requirement is also not stated on the page.
- Wallet deletion lists required fields but gives no request example or body encoding; the client fails closed rather than guessing.
- Price and fiat-rate pages name endpoints but do not provide response schemas.
- Some endpoint examples omit auth headers even when nearby docs say a key is required. The inventory distinguishes `required`, `unspecified`, and `public` rather than silently treating all pages as consistent.

## Security guardrails applied

- The API key is loaded only from backend runtime config (`ROQQU_STAGING_API_KEY`); the shared key from chat was not copied into this workspace, and no key is currently configured.
- The Node API routes call the server-side client directly. The secret is never sent to the browser; client requests are pinned to the official HTTPS host and redirects are refused.
- Current integration endpoints are read-only (`status`, `balances`, `history`). Stateful/irreversible routes remain excluded from the integration. No Roqqu request of any kind has been sent.

## Next steps for live verification

Set `ROQQU_STAGING_API_KEY` in the backend runtime environment and call the read-only balances/history routes to verify staging behavior. The key is absent in this working copy, so live behavior remains unverified. For trade sync, obtain exchange order/fill documentation or keep RAS ledger activity supplemental while manual trade records remain authoritative.
