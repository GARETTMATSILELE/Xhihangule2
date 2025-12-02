## Production Email Setup

To send password reset emails in production, configure ONE of the supported mail providers (SMTP, Resend, SendGrid, or Mailgun). The backend will try them in this order:

1) SMTP (Nodemailer)
2) Resend API
3) SendGrid API
4) Mailgun API
5) Mailtrap Send API (testing only)

Set the environment variables on the server and restart the app.

Required
- APP_BASE_URL=https://www.xhihangule.com
- CLIENT_URL=https://www.xhihangule.com

 Option A — SMTP (Mailtrap testing)
 - SMTP_HOST=sandbox.smtp.mailtrap.io
 - SMTP_PORT=587 (or 465)
 - SMTP_USER=<YOUR_MAILTRAP_SMTP_USERNAME>
 - SMTP_PASS=<YOUR_MAILTRAP_SMTP_PASSWORD>
 - SMTP_FROM="Xhihangule <no-reply@xhihangule.com>"

 Option B — Resend (production delivery)
 - RESEND_API_KEY=<YOUR_RESEND_API_KEY>
 - SMTP_FROM="Xhihangule <no-reply@xhihangule.com>"  (used to build the From header)

 Option C — SendGrid (production delivery)
 - SENDGRID_API_KEY=<YOUR_SENDGRID_API_KEY>
 - SMTP_FROM="Xhihangule <no-reply@xhihangule.com>"  (From must be a verified sender)

 Option D — Mailgun (production delivery)
 - MAILGUN_API_KEY=<YOUR_MAILGUN_API_KEY>
 - MAILGUN_DOMAIN=mg.your-domain.com
 - SMTP_FROM="Xhihangule <no-reply@xhihangule.com>"

 Option E — Mailtrap Email Sending (production delivery via Mailtrap Send API)
 - MAILTRAP_API_TOKEN=<YOUR_MAILTRAP_SEND_API_TOKEN>
 - MAILTRAP_FROM_EMAIL=no-reply@xhihangule.com   (must be verified under your Mailtrap Sending domain)
 - MAILTRAP_FROM_NAME=Xhihangule

Notes
- If you operate with multiple brands, you can suffix vars with _XHI (and set BRAND_ACTIVE=XHI). The backend will prefer brand-suffixed vars, e.g. SMTP_HOST_XHI.
- If none of the providers are configured, the server logs a message and does not send email.
- For correct https links in emails behind a reverse proxy, we set trust proxy and recommend APP_BASE_URL.
 - Provider priority is SMTP → Resend → SendGrid → Mailgun → Mailtrap. If you want to use Mailtrap production sending, avoid setting SMTP/Resend/SendGrid/Mailgun vars so the Mailtrap API is selected.
 - For Mailtrap production delivery, verify your domain and the sender in Mailtrap’s “Email Sending” and use a From address on that domain.


