"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
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
exports.Notification = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const User_1 = require("./User");
const emailService_1 = require("../services/emailService");
const NotificationSchema = new mongoose_1.Schema({
    companyId: { type: String, required: true, index: true },
    userId: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    title: { type: String, required: true },
    message: { type: String, required: true },
    link: { type: String },
    read: { type: Boolean, default: false },
    payload: { type: mongoose_1.Schema.Types.Mixed }
}, { timestamps: true });
NotificationSchema.index({ companyId: 1, userId: 1, createdAt: -1 });
function sendNotificationEmail(doc) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const user = yield User_1.User.findById(doc.userId).select('email firstName lastName').lean();
            if (!user || !user.email)
                return;
            const subject = doc.title || 'New notification';
            const linkBase = process.env.CLIENT_URL || process.env.APP_BASE_URL || 'http://localhost:3000';
            const path = doc.link && doc.link.trim().length > 0 ? doc.link.trim() : '/sales-dashboard/notifications';
            const normalizedPath = path.startsWith('/') ? path : `/${path}`;
            const url = `${linkBase}${normalizedPath}`;
            const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
            const greeting = fullName ? `Hi ${fullName},` : 'Hello,';
            const plain = `${greeting}\n\n${doc.message}\n\nView details: ${url}`;
            const html = [
                `<p>${greeting}</p>`,
                `<p>${doc.message}</p>`,
                `<p><a href="${url}" target="_blank" rel="noopener noreferrer">View details</a></p>`
            ].join('');
            yield (0, emailService_1.sendMail)({ to: user.email, subject, html, text: plain });
        }
        catch (e) {
            // Non-fatal: email failures must not block app flows
            console.warn('[notification-email] Failed to send email for notification:', (e === null || e === void 0 ? void 0 : e.message) || e);
        }
    });
}
NotificationSchema.post('save', function (doc) {
    // Fire and forget to avoid blocking the request lifecycle
    void sendNotificationEmail(doc);
});
NotificationSchema.post('insertMany', function (docs) {
    for (const d of docs) {
        void sendNotificationEmail(d);
    }
});
exports.Notification = mongoose_1.default.model('Notification', NotificationSchema);
