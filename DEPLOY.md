# Deployment Guide — Technology Showback Dashboard

## Prerequisites

- Docker Desktop (or Azure CLI with ACR access) installed on the deployment machine
- Git access to this repository (ask the repo owner to add you as a collaborator on GitHub)
- The `.env` file — this is **never committed to git** and must be shared out-of-band by the security team

---

## 1. Get the Code

```bash
git clone https://github.com/<org>/dashboard.git
cd dashboard
```

For subsequent updates:

```bash
git pull origin master
```

---

## 2. Set Up the `.env` File

The template is at **`backend/.env.example`**. Copy it and rename the copy to `backend/.env`:

```bash
cp backend/.env.example backend/.env
```

Fill in each section. The table below shows who owns what:

| Section | Who fills it | Production requirement |
|---|---|---|
| Section 1 — Azure AD credentials | Security team | Optional — BCI uses Zscaler (Section 1b) instead |
| Section 1b — Zscaler (`TRUST_ZSCALER_HEADERS`, `ZSCALER_USER_HEADER`) | Security team | **Required** — set `TRUST_ZSCALER_HEADERS=true` |
| Section 2 — JWT + Session secrets (`JWT_SECRET_KEY`, `SESSION_SECRET`) | Security team | **Required** — generate new values; do not reuse dev values |
| Section 3 — App settings (`APP_ENV`, `FRONTEND_URL`, `ALLOWED_ORIGINS`) | Infrastructure team | **Required** — set `APP_ENV=production` and replace all `localhost` URLs with the production host |
| Section 4 — Database (`DATABASE_URL`) | Infrastructure team | **Required** — switch from SQLite to PostgreSQL (see warning below) |
| Section 5 — Azure Blob Storage | Infrastructure team | **Required** — without this, all uploaded cost data is wiped on every restart or redeploy |
| Section 6 — Azure Key Vault | Security team | Recommended for production secrets management |
| Section 7 — SMTP / Email (`SMTP_USER`, `SMTP_PASSWORD`) | IT team | Optional — enables the Admin → Share tab to email reports |

### Production URL changes (Section 3)

Replace every `localhost` reference with the production host:

```
APP_ENV=production
FRONTEND_URL=https://<your-app>.azurewebsites.net
ALLOWED_ORIGINS=https://<your-app>.azurewebsites.net
AZURE_REDIRECT_URI=https://<your-app>.azurewebsites.net/auth/callback
```

### Database warning (Section 4)

> **Do not use SQLite in production.** The default `sqlite:///./data/app.db` is stored inside the container. Every restart or redeploy wipes it — all user accounts and access logs are lost. Switch to PostgreSQL before go-live.

```
# Comment out the SQLite line and uncomment this:
DATABASE_URL=postgresql://username:password@hostname.postgres.database.azure.com:5432/dbname
```

Get the connection string from: Azure Portal → Azure Database for PostgreSQL → [your server] → Connection strings.

### Blob Storage warning (Section 5)

> **Without Blob Storage, uploaded cost data does not persist.** Every time the container restarts, the dashboard will be empty until someone re-uploads the workbook. Set `STORAGE_BACKEND=azure` and fill in `AZURE_STORAGE_CONNECTION_STRING` before go-live.

---

## 3. Local Development (Docker)

Build and run:

```bash
docker build -t bci-dashboard .
docker run -p 8000:8000 --env-file backend/.env bci-dashboard
```

The app is available at `http://localhost:8000`.

For hot-reload frontend development (optional):

```bash
npm install
npm run dev
# Set FRONTEND_URL=http://localhost:5173 in backend/.env
```

---

## 4. Production Deployment — Azure App Service

### 4a. Build and push to Azure Container Registry (one command)

```bash
az acr build --registry <your-acr-name> --image showback-dashboard:latest .
```

This builds and pushes in one step — no local Docker required.

For subsequent deployments, re-run this command only. The container restarts automatically.

### 4b. Point App Service at the image (run once)

```bash
az webapp config container set \
  --name <your-app-name> \
  --resource-group <your-rg> \
  --docker-custom-image-name <your-acr-name>.azurecr.io/showback-dashboard:latest
```

### 4c. Set Application Settings

Azure Portal → App Services → [your app] → Configuration → **Application Settings**

Add every key from `backend/.env` as an Application Setting. Do not upload the `.env` file itself.

Minimum required settings:

```
APP_ENV=production
TRUST_ZSCALER_HEADERS=true
FRONTEND_URL=https://<your-app>.azurewebsites.net
ALLOWED_ORIGINS=https://<your-app>.azurewebsites.net
JWT_SECRET_KEY=<generated value>
SESSION_SECRET=<generated value>
DATABASE_URL=postgresql://...
STORAGE_BACKEND=azure
AZURE_STORAGE_CONNECTION_STRING=...
```

### 4d. Startup command

Under **General Settings**, set the startup command to:

```
bash /home/site/wwwroot/startup.sh
```

### 4e. Azure AD redirect URI

If using Microsoft OAuth (fallback to Section 1), register the production redirect URI in the Azure AD app registration:

Azure Portal → Microsoft Entra ID → App registrations → [your app] → Authentication → Add a redirect URI:

```
https://<your-app>.azurewebsites.net/auth/callback
```

---

## 5. First-Run Setup — Create the Admin User

After the container is live, create the first admin account via SSH into the App Service:

```bash
az webapp ssh --name <your-app-name> --resource-group <your-rg>
cd /app/backend
python init_admin.py admin@bci.ca
```

Replace `admin@bci.ca` with the admin's actual BCI email address. After this, the admin can log in via Zscaler SSO and use the **Admin** tab to create other users and assign department permissions.

> Note: `/auth/dev-login` is disabled in production (`APP_ENV=production`). Do not use it to create the first admin.

---

## 6. Updating a Running Deployment

```bash
git pull origin master
az acr build --registry <your-acr-name> --image showback-dashboard:latest .
```

The App Service picks up the new image automatically. If it doesn't restart within a few minutes, trigger a restart manually from the Azure Portal.

---

## 7. User Permissions

Once logged in as admin:

1. Navigate to the **Admin** tab
2. Create user accounts (BCI email address required — must match what Zscaler passes in the identity header)
3. Set `allowed_departments`:
   - Leave empty → full access (Technology team, admins)
   - Set to specific departments (e.g. `Finance`) → restricted view showing only that department's data
