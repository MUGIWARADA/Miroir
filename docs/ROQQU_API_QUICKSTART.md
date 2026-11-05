# Roqqu RAS API: readable quick start

> Historical quick start for the previous backend API. Current route behavior and local-only safety restrictions are documented in the root README and `backend/README.md`; do not follow old startup commands without checking those current files.

This guide is for a developer or account owner who wants to see how the Miroir backend reads Roqqu staging data. **There is no Roqqu panel in the current Miroir frontend.** Use the interactive API docs or call the API directly.

The integration is read-only: it can report configuration, read balances, and read ledger history. It does not trade, send funds, refund transactions, or import ledger history as canonical Miroir trades.

## Before you begin

1. Start the Miroir API and Python scoring service using the [backend export runbook](BACKEND_EXPORT_RUNBOOK.md).
2. Have an authorized **Roqqu staging** API key. The staging key must be set on the backend as `ROQQU_STAGING_API_KEY`; never put it in frontend code or commit it to the project. A Miroir API user cannot provide the Roqqu key in an API request.
3. Know the Roqqu account email if you plan to request history. History requires an `email` query parameter.

The Roqqu key and the Miroir bearer token below are different credentials:

- `ROQQU_STAGING_API_KEY` lets the backend call Roqqu. Keep it in the backend's private environment or secret manager.
- The Miroir bearer token lets a user call protected Miroir endpoints. It is returned by `POST /v1/demo/session`.

## Option A: use the interactive API docs

1. Open `https://YOUR-API-HOST/docs` (or `http://localhost:8080/docs` for local development).
2. Find **Auth → Create an isolated demo identity and bearer token** (`POST /v1/demo/session`) and choose **Try it out**, then **Execute**. The response contains a `token`.
3. Click **Authorize** at the top of the page. Paste the Miroir token into the Bearer field and authorize. Do not paste the Roqqu key here.
4. Find the **Integrations** section.
5. Try `GET /v1/integrations/roqqu/status`. It only reports configuration; it does not contact Roqqu.
6. Try `GET /v1/integrations/roqqu/balances`. It calls Roqqu staging when the backend has the staging key configured.
7. Try `GET /v1/integrations/roqqu/history`. Enter the account's email in the required `email` field before executing.

## Option B: call the API with curl

Set the API address to the host running Miroir. For a local setup:

```bash
export API_BASE="http://localhost:8080"
```

Create a Miroir demo session:

```bash
curl -sS -X POST "$API_BASE/v1/demo/session" \
  -H 'Content-Type: application/json' \
  -d '{"display_name":"API reader"}'
```

Copy the `token` value from the response, then set it in your terminal. Keep it private:

```bash
export MIROIR_TOKEN='PASTE_THE_SESSION_TOKEN_HERE'
```

Check the backend's Roqqu configuration:

```bash
curl -sS "$API_BASE/v1/integrations/roqqu/status" \
  -H "Authorization: Bearer $MIROIR_TOKEN"
```

The response has `provider`, `configured`, `mode`, `liveConnectivity`, and `tradeMapping`. A configured staging key is reported as `configured: true`; `liveConnectivity` remains `not_checked` because this status call deliberately makes no upstream request.

Read balances:

```bash
curl -sS "$API_BASE/v1/integrations/roqqu/balances" \
  -H "Authorization: Bearer $MIROIR_TOKEN"
```

Read ledger history (replace the email with the Roqqu account email):

```bash
curl -sS --get "$API_BASE/v1/integrations/roqqu/history" \
  -H "Authorization: Bearer $MIROIR_TOKEN" \
  --data-urlencode 'email=ACCOUNT_EMAIL'
```

History also accepts optional `token`, `network`, `direction`, `timestamp`, and `status` query filters. See `/docs` for their schemas.

## How to understand the result

- **Status returns `configured: false`:** the API process does not currently have `ROQQU_STAGING_API_KEY`. Add the staging key to the backend's private environment and restart the API. Do not add it to the frontend or this repository.
- **Balances/history return `ROQQU_NOT_CONFIGURED` (HTTP 503):** same cause—no key is loaded in the running backend.
- **Balances/history return `ROQQU_UPSTREAM_ERROR` (HTTP 502):** Miroir could not complete the Roqqu read request. Check the backend's server logs and the staging account/key; the API response intentionally does not expose upstream details or credentials.
- **Successful read:** the response includes `provider: "roqqu_ras"` and the upstream result under `data`. The staging balance check previously succeeded with HTTP 200 and 20 assets. History has not yet been live-tested.

A successful balance or history read does not create Miroir trades. RAS history is supplemental ledger data; it is not automatically a completed exchange fill. The project has no Roqqu write endpoints.

## Current preview state

The running preview is deliberately started without a Roqqu key. Its status therefore says `configured: false`, and balance requests return `ROQQU_NOT_CONFIGURED` until an authorized operator loads the staging key into the backend process. No key is included in a project export.
