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

Option A — SMTP
- SMTP_HOST=your.smtp.host
- SMTP_PORT=587 (or 465)
- SMTP_USER=smtp@mailtrap.io
- SMTP_PASS=b8037a4a2145221d064e6bca15d4bf2f
- SMTP_FROM="Your App <www.xhihangule.com>"

Option B — Resend
- RESEND_API_KEY=your_resend_api_key
- SMTP_FROM="Your App <www.xhihangule.com>"  (used to build the From header)

Option C — SendGrid
- SENDGRID_API_KEY=your_sendgrid_api_key
- SMTP_FROM="Your App <www.xhihangule.com>"  (From must be a verified sender)

Option D — Mailgun
- MAILGUN_API_KEY=your_mailgun_api_key
- MAILGUN_DOMAIN=mg.your-domain.com
- SMTP_FROM="Your App <www.xhihangule.com>"

Notes
- If you operate with multiple brands, you can suffix vars with _XHI (and set BRAND_ACTIVE=XHI). The backend will prefer brand-suffixed vars, e.g. SMTP_HOST_XHI.
- If none of the providers are configured, the server logs a message and does not send email.
- For correct https links in emails behind a reverse proxy, we set trust proxy and recommend APP_BASE_URL.


