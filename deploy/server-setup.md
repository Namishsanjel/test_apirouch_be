# One-time Contabo VPS setup

Step-by-step guide for a **fresh Ubuntu 24.04 LTS** VPS (Contabo). If you are on
Ubuntu 22.04, the steps are the same. Run these as a user with `sudo` (your
initial Contabo root or sudo user). Replace every `<...>` placeholder.

> Conventions used below:
> - App directory (git checkout): `/var/www/apitours/app`
> - Persistent shared data: `/var/www/apitours/shared`
> - App name for PM2: `apitours-api`
> - API domain: `api.yourdomain.com`
> - Deploy user (SSH + runs the app): `deploy`

---

## 1. System update and base packages

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl git nginx postgresql postgresql-contrib ufw \
  unattended-upgrades ca-certificates
```

## 2. Create the deploy user

```bash
sudo adduser deploy
sudo usermod -aG sudo deploy      # optional; only if deploy needs sudo
```

## 3. SSH access for GitHub Actions

On **your local machine**, create a dedicated key pair for CI (no passphrase,
because Actions cannot type one):

```bash
ssh-keygen -t ed25519 -C "github-actions@apitours" -f ./apitours_deploy_key -N ""
```

Copy the **public** key to the server as the `deploy` user:

```bash
ssh-copy-id -i ./apitours_deploy_key.pub deploy@<VPS_IP>
```

Or manually, on the server:

```bash
sudo mkdir -p /home/deploy/.ssh
sudo chmod 700 /home/deploy/.ssh
# paste the contents of apitours_deploy_key.pub into authorized_keys:
sudo tee -a /home/deploy/.ssh/authorized_keys < apitours_deploy_key.pub
sudo chown -R deploy:deploy /home/deploy/.ssh
sudo chmod 600 /home/deploy/.ssh/authorized_keys
```

Put the **private** key (`apitours_deploy_key`) into the GitHub secret
`SSH_PRIVATE_KEY`, and **delete the local private key file** afterwards.

### Record the host key for GitHub (SSH_KNOWN_HOSTS)

On your local machine:

```bash
ssh-keyscan -p 22 -H <VPS_IP>
```

Paste the output into the GitHub secret `SSH_KNOWN_HOSTS`. The workflow verifies
host keys (never disables checking).

### Harden SSH: disable password and root login

```bash
sudo tee /etc/ssh/sshd_config.d/99-hardening.conf >/dev/null <<'EOF'
PasswordAuthentication no
PermitRootLogin no
PubkeyAuthentication yes
EOF
sudo sshd -t && sudo systemctl reload ssh
```

**Test a new SSH session as `deploy` before closing your current one.**

## 4. Firewall

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
sudo ufw status verbose
```

PostgreSQL (5432) and the app port (1337) stay **closed** to the internet; the
database is reached only locally and the app only through Nginx.

## 5. Node.js (match the project: Node 22)

Using NodeSource:

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
node -v    # expect v22.x
```

## 6. PM2

```bash
sudo npm install -g pm2
pm2 -v
```

PM2 startup on boot will be configured **after** the first app start (step 9),
because it needs the process list. Do it as the `deploy` user.

## 7. PostgreSQL: create database and user

```bash
sudo -u postgres psql <<'SQL'
CREATE DATABASE apitours;
CREATE USER apitours WITH ENCRYPTED PASSWORD '<STRONG_DB_PASSWORD>';
GRANT ALL PRIVILEGES ON DATABASE apitours TO apitours;
ALTER DATABASE apitours OWNER TO apitours;
SQL
```

Notes:
- Generate `<STRONG_DB_PASSWORD>` with `openssl rand -base64 24`.
- Leave `listen_addresses = 'localhost'` (default). Do **not** open 5432.
- If you prefer MySQL/MariaDB instead: install `mariadb-server`, create a DB and
  user, and set `DATABASE_CLIENT=mysql` instead of `postgres`.

## 8. Clone the repo and create the production .env

The repository is **private**. Use a read-only deploy key or a GitHub
fine-grained token.

Deploy key (on the server, as `deploy`):

```bash
ssh-keygen -t ed25519 -C "vps@apitours" -f ~/.ssh/github_deploy -N ""
cat ~/.ssh/github_deploy.pub   # add this as a "Deploy key" (read-only) in GitHub repo settings
```

Then clone:

```bash
sudo mkdir -p /var/www/apitours && sudo chown -R deploy:deploy /var/www/apitours
sudo -u deploy bash -c '
  cd /var/www/apitours
  GIT_SSH_COMMAND="ssh -i ~/.ssh/github_deploy" \
    git clone git@github.com:Namishsanjel/test_apirouch_be.git app
'
```

Create the persistent shared folders and the linked uploads directory:

```bash
sudo -u deploy bash -c '
  mkdir -p /var/www/apitours/shared/uploads /var/www/apitours/app/logs
  # Make Strapi write uploads to the persistent folder instead of the checkout.
  rm -rf /var/www/apitours/app/public/uploads
  ln -s /var/www/apitours/shared/uploads /var/www/apitours/app/public/uploads
'
```

> `deploy/deploy.sh` does `git reset --hard`, which does **not** remove the
> `public/uploads` symlink (it is untracked). If it is ever missing, re-create
> the symlink above.

Create the production `.env` (never commit it):

```bash
sudo -u deploy nano /var/www/apitours/app/.env
```

See `.env.example` for every variable. Generate the secrets with
`openssl rand -base64 32`:

```
NODE_ENV=production
HOST=127.0.0.1
PORT=1337
PUBLIC_URL=https://api.yourdomain.com

APP_KEYS=<key1>,<key2>,<key3>,<key4>
API_TOKEN_SALT=<random>
ADMIN_JWT_SECRET=<random>
TRANSFER_TOKEN_SALT=<random>
JWT_SECRET=<random>
ENCRYPTION_KEY=<random>

DATABASE_CLIENT=postgres
DATABASE_HOST=127.0.0.1
DATABASE_PORT=5432
DATABASE_NAME=apitours
DATABASE_USERNAME=apitours
DATABASE_PASSWORD=<STRONG_DB_PASSWORD>
DATABASE_SCHEMA=public
DATABASE_SSL=false

CORS_ORIGINS=https://www.yourdomain.com,https://yourdomain.com

# Uploads are handled by the symlink; UPLOADS_DIR is not required by Strapi's
# local provider and is left empty on purpose.

SMTP_HOST=
SMTP_PORT=
SMTP_USERNAME=
SMTP_PASSWORD=
EMAIL_FROM=
EMAIL_REPLY_TO=
NOTIFY_EMAIL=
```

Protect it:

```bash
sudo chmod 600 /var/www/apitours/app/.env
```

## 9. First build and start

As `deploy`:

```bash
cd /var/www/apitours/app
npm ci
NODE_ENV=production npm run build
pm2 start ecosystem.config.js --only apitours-api --update-env
pm2 save
pm2 startup systemd -u deploy --hp /home/deploy   # then run the printed command
```

Health check:

```bash
curl -i http://127.0.0.1:1337/_health   # expect HTTP 204
```

## 10. Nginx reverse proxy + HTTPS

```bash
sudo cp deploy/nginx.conf.example /etc/nginx/sites-available/apitours
sudo nano /etc/nginx/sites-available/apitours   # set server_name api.yourdomain.com
sudo ln -s /etc/nginx/sites-available/apitours /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
```

DNS: in your registrar, add an **A record** for `api.yourdomain.com` pointing to
`<VPS_IP>`. Wait for propagation, then:

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d api.yourdomain.com
```

Certbot installs a renewal timer automatically; verify with
`sudo systemctl list-timers | grep certbot`.

## 11. Load the initial content (idempotent)

The tour importer reads `docs/source/*.md` and upserts by slug, so it is safe to
run more than once (no duplicates).

```bash
cd /var/www/apitours/app
NODE_ENV=production node scripts/import-packages.js            # import
NODE_ENV=production node scripts/import-packages.js --dry-run  # preview only
```

It connects using the same `.env`, i.e. the production PostgreSQL database.

If you also need the demo seed (destinations, services, FAQs, sample tours):

```bash
NODE_ENV=production node scripts/seed.js --help
```

## 12. Automatic security updates

`unattended-upgrades` was installed in step 1. Enable automatic reboots only if
you accept them, otherwise just security patches:

```bash
sudo dpkg-reconfigure -plow unattended-upgrades
```

## 13. Backups (database + uploads) with retention

Create a backup script and a daily cron job (as `deploy`):

```bash
sudo -u deploy bash -c 'mkdir -p /var/www/apitours/backups'
sudo -u deploy tee /var/www/apitours/backup.sh >/dev/null <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
STAMP="$(date +%F_%H%M%S)"
DIR=/var/www/apitours/backups
mkdir -p "$DIR"
# Database dump (Postgres). Uses the app's DATABASE_* values.
set -a; . /var/www/apitours/app/.env; set +a
PGPASSWORD="$DATABASE_PASSWORD" pg_dump -h "$DATABASE_HOST" -p "$DATABASE_PORT" \
  -U "$DATABASE_USERNAME" -Fc "$DATABASE_NAME" > "$DIR/db_$STAMP.dump"
# Uploads archive
tar -czf "$DIR/uploads_$STAMP.tar.gz" -C /var/www/apitours/shared uploads
# Retention: keep 14 days
find "$DIR" -type f -mtime +14 -delete
EOF
sudo -u deploy chmod +x /var/www/apitours/backup.sh
sudo -u deploy crontab -l 2>/dev/null | { cat; echo "15 3 * * * /var/www/apitours/backup.sh >> /var/www/apitours/backups/backup.log 2>&1"; } | sudo -u deploy crontab -
```

Restore (database):

```bash
# stop the app, drop/recreate, restore, then start
pm2 stop apitours-api
PGPASSWORD='<pw>' pg_restore -h 127.0.0.1 -U apitours -d apitours --clean --if-exists \
  /var/www/apitours/backups/db_<STAMP>.dump
pm2 start apitours-api
```

Restore (uploads):

```bash
tar -xzf /var/www/apitours/backups/uploads_<STAMP>.tar.gz -C /var/www/apitours/shared
```

> Copy backups off the VPS (e.g. `rclone`/`scp` to object storage). A backup that
> only lives on the same disk is not a backup.
