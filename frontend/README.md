# Miroir Frontend

React 19 + Vite UI for the Miroir demo workflow. See the repository-root `README.md` for the complete local stack and product boundaries.

## Run

```bash
npm ci
npm run dev
```

Vite serves the app at `http://localhost:5173`. By default it forwards `/v1` requests to `http://127.0.0.1:8080`; start the backend API and Python scoring service first. Set `VITE_API_PROXY_TARGET` to override the API proxy. `VITE_API_BASE_URL` can point a built frontend at a public API origin and must not contain a credential.

The real backend is the default. `VITE_API_MODE=mock` opts into the retained fixture adapter for UI-only work; it does not connect to Roqqu or persist server records. See `.env.example` for the non-secret configuration template.

## Current UI behavior

- Create a clearly labelled demo workspace; seeded samples and manually entered trades are shown together.
- Record trades manually, or preview and confirm fixed-template CSV imports.
- Request deterministic reviews, browse trade history, and view backend-provided stats/progress.
- The bodyless review POST must not send `Content-Type: application/json`; the API adapter handles this contract.
- Roqqu exchange authentication/trading is not implemented. No exchange credentials should be entered.

## Checks

```bash
npm run lint
npm run build
```
