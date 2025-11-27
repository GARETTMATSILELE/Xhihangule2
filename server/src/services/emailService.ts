// Optional mailer: avoid hard dependency on nodemailer at build time
// If nodemailer isn't installed or configured, we fallback to console logging
let nodemailer: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  nodemailer = require('nodemailer');
} catch {
  nodemailer = null;
}

interface SendMailParams {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

let transporter: any | null = null;

function getActiveBrandKey(): 'XHI' | 'MANTIS' {
  const forced = (process.env.BRAND_ACTIVE || '').toUpperCase();
  if (forced === 'MANTIS') return 'MANTIS';
  if (forced === 'XHI') return 'XHI';
  const cutoff = process.env.BRAND_CUTOFF_ISO;
  if (cutoff) {
    const now = new Date();
    const cut = new Date(cutoff);
    if (!isNaN(cut.getTime()) && now >= cut) {
      return 'MANTIS';
    }
  }
  return 'XHI';
}

function getEnvByBrand(base: string, brand: 'XHI' | 'MANTIS'): string | undefined {
  const byBrand = process.env[`${base}_${brand}`];
  return byBrand !== undefined ? byBrand : process.env[base];
}

function getTransporter(): any | null {
  if (transporter !== null) return transporter;
  const brand = getActiveBrandKey();
  const host = getEnvByBrand('SMTP_HOST', brand);
  const portStr = getEnvByBrand('SMTP_PORT', brand);
  const port = portStr ? Number(portStr) : undefined;
  const user = getEnvByBrand('SMTP_USER', brand);
  const pass = getEnvByBrand('SMTP_PASS', brand);
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

function parseFromHeaderForBrand(): { email: string; name?: string } {
  const brand = getActiveBrandKey();
  // Prefer explicit Mailtrap FROM for brand
  const explicitEmail = getEnvByBrand('MAILTRAP_FROM_EMAIL', brand);
  const explicitName = getEnvByBrand('MAILTRAP_FROM_NAME', brand);
  if (explicitEmail) {
    return { email: explicitEmail, name: explicitName || undefined };
  }
  // Parse brand-specific SMTP_FROM like "Name <email@domain>"
  const fromEnv = getEnvByBrand('SMTP_FROM', brand) || '';

  const match = fromEnv.match(/^(.*)<(.+)>/);
  if (match) {
    const name = String(match[1] || '').trim().replace(/^"|"$/g, '');
    const email = String(match[2] || '').trim();
    if (email) return { email, name: name || undefined };
  }

  // Fallbacks
  const possibleEmail = getEnvByBrand('SMTP_USER', brand);
  if (possibleEmail && possibleEmail.includes('@')) {
    return { email: possibleEmail, name: undefined };
  }

  // Mailtrap demo sender as last resort (works for Send API demos)
  return { email: 'hello@demomailtrap.co', name: 'Mailtrap Test' };
}

async function sendViaMailtrapApi(params: SendMailParams): Promise<boolean> {
  const brand = getActiveBrandKey();
  const token = getEnvByBrand('MAILTRAP_API_TOKEN', brand);
  if (!token) return false;

  const from = parseFromHeaderForBrand();
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
  const brand = getActiveBrandKey();
  const key = getEnvByBrand('RESEND_API_KEY', brand);
  if (!key) return false;
  const from = parseFromHeaderForBrand();
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
  const brand = getActiveBrandKey();
  const key = getEnvByBrand('SENDGRID_API_KEY', brand);
  if (!key) return false;
  const from = parseFromHeaderForBrand();
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
  const brand = getActiveBrandKey();
  const key = getEnvByBrand('MAILGUN_API_KEY', brand);
  const domain = getEnvByBrand('MAILGUN_DOMAIN', brand);
  if (!key || !domain) return false;
  const apiBase = getEnvByBrand('MAILGUN_API_BASE', brand) || 'https://api.mailgun.net/v3';
  const from = parseFromHeaderForBrand();
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
      console.log('[emailService] SMTP/API not configured. Would send email:', {
        to: params.to,
        subject: params.subject,
        text: params.text,
        html: params.html
      });
    }
    return;
  }
  try {
    await tx.sendMail({
      from: getEnvByBrand('SMTP_FROM', getActiveBrandKey()) || getEnvByBrand('SMTP_USER', getActiveBrandKey()),
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



