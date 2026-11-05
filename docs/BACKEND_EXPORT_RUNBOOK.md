# Run the exported backend with local PostgreSQL

> Historical runbook for the previous backend. That backend was removed for a clean rebuild. Use the root README and `backend/README.md` for the current setup; this document is preserved for reference, not as executable instructions for the current source tree.

This runbook is for someone who receives a copy of this project and wants to run the backend with PostgreSQL installed on the same computer/server. **No team server or Neon account is required.** The PostgreSQL database running in the coding workspace is only a test database; its data is not included when the source project is copied.

The SQL migration files are the portable database setup. They create the schema on the recipient's own PostgreSQL instance.

## Requirements

- PostgreSQL 15 or newer (tested with PostgreSQL 17)
- Node.js 22 or newer and npm
- Python 3.11 or newer

## 1. Create an empty local database

On a Linux server with PostgreSQL installed, open a PostgreSQL administrator shell:

```bash
sudo -u postgres psql
```

Then create an application role and database. `\password` prompts privately for a password:

```sql
CREATE ROLE miroir_app LOGIN;
\password miroir_app
CREATE DATABASE miroir OWNER miroir_app;
\q
```

Choose a strong password and keep it out of the source project. On Windows, install PostgreSQL and use pgAdmin's Query Tool; on macOS, use pgAdmin or `psql` as a PostgreSQL administrator. In either tool, run the same SQL statements and create `miroir` owned by `miroir_app`.

## 2. Configure the backend

From the project's `backend/` directory on Linux/macOS:

```bash
npm ci
python3 -m venv .venv
.venv/bin/pip install -r scoring/requirements.txt
cp .env.example .env
```

On Windows PowerShell, use:

```powershell
npm ci
py -3.11 -m venv .venv
.venv\\Scripts\\python.exe -m pip install -r scoring/requirements.txt
Copy-Item .env.example .env
```

Edit `backend/.env` (never commit or share this file). Set the database URLs to the local PostgreSQL database. Replace `PASSWORD` with the password chosen above; URL-encode special characters in it if needed.

```dotenv
NODE_ENV=production
HOST=0.0.0.0
PORT=8080
DATABASE_URL=postgresql://miroir_app:PASSWORD@127.0.0.1:5432/miroir
MIGRATION_DATABASE_URL=postgresql://miroir_app:PASSWORD@127.0.0.1:5432/miroir
CORS_ORIGIN=https://YOUR-FRONTEND-ADDRESS
SCORING_SERVICE_URL=http://127.0.0.1:8001
SCORING_SERVICE_TOKEN=REPLACE_WITH_A_RANDOM_VALUE_AT_LEAST_32_CHARACTERS
DEMO_AUTH_ENABLED=true
DEMO_AUTH_FALLBACK_ENABLED=false
TRUST_PROXY=false
```

Use the frontend's exact website origin for `CORS_ORIGIN` (scheme and host, no path). If there is no hosted frontend yet, use the local development origin such as `http://localhost:5173` while developing; production mode does not allow `*`.

Generate a scoring token locally, for example with `openssl rand -hex 32`, and put the result in `.env`. If a reverse proxy is later configured in front of the API, set `TRUST_PROXY=true`; otherwise leave it false.

`ROQQU_STAGING_API_KEY` is optional and is not needed to start the backend. If the account owner enables the Roqqu staging integration, put the staging key only in the backend's private runtime environment / `.env`; do not commit it or put it in frontend configuration. The project export contains no Roqqu key.

## 3. Initialize the database schema

Still in `backend/`:

```bash
npm run migrate
```

This applies the checked-in SQL migrations to the local `miroir` database. It initializes the schema, not copied user/demo records.

## 4. Build and start the services

Build the API:

```bash
npm run build
```

Open one terminal in `backend/` for the scoring service.

Linux/macOS:

```bash
.venv/bin/python -m uvicorn scoring.app.main:app --host 127.0.0.1 --port 8001
```

Windows PowerShell:

```powershell
.venv\\Scripts\\python.exe -m uvicorn scoring.app.main:app --host 127.0.0.1 --port 8001
```

Open a second terminal in `backend/` for the API:

```bash
npm start
```

Check `http://localhost:8080/health`; API documentation is at `http://localhost:8080/docs`. For an always-on deployment, run both services under the host's process manager (for example, systemd) and configure them to start after PostgreSQL. This repository does not assume a particular hosting provider or install a server-specific process manager.

To create the sample demo workspace after both services are running, call `POST /v1/demo/session`; it creates a fresh demo identity, strategy, six sample trades, and six reviews in that recipient's database. It does not import data from the coding workspace.

## What gets copied

Copy the source tree, including `backend/package-lock.json`, `backend/migrations/`, and this runbook. Do not copy `node_modules/`, `.venv/`, `dist/`, `.data/`, or `.env`. `npm ci` and the Python install command recreate dependencies; `npm run migrate` creates the PostgreSQL schema. Back up the recipient's PostgreSQL data directory separately after deployment; it is not part of a source-code export.
