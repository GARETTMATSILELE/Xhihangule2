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
exports.handlePaymentConfirmationWebhook = void 0;
const crypto_1 = __importDefault(require("crypto"));
const mongoose_1 = __importDefault(require("mongoose"));
const Payment_1 = require("../models/Payment");
const eventBus_1 = require("../events/eventBus");
const WebhookEventReceipt_1 = require("../models/WebhookEventReceipt");
const toSafeString = (v) => String(v || '').trim();
const normalizeStatus = (raw) => {
    const s = String(raw || '').toLowerCase();
    if (s === 'confirmed' || s === 'completed' || s === 'success')
        return 'completed';
    if (s === 'failed' || s === 'error')
        return 'failed';
    return 'pending';
};
const isSignatureValid = (body, signature) => {
    const secret = process.env.WEBHOOK_SHARED_SECRET || '';
    if (!secret)
        return false;
    if (!signature)
        return false;
    const expected = crypto_1.default.createHmac('sha256', secret).update(JSON.stringify(body || {})).digest('hex');
    return crypto_1.default.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
};
const handlePaymentConfirmationWebhook = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const signature = req.headers['x-webhook-signature'] || '';
        if (!isSignatureValid(req.body, signature)) {
            return res.status(401).json({ message: 'Invalid webhook signature' });
        }
        const { provider, eventId, externalTransactionId, paymentId, companyId, propertyId, payerId, amount, reference, date, status, paymentMethod, currency } = req.body || {};
        const normalizedStatus = normalizeStatus(String(status || 'pending'));
        if (!companyId || !propertyId || amount == null || !reference) {
            return res.status(400).json({ message: 'Missing required fields: companyId, propertyId, amount, reference' });
        }
        if (!mongoose_1.default.Types.ObjectId.isValid(String(companyId)) || !mongoose_1.default.Types.ObjectId.isValid(String(propertyId))) {
            return res.status(400).json({ message: 'Invalid companyId or propertyId' });
        }
        const providerName = toSafeString(provider || 'external');
        const providerEventId = toSafeString(eventId || externalTransactionId || paymentId || reference);
        if (!providerEventId) {
            return res.status(400).json({ message: 'eventId or externalTransactionId is required for webhook idempotency' });
        }
        const existingEvent = yield WebhookEventReceipt_1.WebhookEventReceipt.findOne({ provider: providerName, eventId: providerEventId });
        if ((existingEvent === null || existingEvent === void 0 ? void 0 : existingEvent.status) === 'processed') {
            return res.json({ message: 'Duplicate webhook ignored', eventId: providerEventId });
        }
        yield WebhookEventReceipt_1.WebhookEventReceipt.updateOne({ provider: providerName, eventId: providerEventId }, {
            $setOnInsert: {
                provider: providerName,
                eventId: providerEventId,
                status: 'processing',
                companyId: new mongoose_1.default.Types.ObjectId(String(companyId))
            },
            $set: { status: 'processing', lastError: '' }
        }, { upsert: true });
        let payment = null;
        if (paymentId && mongoose_1.default.Types.ObjectId.isValid(String(paymentId))) {
            payment = yield Payment_1.Payment.findOne({ _id: new mongoose_1.default.Types.ObjectId(String(paymentId)), companyId: new mongoose_1.default.Types.ObjectId(String(companyId)) });
        }
        if (!payment) {
            payment = yield Payment_1.Payment.findOne({
                companyId: new mongoose_1.default.Types.ObjectId(String(companyId)),
                externalProvider: providerName,
                externalTransactionId: toSafeString(externalTransactionId || providerEventId)
            });
        }
        if (!payment) {
            payment = yield Payment_1.Payment.findOne({
                companyId: new mongoose_1.default.Types.ObjectId(String(companyId)),
                referenceNumber: toSafeString(reference)
            });
        }
        if (payment) {
            payment.status = normalizedStatus;
            payment.paymentDate = date ? new Date(String(date)) : payment.paymentDate;
            payment.amount = Number(amount);
            payment.paymentMethod = (paymentMethod || payment.paymentMethod || 'bank_transfer');
            payment.currency = (currency || payment.currency || 'USD');
            payment.externalProvider = providerName;
            payment.externalTransactionId = toSafeString(externalTransactionId || providerEventId);
            yield payment.save();
        }
        else {
            const payerObjectId = payerId && mongoose_1.default.Types.ObjectId.isValid(String(payerId))
                ? new mongoose_1.default.Types.ObjectId(String(payerId))
                : new mongoose_1.default.Types.ObjectId();
            payment = new Payment_1.Payment({
                paymentType: 'sale',
                propertyType: 'residential',
                propertyId: new mongoose_1.default.Types.ObjectId(String(propertyId)),
                tenantId: payerObjectId,
                agentId: payerObjectId,
                companyId: new mongoose_1.default.Types.ObjectId(String(companyId)),
                paymentDate: date ? new Date(String(date)) : new Date(),
                paymentMethod: (paymentMethod || 'bank_transfer'),
                amount: Number(amount),
                depositAmount: 0,
                referenceNumber: toSafeString(reference),
                notes: 'Created from payment confirmation webhook',
                processedBy: payerObjectId,
                commissionDetails: {
                    totalCommission: 0,
                    preaFee: 0,
                    agentShare: 0,
                    agencyShare: 0,
                    vatOnCommission: 0,
                    ownerAmount: Number(amount)
                },
                status: normalizedStatus,
                currency: (currency || 'USD'),
                externalProvider: providerName,
                externalTransactionId: toSafeString(externalTransactionId || providerEventId),
                rentalPeriodMonth: new Date().getMonth() + 1,
                rentalPeriodYear: new Date().getFullYear()
            });
            yield payment.save();
        }
        if (normalizedStatus === 'completed') {
            const updateResult = yield Payment_1.Payment.updateOne({ _id: payment._id, companyId: payment.companyId, trustEventEmittedAt: { $exists: false } }, { $set: { trustEventEmittedAt: new Date(), lastTrustEventSource: 'webhook.payment-confirmation' } });
            if (Number(updateResult.modifiedCount || 0)) {
                yield (0, eventBus_1.emitEvent)('payment.confirmed', {
                    eventId: `payment.confirmed:${String(payment._id)}`,
                    paymentId: String(payment._id),
                    propertyId: String(payment.propertyId),
                    payerId: String(payment.tenantId || ''),
                    amount: Number(payment.amount || 0),
                    reference: String(payment.referenceNumber || ''),
                    date: new Date(payment.paymentDate || new Date()).toISOString(),
                    companyId: String(payment.companyId),
                    performedBy: String(payerId || payment.processedBy || '')
                });
            }
        }
        yield WebhookEventReceipt_1.WebhookEventReceipt.updateOne({ provider: providerName, eventId: providerEventId }, {
            $set: {
                status: 'processed',
                paymentId: payment._id,
                processedAt: new Date(),
                lastError: ''
            }
        });
        return res.json({ message: 'Webhook accepted', paymentId: String(payment._id), status: normalizedStatus });
    }
    catch (error) {
        try {
            const providerName = toSafeString((req.body || {}).provider || 'external');
            const providerEventId = toSafeString((req.body || {}).eventId || (req.body || {}).externalTransactionId || (req.body || {}).reference);
            if (providerEventId) {
                yield WebhookEventReceipt_1.WebhookEventReceipt.updateOne({ provider: providerName, eventId: providerEventId }, { $set: { status: 'failed', lastError: (error === null || error === void 0 ? void 0 : error.message) || 'Webhook processing failed' } }, { upsert: true });
            }
        }
        catch (_a) {
            // noop
        }
        return res.status(500).json({ message: (error === null || error === void 0 ? void 0 : error.message) || 'Webhook processing failed' });
    }
});
exports.handlePaymentConfirmationWebhook = handlePaymentConfirmationWebhook;
