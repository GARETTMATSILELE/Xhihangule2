import express from 'express';
import { getEmailConfigStatus, verifySmtpConnection, sendMail } from '../services/emailService';

const router = express.Router();

// Lightweight diagnostics: email configuration
router.get('/email-config', (_req, res) => {
  const status = getEmailConfigStatus();
  // Redact potentially sensitive details (e.g., SMTP user) if in production
  const isProd = process.env.NODE_ENV === 'production';
  const redacted = {
    ...status,
    smtp: {
      host: status.smtp.host,
      port: status.smtp.port,
      user: isProd ? (status.smtp.user ? '[redacted]' : undefined) : status.smtp.user
    }
  };
  res.json({
    ok: true,
    brand: 'MANTIS',
    email: redacted
  });
});

// Send a test email (diagnostics). Requires EXPOSE_DIAGNOSTICS=true in production.
router.post('/email-send-test', async (req, res) => {
  try {
    const { to } = req.body as { to?: string };
    if (!to) {
      return res.status(400).json({ ok: false, error: 'Missing "to" email' });
    }
    await sendMail({
      to,
      subject: 'Mantis Africa - SMTP Test',
      html: '<p>This is a SMTP test email from Mantis Africa.</p>',
      text: 'This is a SMTP test email from Mantis Africa.'
    });
    res.json({ ok: true });
  } catch (e: any) {
    const isProd = process.env.NODE_ENV === 'production';
    res.status(500).json({ ok: false, error: isProd ? '[redacted]' : (e?.message || String(e)) });
  }
});

// SMTP live verification (attempts transporter.verify())
router.get('/email-smtp-verify', async (_req, res) => {
  const verify = await verifySmtpConnection();
  const status = getEmailConfigStatus();
  const isProd = process.env.NODE_ENV === 'production';
  res.json({
    ok: true,
    brand: 'MANTIS',
    smtp: {
      host: status.smtp.host,
      port: status.smtp.port,
      configured: verify.configured,
      verified: verify.verified,
      error: isProd ? (verify.verified ? undefined : '[redacted]') : verify.error
    }
  });
});

export default router;

