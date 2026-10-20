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
exports.handlePaymentConfirmationWebhook = exports.resolveWebhookCreatedPaymentFinancials = void 0;
const crypto_1 = __importDefault(require("crypto"));
const mongoose_1 = __importDefault(require("mongoose"));
const Payment_1 = require("../models/Payment");
const Property_1 = require("../models/Property");
const eventBus_1 = require("../events/eventBus");
const WebhookEventReceipt_1 = require("../models/WebhookEventReceipt");
const commissionService_1 = require("../services/commissionService");
const salePaymentCompleteness_1 = require("../services/salePaymentCompleteness");
const introductionCommissionService_1 = require("../services/introductionCommissionService");
const vatPolicyService_1 = require("../services/vatPolicyService");
const taxObligationService_1 = require("../services/taxObligationService");
const introductionLeaseContext_1 = require("../services/introductionLeaseContext");
const transactionDomain_1 = require("../services/transactionDomain");
const toSafeString = (v) => String(v || '').trim();
const normalizeStatus = (raw) => {
    const s = String(raw || '').toLowerCase();
    if (s === 'confirmed' || s === 'completed' || s === 'success')
        return 'completed';
    if (s === 'failed' || s === 'error')
        return 'failed';
    return 'pending';
};
/**
 * Classify from Property.rentalType only. Unknown must not be guessed as a sale.
 * Incomplete sales are rejected — never created with a zero commission snapshot.
 */
const resolveWebhookCreatedPaymentFinancials = (input) => __awaiter(void 0, void 0, void 0, function* () {
    const property = yield Property_1.Property.findById(input.propertyId)
        .select('rentalType commission vatOnCommission vatCommissionTreatment agentId rent')
        .lean();
    const kind = (0, salePaymentCompleteness_1.classifyPropertyFinancialKind)(property === null || property === void 0 ? void 0 : property.rentalType);
    if (!property || kind === 'unknown') {
        return {
            ok: false,
            code: salePaymentCompleteness_1.WEBHOOK_PAYMENT_TYPE_UNKNOWN_CODE,
            message: 'Webhook payment type cannot be classified from Property.rentalType.',
            missing: ['property.rentalType']
        };
    }
    const propertyAgent = (property === null || property === void 0 ? void 0 : property.agentId)
        ? new mongoose_1.default.Types.ObjectId(String(property.agentId))
        : undefined;
    if (!propertyAgent && !input.payerObjectId) {
        return {
            ok: false,
            code: 'WEBHOOK_ACTOR_REQUIRED',
            message: 'Webhook payment requires a valid payerId or a property agent.',
            missing: ['payerId']
        };
    }
    const agentId = propertyAgent || input.payerObjectId;
    const amount = Number(input.amount || 0);
    if (kind === 'sale') {
        const percent = Number((property === null || property === void 0 ? void 0 : property.commission) || 0);
        const computed = yield commissionService_1.CommissionService.calculate(amount, percent, new mongoose_1.default.Types.ObjectId(String(input.companyId)));
        const completeness = (0, salePaymentCompleteness_1.validateSalePaymentCompleteness)({
            amount,
            commissionDetails: computed
        });
        if (!completeness.ok) {
            return {
                ok: false,
                code: salePaymentCompleteness_1.SALE_PAYMENT_INCOMPLETE_CODE,
                message: 'Sale payment is missing required financial data.',
                missing: completeness.missing
            };
        }
        return {
            ok: true,
            paymentType: 'sale',
            agentId,
            commissionDetails: computed,
            applyVatOnCommission: false,
            vatOnCommissionRate: 0,
            vatCommissionTreatment: undefined,
            emitTrustEvent: true
        };
    }
    const rentalType = String((property === null || property === void 0 ? void 0 : property.rentalType) || '').toLowerCase();
    const propertyVatRequested = Boolean(property === null || property === void 0 ? void 0 : property.vatOnCommission);
    const isIntroduction = rentalType === 'introduction';
    const commissionVatPolicy = yield (0, vatPolicyService_1.resolveCommissionVatPolicy)({
        companyId: String(input.companyId),
        paymentDate: input.paymentDate,
        property: {
            vatOnCommission: propertyVatRequested,
            vatCommissionTreatment: property === null || property === void 0 ? void 0 : property.vatCommissionTreatment
        },
        requestedVatOnCommission: propertyVatRequested,
        requestedTreatment: property === null || property === void 0 ? void 0 : property.vatCommissionTreatment,
        commissionType: isIntroduction ? 'introduction' : 'management'
    });
    const blockedVatRate = (0, vatPolicyService_1.centralVatRateBlock)(commissionVatPolicy);
    if (blockedVatRate) {
        return { ok: false, code: blockedVatRate.code, message: blockedVatRate.message };
    }
    const commissionVat = (0, vatPolicyService_1.commissionVatFlagsFromPolicy)(commissionVatPolicy);
    if (commissionVatPolicy.reviewRequired && commissionVatPolicy.reviewReason) {
        yield (0, taxObligationService_1.openReview)({
            companyId: String(input.companyId),
            kind: commissionVatPolicy.reviewReason,
            title: 'VAT on commission requires review',
            detail: commissionVatPolicy.reason,
            propertyId: String(input.propertyId)
        });
    }
    if (isIntroduction) {
        const prepared = yield (0, introductionCommissionService_1.prepareIntroductionRentalCommission)({
            companyId: input.companyId,
            propertyId: input.propertyId,
            tenantId: input.tenantId,
            leaseId: input.leaseId,
            rentAllocated: amount,
            levyAllocated: 0,
            vatOnCommission: commissionVat.vatOnCommission,
            vatTreatment: commissionVat.vatTreatment,
            vatRate: commissionVat.vatRate,
            paymentDate: input.paymentDate,
            propertyRent: Number((property === null || property === void 0 ? void 0 : property.rent) || 0)
        });
        if (!prepared.ok) {
            return {
                ok: false,
                code: prepared.code,
                message: prepared.message,
                missing: prepared.missing,
                mismatches: prepared.mismatches
            };
        }
        return {
            ok: true,
            paymentType: 'rental',
            agentId,
            commissionDetails: (0, vatPolicyService_1.stampVatDecision)(prepared.snapshot, commissionVatPolicy),
            applyVatOnCommission: prepared.result.vatOnCommission,
            vatOnCommissionRate: Number(prepared.result.vatRate || 0),
            vatCommissionTreatment: prepared.result.vatTreatment,
            emitTrustEvent: false,
            tenantId: new mongoose_1.default.Types.ObjectId(prepared.context.tenantId),
            leaseId: new mongoose_1.default.Types.ObjectId(prepared.context.leaseId)
        };
    }
    const commissionResult = yield commissionService_1.CommissionService.calculateForProperty({
        companyId: input.companyId,
        grossRent: amount,
        levy: 0,
        commissionPercentage: Number((property === null || property === void 0 ? void 0 : property.commission) || 0),
        vatOnCommission: commissionVat.vatOnCommission,
        vatTreatment: commissionVat.vatTreatment,
        vatRate: commissionVat.vatRate,
        paymentDate: input.paymentDate
    });
    return {
        ok: true,
        paymentType: 'rental',
        agentId,
        commissionDetails: (0, vatPolicyService_1.stampVatDecision)((0, commissionService_1.applyLevyPassThroughToSnapshot)(commissionResult, amount, 0), commissionVatPolicy),
        applyVatOnCommission: commissionResult.vatOnCommission,
        vatOnCommissionRate: Number(commissionResult.vatRate || 0),
        vatCommissionTreatment: commissionResult.vatTreatment,
        emitTrustEvent: false
    };
});
exports.resolveWebhookCreatedPaymentFinancials = resolveWebhookCreatedPaymentFinancials;
const isSignatureValid = (body, signature) => {
    const secret = process.env.WEBHOOK_SHARED_SECRET || '';
    if (!secret)
        return false;
    if (!signature)
        return false;
    const expected = crypto_1.default.createHmac('sha256', secret).update(JSON.stringify(body || {})).digest('hex');
    const expectedBuffer = Buffer.from(expected, 'hex');
    const signatureBuffer = Buffer.from(String(signature).trim(), 'hex');
    if (signatureBuffer.length !== expectedBuffer.length) {
        return false;
    }
    return crypto_1.default.timingSafeEqual(expectedBuffer, signatureBuffer);
};
const handlePaymentConfirmationWebhook = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const signature = req.headers['x-webhook-signature'] || '';
        if (!isSignatureValid(req.body, signature)) {
            return res.status(401).json({ message: 'Invalid webhook signature' });
        }
        const { provider, eventId, externalTransactionId, paymentId, companyId, propertyId, payerId, tenantId, leaseId, amount, reference, date, status, paymentMethod, currency } = req.body || {};
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
                companyId: new mongoose_1.default.Types.ObjectId(String(companyId))
            },
            $set: { status: 'processing', lastError: '' }
        }, { upsert: true });
        const failWebhook = (failure) => __awaiter(void 0, void 0, void 0, function* () {
            yield WebhookEventReceipt_1.WebhookEventReceipt.updateOne({ provider: providerName, eventId: providerEventId }, {
                $set: {
                    status: 'failed',
                    lastError: `${failure.code}: ${(failure.missing || failure.mismatches || []).join(', ') || failure.message}`
                }
            });
            const body = failure.code === salePaymentCompleteness_1.SALE_PAYMENT_INCOMPLETE_CODE
                ? (0, salePaymentCompleteness_1.salePaymentIncompleteResponse)(failure.missing || [])
                : (0, introductionLeaseContext_1.introductionContextErrorResponse)({
                    code: failure.code,
                    message: failure.message,
                    missing: failure.missing,
                    mismatches: failure.mismatches
                });
            return res.status(400).json(body);
        });
        let payment = null;
        let emitTrustEvent = true;
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
            const previousStatus = String(payment.status || '');
            const alreadyCompleted = previousStatus === 'completed' && payment.isProvisional !== true;
            payment.status = normalizedStatus;
            payment.externalProvider = providerName;
            payment.externalTransactionId = toSafeString(externalTransactionId || providerEventId);
            if (!alreadyCompleted) {
                payment.paymentDate = date ? new Date(String(date)) : payment.paymentDate;
                payment.amount = Number(amount);
                payment.paymentMethod = (paymentMethod || payment.paymentMethod || 'bank_transfer');
                payment.currency = (currency || payment.currency || 'USD');
            }
            if (normalizedStatus === 'completed' && previousStatus !== 'completed') {
                const { activateAccountingTrackingForCompletion } = yield Promise.resolve().then(() => __importStar(require('../services/paymentAccountingReconciliation')));
                activateAccountingTrackingForCompletion(payment);
            }
            yield payment.save();
        }
        else {
            const payerObjectId = payerId && mongoose_1.default.Types.ObjectId.isValid(String(payerId))
                ? new mongoose_1.default.Types.ObjectId(String(payerId))
                : undefined;
            const paymentDateValue = date ? new Date(String(date)) : new Date();
            const createdFinancials = yield (0, exports.resolveWebhookCreatedPaymentFinancials)({
                companyId: String(companyId),
                propertyId: String(propertyId),
                amount: Number(amount),
                paymentDate: paymentDateValue,
                payerObjectId,
                tenantId,
                leaseId
            });
            if (!createdFinancials.ok) {
                return failWebhook(createdFinancials);
            }
            emitTrustEvent = createdFinancials.emitTrustEvent;
            const requestedTenant = tenantId && mongoose_1.default.Types.ObjectId.isValid(String(tenantId))
                ? new mongoose_1.default.Types.ObjectId(String(tenantId))
                : undefined;
            const tenantForPayment = createdFinancials.tenantId
                || requestedTenant
                || (createdFinancials.paymentType === 'sale' ? undefined : payerObjectId);
            if (createdFinancials.paymentType !== 'sale' && !tenantForPayment) {
                return failWebhook({
                    code: 'WEBHOOK_TENANT_REQUIRED',
                    message: 'A rental webhook payment requires a valid tenantId or payerId.',
                    missing: ['tenantId']
                });
            }
            const processedBy = payerObjectId || createdFinancials.agentId;
            payment = new Payment_1.Payment({
                paymentType: createdFinancials.paymentType,
                transactionDomain: createdFinancials.paymentType === 'sale' ? 'SALE' : 'RENTAL',
                propertyType: 'residential',
                propertyId: new mongoose_1.default.Types.ObjectId(String(propertyId)),
                tenantId: tenantForPayment,
                leaseId: createdFinancials.leaseId,
                agentId: createdFinancials.agentId,
                companyId: new mongoose_1.default.Types.ObjectId(String(companyId)),
                paymentDate: paymentDateValue,
                paymentMethod: (paymentMethod || 'bank_transfer'),
                amount: Number(amount),
                depositAmount: 0,
                referenceNumber: toSafeString(reference),
                notes: 'Created from payment confirmation webhook',
                processedBy,
                commissionDetails: createdFinancials.commissionDetails,
                applyVatOnCommission: createdFinancials.applyVatOnCommission,
                vatOnCommissionRate: createdFinancials.vatOnCommissionRate,
                vatCommissionTreatment: createdFinancials.vatCommissionTreatment,
                status: normalizedStatus,
                accountingStatus: normalizedStatus === 'completed' ? 'pending' : undefined,
                accountingComplete: normalizedStatus === 'completed' ? false : undefined,
                currency: (currency || 'USD'),
                externalProvider: providerName,
                externalTransactionId: toSafeString(externalTransactionId || providerEventId),
                rentalPeriodMonth: new Date().getMonth() + 1,
                rentalPeriodYear: new Date().getFullYear()
            });
            yield payment.save();
        }
        if (normalizedStatus === 'completed') {
            let accountingComplete = false;
            try {
                const { ensurePaymentAccountingPosted } = yield Promise.resolve().then(() => __importStar(require('../services/paymentAccountingReconciliation')));
                const postResult = yield ensurePaymentAccountingPosted(String(payment._id));
                accountingComplete = postResult.accountingComplete === true;
            }
            catch (postErr) {
                console.warn('Webhook payment accounting post failed:', (postErr === null || postErr === void 0 ? void 0 : postErr.message) || postErr);
            }
            if (accountingComplete) {
                try {
                    const { notifyOwnerOfRentPayment } = yield Promise.resolve().then(() => __importStar(require('../services/ownerRentNotificationService')));
                    void notifyOwnerOfRentPayment(payment, { accountingComplete: true });
                }
                catch (noticeErr) {
                    console.warn('[owner-rent-notice] webhook notification was not queued', (noticeErr === null || noticeErr === void 0 ? void 0 : noticeErr.message) || noticeErr);
                }
            }
            if ((0, transactionDomain_1.mayPostSaleTrust)(payment)) {
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
