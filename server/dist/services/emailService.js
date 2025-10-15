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
function getTransporter() {
    if (transporter !== null)
        return transporter;
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
function sendMail(params) {
    return __awaiter(this, void 0, void 0, function* () {
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
        yield tx.sendMail({
            from: process.env.SMTP_FROM || process.env.SMTP_USER,
            to: params.to,
            subject: params.subject,
            text: params.text,
            html: params.html
        });
    });
}
