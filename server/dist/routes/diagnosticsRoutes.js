"use strict";
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
exports.default = router;
