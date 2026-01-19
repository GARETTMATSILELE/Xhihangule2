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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const emailService_1 = require("../services/emailService");
const router = express_1.default.Router();
// Lightweight diagnostics: email configuration
router.get('/email-config', (_req, res) => {
    const status = (0, emailService_1.getEmailConfigStatus)();
    // Redact potentially sensitive details (e.g., SMTP user) if in production
    const isProd = process.env.NODE_ENV === 'production';
    const redacted = Object.assign(Object.assign({}, status), { smtp: {
            host: status.smtp.host,
            port: status.smtp.port,
            user: isProd ? (status.smtp.user ? '[redacted]' : undefined) : status.smtp.user
        } });
    res.json({
        ok: true,
        brand: 'MANTIS',
        email: redacted
    });
});
// Send a test email (diagnostics). Requires EXPOSE_DIAGNOSTICS=true in production.
router.post('/email-send-test', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { to } = req.body;
        if (!to) {
            return res.status(400).json({ ok: false, error: 'Missing "to" email' });
        }
        yield (0, emailService_1.sendMail)({
            to,
            subject: 'Mantis Africa - SMTP Test',
            html: '<p>This is a SMTP test email from Mantis Africa.</p>',
            text: 'This is a SMTP test email from Mantis Africa.'
        });
        res.json({ ok: true });
    }
    catch (e) {
        const isProd = process.env.NODE_ENV === 'production';
        res.status(500).json({ ok: false, error: isProd ? '[redacted]' : ((e === null || e === void 0 ? void 0 : e.message) || String(e)) });
    }
}));
// SMTP live verification (attempts transporter.verify())
router.get('/email-smtp-verify', (_req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const verify = yield (0, emailService_1.verifySmtpConnection)();
    const status = (0, emailService_1.getEmailConfigStatus)();
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
}));
exports.default = router;
