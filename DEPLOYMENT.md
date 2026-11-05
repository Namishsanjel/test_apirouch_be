# Deployment

This Strapi 5 backend is deployed to a self-managed **Contabo VPS** over SSH.
GitHub Actions runs checks on every push/PR and, on a push to `main` that passes
the checks, runs `deploy/deploy.sh` on the server which pulls, builds and
restarts the app with PM2.

- Host: Ubuntu 24.04 LTS VPS
- App dir: `/var/www/apitours/app` (git checkout)
- Shared data: `/var/www/apitours/shared` (uploads + backups)
- Process manager: PM2 (`apitours-api`)
- Reverse proxy / TLS: Nginx + Certbot
- Database: PostgreSQL (production), SQLite (local dev only)

---

## 1. One-time server setup

Follow **`deploy/server-setup.md`** end to end. It covers: deploy user and SSH
key, SSH hardening, UFW, Node 22, PM2 + startup, PostgreSQL, cloning the repo,
the production `.env`, the persistent uploads symlink, Nginx + HTTPS, the first
build, the content import, auto-updates and backups.

## 2. GitHub repository secrets

Add these under **Settings → Secrets and variables → Actions → New repository
secret**. They are used only by the `deploy` job, which runs on `push` to
`main` and never for pull requests or forks.

| Secret            | Value                                                        |
| ----------------- | ------------------------------------------------------------ |
| `SSH_HOST`        | VPS IP or hostname                                           |
| `SSH_USER`        | `deploy`                                                     |
| `SSH_PORT`        | `22` (or your custom SSH port)                               |
| `SSH_PRIVATE_KEY` | Contents of the private deploy key (the `-----BEGIN...` block) |
| `SSH_KNOWN_HOSTS` | Output of `ssh-keyscan -H <VPS_IP>` (pins the host key)      |

No application secrets (database, `APP_KEYS`, SMTP, etc.) go into GitHub. They
live only in `/var/www/apitours/app/.env` on the server.

Recommended: create an **Environment** named `production` (Settings →
Environments) and optionally require a reviewer, so deploys are gated.

## 3. How a normal deploy works

1. Open a PR to `main` → the `check` job runs (install, lint/test if present,
   build). A red check marks the PR as not mergeable if you enable branch
   protection.
2. Merge the PR → `push` to `main` → `check` runs again → if it passes, `deploy`
   runs (one at a time, not cancelled) → SSH into the VPS → `deploy/deploy.sh`.
3. The script fetches `origin/main`, hard-resets, `npm ci`, builds (admin panel
   included), restarts PM2, and health-checks `http://127.0.0.1:1337/_health`.
   If any step before the restart fails, the previous version keeps running.

Recommended: protect `main` (Settings → Branches) and require the `Check` status
before merging, so broken code never reaches the deploy job.

## 4. Verify a deploy worked

```bash
# Public health endpoint (204 No Content)
curl -i https://api.yourdomain.com/_health

# Public content API (published tours)
curl -s "https://api.yourdomain.com/api/tours?pagination[pageSize]=1" | head -c 500

# Admin panel loads (login page)
curl -I https://api.yourdomain.com/admin
```

On the server:

```bash
pm2 status
pm2 logs apitours-api --lines 100
```

## 5. Roll back

The server checkout is reset to `origin/main` on every deploy, so roll back by
reverting the bad commit in git and letting CI redeploy:

```bash
# Locally, on main:
git revert <bad_commit_sha>
git push origin main
```

Fast emergency rollback without git history rewrite: on the server, check out the
previous commit, rebuild and reload:

```bash
cd /var/www/apitours/app
git fetch origin main
git reset --hard <previous_good_sha>
npm ci && NODE_ENV=production npm run build
pm2 reload apitours-api --update-env
curl -i http://127.0.0.1:1337/_health
```

After the emergency rollback, fix forward with a normal PR (the next deploy
resets to `origin/main` again), or restore the database/uploads from
`deploy/server-setup.md` §13 if data was involved.

## 6. First deploy and content import

The first build/start happens during server setup. To (re)load tour content
from `docs/source` at any time:

```bash
cd /var/www/apitours/app
NODE_ENV=production node scripts/import-packages.js --dry-run   # preview
NODE_ENV=production node scripts/import-packages.js             # upsert by slug
```

The importer is idempotent: it upserts tours keyed by slug, so running it twice
creates no duplicates.

## 7. Frontend link

- In the **frontend**, the API base URL variable (e.g. `VITE_API_URL`) must be
  the HTTPS API origin, e.g. `https://api.yourdomain.com` (no trailing slash).
- In **this backend**, set `CORS_ORIGINS` (server `.env`) to the frontend domains,
  comma-separated, e.g. `https://www.yourdomain.com,https://yourdomain.com`.
  Changing it requires a redeploy or `pm2 reload apitours-api --update-env`.
- Set `PUBLIC_URL=https://api.yourdomain.com` so absolute URLs (media) point at
  the HTTPS API domain.
