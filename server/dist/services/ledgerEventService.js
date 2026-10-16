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
const mongoose_1 = __importDefault(require("mongoose"));
const logger_1 = require("../utils/logger");
const LedgerEvent_1 = __importDefault(require("../models/LedgerEvent"));
const propertyAccountService_1 = __importDefault(require("./propertyAccountService"));
const ledgerMutationPolicy_1 = require("./ledgerMutationPolicy");
const ledgerEventStateMachine_1 = require("./ledgerEventStateMachine");
const operationalFailure_1 = require("./operationalFailure");
const auditService_1 = require("./auditService");
const operationalSignal_1 = require("./operationalSignal");
const financialOperationVisibility_1 = require("./financialOperationVisibility");
const STALE_PROCESSING_MS = 5 * 60 * 1000;
class LedgerEventService {
    constructor() {
        this.processing = false;
    }
    static getInstance() {
        if (!LedgerEventService.instance) {
            LedgerEventService.instance = new LedgerEventService();
        }
        return LedgerEventService.instance;
    }
    /**
     * Retry owner-income posting for a Payment that failed during live completion.
     * Invokes paymentAccountingOrchestrator. Do not enqueue from historical full-sync.
     */
    enqueueOwnerIncomeEvent(paymentId) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.enqueueEvent('owner_income', paymentId);
        });
    }
    /**
     * One visible failed owner-income event. It is not claimable for automatic retry
     * and it does not post a second owner-income row.
     */
    recordPermanentOwnerIncomeFailure(paymentId, message) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!mongoose_1.default.Types.ObjectId.isValid(paymentId))
                return false;
            const paymentObjectId = new mongoose_1.default.Types.ObjectId(paymentId);
            const existing = yield LedgerEvent_1.default.findOne({
                type: 'owner_income',
                paymentId: paymentObjectId,
                processorGeneration: ledgerMutationPolicy_1.LEDGER_EVENT_PROCESSOR_GENERATION
            }).select('_id').lean();
            if (existing)
                return true;
            const companyId = yield this.companyIdForPayment(paymentId);
            yield LedgerEvent_1.default.create({
                type: 'owner_income',
                paymentId: paymentObjectId,
                companyId,
                correlationId: paymentId,
                status: 'failed',
                failureClass: 'permanent',
                attemptCount: ledgerEventStateMachine_1.LEDGER_RETRY_LIMIT,
                lastError: message.slice(0, 200),
                exhaustedAt: new Date(),
                processorGeneration: ledgerMutationPolicy_1.LEDGER_EVENT_PROCESSOR_GENERATION,
                metadata: { reason: 'OWNER_INCOME_AMOUNT_MISSING' }
            });
            return true;
        });
    }
    enqueueEvent(type, paymentId, metadata) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const filter = {
                    type,
                    status: { $in: ['pending', 'processing', 'failed'] },
                    processorGeneration: ledgerMutationPolicy_1.LEDGER_EVENT_PROCESSOR_GENERATION
                };
                if (paymentId)
                    filter.paymentId = new mongoose_1.default.Types.ObjectId(paymentId);
                if (metadata === null || metadata === void 0 ? void 0 : metadata.levyPaymentId) {
                    filter.levyPaymentId = new mongoose_1.default.Types.ObjectId(String(metadata.levyPaymentId));
                }
                const existing = yield LedgerEvent_1.default.findOne(filter).lean();
                if (existing)
                    return;
                const companyId = yield this.companyIdForPayment(paymentId);
                yield LedgerEvent_1.default.create({
                    type,
                    paymentId: paymentId ? new mongoose_1.default.Types.ObjectId(paymentId) : undefined,
                    levyPaymentId: (metadata === null || metadata === void 0 ? void 0 : metadata.levyPaymentId)
                        ? new mongoose_1.default.Types.ObjectId(String(metadata.levyPaymentId))
                        : undefined,
                    companyId,
                    correlationId: paymentId || ((metadata === null || metadata === void 0 ? void 0 : metadata.levyPaymentId) ? String(metadata.levyPaymentId) : undefined),
                    status: 'pending',
                    attemptCount: 0,
                    nextAttemptAt: new Date(),
                    processorGeneration: ledgerMutationPolicy_1.LEDGER_EVENT_PROCESSOR_GENERATION,
                    metadata
                });
            }
            catch (e) {
                logger_1.logger.warn('Failed to enqueue ledger event:', (e === null || e === void 0 ? void 0 : e.message) || e);
                throw e;
            }
        });
    }
    /**
     * Atomically claim one due event. Generation 2 only — Phase 5A pending
     * generation-less events are left untouched for Phase 5C.
     */
    claimNext() {
        return __awaiter(this, arguments, void 0, function* (now = new Date()) {
            const staleBefore = new Date(now.getTime() - STALE_PROCESSING_MS);
            const claimed = yield LedgerEvent_1.default.findOneAndUpdate({
                processorGeneration: ledgerMutationPolicy_1.LEDGER_EVENT_PROCESSOR_GENERATION,
                $and: [
                    { $or: [{ attemptCount: { $lt: ledgerEventStateMachine_1.LEDGER_RETRY_LIMIT } }, { attemptCount: { $exists: false } }] },
                    {
                        $or: [
                            { status: { $in: ['pending', 'failed'] }, nextAttemptAt: { $lte: now } },
                            { status: 'processing', claimedAt: { $lte: staleBefore } }
                        ]
                    }
                ]
            }, {
                $set: {
                    status: 'processing',
                    claimedAt: now,
                    updatedAt: now
                }
            }, { sort: { createdAt: 1 }, new: true });
            return claimed;
        });
    }
    processPending() {
        return __awaiter(this, arguments, void 0, function* (limit = 50) {
            if (this.processing)
                return;
            this.processing = true;
            try {
                for (let i = 0; i < limit; i++) {
                    const ev = yield this.claimNext();
                    if (!ev)
                        break;
                    if (!(0, ledgerEventStateMachine_1.isClaimableLedgerEvent)({
                        status: 'processing',
                        claimedAt: ev.claimedAt,
                        processorGeneration: ev.processorGeneration,
                        now: new Date(),
                        staleProcessingMs: STALE_PROCESSING_MS,
                        requiredGeneration: ledgerMutationPolicy_1.LEDGER_EVENT_PROCESSOR_GENERATION
                    }) && ev.status !== 'processing') {
                        continue;
                    }
                    try {
                        yield this.execute(ev);
                        ev.status = 'completed';
                        ev.lastError = undefined;
                        ev.updatedAt = new Date();
                        yield ev.save();
                        const eventPaymentId = ev.paymentId ? String(ev.paymentId) : '';
                        if (eventPaymentId) {
                            try {
                                const { refreshPaymentAccountingStatus } = yield Promise.resolve().then(() => __importStar(require('./paymentAccountingReconciliation')));
                                yield refreshPaymentAccountingStatus(eventPaymentId);
                            }
                            catch (refreshErr) {
                                logger_1.logger.warn('LedgerEvent accounting status refresh failed', {
                                    paymentId: eventPaymentId,
                                    error: (refreshErr === null || refreshErr === void 0 ? void 0 : refreshErr.message) || refreshErr
                                });
                            }
                        }
                    }
                    catch (err) {
                        const failureClass = (0, operationalFailure_1.classifyOperationalFailure)(err);
                        const attempts = failureClass === 'transient'
                            ? (ev.attemptCount || 0) + 1
                            : ledgerEventStateMachine_1.LEDGER_RETRY_LIMIT;
                        yield this.recordEventFailure(ev, err, failureClass, attempts);
                    }
                }
            }
            catch (outer) {
                logger_1.logger.error('LedgerEvent processing loop failed:', outer);
            }
            finally {
                this.processing = false;
            }
        });
    }
    companyIdForPayment(paymentId) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!paymentId || !mongoose_1.default.Types.ObjectId.isValid(paymentId))
                return undefined;
            const { Payment } = yield Promise.resolve().then(() => __importStar(require('../models/Payment')));
            const payment = yield Payment.findById(paymentId).select('companyId').lean();
            return (payment === null || payment === void 0 ? void 0 : payment.companyId) ? new mongoose_1.default.Types.ObjectId(String(payment.companyId)) : undefined;
        });
    }
    recordEventFailure(ev, err, failureClass, attempts) {
        return __awaiter(this, void 0, void 0, function* () {
            const exhausted = (0, ledgerEventStateMachine_1.ledgerRetryExhausted)(attempts) || failureClass !== 'transient';
            ev.attemptCount = attempts;
            ev.status = 'failed';
            ev.failureClass = failureClass;
            ev.lastError = (err === null || err === void 0 ? void 0 : err.message)
                ? String(err.message).slice(0, 200)
                : 'ledger event failed';
            ev.correlationId = ev.correlationId || (ev.paymentId ? String(ev.paymentId) : String(ev._id));
            if (!ev.companyId && ev.paymentId) {
                ev.companyId = yield this.companyIdForPayment(String(ev.paymentId));
            }
            ev.nextAttemptAt = exhausted ? undefined : new Date(Date.now() + (0, ledgerEventStateMachine_1.computeLedgerBackoffMs)(attempts));
            ev.exhaustedAt = exhausted ? new Date() : undefined;
            ev.updatedAt = new Date();
            yield ev.save();
            logger_1.logger.warn('ledger_event_failed', {
                correlationId: ev.correlationId,
                eventId: String(ev._id),
                companyId: ev.companyId ? String(ev.companyId) : undefined,
                sourceId: ev.paymentId ? String(ev.paymentId) : undefined,
                type: ev.type,
                attemptCount: attempts,
                failureClass,
                retryExhausted: exhausted
            });
            if (exhausted) {
                (0, operationalSignal_1.signalOperationalFailure)('LEDGER_RETRY_EXHAUSTED', {
                    correlationId: ev.correlationId,
                    eventId: String(ev._id),
                    companyId: ev.companyId ? String(ev.companyId) : undefined,
                    sourceId: ev.paymentId ? String(ev.paymentId) : (ev.levyPaymentId ? String(ev.levyPaymentId) : undefined),
                    type: ev.type,
                    attemptCount: attempts,
                    failureClass,
                    lastAttemptAt: ev.updatedAt.toISOString()
                });
                if (ev.companyId) {
                    yield (0, financialOperationVisibility_1.upsertFinancialReview)({
                        companyId: String(ev.companyId),
                        component: 'LEDGER_RETRY_EXHAUSTED',
                        operationId: String(ev._id),
                        paymentId: ev.paymentId ? String(ev.paymentId) : undefined,
                        missingRecord: `ledger event ${ev.type}`,
                        issueType: 'missing',
                        actual: failureClass,
                        recommendedReview: `Ledger event ${String(ev._id)} for company ${String(ev.companyId)} is ${failureClass} after ${attempts} attempts. Correlation ${ev.correlationId}. Reason: ${ev.lastError}. ${failureClass === 'transient' ? 'An authorised retry repeats this same event.' : 'This failure is not automatically retried.'} Do not create a new financial operation and do not rewrite historical amounts.`
                    });
                }
            }
        });
    }
    /**
     * Authorised retry of one existing ledger event. This does not create a second event.
     * Permanent and conflict failures are refused. The worker retry limit is unchanged.
     */
    retryFailedEvent(eventId, companyId, audit) {
        return __awaiter(this, void 0, void 0, function* () {
            const correlationId = (audit === null || audit === void 0 ? void 0 : audit.requestId) || eventId;
            const auditFailure = (result, operation) => __awaiter(this, void 0, void 0, function* () {
                yield (0, auditService_1.recordAuditEvent)({
                    userId: audit === null || audit === void 0 ? void 0 : audit.userId,
                    companyId,
                    action: 'ledger.retry',
                    entityType: 'LedgerEvent',
                    entityId: eventId,
                    status: 'failure',
                    metadata: { operation: operation || 'unknown', result, correlationId }
                });
            });
            if (!mongoose_1.default.Types.ObjectId.isValid(eventId) || !mongoose_1.default.Types.ObjectId.isValid(companyId)) {
                yield auditFailure('LEDGER_EVENT_COMPANY_MISMATCH');
                const error = new Error('Ledger event was not found for this company');
                error.code = 'LEDGER_EVENT_COMPANY_MISMATCH';
                throw error;
            }
            const existing = yield LedgerEvent_1.default.findById(eventId);
            if (!existing || existing.status !== 'failed') {
                yield auditFailure('LEDGER_EVENT_NOT_RETRYABLE', existing === null || existing === void 0 ? void 0 : existing.type);
                const error = new Error('Only a failed ledger event can be retried');
                error.code = 'LEDGER_EVENT_NOT_RETRYABLE';
                throw error;
            }
            if (existing.failureClass !== 'transient') {
                yield auditFailure('LEDGER_EVENT_NOT_RETRYABLE', existing.type);
                const error = new Error('Permanent and conflict failures are not retried automatically or by this action');
                error.code = 'LEDGER_EVENT_NOT_RETRYABLE';
                throw error;
            }
            const ownerCompany = existing.companyId || (yield this.companyIdForPayment(existing.paymentId ? String(existing.paymentId) : undefined));
            if (!ownerCompany || String(ownerCompany) !== companyId) {
                yield auditFailure('LEDGER_EVENT_COMPANY_MISMATCH', existing.type);
                const error = new Error('Ledger event was not found for this company');
                error.code = 'LEDGER_EVENT_COMPANY_MISMATCH';
                throw error;
            }
            const operationCorrelation = (audit === null || audit === void 0 ? void 0 : audit.requestId) || existing.correlationId || eventId;
            const started = yield (0, auditService_1.recordAuditEvent)({
                userId: audit === null || audit === void 0 ? void 0 : audit.userId,
                companyId,
                action: 'ledger.retry',
                entityType: 'LedgerEvent',
                entityId: eventId,
                status: 'success',
                metadata: { operation: existing.type, result: 'started', correlationId: operationCorrelation }
            });
            if (!started) {
                const error = new Error('Ledger retry was not started because the audit event could not be stored');
                error.code = 'AUDIT_PERSIST_FAILED';
                throw error;
            }
            const claimed = yield LedgerEvent_1.default.findOneAndUpdate({ _id: existing._id, status: 'failed', failureClass: 'transient' }, { $set: { status: 'processing', claimedAt: new Date(), companyId: ownerCompany } }, { new: true });
            if (!claimed) {
                yield auditFailure('LEDGER_EVENT_ALREADY_CLAIMED', existing.type);
                const error = new Error('This ledger event is already being retried');
                error.code = 'LEDGER_EVENT_ALREADY_CLAIMED';
                throw error;
            }
            try {
                yield this.execute(claimed);
                claimed.status = 'completed';
                claimed.lastError = undefined;
                claimed.updatedAt = new Date();
                yield claimed.save();
                yield (0, financialOperationVisibility_1.resolveFinancialReview)(companyId, 'LEDGER_RETRY_EXHAUSTED', String(claimed._id), 'The existing ledger event completed. No new financial operation was created.');
                if (claimed.paymentId) {
                    try {
                        const { refreshPaymentAccountingStatus } = yield Promise.resolve().then(() => __importStar(require('./paymentAccountingReconciliation')));
                        yield refreshPaymentAccountingStatus(String(claimed.paymentId));
                    }
                    catch (refreshErr) {
                        logger_1.logger.warn('LedgerEvent accounting status refresh failed', {
                            paymentId: String(claimed.paymentId),
                            error: (refreshErr === null || refreshErr === void 0 ? void 0 : refreshErr.message) || refreshErr
                        });
                    }
                }
                const auditPersisted = yield (0, auditService_1.recordAuditEvent)({
                    userId: audit === null || audit === void 0 ? void 0 : audit.userId,
                    companyId,
                    action: 'ledger.retry',
                    entityType: 'LedgerEvent',
                    entityId: eventId,
                    status: 'success',
                    metadata: { operation: claimed.type, result: 'completed', correlationId: operationCorrelation }
                });
                if (!auditPersisted)
                    yield this.recordMissingRetryAudit(claimed, operationCorrelation, 'completed');
                return { status: 'completed', retriedExistingEvent: true, auditPersisted };
            }
            catch (err) {
                const failureClass = (0, operationalFailure_1.classifyOperationalFailure)(err);
                const attempts = failureClass === 'transient' ? (claimed.attemptCount || 0) + 1 : ledgerEventStateMachine_1.LEDGER_RETRY_LIMIT;
                yield this.recordEventFailure(claimed, err, failureClass, attempts);
                const auditPersisted = yield (0, auditService_1.recordAuditEvent)({
                    userId: audit === null || audit === void 0 ? void 0 : audit.userId,
                    companyId,
                    action: 'ledger.retry',
                    entityType: 'LedgerEvent',
                    entityId: eventId,
                    status: 'failure',
                    metadata: { operation: claimed.type, result: failureClass, correlationId: operationCorrelation }
                });
                if (!auditPersisted)
                    yield this.recordMissingRetryAudit(claimed, operationCorrelation, failureClass);
                throw err;
            }
        });
    }
    /**
     * The financial outcome is already stored. A missing audit event is recorded
     * without reversing that outcome and without posting it again.
     */
    recordMissingRetryAudit(ev, correlationId, result) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                ev.metadata = Object.assign(Object.assign({}, (ev.metadata || {})), { auditPersisted: false, auditGapResult: result, auditCorrelationId: correlationId });
                ev.markModified('metadata');
                yield ev.save();
            }
            catch (error) {
                logger_1.logger.error('ledger_retry_audit_gap_unpersisted', {
                    correlationId,
                    eventId: String(ev._id),
                    result,
                    error: String((error === null || error === void 0 ? void 0 : error.message) || error).slice(0, 200)
                });
                return;
            }
            if (!ev.companyId) {
                logger_1.logger.error('ledger_retry_audit_gap_unpersisted', { correlationId, eventId: String(ev._id), result });
                return;
            }
            try {
                yield (0, financialOperationVisibility_1.upsertFinancialReview)({
                    companyId: String(ev.companyId),
                    component: 'AUDIT_EVENT_MISSING',
                    operationId: String(ev._id),
                    paymentId: ev.paymentId ? String(ev.paymentId) : undefined,
                    missingRecord: 'ledger retry audit event',
                    issueType: 'missing',
                    recommendedReview: `Ledger retry ${String(ev._id)} kept its financial outcome, and the audit event was not stored. Correlation ${correlationId}. Result ${result}. Do not post this operation again.`
                });
            }
            catch (error) {
                logger_1.logger.error('ledger_retry_audit_gap_unpersisted', {
                    correlationId,
                    eventId: String(ev._id),
                    result,
                    error: String((error === null || error === void 0 ? void 0 : error.message) || error).slice(0, 200)
                });
            }
        });
    }
    execute(ev) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b, _c, _d;
            const paymentId = ev.paymentId ? ev.paymentId.toString() : '';
            if (ev.type === 'journal' && paymentId) {
                const { Payment } = yield Promise.resolve().then(() => __importStar(require('../models/Payment')));
                const accountingIntegrationService = (yield Promise.resolve().then(() => __importStar(require('./accountingIntegrationService')))).default;
                const payment = yield Payment.findById(paymentId);
                if (!payment)
                    throw new Error(`Payment not found: ${paymentId}`);
                yield accountingIntegrationService.syncPaymentReceived(payment);
                return;
            }
            if ((ev.type === 'owner_income' || ev.type === 'agent_commission' || ev.type === 'company_commission') && paymentId) {
                const { postPaymentAccounting } = yield Promise.resolve().then(() => __importStar(require('./paymentAccountingOrchestrator')));
                const result = yield postPaymentAccounting(paymentId);
                if (result.status === 'partial' || result.status === 'failed') {
                    throw new Error(result.errors.join('; ') || 'accounting projection still incomplete');
                }
                return;
            }
            if (ev.type === 'payment_reversal' && paymentId) {
                const { reversePaymentAccounting } = yield Promise.resolve().then(() => __importStar(require('./paymentAccountingOrchestrator')));
                const result = yield reversePaymentAccounting(paymentId, {
                    reason: String(((_a = ev.metadata) === null || _a === void 0 ? void 0 : _a.reason) || 'ledger_event_retry'),
                    reversalPaymentId: ((_b = ev.metadata) === null || _b === void 0 ? void 0 : _b.reversalPaymentId)
                        ? String(ev.metadata.reversalPaymentId)
                        : undefined
                });
                if (result.status === 'partial' || result.status === 'failed') {
                    throw new Error(result.errors.join('; ') || 'reversal still incomplete');
                }
                return;
            }
            if (ev.type === 'levy_collection') {
                const levyPaymentId = ev.levyPaymentId ? String(ev.levyPaymentId) : String(((_c = ev.metadata) === null || _c === void 0 ? void 0 : _c.levyPaymentId) || '');
                if (!levyPaymentId)
                    throw new Error('levy_collection event missing levyPaymentId');
                yield this.repostLevyCollection(levyPaymentId);
                return;
            }
            if (ev.type === 'levy_payout') {
                const levyPaymentId = ev.levyPaymentId ? String(ev.levyPaymentId) : String(((_d = ev.metadata) === null || _d === void 0 ? void 0 : _d.levyPaymentId) || '');
                if (!levyPaymentId)
                    throw new Error('levy_payout event missing levyPaymentId');
                yield this.repostLevyPayout(levyPaymentId);
                return;
            }
        });
    }
    repostLevyCollection(levyPaymentId) {
        return __awaiter(this, void 0, void 0, function* () {
            const { LevyPayment } = yield Promise.resolve().then(() => __importStar(require('../models/LevyPayment')));
            const levy = yield LevyPayment.findById(levyPaymentId);
            if (!levy)
                throw new Error(`LevyPayment ${levyPaymentId} not found`);
            yield propertyAccountService_1.default.recordPassThroughCollection({
                propertyId: String(levy.propertyId),
                companyId: String(levy.companyId),
                chargeType: 'LEVY',
                amount: Number(levy.amount || 0),
                date: levy.paymentDate,
                levyPaymentId: String(levy._id),
                referenceNumber: levy.referenceNumber,
                description: `Levies collected - ${levy.referenceNumber || levy._id}`,
                processedBy: String(levy.processedBy || ''),
                notes: levy.notes,
                idempotencyKey: `levy-payment:${String(levy._id)}:collection`
            });
        });
    }
    repostLevyPayout(levyPaymentId) {
        return __awaiter(this, void 0, void 0, function* () {
            const { LevyPayment } = yield Promise.resolve().then(() => __importStar(require('../models/LevyPayment')));
            const levy = yield LevyPayment.findById(levyPaymentId);
            if (!levy)
                throw new Error(`LevyPayment ${levyPaymentId} not found`);
            const payout = levy.get('payout') || {};
            yield propertyAccountService_1.default.recordPassThroughPayment({
                propertyId: String(levy.propertyId),
                companyId: String(levy.companyId),
                chargeType: 'LEVY',
                amount: Number(levy.amount || 0),
                date: payout.payoutDate ? new Date(payout.payoutDate) : new Date(),
                levyPaymentId: String(levy._id),
                referenceNumber: payout.payoutReference || levy.referenceNumber,
                description: `Levies paid - ${payout.payoutReference || levy.referenceNumber || levy._id}`,
                processedBy: String(payout.processedBy || levy.processedBy || ''),
                notes: payout.notes,
                idempotencyKey: `levy-payment:${String(levy._id)}:payout`
            });
        });
    }
}
exports.default = LedgerEventService.getInstance();
