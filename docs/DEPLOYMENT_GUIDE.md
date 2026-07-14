# Deployment Guide for Cockpit OS

This guide will walk you through deploying your Cockpit OS application to a VPS (Virtual Private Server), separating the frontend (app) and backend (server).

**Domains:**
- Frontend: `cockpit.ripun.site`
- Backend API: `cognode.a2.cockpit.run`

## Prerequisites

- A VPS (Ubuntu 20.04/22.04 LTS recommended) with root or sudo access.
- A GitHub account.
- Domain names pointed to your VPS IP address (A records).

---

## Part 1: Push Code to GitHub

First, you need to get your code onto GitHub.

1.  **Initialize Git (if not already done)**
    Open your terminal in the project root (`e:\Projects\COCKPIT-OS`):
    ```bash
    git init
    ```

2.  **Create a .gitignore file in the root**
    Create a file named `.gitignore` in the root directory with the following content:
    ```
    node_modules
    .env
    .DS_Store
    ```

3.  **Commit your code**
    ```bash
    git add .
    git commit -m "Initial commit for deployment"
    ```

4.  **Push to GitHub**
    - Go to [GitHub](https://github.com) and create a valid new repository (e.g., `cockpit-os`).
    - Copy the repository URL.
    - Run the following commands in your terminal:
    ```bash
    git branch -M main
    git remote add origin https://github.com/YOUR_USERNAME/cockpit-os.git
    git push -u origin main
    ```

---

## Part 2: Prepare the VPS

Log in to your VPS via SSH:
```bash
ssh root@YOUR_VPS_IP
```

1.  **Update System**
    ```bash
    sudo apt update && sudo apt upgrade -y
    ```

2.  **Install Node.js (via NVM)**
    ```bash
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
    source ~/.bashrc
    nvm install 20
    nvm use 20
    nvm alias default 20
    ```

3.  **Enable pnpm and Install PM2 (Process Manager)**
    ```bash
    corepack enable
    corepack prepare pnpm@11.7.0 --activate
    pnpm setup
    source ~/.bashrc
    pnpm add -g pm2
    ```

4.  **Install Nginx (Web Server)**
    ```bash
    sudo apt install nginx -y
    ```

5.  **Install Certbot (SSL)**
    ```bash
    sudo apt install certbot python3-certbot-nginx -y
    ```

6.  **Install PostgreSQL**
    ```bash
    sudo apt install postgresql postgresql-contrib -y
    sudo systemctl start postgresql
    sudo systemctl enable postgresql
    ```

7.  **Configure PostgreSQL Database**
    Switch to the postgres user:
    ```bash
    sudo -i -u postgres
    ```
    Enter the PostgreSQL shell:
    ```bash
    psql
    ```
    Create database and user (replace `your_password` with a strong password):
    ```sql
    CREATE DATABASE cockpit_db;
    CREATE USER ripun WITH ENCRYPTED PASSWORD 'ripun';
    GRANT ALL PRIVILEGES ON DATABASE cockpit_db TO ripun;
    \q
    ```
    Exit the postgres user shell:
    ```bash
    exit
    ```
    **Note:** Your `DATABASE_URL` in the server `.env` will look like:
    `postgres://cockpit_user:your_password@localhost:5432/cockpit_db`

---

## Part 3: Deploy the Backend (Server)

1.  **Configure GitHub SSH Key**
    Generate a new SSH key:
    ```bash
    ssh-keygen -t ed25519 -C "git@ripun.site"
    cat ~/.ssh/id_ed25519.pub
    ```
    Copy the output (the public key) and add it to your GitHub account settings under **SSH and GPG keys**.

2.  **Clone the Repository**
    ```bash
    cd /var/www
    git clone git@github.com:YOUR_USERNAME/cockpit-os.git
    cd cockpit-os/server
    ```

2.  **Install Dependencies**
    ```bash
    pnpm install
    ```

3.  **Configure Environment Variables**
    Create a `.env` file with your production values:
    ```bash
    nano .env
    ```
    Paste your production configuration. **Crucially**:
    - `PORT=9100`
    - `API_PUBLIC_URL=https://cognode.a2.cockpit.run`
    - `CORS_ORIGIN=https://cockpit.ripun.site`
    - `DATABASE_URL=...` (Your production DB URL)
    - `SMTP_HOST=smtppro.zoho.in`
    - ...other keys...

4.  **Build the Server**
    ```bash
    pnpm run build
    ```

5.  **Start with PM2**
    ```bash
    pm2 start dist/src/main.js --name "cognode"
    ```

---

## Part 4: Deploy the Frontend (App)

1.  **Navigate to App Directory**
    ```bash
    cd ../app
    ```

2.  **Install Dependencies**
    ```bash
    pnpm install
    ```

3.  **Configure Environment Variables**
    Create a `.env.local` file:
    ```bash
    nano .env.local
    ```
    Paste your production configuration:
    ```bash
    NEXT_PUBLIC_API_BASE_URL=https://cognode.a2.cockpit.run
    # Add any other public vars
    ```

4.  **Build the App**
    ```bash
    pnpm run build
    ```

5.  **Start with PM2**
    ```bash
    pm2 start pnpm --name "cockpit-app" -- start -- -p 3000
    ```

6.  **Save PM2 List**
    ```bash
    pm2 save
    pm2 startup
    ```


Step‑by‑step
From your shell, enter Postgres as the superuser:

bash
sudo -u postgres psql
Inside the psql prompt, connect to your database:

sql
\c cockpit_db
You should see:

Code
You are now connected to database "cockpit_db" as user "postgres".
Now run the ownership and grants (no sudo here, just SQL):

sql
ALTER SCHEMA public OWNER TO ripun;

GRANT ALL ON SCHEMA public TO ripun;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO ripun;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO ripun;

ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO ripun;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO ripun;
Verify:

sql
\dn+
You should see public | ripun | ….

Why this works
ALTER SCHEMA public OWNER TO ripun; makes your role the owner of the schema.

The GRANT statements give full rights on existing and future objects.

No sudo is ever typed inside psql — that’s only for the shell.

---

## Part 5: Configure Nginx & SSL

1.  **Configure Backend Domain (`cognode.a2.cockpit.run`)**
    Create a config file:
    ```bash
    sudo nano /etc/nginx/sites-available/cognode.a2.cockpit.run
    ```
    Content:
    ```nginx
    server {
        server_name cognode.a2.cockpit.run;

        location / {
            proxy_pass http://localhost:9100;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection 'upgrade';
            proxy_set_header Host $host;
            proxy_cache_bypass $http_upgrade;
        }
    }
    ```

2.  **Configure Frontend Domain (`cockpit.ripun.site`)**
    Create a config file:
    ```bash
    sudo nano /etc/nginx/sites-available/cockpit.ripun.site
    ```
    Content:
    ```nginx
    server {
        server_name cockpit.ripun.site;

        location / {
            proxy_pass http://localhost:3000;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection 'upgrade';
            proxy_set_header Host $host;
            proxy_cache_bypass $http_upgrade;
        }
    }
    ```

3.  **Enable Sites**
    ```bash
    sudo ln -s /etc/nginx/sites-available/cognode.a2.cockpit.run /etc/nginx/sites-enabled/
    sudo ln -s /etc/nginx/sites-available/cockpit.ripun.site /etc/nginx/sites-enabled/
    sudo nginx -t
    sudo systemctl restart nginx
    ```

4.  **Secure with SSL (Certbot)**
    ```bash
    sudo certbot --nginx -d cognode.a2.cockpit.run
    sudo certbot --nginx -d cockpit.ripun.site
    ```

---

Open ports in AWS Security Group

Go to your AWS EC2 console → Security Groups → Inbound rules.

Add rules:

Type	Protocol	Port Range	Source
HTTP	TCP	80	0.0.0.0/0
HTTPS	TCP	443	0.0.0.0/0

Save rules.

These are essential; Let’s Encrypt will fail otherwise.

Step 3: Open ports in UFW (Ubuntu firewall)
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw reload
sudo ufw status

Confirm ports 80 and 443 are allowed.

## Verification

- Visit `https://cockpit.ripun.site` - You should see your application.
- Visit `https://cognode.a2.cockpit.run/docs` - You should see your Swagger API docs.
