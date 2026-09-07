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
    enqueueOwnerIncomeEvent(paymentId) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.enqueueEvent('owner_income', paymentId);
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
                yield LedgerEvent_1.default.create({
                    type,
                    paymentId: paymentId ? new mongoose_1.default.Types.ObjectId(paymentId) : undefined,
                    levyPaymentId: (metadata === null || metadata === void 0 ? void 0 : metadata.levyPaymentId)
                        ? new mongoose_1.default.Types.ObjectId(String(metadata.levyPaymentId))
                        : undefined,
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
                $or: [
                    { status: { $in: ['pending', 'failed'] }, nextAttemptAt: { $lte: now } },
                    { status: 'processing', claimedAt: { $lte: staleBefore } }
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
                    }
                    catch (err) {
                        const attempts = (ev.attemptCount || 0) + 1;
                        ev.attemptCount = attempts;
                        ev.status = 'failed';
                        ev.lastError = (err === null || err === void 0 ? void 0 : err.message) ? String(err.message) : String(err);
                        ev.nextAttemptAt = new Date(Date.now() + (0, ledgerEventStateMachine_1.computeLedgerBackoffMs)(attempts));
                        ev.updatedAt = new Date();
                        yield ev.save();
                        logger_1.logger.warn(`LedgerEvent ${ev._id} failed (attempt ${attempts}), next try in ${Math.round((0, ledgerEventStateMachine_1.computeLedgerBackoffMs)(attempts) / 1000)}s:`, ev.lastError);
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
    execute(ev) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b, _c, _d;
            const paymentId = ev.paymentId ? ev.paymentId.toString() : '';
            if (ev.type === 'owner_income' && paymentId) {
                yield propertyAccountService_1.default.recordIncomeFromPayment(paymentId);
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
            if (ev.type === 'agent_commission' && paymentId) {
                const agentAccountService = (yield Promise.resolve().then(() => __importStar(require('./agentAccountService')))).default;
                yield agentAccountService.syncCommissionForPayment(paymentId);
                return;
            }
            if (ev.type === 'company_commission' && paymentId) {
                const { Payment } = yield Promise.resolve().then(() => __importStar(require('../models/Payment')));
                const accountingIntegrationService = (yield Promise.resolve().then(() => __importStar(require('./accountingIntegrationService')))).default;
                const payment = yield Payment.findById(paymentId);
                if (!payment)
                    return;
                yield accountingIntegrationService.postCompanyCommission(payment);
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
