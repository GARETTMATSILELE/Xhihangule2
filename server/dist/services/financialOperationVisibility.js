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
exports.upsertFinancialReview = upsertFinancialReview;
exports.resolveFinancialReview = resolveFinancialReview;
exports.flagExhaustedLedgerEvents = flagExhaustedLedgerEvents;
const mongoose_1 = __importDefault(require("mongoose"));
const AccountingException_1 = require("../models/AccountingException");
const Payment_1 = require("../models/Payment");
const LedgerEvent_1 = __importDefault(require("../models/LedgerEvent"));
const ledgerEventStateMachine_1 = require("./ledgerEventStateMachine");
/**
 * One open financial_review row per company, component, and operation id.
 * Repeating detection updates that row. It does not insert another copy.
 */
function upsertFinancialReview(input) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!mongoose_1.default.Types.ObjectId.isValid(input.companyId))
            return;
        const now = new Date();
        const companyId = new mongoose_1.default.Types.ObjectId(input.companyId);
        const paymentId = input.paymentId && mongoose_1.default.Types.ObjectId.isValid(input.paymentId)
            ? new mongoose_1.default.Types.ObjectId(input.paymentId)
            : undefined;
        yield AccountingException_1.AccountingException.updateOne({
            kind: 'financial_review',
            companyId,
            component: input.component,
            'accountingRef.transactionId': input.operationId
        }, {
            $set: Object.assign({ status: 'open', issueType: input.issueType, component: input.component, expected: input.amount, actual: input.actual || input.missingRecord, companyId, error: input.recommendedReview, missingComponents: [input.missingRecord], lastCheckedAt: now, accountingRef: { collection: input.component, transactionId: input.operationId } }, (paymentId ? { paymentId } : {})),
            $setOnInsert: {
                kind: 'financial_review',
                detectedAt: now
            },
            $unset: { resolvedAt: 1, resolvedBy: 1, resolution: 1 }
        }, { upsert: true });
    });
}
function resolveFinancialReview(companyId, component, operationId, resolution) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!mongoose_1.default.Types.ObjectId.isValid(companyId))
            return;
        yield AccountingException_1.AccountingException.updateOne({
            kind: 'financial_review',
            companyId: new mongoose_1.default.Types.ObjectId(companyId),
            component,
            'accountingRef.transactionId': operationId,
            status: 'open'
        }, {
            $set: {
                status: 'resolved',
                resolvedAt: new Date(),
                resolution,
                lastCheckedAt: new Date()
            }
        });
    });
}
function flagExhaustedLedgerEvents(companyId) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!mongoose_1.default.Types.ObjectId.isValid(companyId))
            return 0;
        const companyObjectId = new mongoose_1.default.Types.ObjectId(companyId);
        const payments = yield Payment_1.Payment.find({ companyId: companyObjectId }).select('_id referenceNumber amount').limit(500).lean();
        const paymentIds = payments.map((row) => row._id);
        const events = yield LedgerEvent_1.default.find({
            status: 'failed',
            $and: [
                { $or: [{ companyId: companyObjectId }, { paymentId: { $in: paymentIds } }] },
                {
                    $or: [
                        { attemptCount: { $gte: ledgerEventStateMachine_1.LEDGER_RETRY_LIMIT } },
                        { failureClass: { $in: ['permanent', 'conflict'] } }
                    ]
                }
            ]
        }).limit(100).lean();
        for (const event of events) {
            const payment = payments.find((row) => String(row._id) === String(event.paymentId));
            const failureClass = String(event.failureClass || 'transient');
            const operationId = String(event._id);
            yield upsertFinancialReview({
                companyId,
                component: 'LEDGER_RETRY_EXHAUSTED',
                operationId,
                paymentId: event.paymentId ? String(event.paymentId) : undefined,
                amount: payment ? Number(payment.amount || 0) : undefined,
                missingRecord: `ledger event ${event.type}`,
                issueType: 'missing',
                actual: failureClass,
                recommendedReview: `Ledger event ${operationId} for company ${companyId} is ${failureClass} after ${event.attemptCount || 0} attempts. Source ${event.paymentId || event.levyPaymentId || 'unknown'}. Correlation ${event.correlationId || event.paymentId || operationId}. Reason: ${String(event.lastError || 'unknown').slice(0, 180)}. A transient failure can be retried as the same operation. Do not create a new financial record and do not rewrite historical amounts.`
            });
        }
        return events.length;
    });
}
