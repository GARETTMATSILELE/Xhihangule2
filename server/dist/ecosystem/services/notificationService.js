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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.NotificationService = void 0;
exports.isDeliverableEmail = isDeliverableEmail;
exports.notifyEvent = notifyEvent;
exports.notifyCompanyStaff = notifyCompanyStaff;
const crypto_1 = __importDefault(require("crypto"));
const Notification_1 = require("../../models/Notification");
const User_1 = require("../../models/User");
const commsAndPayments_1 = require("../models/commsAndPayments");
const constants_1 = require("../constants");
const flags_1 = require("../flags");
const logger_1 = require("../../utils/logger");
const TEMPLATES = {
    VIEWING_REQUESTED: { title: 'Viewing requested', body: '{{tenantName}} requested a viewing for {{propertyName}}.' },
    VIEWING_CONFIRMED: { title: 'Viewing confirmed', body: 'Your viewing for {{propertyName}} is confirmed.' },
    VIEWING_DECLINED: { title: 'Viewing declined', body: 'The viewing request for {{propertyName}} was declined.' },
    VIEWING_RESCHEDULED: { title: 'Viewing rescheduled', body: 'A new time was proposed for your viewing of {{propertyName}}.' },
    APPLICATION_SUBMITTED: { title: 'Application submitted', body: '{{tenantName}} applied for {{propertyName}}.' },
    APPLICATION_APPROVED: { title: 'Application approved', body: 'Your application for {{propertyName}} was approved.' },
    APPLICATION_DECLINED: { title: 'Application declined', body: 'Your application for {{propertyName}} was declined.' },
    RENT_PAYMENT_RECEIVED: { title: 'Rent payment received', body: 'Payment of {{amount}} was received for {{propertyName}}.' },
    RENT_PAYMENT_REMINDER: { title: 'Rent reminder', body: 'Rent of {{amount}} is due for {{propertyName}}.' },
    MAINTENANCE_REQUEST_RECEIVED: { title: 'Maintenance reported', body: '{{tenantName}} reported: {{maintenanceDescription}} at {{propertyName}}.' },
    QUOTE_REQUESTED: {
        title: 'New job request',
        body: 'A new job request is available.\nReference: {{propertyReference}}\nLocation: {{propertyLocation}}\nIssue: {{maintenanceDescription}}\nSubmitted: {{submittedAt}}\nSign in to your Mantis contractor portal to review the request and photographs, then accept or decline it.\n{{portalLink}}',
        sms: 'New Mantis job request ({{propertyReference}}). Sign in to review and accept or decline: {{portalLink}}',
    },
    QUOTE_RECEIVED: { title: 'Quote received', body: '{{contractorName}} submitted a quote of {{quoteAmount}} for {{propertyName}}.' },
    QUOTE_SENT_TO_OWNER: { title: 'Quote awaiting your approval', body: 'A maintenance quote of {{quoteAmount}} for {{propertyName}} needs your review.' },
    OWNER_QUOTE_APPROVED: { title: 'Owner approved quote', body: '{{ownerName}} approved the quote for {{propertyName}}.' },
    OWNER_QUOTE_DECLINED: { title: 'Owner declined quote', body: '{{ownerName}} declined the quote for {{propertyName}}.' },
    CONTRACTOR_AUTHORISED: { title: 'You are authorised to proceed', body: 'You are authorised to proceed with the job at {{propertyName}}.' },
    WORK_COMPLETED: { title: 'Work marked completed', body: 'Maintenance at {{propertyName}} was marked completed.' },
    MAINTENANCE_REOPENED: { title: 'Maintenance reopened', body: 'A tenant reported a problem with completed work at {{propertyName}}.' },
    BROADCAST_MESSAGE: { title: '{{title}}', body: '{{message}}' },
};
function render(template, vars) {
    return template.replace(/\{\{(\w+)\}\}/g, (_m, key) => vars[key] || '');
}
function isDeliverableEmail(value) {
    if (!value)
        return false;
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}
function escapeHtml(value) {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}
function safeHttpUrl(value) {
    if (!value)
        return undefined;
    try {
        const url = new URL(value);
        if (url.protocol === 'https:' || url.protocol === 'http:')
            return url.toString();
    }
    catch (_a) {
        return undefined;
    }
    return undefined;
}
class SmtpEmailProvider {
    send(input) {
        return __awaiter(this, void 0, void 0, function* () {
            const { sendMail } = yield Promise.resolve().then(() => __importStar(require('../../services/emailService')));
            yield sendMail({ to: input.to, subject: input.subject, html: input.html, text: input.text });
            return { id: `smtp-${Date.now()}` };
        });
    }
}
class UnconfiguredSmsProvider {
    send(_input) {
        return __awaiter(this, void 0, void 0, function* () {
            throw new Error('SMS provider is not configured');
        });
    }
}
class UnconfiguredWhatsAppProvider {
    send(_input) {
        return __awaiter(this, void 0, void 0, function* () {
            throw new Error('WhatsApp provider is not configured');
        });
    }
}
function getEmailProvider() {
    if (!(0, flags_1.isChannelGloballyEnabled)('EMAIL'))
        return null;
    return new SmtpEmailProvider();
}
function getSmsProvider() {
    if (!(0, flags_1.isChannelGloballyEnabled)('SMS'))
        return null;
    return new UnconfiguredSmsProvider();
}
function getWhatsAppProvider() {
    if (!(0, flags_1.isChannelGloballyEnabled)('WHATSAPP'))
        return null;
    return new UnconfiguredWhatsAppProvider();
}
const IMPORTANT_EVENTS = new Set([
    'QUOTE_SENT_TO_OWNER',
    'OWNER_QUOTE_APPROVED',
    'OWNER_QUOTE_DECLINED',
    'CONTRACTOR_AUTHORISED',
    'WORK_COMPLETED',
    'MAINTENANCE_REOPENED',
    'APPLICATION_APPROVED',
    'APPLICATION_DECLINED',
    'VIEWING_CONFIRMED',
    'VIEWING_DECLINED',
    'VIEWING_RESCHEDULED',
]);
const RECEIPT_EVENTS = new Set(['RENT_PAYMENT_RECEIVED']);
function notifyEvent(input) {
    return __awaiter(this, void 0, void 0, function* () {
        const eventType = input.eventType;
        if (!constants_1.TEMPLATE_KEYS.includes(eventType))
            return;
        const vars = input.variables || {};
        const tpl = TEMPLATES[eventType];
        const title = render(tpl.title, vars);
        const message = render(tpl.body, vars);
        const operational = input.operational !== false;
        const user = yield User_1.User.findById(input.recipientId).select('email firstName lastName').lean();
        const prefs = yield commsAndPayments_1.CommunicationPreference.findOne({ userId: input.recipientId }).lean();
        const channels = ['IN_APP'];
        if (IMPORTANT_EVENTS.has(eventType) || RECEIPT_EVENTS.has(eventType) || operational) {
            channels.push('EMAIL');
        }
        if (IMPORTANT_EVENTS.has(eventType)) {
            channels.push('SMS', 'WHATSAPP');
        }
        if (eventType === 'QUOTE_REQUESTED' && (0, flags_1.isChannelGloballyEnabled)('SMS')) {
            channels.push('SMS');
        }
        if (RECEIPT_EVENTS.has(eventType)) {
            // receipts: email + in-app; SMS/WhatsApp only if configured and preferred
            if ((prefs === null || prefs === void 0 ? void 0 : prefs.smsAvailable) && (prefs === null || prefs === void 0 ? void 0 : prefs.smsOperational))
                channels.push('SMS');
            if ((prefs === null || prefs === void 0 ? void 0 : prefs.whatsappAvailable) && (prefs === null || prefs === void 0 ? void 0 : prefs.whatsappOperational))
                channels.push('WHATSAPP');
        }
        const uniqueChannels = Array.from(new Set(channels));
        let inAppId;
        for (const channel of uniqueChannels) {
            const key = input.idempotencyKey
                ? `${input.idempotencyKey}:${channel}`
                : `${eventType}:${input.recipientId}:${channel}:${crypto_1.default.createHash('sha1').update(message).digest('hex').slice(0, 12)}`;
            const existing = yield commsAndPayments_1.NotificationDelivery.findOne({ idempotencyKey: key }).lean();
            if (existing && (existing.status === 'SENT' || existing.status === 'SKIPPED' || existing.status === 'DELIVERED')) {
                continue;
            }
            if ((existing === null || existing === void 0 ? void 0 : existing.status) === 'FAILED') {
                yield commsAndPayments_1.NotificationDelivery.deleteOne({ _id: existing._id });
            }
            const available = channel === 'IN_APP'
                ? (prefs === null || prefs === void 0 ? void 0 : prefs.inAppAvailable) !== false
                : channel === 'EMAIL'
                    ? ((prefs === null || prefs === void 0 ? void 0 : prefs.emailAvailable) !== false && (operational ? (prefs === null || prefs === void 0 ? void 0 : prefs.emailOperational) !== false : prefs === null || prefs === void 0 ? void 0 : prefs.emailMarketing))
                    : channel === 'SMS'
                        ? Boolean(prefs === null || prefs === void 0 ? void 0 : prefs.smsAvailable) && (operational ? (prefs === null || prefs === void 0 ? void 0 : prefs.smsOperational) !== false : prefs === null || prefs === void 0 ? void 0 : prefs.smsMarketing)
                        : Boolean(prefs === null || prefs === void 0 ? void 0 : prefs.whatsappAvailable) && (operational ? (prefs === null || prefs === void 0 ? void 0 : prefs.whatsappOperational) !== false : prefs === null || prefs === void 0 ? void 0 : prefs.whatsappMarketing);
            const globallyOn = channel === 'IN_APP' ? true : (0, flags_1.isChannelGloballyEnabled)(channel);
            if (!available || !globallyOn) {
                yield commsAndPayments_1.NotificationDelivery.create({
                    recipientId: input.recipientId,
                    eventType,
                    channel,
                    status: 'SKIPPED',
                    idempotencyKey: key,
                    failureReason: !globallyOn ? 'channel_unconfigured' : 'preference_or_unavailable',
                });
                continue;
            }
            try {
                if (channel === 'IN_APP') {
                    const doc = yield Notification_1.Notification.create({
                        companyId: String(input.companyId || 'ecosystem'),
                        userId: input.recipientId,
                        title,
                        message,
                        link: input.link,
                        payload: Object.assign({ skipEmail: true, eventType }, vars),
                    });
                    inAppId = String(doc._id);
                    yield commsAndPayments_1.NotificationDelivery.create({
                        notificationId: doc._id,
                        recipientId: input.recipientId,
                        eventType,
                        channel,
                        status: 'SENT',
                        provider: 'in_app',
                        idempotencyKey: key,
                        sentAt: new Date(),
                        templateName: eventType,
                    });
                    continue;
                }
                if (channel === 'EMAIL') {
                    const provider = getEmailProvider();
                    const emailTarget = input.email !== undefined ? input.email.trim() : ((user === null || user === void 0 ? void 0 : user.email) || '');
                    if (!isDeliverableEmail(emailTarget)) {
                        yield commsAndPayments_1.NotificationDelivery.create({
                            notificationId: inAppId,
                            recipientId: input.recipientId,
                            eventType,
                            channel,
                            status: 'FAILED',
                            idempotencyKey: key,
                            failedAt: new Date(),
                            failureReason: 'invalid_contractor_email',
                        });
                        continue;
                    }
                    if (!provider) {
                        yield commsAndPayments_1.NotificationDelivery.create({
                            notificationId: inAppId,
                            recipientId: input.recipientId,
                            eventType,
                            channel,
                            status: 'SKIPPED',
                            idempotencyKey: key,
                            failureReason: 'email_unavailable',
                        });
                        continue;
                    }
                    const safeLink = safeHttpUrl(input.link);
                    const result = yield provider.send({
                        to: emailTarget,
                        subject: title,
                        html: `<p>${escapeHtml(message).replace(/\n/g, '<br/>')}</p>${safeLink ? `<p><a href="${escapeHtml(safeLink)}">Open the job request</a></p>` : ''}`,
                        text: message,
                    });
                    yield commsAndPayments_1.NotificationDelivery.create({
                        notificationId: inAppId,
                        recipientId: input.recipientId,
                        eventType,
                        channel,
                        status: 'SENT',
                        provider: process.env.EMAIL_PROVIDER || 'smtp',
                        providerMessageId: result.id,
                        idempotencyKey: key,
                        sentAt: new Date(),
                        templateName: eventType,
                    });
                    continue;
                }
                if (channel === 'SMS') {
                    const provider = getSmsProvider();
                    const to = prefs === null || prefs === void 0 ? void 0 : prefs.phone;
                    if (!provider || !to) {
                        yield commsAndPayments_1.NotificationDelivery.create({
                            recipientId: input.recipientId,
                            eventType,
                            channel,
                            status: 'SKIPPED',
                            idempotencyKey: key,
                            failureReason: 'sms_unavailable',
                        });
                        continue;
                    }
                    const smsBody = tpl.sms ? render(tpl.sms, vars) : message;
                    const result = yield provider.send({ to, body: smsBody });
                    yield commsAndPayments_1.NotificationDelivery.create({
                        recipientId: input.recipientId,
                        eventType,
                        channel,
                        status: 'SENT',
                        provider: process.env.SMS_PROVIDER,
                        providerMessageId: result.id,
                        idempotencyKey: key,
                        sentAt: new Date(),
                        templateName: eventType,
                    });
                    continue;
                }
                const provider = getWhatsAppProvider();
                const to = (prefs === null || prefs === void 0 ? void 0 : prefs.whatsappNumber) || (prefs === null || prefs === void 0 ? void 0 : prefs.phone);
                if (!provider || !to) {
                    yield commsAndPayments_1.NotificationDelivery.create({
                        recipientId: input.recipientId,
                        eventType,
                        channel,
                        status: 'SKIPPED',
                        idempotencyKey: key,
                        failureReason: 'whatsapp_unavailable',
                    });
                    continue;
                }
                const result = yield provider.send({ to, templateName: eventType, variables: vars });
                yield commsAndPayments_1.NotificationDelivery.create({
                    recipientId: input.recipientId,
                    eventType,
                    channel,
                    status: 'SENT',
                    provider: process.env.WHATSAPP_PROVIDER,
                    providerMessageId: result.id,
                    templateName: eventType,
                    idempotencyKey: key,
                    sentAt: new Date(),
                });
            }
            catch (error) {
                logger_1.logger.warn('Notification channel failed', { channel, eventType, message: error === null || error === void 0 ? void 0 : error.message });
                yield commsAndPayments_1.NotificationDelivery.create({
                    recipientId: input.recipientId,
                    eventType,
                    channel,
                    status: 'FAILED',
                    idempotencyKey: key,
                    failedAt: new Date(),
                    failureReason: (error === null || error === void 0 ? void 0 : error.message) || 'provider_error',
                    retryCount: 1,
                }).catch(() => undefined);
            }
        }
    });
}
function notifyCompanyStaff(companyId, eventType, variables, idempotencyKey) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!companyId)
            return;
        const staff = yield User_1.User.find({
            companyId,
            isActive: { $ne: false },
            $or: [
                { role: { $in: ['admin', 'agent', 'principal', 'prea'] } },
                { roles: { $in: ['admin', 'agent', 'principal', 'prea'] } },
            ],
        }).select('_id').limit(20).lean();
        for (const member of staff) {
            yield notifyEvent({
                recipientId: String(member._id),
                companyId,
                eventType,
                variables,
                idempotencyKey: `${idempotencyKey}:${member._id}`,
            });
        }
    });
}
exports.NotificationService = { notifyEvent, notifyCompanyStaff, renderTemplate: render, TEMPLATES };
