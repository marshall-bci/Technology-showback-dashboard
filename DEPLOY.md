# Deployment Guide — Technology Showback Dashboard

## Prerequisites

- Docker Desktop installed on the deployment machine
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

Copy `.env.example` to `.env` and fill in each section. The table below shows who owns each section:

| Section | Who fills it |
|---|---|
| Section 1 — Azure AD credentials (`AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`, `AZURE_REDIRECT_URI`) | Security team / Azure AD administrator |
| Section 1b — Zscaler Private Access (`TRUST_ZSCALER_HEADERS`, `ZSCALER_USER_HEADER`) | Security team |
| Section 2 — JWT + Session secrets (`JWT_SECRET_KEY`, `SESSION_SECRET`) | Already generated in `.env.example` — copy as-is for dev; generate new values for production |
| Section 3 — App settings (`APP_ENV`, `FRONTEND_URL`, `ALLOWED_ORIGINS`) | Deployer — set `APP_ENV=production` and update URLs for the production host |
| Section 4 — Database (`DATABASE_URL`) | SQLite is the default and works locally; switch to PostgreSQL for Azure production |
| Section 5 — Azure Blob Storage | Data management team — leave commented out for local dev |
| Section 6 — Azure Key Vault | Security team — leave commented out for local dev |

---

## 3. Local Development (Docker)

Build the image:

```bash
docker build -t bci-dashboard .
```

Run locally:

```bash
docker run -p 8000:8000 --env-file .env bci-dashboard
```

The app is available at `http://localhost:8000`.

To run the frontend dev server separately (hot-reload during development):

```bash
npm install
npm run dev
```

The Vite dev server starts at `http://localhost:5173`. Set `FRONTEND_URL=http://localhost:5173` in `.env`.

---

## 4. Production Deployment — Azure App Service

### 4a. Push the image to Azure Container Registry

```bash
az acr login --name <your-registry>
docker build -t <your-registry>.azurecr.io/bci-dashboard:latest .
docker push <your-registry>.azurecr.io/bci-dashboard:latest
```

### 4b. Configure App Service

1. Azure Portal → App Services → [your app] → Deployment Center
2. Set source to **Azure Container Registry**, select your image and tag
3. Azure Portal → [your app] → Configuration → **Application Settings**
4. Add every key from your `.env` file as an Application Setting (do not upload the `.env` file itself)
5. Set `APP_ENV=production` and update `FRONTEND_URL` and `ALLOWED_ORIGINS` to your App Service URL
6. Under **General Settings**, set the startup command to:
   ```
   bash /home/site/wwwroot/startup.sh
   ```
   (This is already in `startup.sh` and runs `uvicorn main:app --host 0.0.0.0 --port 8000 --workers 1`)

### 4c. HTTPS and redirect URI

Ensure the Azure AD app registration has the production redirect URI registered:

```
https://<your-app>.azurewebsites.net/auth/callback
```

Match this exactly in the `AZURE_REDIRECT_URI` Application Setting.

---

## 5. Updating a Running Deployment

```bash
git pull origin master
docker build -t <your-registry>.azurecr.io/bci-dashboard:latest .
docker push <your-registry>.azurecr.io/bci-dashboard:latest
```

Then in Azure Portal → App Service → restart the app, or trigger a new deployment from the Deployment Center.

---

## 6. First-Run Setup (Users and Permissions)

After the app is running, an admin must:

1. Log in at `/auth/dev-login` (development) or via Microsoft SSO (production)
2. Navigate to the **Admin** tab
3. Create user accounts and assign department permissions

Users with `allowed_departments` set to specific departments will see a restricted view (their department's data only, no Direct Chargeback rows). Leave `allowed_departments` empty to grant full access.
