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

function getTransporter(): any | null {
  if (transporter !== null) return transporter;
  const host = process.env.SMTP_HOST;
  const port = process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : undefined;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
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

export async function sendMail(params: SendMailParams): Promise<void> {
  const tx = getTransporter();
  if (!tx) {
    console.log('[emailService] SMTP not configured. Would send email:', {
      to: params.to,
      subject: params.subject,
      text: params.text,
      html: params.html
    });
    return;
  }
  await tx.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to: params.to,
    subject: params.subject,
    text: params.text,
    html: params.html
  });
}



