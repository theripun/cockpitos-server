Here’s the clean deployment path for this Cockpit backend on an AWS EC2 Ubuntu instance.

**Port Plan**
Use this layout:

| Purpose | Port | Open in EC2 Security Group? | Notes |
|---|---:|---|---|
| SSH | `22` | Yes, but only your IP | For admin access |
| HTTP | `80` | Yes, `0.0.0.0/0`, `::/0` | Needed for Certbot and redirects |
| HTTPS | `443` | Yes, `0.0.0.0/0`, `::/0` | Public API traffic |
| Nest server | `9100` | No | Nginx proxies to this locally |
| PostgreSQL | `5432` | No | Keep local-only unless using managed DB |

Do not expose `9100` publicly except for a short test from your own IP. The app already listens on `0.0.0.0`, and [server/note.txt](/home/ripun/GitHub/LIVE/cockpitos/server/note.txt:3) says `PORT=9100`.

**EC2 Setup**
1. Launch Ubuntu 22.04 EC2.
2. Attach an Elastic IP.
3. Security Group inbound:
   ```text
   SSH   22   your-ip/32
   HTTP  80   0.0.0.0/0
   HTTPS 443  0.0.0.0/0
   ```
4. SSH in:
   ```bash
   ssh -i ripun-ec2.pem ubuntu@YOUR_EC2_PUBLIC_IP
   ```

**Install Runtime**
```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y nginx postgresql postgresql-contrib certbot python3-certbot-nginx git build-essential

curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
sudo corepack enable
sudo corepack prepare pnpm@11.7.0 --activate
sudo npm i -g pm2
```

**Postgres**
```bash
sudo -u postgres psql
```

```sql
CREATE DATABASE cockpit_pro;
CREATE USER cockpit_user WITH ENCRYPTED PASSWORD 'STRONG_PASSWORD';
GRANT ALL PRIVILEGES ON DATABASE cockpit_pro TO cockpit_user;
\q
```

If migrations need schema privileges:
```bash
sudo -u postgres psql -d cockpit_pro
```

```sql
GRANT ALL ON SCHEMA public TO cockpit_user;
ALTER SCHEMA public OWNER TO cockpit_user;
\q
```

**Deploy Server**
```bash
sudo mkdir -p /var/www
sudo chown ubuntu:ubuntu /var/www
cd /var/www
git clone https://github.com/theripun/cockpitos-server.git
cd cockpitos-server
pnpm install
```

Create `/var/www/cockpitos/server/.env`:

```env
# Environment
NODE_ENV=production
PORT=9100

# Frontend
FRONTEND_URL=https://cockpit.run

# Database
DATABASE_URL=postgres://cockpit_user:STRONG_PASSWORD@localhost:5432/cockpit_pro

# CORS
CORS_ORIGIN=https://cockpit.run,https://api.cockpit.run

# Sessions
SESSION_TTL_SECONDS=604800

# Cookies
COOKIE_SECURE=true
COOKIE_SAMESITE=lax

# WebAuthn (Passkeys)
RP_NAME=Cockpit
RP_ID=cockpit.run
RP_ORIGIN=https://cockpit.run
WEBAUTHN_CHALLENGE_TTL_SECONDS=300

# Application Secret
COCKPIT_SECRET_KEY=6b2f5d8a91e7c34f0a8d5b9c7e1f4a26d3c8e5f7a9b1d4e6c2f8a0b3d7e9c5f1

# Cloudflare R2
R2_ACCOUNT_ID=xxxxxxxxxxxxxxxx
R2_ACCESS_KEY_ID=xxxxxxxxxxxxxxxx
R2_SECRET_ACCESS_KEY=xxxxxxxxxxxxxxxx
R2_BUCKET=cockpit-storage
R2_PUBLIC_BASE_URL=https://cdn.yourdomain.com
R2_REGION=auto

# Email
MAIL_TRANSPORT=smtp
SMTP_HOST=smtp.zoho.in
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=hello@theripun.com
SMTP_PASS=XkYRiHgymXLn
FROM_EMAIL=hello@theripun.com
```

Because your frontend and backend are on different site roots, `COOKIE_SAMESITE=none` and `COOKIE_SECURE=true` are important for browser credentialed requests.

Build and migrate:

```bash
pnpm run build
pnpm run db:migrate
pm2 start dist/src/main.js --name cockpit-server --env production
pm2 save
pm2 startup
```

Run the command PM2 prints after `pm2 startup`.

**Nginx**
Create:

```bash
sudo nano /etc/nginx/sites-available/api.cockpit.run
```

Paste:

```nginx
server {
    listen 80;
    server_name api.cockpit.run;

    location / {
        proxy_pass http://127.0.0.1:9100;
        proxy_http_version 1.1;

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";

        proxy_read_timeout 3600;
        proxy_send_timeout 3600;
    }
}
```

Enable it:

```bash
sudo ln -s /etc/nginx/sites-available/api.cockpit.run /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

**Cloudflare DNS**
In Cloudflare:

1. Add an `A` record:
   ```text
   Name: api
   Target: YOUR_EC2_ELASTIC_IP
   Proxy: DNS only first
   ```
2. Run SSL:
   ```bash
   sudo certbot --nginx -d api.cockpit.run
   ```
3. After SSL works, you can switch Cloudflare proxy on if you want.
4. Set Cloudflare SSL/TLS mode to `Full (strict)`.

**Cloudflare R2 Storage**
Your [server/note.txt](/home/ripun/GitHub/LIVE/cockpitos/server/note.txt:25) says the gallery uses Cloudflare R2 signed URLs. Configure the bucket CORS:

Cloudflare Dashboard → R2 → bucket `cockpit-preview` → Settings → CORS Policy:

```json
[
  {
    "AllowedOrigins": [
      "http://localhost:3000",
      "https://cockpit.ripun.site",
      "https://cognode.a2.cockpit.run"
    ],
    "AllowedMethods": ["PUT", "GET", "HEAD", "DELETE"],
    "AllowedHeaders": ["Content-Type"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3000
  }
]
```

Do not enable public bucket access. This app’s flow uses signed URLs: frontend asks your server for a signed URL, browser uploads/downloads directly to R2, and R2 CORS permits that browser transfer.

**Verify**
```bash
curl http://127.0.0.1:9100/health
curl https://cognode.a2.cockpit.run/health
pm2 logs cognode
```

Then check:

```text
https://cognode.a2.cockpit.run/docs
```

Final mental model: public traffic enters Cloudflare → EC2 `443` → Nginx → local `127.0.0.1:9100` → Nest server. R2 stays private and only accepts browser uploads/downloads through signed URLs.