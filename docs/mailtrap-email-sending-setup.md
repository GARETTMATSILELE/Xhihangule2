## Mailtrap Email Sending (Live) — Production SMTP Setup

Use this guide to enable real password reset emails via Mailtrap Email Sending using SMTP.

### 1) Verify a sending domain in Mailtrap
- In Mailtrap, go to Email Sending → Domains → Add domain.
- Follow the DNS steps to verify the domain you will send from (e.g., `mantisafrica.com`).
- Once verified, ensure the From address you plan to use belongs to that domain (e.g., `no-reply@mantisafrica.com`).  

### 2) Get your SMTP credentials
- Mailtrap Email Sending (live):  
  - Host: `live.smtp.mailtrap.io`  
  - Port: `587` (STARTTLS) or `465` (TLS)  
  - Username: `apismtp@mailtrap.io`  
  - Password: `<YOUR_API_TOKEN>` (Mailtrap API token)

Optional: You can also use the same API token for Mailtrap's Send API fallback by setting `MAILTRAP_API_TOKEN`.

### 3) Configure environment variables on the server
Create or update your production environment file (for example `.env.production`):

```env
# Core app URLs
APP_BASE_URL=https://www.mantisafrica.com
CLIENT_URL=https://www.mantisafrica.com

# Mailtrap Email Sending (SMTP)
SMTP_HOST=live.smtp.mailtrap.io
SMTP_PORT=587
SMTP_USER=apismtp@mailtrap.io
SMTP_PASS=<YOUR_API_TOKEN>

# From header (used for SMTP and to build sender for API fallbacks)
# Must be a verified sender under your Mailtrap sending domain
SMTP_FROM="Mantis Africa <no-reply@mantisafrica.com>"

# Optional: Mailtrap Send API (fallback if SMTP unavailable)
MAILTRAP_API_TOKEN=<YOUR_API_TOKEN>
MAILTRAP_FROM_EMAIL=no-reply@mantisafrica.com
MAILTRAP_FROM_NAME=Mantis Africa

# Single brand: Mantis Africa (multi-brand/XHI is not supported)
```

Notes:
- `APP_BASE_URL` is used to generate the reset link in emails. It should point to your client app and include HTTPS in production.
- `CLIENT_URL` must be included in the backend CORS allowlist.
- If no provider is configured, the backend will log a “would send email” message instead of sending.

### 4) Restart the backend
Rebuild and restart the server so it picks up the new environment variables.

### 5) Test the flow
- Go to `/forgot-password` in your app and submit a real user’s email.
- Check Mailtrap Email Sending logs or the recipient’s inbox.
- The reset link will be: `APP_BASE_URL/reset-password?token=...&email=...`

### Security hardening included
- Forgot/reset endpoints are rate-limited in production.
- Password reset now invalidates existing access/refresh tokens by tracking `passwordChangedAt`.


