"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendMail = sendMail;
// Optional mailer: avoid hard dependency on nodemailer at build time
// If nodemailer isn't installed or configured, we fallback to console logging
let nodemailer = null;
try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    nodemailer = require('nodemailer');
}
catch (_a) {
    nodemailer = null;
}
let transporter = null;
function getActiveBrandKey() {
    const forced = (process.env.BRAND_ACTIVE || '').toUpperCase();
    if (forced === 'MANTIS')
        return 'MANTIS';
    if (forced === 'XHI')
        return 'XHI';
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
function getEnvByBrand(base, brand) {
    const byBrand = process.env[`${base}_${brand}`];
    return byBrand !== undefined ? byBrand : process.env[base];
}
function getTransporter() {
    if (transporter !== null)
        return transporter;
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
function parseFromHeaderForBrand() {
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
        if (email)
            return { email, name: name || undefined };
    }
    // Fallbacks
    const possibleEmail = getEnvByBrand('SMTP_USER', brand);
    if (possibleEmail && possibleEmail.includes('@')) {
        return { email: possibleEmail, name: undefined };
    }
    // Mailtrap demo sender as last resort (works for Send API demos)
    return { email: 'hello@demomailtrap.co', name: 'Mailtrap Test' };
}
function sendViaMailtrapApi(params) {
    return __awaiter(this, void 0, void 0, function* () {
        const brand = getActiveBrandKey();
        const token = getEnvByBrand('MAILTRAP_API_TOKEN', brand);
        if (!token)
            return false;
        const from = parseFromHeaderForBrand();
        try {
            const res = yield fetch('https://send.api.mailtrap.io/api/send', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    from: Object.assign({ email: from.email }, (from.name ? { name: from.name } : {})),
                    to: [{ email: params.to }],
                    subject: params.subject,
                    text: params.text || '',
                    html: params.html,
                    category: 'App Notification'
                })
            });
            if (!res.ok) {
                const text = yield res.text().catch(() => '');
                console.error('[emailService] Mailtrap Send API error:', res.status, text);
                return false;
            }
            return true;
        }
        catch (err) {
            console.error('[emailService] Mailtrap Send API request failed:', err);
            return false;
        }
    });
}
function sendMail(params) {
    return __awaiter(this, void 0, void 0, function* () {
        const tx = getTransporter();
        if (!tx) {
            // Try Mailtrap Send API as a fallback when SMTP isn't configured
            const sentViaApi = yield sendViaMailtrapApi(params);
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
            yield tx.sendMail({
                from: getEnvByBrand('SMTP_FROM', getActiveBrandKey()) || getEnvByBrand('SMTP_USER', getActiveBrandKey()),
                to: params.to,
                subject: params.subject,
                text: params.text,
                html: params.html
            });
        }
        catch (err) {
            // If SMTP auth fails (e.g., 535) or any SMTP error occurs, try API fallback
            const message = (err && (err.message || err.toString())) || 'SMTP send failed';
            console.error('[emailService] SMTP send failed, attempting API fallback:', message);
            const sentViaApi = yield sendViaMailtrapApi(params);
            if (sentViaApi) {
                console.warn('[emailService] Email sent via Mailtrap API fallback after SMTP failure');
                return;
            }
            throw err;
        }
    });
}
