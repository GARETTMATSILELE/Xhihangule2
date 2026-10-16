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
exports.claimPaynowEvent = claimPaynowEvent;
exports.processVerifiedPaynowEvent = processVerifiedPaynowEvent;
const WebhookEventReceipt_1 = require("../models/WebhookEventReceipt");
const logger_1 = require("../utils/logger");
const operationalSignal_1 = require("./operationalSignal");
const applyPolledPayment_1 = require("./applyPolledPayment");
const paynowWebhookIdentity_1 = require("./paynowWebhookIdentity");
const STALE_PROCESSING_MS = 2 * 60 * 1000;
/**
 * Claim one Paynow callback. The unique { provider, eventId } index is the lock when it exists.
 * Startup does not create that index. A duplicate key without provider and eventId metadata is not
 * proof that this event was processed, and it does not activate a subscription.
 * A duplicate key is not payment success. Activation happens only after a paid,
 * matching poll is applied by the caller.
 */
function claimPaynowEvent(eventId, payloadFingerprint) {
    return __awaiter(this, void 0, void 0, function* () {
        const now = new Date();
        const staleBefore = new Date(now.getTime() - STALE_PROCESSING_MS);
        const reclaimed = yield WebhookEventReceipt_1.WebhookEventReceipt.findOneAndUpdate({
            provider: 'paynow',
            eventId,
            $or: [
                { status: 'failed' },
                { status: 'processing', updatedAt: { $lte: staleBefore } }
            ]
        }, { $set: Object.assign({ status: 'processing' }, (payloadFingerprint ? { payloadFingerprint } : {})), $unset: { lastError: 1 } }, { new: true });
        if (reclaimed)
            return { action: 'process', receipt: reclaimed };
        const existing = yield WebhookEventReceipt_1.WebhookEventReceipt.findOne({ provider: 'paynow', eventId });
        if ((existing === null || existing === void 0 ? void 0 : existing.status) === 'processed')
            return { action: 'duplicate', payloadFingerprint: existing.payloadFingerprint };
        if ((existing === null || existing === void 0 ? void 0 : existing.status) === 'processing')
            return { action: 'in_progress' };
        try {
            if (process.env.NODE_ENV !== 'production' && process.env.MANTIS_TEST_SEAM === '1' && global.__paynowDuplicateKey) {
                const synthetic = global.__paynowDuplicateKey;
                global.__paynowDuplicateKey = undefined;
                throw synthetic;
            }
            const created = yield WebhookEventReceipt_1.WebhookEventReceipt.create({
                provider: 'paynow',
                eventId,
                status: 'processing',
                payloadFingerprint: payloadFingerprint || undefined
            });
            if (process.env.NODE_ENV !== 'production' && process.env.MANTIS_TEST_SEAM === '1' && global.__paynowUncertainReceiptCreate) {
                global.__paynowUncertainReceiptCreate = false;
                const uncertain = new Error('UNCERTAIN_RECEIPT_WRITE');
                uncertain.code = 'UNCERTAIN_WRITE';
                throw uncertain;
            }
            return { action: 'process', receipt: created };
        }
        catch (error) {
            const code = Number(error === null || error === void 0 ? void 0 : error.code);
            if (code !== 11000)
                throw error;
            if (!(0, paynowWebhookIdentity_1.samePaynowEventConflict)(error, eventId)) {
                (0, operationalSignal_1.signalOperationalFailure)('paynow_callback_conflict_unidentified', {
                    correlationId: eventId,
                    eventId
                });
                throw error;
            }
            const raced = yield WebhookEventReceipt_1.WebhookEventReceipt.findOne({ provider: 'paynow', eventId });
            if (!raced) {
                (0, operationalSignal_1.signalOperationalFailure)('paynow_callback_conflict_unidentified', {
                    correlationId: eventId,
                    eventId,
                    outcome: 'receipt_missing'
                });
                throw error;
            }
            if (raced.status === 'processed')
                return { action: 'duplicate', payloadFingerprint: raced.payloadFingerprint };
            return { action: 'in_progress' };
        }
    });
}
function processVerifiedPaynowEvent(input) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b;
        const claim = yield claimPaynowEvent(input.eventId, input.payloadFingerprint);
        if (claim.action === 'duplicate') {
            if (input.payloadFingerprint && claim.payloadFingerprint && claim.payloadFingerprint !== input.payloadFingerprint) {
                (0, operationalSignal_1.signalOperationalFailure)('paynow_callback_payload_conflict', {
                    correlationId: input.reference,
                    reference: input.reference,
                    eventId: input.eventId
                });
                const lateStatus = String(input.payloadFingerprint.split('|')[1] || '').trim().toLowerCase();
                if (lateStatus === 'refunded' || lateStatus === 'disputed') {
                    yield (0, applyPolledPayment_1.notePaynowLateStatus)(input.reference, lateStatus);
                }
                return { status: 'payload_conflict', activated: false, ignored: true };
            }
            return { status: 'duplicate', activated: false, ignored: false };
        }
        if (claim.action === 'in_progress')
            return { status: 'in_progress', activated: false, ignored: false };
        const receipt = claim.receipt;
        try {
            const applied = yield input.apply();
            const activated = applied.activated === true;
            const ignored = applied.ignored === true;
            if ((_a = applied.session) === null || _a === void 0 ? void 0 : _a.companyId)
                receipt.companyId = applied.session.companyId;
            if ((_b = applied.session) === null || _b === void 0 ? void 0 : _b.billingPaymentId)
                receipt.paymentId = applied.session.billingPaymentId;
            receipt.status = 'processed';
            receipt.processedAt = new Date();
            yield receipt.save();
            if (ignored) {
                logger_1.logger.warn('paynow_callback_ignored', {
                    correlationId: input.reference,
                    reference: input.reference,
                    eventId: input.eventId,
                    paymentStatus: applied.paymentStatus
                });
            }
            return { status: ignored ? 'ignored' : 'received', activated, ignored };
        }
        catch (error) {
            receipt.status = 'failed';
            receipt.lastError = String((error === null || error === void 0 ? void 0 : error.message) || error).slice(0, 200);
            try {
                yield receipt.save();
            }
            catch (saveError) {
                (0, operationalSignal_1.signalOperationalFailure)('paynow_callback_receipt_update_failed', {
                    correlationId: input.reference,
                    reference: input.reference,
                    eventId: input.eventId,
                    error: String((saveError === null || saveError === void 0 ? void 0 : saveError.message) || saveError).slice(0, 200)
                });
            }
            (0, operationalSignal_1.signalOperationalFailure)('paynow_callback_processing_failed', {
                correlationId: input.reference,
                reference: input.reference,
                eventId: input.eventId,
                code: String((error === null || error === void 0 ? void 0 : error.code) || 'callback_failed')
            });
            throw error;
        }
    });
}
