## Mailtrap Setup (Email Testing in Development)

Use Mailtrap to capture outgoing emails (like password reset) in development without sending real emails.

### 1) Install mailer dependency

```bash
cd server
npm i nodemailer --save
```

### 2) Get your Mailtrap SMTP credentials

- Create an account at https://mailtrap.io
- Go to Email Testing → Inboxes → select (or create) an inbox
- Click "SMTP Settings" and copy:
  - host: `sandbox.smtp.mailtrap.io`
  - port: `587` (or `2525`)
  - username
  - password

### 3) Configure environment variables (server)

Create `server/.env` (do not commit it) with:

```env
NODE_ENV=development
PORT=5000

MONGODB_URI=mongodb://localhost:27017/property-management
JWT_SECRET=replace_with_a_secure_random_string

APP_BASE_URL=http://localhost:3000

SMTP_HOST=sandbox.smtp.mailtrap.io
SMTP_PORT=587
SMTP_USER=YOUR_MAILTRAP_USERNAME
SMTP_PASS=YOUR_MAILTRAP_PASSWORD
SMTP_FROM="Mantis Africa <no-reply@mantisafrica.local>"
```

Note: This project reads `SMTP_*` variables in `server/src/services/emailService.ts` and uses Nodemailer to send email via Mailtrap.

### 4) Restart backend

```bash
cd server
npm run dev
```

### 5) Test the flow

- In the app, go to `/login` → click "Forgot your password?"
- Enter an email and submit
- Check your Mailtrap inbox for the reset email
- The link points to `APP_BASE_URL/reset-password?token=...&email=...`

If SMTP is not configured, the server logs a message like:
`[emailService] SMTP not configured. Would send email: { ... }`


