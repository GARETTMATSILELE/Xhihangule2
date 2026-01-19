// Optional mailer: avoid hard dependency on nodemailer at build time
// If nodemailer isn't installed or configured, we fallback to console logging
let nodemailer: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  nodemailer = require('nodemailer');
} catch {
  nodemailer = null;
}

import { AppError } from '../middleware/errorHandler';

interface SendMailParams {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

let transporter: any | null = null;

// Single-brand (Mantis) environment reader. Prefers unsuffixed, then *_MANTIS.
function getEnv(base: string): string | undefined {
  const direct = process.env[base];
  if (direct !== undefined) return direct;
  return process.env[`${base}_MANTIS`];
}

function getTransporter(): any | null {
  if (transporter !== null) return transporter;
  const host = getEnv('SMTP_HOST');
  const portStr = getEnv('SMTP_PORT');
  const port = portStr ? Number(portStr) : undefined;
  const user = getEnv('SMTP_USER');
  const pass = getEnv('SMTP_PASS');
  if (!host || !port || !user || !pass) {
    // No SMTP configured; fall back to console logging
    return null;
  }
  if (!nodemailer) {
    // nodemailer not available; fall back to console logging
    return null;
  }
  transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass }
  });
  return transporter;
}

function parseFromHeader(): { email: string; name?: string } {
  // Prefer explicit Mailtrap FROM for brand
  const explicitEmail = getEnv('MAILTRAP_FROM_EMAIL');
  const explicitName = getEnv('MAILTRAP_FROM_NAME');
  if (explicitEmail) {
    return { email: explicitEmail, name: explicitName || undefined };
  }
  // Parse brand-specific SMTP_FROM like "Name <email@domain>"
  const fromEnv = getEnv('SMTP_FROM') || '';

  const match = fromEnv.match(/^(.*)<(.+)>/);
  if (match) {
    const name = String(match[1] || '').trim().replace(/^"|"$/g, '');
    const email = String(match[2] || '').trim();
    if (email) return { email, name: name || undefined };
  }

  // Fallbacks
  const possibleEmail = getEnv('SMTP_USER');
  if (possibleEmail && possibleEmail.includes('@')) {
    return { email: possibleEmail, name: undefined };
  }

  // Mailtrap demo sender as last resort (works for Send API demos)
  return { email: 'hello@demomailtrap.co', name: 'Mailtrap Test' };
}

export function getEmailConfigStatus(): {
  brand: 'MANTIS';
  from: { email: string; name?: string };
  smtpConfigured: boolean;
  smtp: { host?: string; port?: number; user?: string };
  apiProvidersConfigured: { resend: boolean; sendgrid: boolean; mailgun: boolean; mailtrapApi: boolean };
  anyProviderConfigured: boolean;
  strict: boolean;
} {
  const smtpHost = getEnv('SMTP_HOST');
  const smtpPort = getEnv('SMTP_PORT');
  const smtpUser = getEnv('SMTP_USER');
  const smtpPass = getEnv('SMTP_PASS');
  const smtpConfigured = Boolean(smtpHost && smtpPort && smtpUser && smtpPass);

  const resend = Boolean(getEnv('RESEND_API_KEY'));
  const sendgrid = Boolean(getEnv('SENDGRID_API_KEY'));
  const mailgun = Boolean(getEnv('MAILGUN_API_KEY') && getEnv('MAILGUN_DOMAIN'));
  const mailtrapApi = Boolean(getEnv('MAILTRAP_API_TOKEN'));

  const fromParsed = parseFromHeader();
  const strict = String(process.env.EMAIL_STRICT || process.env.EMAIL_REQUIRE_PROVIDER || '').toLowerCase() === 'true';

  return {
    brand: 'MANTIS',
    from: fromParsed,
    smtpConfigured,
    smtp: {
      host: smtpHost || undefined,
      port: smtpPort ? Number(smtpPort) : undefined,
      user: smtpUser || undefined
    },
    apiProvidersConfigured: { resend, sendgrid, mailgun, mailtrapApi },
    anyProviderConfigured: smtpConfigured || resend || sendgrid || mailgun || mailtrapApi,
    strict
  };
}

async function sendViaMailtrapApi(params: SendMailParams): Promise<boolean> {
  const token = getEnv('MAILTRAP_API_TOKEN');
  if (!token) return false;

  const from = parseFromHeader();
  try {
    const res = await fetch('https://send.api.mailtrap.io/api/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: { email: from.email, ...(from.name ? { name: from.name } : {}) },
        to: [{ email: params.to }],
        subject: params.subject,
        text: params.text || '',
        html: params.html,
        category: 'App Notification'
      })
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.error('[emailService] Mailtrap Send API error:', res.status, text);
      return false;
    }
    return true;
  } catch (err) {
    console.error('[emailService] Mailtrap Send API request failed:', err);
    return false;
  }
}

async function sendViaResendApi(params: SendMailParams): Promise<boolean> {
  const key = getEnv('RESEND_API_KEY');
  if (!key) return false;
  const from = parseFromHeader();
  const fromHeader = from.name ? `${from.name} <${from.email}>` : from.email;
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: fromHeader,
        to: [params.to],
        subject: params.subject,
        html: params.html,
        text: params.text || ''
      })
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.error('[emailService] Resend API error:', res.status, text);
      return false;
    }
    return true;
  } catch (err) {
    console.error('[emailService] Resend API request failed:', err);
    return false;
  }
}

async function sendViaSendgridApi(params: SendMailParams): Promise<boolean> {
  const key = getEnv('SENDGRID_API_KEY');
  if (!key) return false;
  const from = parseFromHeader();
  try {
    const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: params.to }] }],
        from: { email: from.email, ...(from.name ? { name: from.name } : {}) },
        subject: params.subject,
        content: [
          { type: 'text/plain', value: params.text || '' },
          { type: 'text/html', value: params.html }
        ]
      })
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.error('[emailService] SendGrid API error:', res.status, text);
      return false;
    }
    return true;
  } catch (err) {
    console.error('[emailService] SendGrid API request failed:', err);
    return false;
  }
}

async function sendViaMailgunApi(params: SendMailParams): Promise<boolean> {
  const key = getEnv('MAILGUN_API_KEY');
  const domain = getEnv('MAILGUN_DOMAIN');
  if (!key || !domain) return false;
  const apiBase = getEnv('MAILGUN_API_BASE') || 'https://api.mailgun.net/v3';
  const from = parseFromHeader();
  try {
    const body = new URLSearchParams();
    body.set('from', from.name ? `${from.name} <${from.email}>` : from.email);
    body.set('to', params.to);
    body.set('subject', params.subject);
    if (params.text) body.set('text', params.text);
    body.set('html', params.html);
    const res = await fetch(`${apiBase}/${domain}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${Buffer.from(`api:${key}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.error('[emailService] Mailgun API error:', res.status, text);
      return false;
    }
    return true;
  } catch (err) {
    console.error('[emailService] Mailgun API request failed:', err);
    return false;
  }
}

async function tryApiFallbacks(params: SendMailParams): Promise<boolean> {
  // Try common production providers first, then dev/testing Mailtrap
  if (await sendViaResendApi(params)) return true;
  if (await sendViaSendgridApi(params)) return true;
  if (await sendViaMailgunApi(params)) return true;
  if (await sendViaMailtrapApi(params)) return true;
  return false;
}

export async function sendMail(params: SendMailParams): Promise<void> {
  const tx = getTransporter();
  if (!tx) {
    // Try API-based providers when SMTP isn't configured
    const sentViaApi = await tryApiFallbacks(params);
    if (!sentViaApi) {
      const strict = String(process.env.EMAIL_STRICT || process.env.EMAIL_REQUIRE_PROVIDER || '').toLowerCase() === 'true';
      if (strict) {
        const status = getEmailConfigStatus();
        throw new AppError('Email sending is not configured', 500, 'EMAIL_NOT_CONFIGURED', status);
      } else {
        console.log('[emailService] SMTP/API not configured. Would send email:', {
          to: params.to,
          subject: params.subject,
          text: params.text,
          html: params.html
        });
      }
    }
    return;
  }
  try {
    const fromParsed = parseFromHeader();
    const fromHeader = fromParsed.name ? `${fromParsed.name} <${fromParsed.email}>` : fromParsed.email;
    await tx.sendMail({
      from: fromHeader,
      to: params.to,
      subject: params.subject,
      text: params.text,
      html: params.html
    });
  } catch (err: any) {
    // If SMTP fails, try API-based fallbacks
    const message = (err && (err.message || err.toString())) || 'SMTP send failed';
    console.error('[emailService] SMTP send failed, attempting API fallback(s):', message);
    const sentViaApi = await tryApiFallbacks(params);
    if (sentViaApi) return;
    throw err;
  }
}



