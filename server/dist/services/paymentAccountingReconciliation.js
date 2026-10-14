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
exports.buildAccountingRepairPlan = exports.deriveAccountingComplete = exports.deriveAccountingStatus = exports.evaluateAccountingReconciliation = exports.buildExpectedAccountingProjection = void 0;
exports.loadAccountingActualSnapshot = loadAccountingActualSnapshot;
exports.reconcilePayment = reconcilePayment;
exports.persistAccountingIntegrityFromRecon = persistAccountingIntegrityFromRecon;
exports.upsertIncompleteAccountingException = upsertIncompleteAccountingException;
exports.resolveIncompleteAccountingException = resolveIncompleteAccountingException;
exports.applyReconciliationOutcome = applyReconciliationOutcome;
exports.ensureDepositLedgerFromPayment = ensureDepositLedgerFromPayment;
exports.repairPaymentAccounting = repairPaymentAccounting;
exports.ensurePaymentAccountingPosted = ensurePaymentAccountingPosted;
exports.refreshPaymentAccountingStatus = refreshPaymentAccountingStatus;
exports.initialAccountingStatusForNewPayment = initialAccountingStatusForNewPayment;
exports.initialAccountingIntegrityFields = initialAccountingIntegrityFields;
exports.activateAccountingTrackingForCompletion = activateAccountingTrackingForCompletion;
const mongoose_1 = __importDefault(require("mongoose"));
const logger_1 = require("../utils/logger");
const Payment_1 = require("../models/Payment");
const PropertyAccount_1 = __importDefault(require("../models/PropertyAccount"));
const AgentAccount_1 = require("../models/AgentAccount");
const CompanyAccount_1 = require("../models/CompanyAccount");
const JournalEntry_1 = require("../models/JournalEntry");
const JournalLine_1 = require("../models/JournalLine");
const VatRecord_1 = require("../models/VatRecord");
const rentalDeposit_1 = require("../models/rentalDeposit");
const AccountingEventLog_1 = require("../models/AccountingEventLog");
const AccountingException_1 = require("../models/AccountingException");
const paymentAccountingOrchestrator_1 = require("./paymentAccountingOrchestrator");
const paymentAccountingProjection_1 = require("./paymentAccountingProjection");
Object.defineProperty(exports, "buildAccountingRepairPlan", { enumerable: true, get: function () { return paymentAccountingProjection_1.buildAccountingRepairPlan; } });
Object.defineProperty(exports, "buildExpectedAccountingProjection", { enumerable: true, get: function () { return paymentAccountingProjection_1.buildExpectedAccountingProjection; } });
Object.defineProperty(exports, "deriveAccountingComplete", { enumerable: true, get: function () { return paymentAccountingProjection_1.deriveAccountingComplete; } });
Object.defineProperty(exports, "deriveAccountingStatus", { enumerable: true, get: function () { return paymentAccountingProjection_1.deriveAccountingStatus; } });
Object.defineProperty(exports, "evaluateAccountingReconciliation", { enumerable: true, get: function () { return paymentAccountingProjection_1.evaluateAccountingReconciliation; } });
const paymentAccountingCompleteness_1 = require("./paymentAccountingCompleteness");
const money_1 = require("../utils/money");
function asObjectId(paymentId) {
    return mongoose_1.default.Types.ObjectId.isValid(paymentId) ? new mongoose_1.default.Types.ObjectId(paymentId) : null;
}
function linkedId(value) {
    if (value == null || value === '')
        return undefined;
    return String(value);
}
function loadAccountingActualSnapshot(payment) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b;
        const paymentId = String((payment === null || payment === void 0 ? void 0 : payment._id) || '');
        const isSale = String((payment === null || payment === void 0 ? void 0 : payment.paymentType) || '') === 'sale';
        const computedOwnerIncomeAmount = (0, paymentAccountingCompleteness_1.computeOwnerIncomeAmount)({
            isSale,
            ownerAmount: (_a = payment === null || payment === void 0 ? void 0 : payment.commissionDetails) === null || _a === void 0 ? void 0 : _a.ownerAmount,
            passThroughTotal: Number((payment === null || payment === void 0 ? void 0 : payment.levyAllocated) || 0)
        });
        const empty = {
            ownerIncome: false,
            agentCommission: false,
            companyCommission: false,
            journal: false,
            vat: false,
            deposit: false,
            computedOwnerIncomeAmount,
            amounts: {},
            linkedPaymentIds: {},
            duplicates: {}
        };
        const oid = asObjectId(paymentId);
        if (!oid)
            return empty;
        const [propertyAccount, agentAccounts, companyAccount, journalHit, vatHit, deposits] = yield Promise.all([
            PropertyAccount_1.default.findOne({
                isArchived: { $ne: true },
                isActive: { $ne: false },
                transactions: {
                    $elemMatch: {
                        type: 'income',
                        status: 'completed',
                        idempotencyKey: `payment:${paymentId}`
                    }
                }
            }).select('transactions.type transactions.status transactions.amount transactions.paymentId transactions.idempotencyKey').lean(),
            AgentAccount_1.AgentAccount.find({
                transactions: {
                    $elemMatch: {
                        type: 'commission',
                        status: 'completed',
                        paymentId: paymentId
                    }
                }
            }).select('transactions.type transactions.status transactions.amount transactions.paymentId').lean(),
            CompanyAccount_1.CompanyAccount.findOne({
                transactions: {
                    $elemMatch: {
                        paymentId: oid,
                        isArchived: { $ne: true }
                    }
                }
            }).select('transactions.paymentId transactions.amount transactions.isArchived').lean(),
            JournalEntry_1.JournalEntry.findOne({
                sourceId: paymentId,
                status: 'posted'
            }).select('_id sourceId').lean(),
            VatRecord_1.VatRecord.findOne({ transactionId: paymentId }).select('_id transactionId vatCollected').lean(),
            rentalDeposit_1.RentalDeposit.find({ paymentId: oid, type: 'payment' }).select('_id paymentId depositAmount').lean()
        ]);
        const incomeTxs = ((propertyAccount === null || propertyAccount === void 0 ? void 0 : propertyAccount.transactions) || []).filter((tx) => String((tx === null || tx === void 0 ? void 0 : tx.type) || '') === 'income'
            && String((tx === null || tx === void 0 ? void 0 : tx.status) || '') === 'completed'
            && String((tx === null || tx === void 0 ? void 0 : tx.idempotencyKey) || '') === `payment:${paymentId}`);
        const incomeTx = incomeTxs[0];
        const agentTxs = [];
        for (const account of agentAccounts) {
            for (const tx of (account === null || account === void 0 ? void 0 : account.transactions) || []) {
                if (String((tx === null || tx === void 0 ? void 0 : tx.type) || '') === 'commission'
                    && String((tx === null || tx === void 0 ? void 0 : tx.status) || '') === 'completed'
                    && (0, money_1.idsEqual)(tx === null || tx === void 0 ? void 0 : tx.paymentId, paymentId)) {
                    agentTxs.push(tx);
                }
            }
        }
        const companyTxs = ((companyAccount === null || companyAccount === void 0 ? void 0 : companyAccount.transactions) || []).filter((tx) => (0, money_1.idsEqual)(tx === null || tx === void 0 ? void 0 : tx.paymentId, paymentId) && (tx === null || tx === void 0 ? void 0 : tx.isArchived) !== true);
        const companyTx = companyTxs[0];
        const depositDoc = deposits[0];
        let journalAmount;
        if (journalHit) {
            const lines = yield JournalLine_1.JournalLine.find({ journalEntryId: journalHit._id }).select('debit credit').lean();
            journalAmount = (0, money_1.roundMoney)(lines.reduce((sum, line) => sum + Number((line === null || line === void 0 ? void 0 : line.debit) || 0), 0));
        }
        return {
            ownerIncome: Boolean(incomeTx),
            agentCommission: agentTxs.length > 0,
            companyCommission: Boolean(companyTx),
            journal: Boolean(journalHit),
            vat: Boolean(vatHit),
            deposit: Boolean(depositDoc),
            computedOwnerIncomeAmount,
            amounts: {
                ownerIncome: incomeTx ? (0, money_1.roundMoney)(Number(incomeTx.amount || 0)) : undefined,
                agentCommission: agentTxs.length ? (0, money_1.roundMoney)(agentTxs.reduce((sum, tx) => sum + Number(tx.amount || 0), 0)) : undefined,
                companyCommission: companyTx ? (0, money_1.roundMoney)(Number(companyTx.amount || 0)) : undefined,
                journal: journalAmount,
                vat: vatHit ? (0, money_1.roundMoney)(Number(vatHit.vatCollected || 0)) : undefined,
                deposit: depositDoc ? (0, money_1.roundMoney)(Number(depositDoc.depositAmount || 0)) : undefined
            },
            linkedPaymentIds: {
                ownerIncome: linkedId(incomeTx === null || incomeTx === void 0 ? void 0 : incomeTx.paymentId) || (incomeTx ? paymentId : undefined),
                agentCommission: agentTxs.length ? linkedId((_b = agentTxs[0]) === null || _b === void 0 ? void 0 : _b.paymentId) : undefined,
                companyCommission: linkedId(companyTx === null || companyTx === void 0 ? void 0 : companyTx.paymentId),
                journal: linkedId(journalHit === null || journalHit === void 0 ? void 0 : journalHit.sourceId),
                vat: linkedId(vatHit === null || vatHit === void 0 ? void 0 : vatHit.transactionId),
                deposit: linkedId(depositDoc === null || depositDoc === void 0 ? void 0 : depositDoc.paymentId)
            },
            duplicates: {
                ownerIncome: incomeTxs.length || undefined,
                companyCommission: companyTxs.length || undefined,
                deposit: deposits.length || undefined
            }
        };
    });
}
/** Read-only comparison. Never writes ledgers, payments, or exceptions. */
function reconcilePayment(paymentId) {
    return __awaiter(this, void 0, void 0, function* () {
        const payment = yield Payment_1.Payment.findById(paymentId);
        if (!payment) {
            return {
                paymentId,
                expected: (0, paymentAccountingProjection_1.buildExpectedAccountingProjection)(null),
                actual: {
                    ownerIncome: false,
                    agentCommission: false,
                    companyCommission: false,
                    journal: false,
                    vat: false,
                    deposit: false
                },
                status: 'failed',
                accountingComplete: false,
                missing: [],
                mismatched: [],
                issues: [],
                componentStatus: {
                    ownerIncome: 'MISSING',
                    agentCommission: 'MISSING',
                    companyCommission: 'MISSING',
                    journal: 'MISSING',
                    vat: 'MISSING',
                    deposit: 'MISSING'
                }
            };
        }
        const expected = (0, paymentAccountingProjection_1.buildExpectedAccountingProjection)(payment);
        const actual = yield loadAccountingActualSnapshot(payment);
        return (0, paymentAccountingProjection_1.evaluateAccountingReconciliation)({
            paymentId: String(payment._id),
            propertyId: payment.propertyId ? String(payment.propertyId) : undefined,
            expected,
            actual
        });
    });
}
function diagnosticStatusFromRecon(recon) {
    return (0, paymentAccountingProjection_1.deriveAccountingStatus)({
        reconStatus: recon.status,
        missing: recon.missing
    });
}
/**
 * Persist binary integrity on already-tracked payments only.
 * Historical documents (no accountingComplete and no accountingStatus) are never stamped.
 * Does not write financial ledgers.
 */
function persistAccountingIntegrityFromRecon(paymentId, recon, extra) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        const payment = yield Payment_1.Payment.findById(paymentId)
            .select('accountingComplete accountingStatus')
            .lean();
        const accountingComplete = recon.accountingComplete;
        const accountingStatus = diagnosticStatusFromRecon(recon);
        if (!payment || (0, paymentAccountingProjection_1.isHistoricalUntrackedPayment)(payment)) {
            return { accountingComplete, accountingStatus };
        }
        const now = new Date();
        const set = {
            accountingComplete,
            accountingStatus,
            accountingLastAttemptAt: now,
            accountingMissing: recon.missing,
            accountingMismatched: recon.mismatched || []
        };
        const unset = {};
        if (accountingComplete) {
            set.accountingPostedAt = now;
            unset.accountingLastError = 1;
            unset.accountingNextAttemptAt = 1;
        }
        else {
            set.accountingLastError = (extra === null || extra === void 0 ? void 0 : extra.lastError)
                || (((_a = recon.mismatched) === null || _a === void 0 ? void 0 : _a.length) ? `mismatched:${recon.mismatched.join(',')}` : undefined)
                || (recon.missing.length ? recon.missing.join(',') : 'incomplete');
        }
        const update = { $set: set };
        if (Object.keys(unset).length)
            update.$unset = unset;
        yield Payment_1.Payment.updateOne({ _id: paymentId }, update);
        return { accountingComplete, accountingStatus };
    });
}
function upsertIncompleteAccountingException(input) {
    return __awaiter(this, void 0, void 0, function* () {
        const oid = asObjectId(input.paymentId);
        if (!oid)
            return;
        const now = new Date();
        const mismatched = input.recon.mismatched || [];
        const issueType = mismatched.length ? 'mismatched' : 'missing';
        const primary = (input.recon.issues || [])[0];
        yield AccountingException_1.AccountingException.updateOne({ kind: 'incomplete_projection', paymentId: oid }, {
            $set: {
                status: 'open',
                issueType,
                component: primary === null || primary === void 0 ? void 0 : primary.component,
                expected: primary === null || primary === void 0 ? void 0 : primary.expected,
                actual: primary === null || primary === void 0 ? void 0 : primary.actual,
                difference: typeof (primary === null || primary === void 0 ? void 0 : primary.difference) === 'number' ? primary.difference : undefined,
                issues: input.recon.issues || [],
                companyId: input.companyId && mongoose_1.default.Types.ObjectId.isValid(input.companyId)
                    ? new mongoose_1.default.Types.ObjectId(input.companyId)
                    : undefined,
                propertyId: input.propertyId && mongoose_1.default.Types.ObjectId.isValid(input.propertyId)
                    ? new mongoose_1.default.Types.ObjectId(input.propertyId)
                    : undefined,
                missingComponents: input.recon.missing,
                error: input.error
                    || (mismatched.length ? `mismatched:${mismatched.join(',')}` : undefined)
                    || (input.recon.missing.length ? input.recon.missing.join(',') : 'incomplete'),
                lastCheckedAt: now
            },
            $unset: {
                resolvedAt: 1,
                resolvedBy: 1,
                resolution: 1
            },
            $setOnInsert: {
                kind: 'incomplete_projection',
                paymentId: oid,
                detectedAt: now
            }
        }, { upsert: true });
    });
}
function resolveIncompleteAccountingException(paymentId, opts) {
    return __awaiter(this, void 0, void 0, function* () {
        const oid = asObjectId(paymentId);
        if (!oid)
            return;
        const now = new Date();
        yield AccountingException_1.AccountingException.updateMany({ kind: 'incomplete_projection', paymentId: oid, status: 'open' }, {
            $set: {
                status: 'resolved',
                lastCheckedAt: now,
                resolvedAt: now,
                resolvedBy: (opts === null || opts === void 0 ? void 0 : opts.resolvedBy) && mongoose_1.default.Types.ObjectId.isValid(opts.resolvedBy)
                    ? new mongoose_1.default.Types.ObjectId(opts.resolvedBy)
                    : undefined,
                resolution: (opts === null || opts === void 0 ? void 0 : opts.resolution) || 'reconcilePayment returned complete'
            }
        });
    });
}
function applyReconciliationOutcome(paymentId, recon, extra) {
    return __awaiter(this, void 0, void 0, function* () {
        const persisted = yield persistAccountingIntegrityFromRecon(paymentId, recon, extra);
        if (recon.accountingComplete) {
            yield resolveIncompleteAccountingException(paymentId, { resolution: 'reconcilePayment returned VALID/complete' });
        }
        else if (recon.status === 'incomplete' || recon.status === 'failed') {
            yield upsertIncompleteAccountingException({
                paymentId,
                companyId: extra === null || extra === void 0 ? void 0 : extra.companyId,
                propertyId: recon.propertyId,
                recon,
                error: extra === null || extra === void 0 ? void 0 : extra.lastError
            });
        }
        return persisted;
    });
}
function ensureDepositLedgerFromPayment(payment, session) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        const depositAmount = Number((payment === null || payment === void 0 ? void 0 : payment.depositAmount) || 0);
        if (depositAmount <= 0 || !(payment === null || payment === void 0 ? void 0 : payment._id))
            return 'skipped';
        if (payment.reversalOfPaymentId || Number(payment.amount || 0) < 0)
            return 'skipped';
        const filter = { paymentId: payment._id, type: 'payment' };
        const insertDoc = {
            propertyId: payment.propertyId,
            agentId: payment.agentId,
            companyId: payment.companyId,
            tenantId: payment.tenantId,
            depositAmount,
            depositDate: payment.paymentDate || new Date(),
            paymentId: payment._id,
            type: 'payment',
            referenceNumber: payment.referenceNumber,
            notes: payment.notes || '',
            processedBy: payment.processedBy,
            paymentMethod: payment.paymentMethod
        };
        const existing = yield rentalDeposit_1.RentalDeposit.findOne(filter).select('_id').session(session || null).lean();
        if (existing)
            return 'existing';
        try {
            const result = yield rentalDeposit_1.RentalDeposit.findOneAndUpdate(filter, { $setOnInsert: insertDoc }, { upsert: true, new: true, rawResult: true, session: session || undefined });
            const upserted = Boolean(((_a = result === null || result === void 0 ? void 0 : result.lastErrorObject) === null || _a === void 0 ? void 0 : _a.upserted) || (result === null || result === void 0 ? void 0 : result.upsertedId));
            return upserted ? 'inserted' : 'existing';
        }
        catch (e) {
            const raced = yield rentalDeposit_1.RentalDeposit.findOne(filter).select('_id').session(session || null).lean();
            if (raced)
                return 'existing';
            throw e;
        }
    });
}
function writeRepairAudit(input) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!input.companyId)
            return;
        try {
            yield AccountingEventLog_1.AccountingEventLog.create({
                companyId: new mongoose_1.default.Types.ObjectId(input.companyId),
                eventType: 'payment_accounting_repair',
                sourceModule: 'payment',
                sourceId: input.paymentId,
                success: input.result === 'complete' || input.dryRun,
                message: input.dryRun ? 'dry-run' : input.result,
                metadata: {
                    paymentId: input.paymentId,
                    performedBy: input.userId,
                    user: input.userId,
                    timestamp: new Date().toISOString(),
                    reason: input.reason || '',
                    dryRun: input.dryRun,
                    previousStatus: input.previousStatus,
                    previousComplete: input.previousComplete,
                    detectedIssues: input.detectedIssues || [],
                    componentsDetectedMissing: input.componentsDetectedMissing,
                    componentsMismatched: input.componentsMismatched || [],
                    componentsCreated: input.componentsCreated,
                    recordsCreated: input.componentsCreated,
                    recordsModified: input.componentsModified || [],
                    recordsSkipped: input.componentsSkipped,
                    componentsSkipped: input.componentsSkipped,
                    result: input.result,
                    finalReconciliation: input.finalRecon
                        ? {
                            accountingComplete: input.finalRecon.accountingComplete,
                            status: input.finalRecon.status,
                            missing: input.finalRecon.missing,
                            mismatched: input.finalRecon.mismatched,
                            issues: input.finalRecon.issues
                        }
                        : undefined
                }
            });
        }
        catch (e) {
            logger_1.logger.warn('Failed to write accounting repair audit', {
                paymentId: input.paymentId,
                error: (e === null || e === void 0 ? void 0 : e.message) || e
            });
        }
    });
}
/**
 * Explicit, targeted, payment-scoped repair. Never called by the integrity job.
 * Dry-run writes nothing financial. Write mode only creates missing projections via existing writers.
 * Mismatched projections are not auto-corrected.
 */
function repairPaymentAccounting(paymentId, opts) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b;
        if (!paymentId || !String(paymentId).trim()) {
            throw new Error('repairPaymentAccounting requires an explicit paymentId');
        }
        const dryRun = (opts === null || opts === void 0 ? void 0 : opts.dryRun) === true;
        const reason = String((opts === null || opts === void 0 ? void 0 : opts.reason) || '').trim();
        if (!dryRun && !reason) {
            const err = new Error('Manual accounting repair requires a non-empty reason');
            err.statusCode = 400;
            throw err;
        }
        const reconBefore = yield reconcilePayment(paymentId);
        const plan = (0, paymentAccountingProjection_1.buildAccountingRepairPlan)(reconBefore);
        const payment = yield Payment_1.Payment.findById(paymentId).select('companyId').lean();
        const companyId = (payment === null || payment === void 0 ? void 0 : payment.companyId) ? String(payment.companyId) : undefined;
        if (dryRun) {
            yield writeRepairAudit({
                paymentId,
                companyId,
                userId: opts === null || opts === void 0 ? void 0 : opts.userId,
                reason,
                dryRun: true,
                previousStatus: reconBefore.status,
                previousComplete: reconBefore.accountingComplete,
                detectedIssues: reconBefore.issues,
                componentsDetectedMissing: reconBefore.missing,
                componentsMismatched: reconBefore.mismatched,
                componentsCreated: [],
                componentsSkipped: plan.wouldNotModify,
                result: reconBefore.status,
                finalRecon: reconBefore
            });
            return {
                dryRun: true,
                recon: reconBefore,
                plan,
                accountingComplete: reconBefore.accountingComplete,
                accountingStatus: diagnosticStatusFromRecon(reconBefore),
                componentsCreated: [],
                componentsSkipped: plan.wouldNotModify,
                requiresManualReview: plan.requiresManualReview
            };
        }
        let postResult = { errors: [] };
        let depositResult = 'skipped';
        if (plan.wouldCreate.length > 0) {
            postResult = yield (0, paymentAccountingOrchestrator_1.postPaymentAccounting)(paymentId, { createdBy: (opts === null || opts === void 0 ? void 0 : opts.createdBy) || (opts === null || opts === void 0 ? void 0 : opts.userId) });
            const paymentDoc = yield Payment_1.Payment.findById(paymentId);
            if (paymentDoc && plan.wouldCreate.includes('deposit')) {
                try {
                    depositResult = yield ensureDepositLedgerFromPayment(paymentDoc);
                }
                catch (e) {
                    logger_1.logger.warn('Deposit ledger repair failed', { paymentId, error: (e === null || e === void 0 ? void 0 : e.message) || e });
                }
            }
        }
        const recon = yield reconcilePayment(paymentId);
        const persisted = yield applyReconciliationOutcome(paymentId, recon, {
            lastError: ((_a = postResult.errors) === null || _a === void 0 ? void 0 : _a.length)
                ? postResult.errors.join('; ')
                : (((_b = recon.mismatched) === null || _b === void 0 ? void 0 : _b.length) ? `mismatched:${recon.mismatched.join(',')}` : undefined),
            companyId
        });
        const created = reconBefore.missing.filter((c) => !recon.missing.includes(c));
        if (depositResult === 'inserted' && !created.includes('deposit'))
            created.push('deposit');
        const finalPlan = (0, paymentAccountingProjection_1.buildAccountingRepairPlan)(recon);
        yield writeRepairAudit({
            paymentId,
            companyId,
            userId: opts === null || opts === void 0 ? void 0 : opts.userId,
            reason,
            dryRun: false,
            previousStatus: reconBefore.status,
            previousComplete: reconBefore.accountingComplete,
            detectedIssues: reconBefore.issues,
            componentsDetectedMissing: reconBefore.missing,
            componentsMismatched: reconBefore.mismatched,
            componentsCreated: created,
            componentsModified: [],
            componentsSkipped: plan.wouldNotModify,
            result: recon.status,
            finalRecon: recon
        });
        logger_1.logger.info('Explicit payment accounting repair finished', {
            paymentId,
            attempt: 1,
            reason,
            result: recon.status,
            missing: recon.missing,
            mismatched: recon.mismatched,
            requiresManualReview: finalPlan.requiresManualReview,
            timestamp: new Date().toISOString(),
            dryRun: false
        });
        return {
            dryRun: false,
            recon,
            plan: finalPlan,
            accountingComplete: persisted.accountingComplete,
            accountingStatus: persisted.accountingStatus,
            componentsCreated: created,
            componentsSkipped: plan.wouldNotModify,
            requiresManualReview: finalPlan.requiresManualReview
        };
    });
}
/**
 * Normal payment-creation posting + verification. Not a repair loop.
 * If projection is incomplete, the payment remains saved and accountingComplete stays false.
 */
function ensurePaymentAccountingPosted(paymentId, opts) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b;
        const postResult = yield (0, paymentAccountingOrchestrator_1.postPaymentAccounting)(paymentId, { createdBy: opts === null || opts === void 0 ? void 0 : opts.createdBy });
        const recon = yield reconcilePayment(paymentId);
        const payment = yield Payment_1.Payment.findById(paymentId).select('companyId').lean();
        const persisted = yield applyReconciliationOutcome(paymentId, recon, {
            lastError: ((_a = postResult.errors) === null || _a === void 0 ? void 0 : _a.length) ? postResult.errors.join('; ') : undefined,
            companyId: (payment === null || payment === void 0 ? void 0 : payment.companyId) ? String(payment.companyId) : undefined
        });
        if (!recon.accountingComplete) {
            logger_1.logger.warn('Payment accounting incomplete after posting', {
                paymentId,
                reason: ((_b = postResult.errors) === null || _b === void 0 ? void 0 : _b.length) ? postResult.errors.join('; ') : recon.missing.join(','),
                result: recon.status,
                missing: recon.missing,
                timestamp: new Date().toISOString()
            });
        }
        return { recon, accountingComplete: persisted.accountingComplete, accountingStatus: persisted.accountingStatus };
    });
}
/** Observation-only status refresh after an existing writer succeeds. Never posts ledgers. */
function refreshPaymentAccountingStatus(paymentId) {
    return __awaiter(this, void 0, void 0, function* () {
        const tracked = yield Payment_1.Payment.findById(paymentId).select('accountingComplete accountingStatus companyId').lean();
        if (!tracked || (0, paymentAccountingProjection_1.isHistoricalUntrackedPayment)(tracked))
            return 'untouched';
        const recon = yield reconcilePayment(paymentId);
        const persisted = yield applyReconciliationOutcome(paymentId, recon, {
            companyId: tracked.companyId ? String(tracked.companyId) : undefined
        });
        return persisted.accountingStatus;
    });
}
function initialAccountingStatusForNewPayment(payment) {
    if (payment.isProvisional === true || payment.isInSuspense === true)
        return 'not_applicable';
    if (String(payment.status || '') === 'completed')
        return 'pending';
    return undefined;
}
function initialAccountingIntegrityFields(payment) {
    const status = initialAccountingStatusForNewPayment(payment);
    if (status === 'not_applicable')
        return { accountingStatus: 'not_applicable', accountingComplete: true };
    if (status === 'pending')
        return { accountingStatus: 'pending', accountingComplete: false };
    return {};
}
/** Mark a payment as integrity-tracked when it first becomes a completed posting candidate. */
function activateAccountingTrackingForCompletion(payment) {
    if (!payment)
        return;
    const current = String(payment.accountingStatus || '');
    if (!current || current === 'not_applicable' || payment.accountingComplete == null) {
        payment.accountingStatus = 'pending';
        payment.accountingComplete = false;
    }
}
