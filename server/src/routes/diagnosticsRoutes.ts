import express from 'express';
import { getEmailConfigStatus } from '../services/emailService';

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

export default router;

