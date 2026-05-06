# Deployment Guide — Technology Showback Dashboard

This app is a React + FastAPI dashboard that shows BCI's technology costs by department. It runs as a single Docker container on Azure App Service. Users log in via Zscaler SSO (no passwords).

---

## Before You Start

### Tools you need on your machine

- [Azure CLI](https://learn.microsoft.com/en-us/cli/azure/install-azure-cli) — used to build the container and configure App Service
- Git

That's it. You do not need Docker installed — `az acr build` builds in the cloud.

### Log in to Azure first

```bash
az login
```

This opens a browser. Sign in with your BCI account. Every `az` command below requires this.

### Azure resources that must already exist

Before deploying, confirm these are provisioned (ask the infrastructure team if unsure):

| Resource | What it's for |
|---|---|
| Azure Container Registry (ACR) | Stores the built Docker image |
| Azure App Service (Linux, container) | Runs the app |
| Azure Database for PostgreSQL | Stores user accounts and access logs |
| Azure Storage Account + Blob Container | Stores uploaded cost data (persists across restarts) |

### People to coordinate with

| What you need | Who to ask |
|---|---|
| `JWT_SECRET_KEY`, `SESSION_SECRET` generated values | Security team |
| Zscaler confirmed working (`TRUST_ZSCALER_HEADERS=true`) | Security team |
| PostgreSQL connection string | Infrastructure team |
| Azure Storage connection string | Infrastructure team |
| ACR name, App Service name, resource group name | Infrastructure team |
| SMTP service account password (optional, for email reports) | IT team |

---

## Step 1 — Get the Code

```bash
git clone https://github.com/marshall-bci/Technology-showback-dashboard.git
cd Technology-showback-dashboard
```

---

## Step 2 — Set Up the `.env` File

The template is at `backend/.env.example`. Copy it:

```bash
cp backend/.env.example backend/.env
```

Open `backend/.env` and fill in every value that has a placeholder. The minimum required for production:

```
APP_ENV=production
TRUST_ZSCALER_HEADERS=true

FRONTEND_URL=https://<your-app>.azurewebsites.net
ALLOWED_ORIGINS=https://<your-app>.azurewebsites.net

JWT_SECRET_KEY=<64-char hex — generate with: python -c "import secrets; print(secrets.token_hex(32))">
SESSION_SECRET=<64-char hex — generate a different value with the same command>

DATABASE_URL=postgresql://username:password@hostname.postgres.database.azure.com:5432/dbname

STORAGE_BACKEND=azure
AZURE_STORAGE_CONNECTION_STRING=<from Azure Portal → Storage accounts → Access keys>
AZURE_STORAGE_CONTAINER=showback-data
```

> **SQLite is not safe for production.** The `.env.example` has PostgreSQL as the active database line. Do not switch it back to SQLite — it wipes all user accounts on every restart.

> **Blob Storage is required.** Without it, every container restart empties the dashboard. Users will see no data until someone re-uploads the cost workbook.

You do not need to fill in Section 1 (Azure AD) — BCI authenticates via Zscaler (Section 1b). Leave those lines blank.

---

## Step 3 — Build and Push the Container

```bash
az acr build --registry <your-acr-name> --image showback-dashboard:latest .
```

This builds the Docker image in the cloud and pushes it to your Container Registry. It takes 3–5 minutes. You will see streaming build output; it ends with `Run ID: ... was successful`.

---

## Step 4 — Point App Service at the Image (run once)

```bash
az webapp config container set \
  --name <your-app-name> \
  --resource-group <your-rg> \
  --docker-custom-image-name <your-acr-name>.azurecr.io/showback-dashboard:latest
```

---

## Step 5 — Set Application Settings

These replace the `.env` file in production. Do not upload the `.env` file to Azure.

Azure Portal → App Services → [your app] → **Configuration** → **Application Settings** → New application setting

Add each key-value pair from your `backend/.env`. Every non-commented line becomes one setting.

Then under **General Settings**, set the startup command to:

```
bash /home/site/wwwroot/startup.sh
```

Save and restart the app.

---

## Step 6 — Create the First Admin User

The app has no users yet. You need to create the first admin before anyone can log in.

SSH into the running container:

```bash
az webapp ssh --name <your-app-name> --resource-group <your-rg>
```

Inside the SSH session:

```bash
cd /app/backend
python init_admin.py admin@bci.ca
```

Replace `admin@bci.ca` with the admin's actual BCI email. Expected output:

```
Created admin user: admin@bci.ca
```

Exit the SSH session. The admin can now log in via Zscaler SSO at the app URL.

> `/auth/dev-login` does not work in production. It is disabled when `APP_ENV=production`.

---

## Step 7 — Verify It's Working

1. Open `https://<your-app>.azurewebsites.net` in a browser
2. You should be redirected to the Zscaler login (or logged in automatically if already on the BCI network)
3. After login, you should see the dashboard with an empty state (no data uploaded yet)
4. Log in as the admin created in Step 6
5. Go to the **Admin** tab — if it loads, the database connection is working
6. Upload the cost workbook via the upload button — if data appears, Blob Storage is working

**If the page shows a 500 error or the container fails to start:**

Check the logs:

```bash
az webapp log tail --name <your-app-name> --resource-group <your-rg>
```

Common causes:
- Missing or wrong `DATABASE_URL` — the app exits on startup if it can't connect to PostgreSQL
- Missing `JWT_SECRET_KEY` or `SESSION_SECRET` — the app will refuse to start
- `AZURE_STORAGE_CONNECTION_STRING` has placeholder values (`YOUR_ACCOUNT`, `YOUR_KEY`) — replace them

---

## Step 8 — Add Users

Once the admin is logged in:

1. Go to **Admin** tab
2. Create user accounts — BCI email address required (must match what Zscaler passes)
3. Set `allowed_departments`:
   - Leave empty → full access (Technology team and admins)
   - Set to a department name (e.g. `Finance`) → restricted view, that department's data only

---

## Step 9 — Test Both Roles, Then Remove Test Accounts

If the app was run locally during development, two test accounts may exist in the database:

| Email | Role | What to test |
|---|---|---|
| `testadmin@bci.ca` | Admin | Full dashboard, Admin tab, all departments visible, upload works |
| `testviewer@bci.ca` | Viewer (no department restriction) | Same data as admin but no Admin tab |

Use these to verify both experiences look correct before handing the URL to real users.

**How to log in as a test account:**

Zscaler SSO will not let you log in as `testadmin@bci.ca` — it passes your real BCI identity. To use the test accounts, temporarily switch the app to development mode:

1. In Azure Portal → App Service → Configuration → Application Settings, change `APP_ENV` to `development`
2. Save and restart the app
3. Open `https://<your-app>.azurewebsites.net` — the sign-in page will now show **Dev Admin** and **Dev Viewer** buttons at the bottom
4. Click **Dev Admin** to test the admin experience, **Dev Viewer** for the viewer experience
5. Once satisfied, change `APP_ENV` back to `production` and restart

> The Dev Admin / Dev Viewer buttons only appear when `APP_ENV=development`. They are hidden automatically in production mode.

**Once testing is complete — delete the test accounts:**

Via the Admin tab (log back in as the production admin first):

1. Go to **Admin** tab
2. Find `testadmin@bci.ca` and `testviewer@bci.ca` in the user list
3. Click **Delete** next to each one and confirm

Or via SSH if preferred:

```bash
az webapp ssh --name <your-app-name> --resource-group <your-rg>
cd /app/backend
python - <<'EOF'
from database import SessionLocal
from models import User
db = SessionLocal()
for email in ["testadmin@bci.ca", "testviewer@bci.ca"]:
    u = db.query(User).filter(User.email == email).first()
    if u:
        db.delete(u)
        print(f"Deleted {email}")
    else:
        print(f"Not found: {email}")
db.commit()
EOF
```

Switch `APP_ENV` back to `production`, restart the app, and it is ready to share with real users.

---

## Updating a Running Deployment

```bash
git pull origin master
az acr build --registry <your-acr-name> --image showback-dashboard:latest .
```

App Service pulls the new image automatically within a few minutes. If it doesn't restart, trigger a manual restart from the Azure Portal or:

```bash
az webapp restart --name <your-app-name> --resource-group <your-rg>
```

---

## Appendix — Local Development

For running the app on your laptop (not production):

```bash
docker build -t bci-dashboard .
docker run -p 8000:8000 --env-file backend/.env bci-dashboard
```

Open `http://localhost:8000`.

For frontend hot-reload (React/Vite dev server):

```bash
npm install
npm run dev
```

Set `FRONTEND_URL=http://localhost:5173` and `APP_ENV=development` in `backend/.env` for local dev. Use `/auth/dev-login` to log in without Zscaler.
