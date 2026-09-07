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
exports.postPaymentAccounting = postPaymentAccounting;
exports.reversePaymentAccounting = reversePaymentAccounting;
const logger_1 = require("../utils/logger");
const accountingPostingPolicy_1 = require("./accountingPostingPolicy");
const ledgerEventService_1 = __importDefault(require("./ledgerEventService"));
const propertyAccountService_1 = __importDefault(require("./propertyAccountService"));
const agentAccountService_1 = __importDefault(require("./agentAccountService"));
const accountingIntegrationService_1 = __importDefault(require("./accountingIntegrationService"));
const Payment_1 = require("../models/Payment");
const ledgerEventStateMachine_1 = require("./ledgerEventStateMachine");
function asState(value) {
    if (value === 'failed')
        return 'failed';
    if (value === 'posted')
        return 'active';
    if (value === 'reversed' || value === 'already_applied')
        return 'reversed';
    return 'absent';
}
/**
 * Single write-side entry for posting a completed payment to every ledger.
 * Failures enqueue retryable LedgerEvents and are never swallowed as HTTP success
 * without an observable event.
 */
function postPaymentAccounting(paymentId, opts) {
    return __awaiter(this, void 0, void 0, function* () {
        const errors = [];
        const artifacts = {};
        const payment = yield Payment_1.Payment.findById(paymentId);
        if (!payment) {
            return { paymentId, status: 'failed', reason: 'missing_payment', artifacts, errors: ['Payment not found'] };
        }
        const policy = (0, accountingPostingPolicy_1.evaluatePermanentAccountingPolicy)(payment);
        if (!policy.allowed) {
            return {
                paymentId,
                status: 'skipped',
                reason: policy.reason,
                artifacts: {
                    ownerIncome: 'skipped',
                    agentCommission: 'skipped',
                    companyCommission: 'skipped',
                    journal: 'skipped',
                    trust: 'skipped'
                },
                errors: []
            };
        }
        if (!policy.skipOwnerIncome) {
            try {
                yield propertyAccountService_1.default.recordIncomeFromPayment(paymentId);
                artifacts.ownerIncome = 'posted';
            }
            catch (e) {
                artifacts.ownerIncome = 'failed';
                errors.push(`ownerIncome: ${(e === null || e === void 0 ? void 0 : e.message) || e}`);
                try {
                    yield ledgerEventService_1.default.enqueueOwnerIncomeEvent(paymentId);
                }
                catch (enqueueErr) {
                    errors.push(`ownerIncome.enqueue: ${(enqueueErr === null || enqueueErr === void 0 ? void 0 : enqueueErr.message) || enqueueErr}`);
                }
            }
        }
        else {
            artifacts.ownerIncome = 'skipped';
        }
        if (!policy.skipAgentCommission) {
            try {
                yield agentAccountService_1.default.syncCommissionForPayment(paymentId);
                artifacts.agentCommission = 'posted';
            }
            catch (e) {
                artifacts.agentCommission = 'failed';
                errors.push(`agentCommission: ${(e === null || e === void 0 ? void 0 : e.message) || e}`);
                try {
                    yield ledgerEventService_1.default.enqueueEvent('agent_commission', paymentId);
                }
                catch (enqueueErr) {
                    errors.push(`agentCommission.enqueue: ${(enqueueErr === null || enqueueErr === void 0 ? void 0 : enqueueErr.message) || enqueueErr}`);
                }
            }
        }
        else {
            artifacts.agentCommission = 'skipped';
        }
        if (!policy.skipCompanyCommission) {
            try {
                yield accountingIntegrationService_1.default.postCompanyCommission(payment);
                artifacts.companyCommission = 'posted';
            }
            catch (e) {
                artifacts.companyCommission = 'failed';
                errors.push(`companyCommission: ${(e === null || e === void 0 ? void 0 : e.message) || e}`);
                try {
                    yield ledgerEventService_1.default.enqueueEvent('company_commission', paymentId);
                }
                catch (enqueueErr) {
                    errors.push(`companyCommission.enqueue: ${(enqueueErr === null || enqueueErr === void 0 ? void 0 : enqueueErr.message) || enqueueErr}`);
                }
            }
        }
        else {
            artifacts.companyCommission = 'skipped';
        }
        if (!policy.skipJournal) {
            try {
                yield accountingIntegrationService_1.default.syncPaymentReceived(payment, { createdBy: opts === null || opts === void 0 ? void 0 : opts.createdBy });
                artifacts.journal = 'posted';
            }
            catch (e) {
                artifacts.journal = 'failed';
                errors.push(`journal: ${(e === null || e === void 0 ? void 0 : e.message) || e}`);
            }
        }
        else {
            artifacts.journal = 'skipped';
        }
        const failed = Object.values(artifacts).some((v) => v === 'failed');
        const posted = Object.values(artifacts).some((v) => v === 'posted');
        const status = failed ? (posted ? 'partial' : 'failed') : 'posted';
        if (failed) {
            logger_1.logger.warn('Payment accounting post incomplete', { paymentId, artifacts, errors });
        }
        return { paymentId, status, artifacts, errors, reason: policy.reason };
    });
}
/**
 * Comprehensive, idempotent reversal of every payment-derived ledger artifact.
 * Safe to call from the reverse controller, change stream, and LedgerEvent retry.
 */
function reversePaymentAccounting(paymentId, opts) {
    return __awaiter(this, void 0, void 0, function* () {
        const errors = [];
        const artifacts = {};
        const payment = yield Payment_1.Payment.findById(paymentId);
        if (!payment) {
            return { paymentId, status: 'failed', artifacts, errors: ['Payment not found'] };
        }
        if (!(0, accountingPostingPolicy_1.shouldAttemptAccountingReversal)(payment) && String(payment.status) !== 'reversed') {
            // Still allow explicit reversal of a completed payment whose status flip already committed.
            if (String(payment.status) !== 'completed' && String(payment.postingStatus) !== 'reversed') {
                return { paymentId, status: 'failed', artifacts, errors: ['Payment is not in a reversible state'] };
            }
        }
        try {
            yield propertyAccountService_1.default.reverseIncomeFromPayment(paymentId, {
                processedBy: opts === null || opts === void 0 ? void 0 : opts.processedBy,
                reason: opts === null || opts === void 0 ? void 0 : opts.reason
            });
            artifacts.ownerIncome = 'reversed';
            artifacts.configuredExpense = 'reversed';
            artifacts.passThrough = 'reversed';
        }
        catch (e) {
            artifacts.ownerIncome = 'failed';
            artifacts.configuredExpense = 'failed';
            artifacts.passThrough = 'failed';
            errors.push(`propertyAccount: ${(e === null || e === void 0 ? void 0 : e.message) || e}`);
        }
        try {
            yield agentAccountService_1.default.reverseCommissionForPayment(paymentId, opts === null || opts === void 0 ? void 0 : opts.reason);
            artifacts.agentCommission = 'reversed';
        }
        catch (e) {
            artifacts.agentCommission = 'failed';
            errors.push(`agentCommission: ${(e === null || e === void 0 ? void 0 : e.message) || e}`);
        }
        try {
            yield accountingIntegrationService_1.default.syncPaymentReversed(payment, {
                createdBy: opts === null || opts === void 0 ? void 0 : opts.processedBy,
                reason: opts === null || opts === void 0 ? void 0 : opts.reason
            });
            artifacts.journal = 'reversed';
            artifacts.companyCommission = 'reversed';
        }
        catch (e) {
            artifacts.journal = 'failed';
            artifacts.companyCommission = 'failed';
            errors.push(`journal/company: ${(e === null || e === void 0 ? void 0 : e.message) || e}`);
        }
        const progress = {
            ownerIncome: asState(artifacts.ownerIncome || 'absent'),
            configuredExpense: asState(artifacts.configuredExpense || 'absent'),
            companyCommission: asState(artifacts.companyCommission || 'absent'),
            agentCommission: asState(artifacts.agentCommission || 'absent'),
            trust: 'absent',
            journal: asState(artifacts.journal || 'absent')
        };
        let status = (0, ledgerEventStateMachine_1.classifyReversalOutcome)(progress);
        if (errors.length && status === 'reversed')
            status = 'partial';
        if (errors.length && status === 'already_reversed')
            status = 'partial';
        if (status === 'partial' || status === 'failed') {
            try {
                yield ledgerEventService_1.default.enqueueEvent('payment_reversal', paymentId, {
                    reversalPaymentId: opts === null || opts === void 0 ? void 0 : opts.reversalPaymentId,
                    reason: opts === null || opts === void 0 ? void 0 : opts.reason
                });
            }
            catch (enqueueErr) {
                errors.push(`reversal.enqueue: ${(enqueueErr === null || enqueueErr === void 0 ? void 0 : enqueueErr.message) || enqueueErr}`);
            }
            logger_1.logger.warn('Payment accounting reversal incomplete', { paymentId, artifacts, errors });
        }
        return { paymentId, status, artifacts, errors };
    });
}
exports.default = {
    postPaymentAccounting,
    reversePaymentAccounting
};
