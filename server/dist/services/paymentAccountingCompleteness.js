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
exports.passThroughCollectionIdempotencyKey = passThroughCollectionIdempotencyKey;
exports.configuredExpenseIdempotencyKey = configuredExpenseIdempotencyKey;
exports.ownerIncomeIdempotencyKey = ownerIncomeIdempotencyKey;
exports.normalizePassThroughType = normalizePassThroughType;
exports.computeOwnerIncomeAmount = computeOwnerIncomeAmount;
exports.groupRequiredPassThroughCodes = groupRequiredPassThroughCodes;
exports.computePassThroughTotal = computePassThroughTotal;
exports.computeConfiguredExpenseTotal = computeConfiguredExpenseTotal;
exports.shouldSkipRecordIncomePosting = shouldSkipRecordIncomePosting;
exports.buildOwnerIncomeLedgerTargets = buildOwnerIncomeLedgerTargets;
exports.accountHasCompletedIncomeForPayment = accountHasCompletedIncomeForPayment;
exports.accountHasIncomeNotCompletedForPayment = accountHasIncomeNotCompletedForPayment;
exports.accountHasCompletedPassThroughCollection = accountHasCompletedPassThroughCollection;
exports.accountHasCompletedConfiguredExpense = accountHasCompletedConfiguredExpense;
exports.evaluateTargetAccountingCompleteness = evaluateTargetAccountingCompleteness;
exports.provePaymentAccountingCompleteness = provePaymentAccountingCompleteness;
exports.checkPaymentAccountingCompleteness = checkPaymentAccountingCompleteness;
const mongoose_1 = __importDefault(require("mongoose"));
const paymentReconciliationQuery_1 = require("./paymentReconciliationQuery");
const COMPLETED_STATUS = 'completed';
function passThroughCollectionIdempotencyKey(paymentId, chargeTypeCode) {
    return `payment:${paymentId}:pass-through:${chargeTypeCode}`;
}
function configuredExpenseIdempotencyKey(paymentId) {
    return `payment:${paymentId}:configured-expense`;
}
function ownerIncomeIdempotencyKey(paymentId) {
    return `payment:${paymentId}`;
}
function normalizePassThroughType(type) {
    const normalized = String(type || 'OTHER')
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9_]+/g, '_')
        .replace(/^_+|_+$/g, '');
    return normalized || 'OTHER';
}
function computeOwnerIncomeAmount(input) {
    const ownerAmount = Number(input.ownerAmount || 0);
    return input.isSale
        ? Math.max(0, ownerAmount)
        : Math.max(0, ownerAmount - Number(input.passThroughTotal || 0));
}
function groupRequiredPassThroughCodes(passThroughLines) {
    var _a;
    const grouped = new Map();
    for (const line of passThroughLines) {
        const code = String(((_a = line === null || line === void 0 ? void 0 : line.chargeType) === null || _a === void 0 ? void 0 : _a.code) || '').trim();
        grouped.set(code, Number(grouped.get(code) || 0) + Number((line === null || line === void 0 ? void 0 : line.amount) || 0));
    }
    const codes = [];
    for (const [code, amount] of grouped) {
        if (amount <= 0)
            continue;
        codes.push(code);
    }
    return codes;
}
function computePassThroughTotal(passThroughLines) {
    return passThroughLines.reduce((sum, line) => sum + Number((line === null || line === void 0 ? void 0 : line.amount) || 0), 0);
}
function computeConfiguredExpenseTotal(propertyExpenseLines) {
    return propertyExpenseLines.reduce((sum, line) => sum + Number((line === null || line === void 0 ? void 0 : line.amount) || 0), 0);
}
function shouldSkipRecordIncomePosting(result) {
    return (result === null || result === void 0 ? void 0 : result.complete) === true;
}
function buildOwnerIncomeLedgerTargets(input) {
    return __awaiter(this, void 0, void 0, function* () {
        const targets = [];
        let devId = input.developmentId;
        const unitId = input.developmentUnitId;
        if (input.isSale) {
            if (unitId)
                targets.push({ id: String(unitId), ledger: input.ledgerType });
            if (!devId && unitId) {
                try {
                    const resolved = yield input.findDevelopmentIdForUnit(String(unitId));
                    if (resolved)
                        devId = resolved;
                }
                catch (error) {
                    if (input.unitLookupErrors === 'propagate')
                        throw error;
                }
            }
            if (devId)
                targets.push({ id: String(devId), ledger: input.ledgerType });
            if (!unitId && !devId)
                targets.push({ id: String(input.propertyId), ledger: input.ledgerType });
        }
        else {
            targets.push({ id: String(input.propertyId), ledger: input.ledgerType });
        }
        return targets;
    });
}
function idsEqual(left, right) {
    return String(left || '') === String(right || '');
}
function isCompletedStatus(status) {
    return String(status || '') === COMPLETED_STATUS;
}
function accountHasCompletedIncomeForPayment(account, paymentId) {
    return ((account === null || account === void 0 ? void 0 : account.transactions) || []).some((tx) => (tx === null || tx === void 0 ? void 0 : tx.type) === 'income' && idsEqual(tx === null || tx === void 0 ? void 0 : tx.paymentId, paymentId) && isCompletedStatus(tx === null || tx === void 0 ? void 0 : tx.status));
}
function accountHasIncomeNotCompletedForPayment(account, paymentId) {
    const matches = ((account === null || account === void 0 ? void 0 : account.transactions) || []).filter((tx) => (tx === null || tx === void 0 ? void 0 : tx.type) === 'income' && idsEqual(tx === null || tx === void 0 ? void 0 : tx.paymentId, paymentId));
    if (matches.length === 0)
        return false;
    return !matches.some((tx) => isCompletedStatus(tx === null || tx === void 0 ? void 0 : tx.status));
}
function accountHasCompletedPassThroughCollection(account, paymentId, chargeTypeCode) {
    if (!chargeTypeCode)
        return false;
    const type = normalizePassThroughType(chargeTypeCode);
    const idKey = passThroughCollectionIdempotencyKey(paymentId, chargeTypeCode);
    const passThroughAccounts = Array.isArray(account === null || account === void 0 ? void 0 : account.passThroughAccounts) ? account.passThroughAccounts : [];
    const target = passThroughAccounts.find((passThroughAccount) => normalizePassThroughType(passThroughAccount === null || passThroughAccount === void 0 ? void 0 : passThroughAccount.type) === type);
    return ((target === null || target === void 0 ? void 0 : target.transactions) || []).some((tx) => {
        if (!isCompletedStatus(tx === null || tx === void 0 ? void 0 : tx.status))
            return false;
        if (String((tx === null || tx === void 0 ? void 0 : tx.idempotencyKey) || '') === idKey)
            return true;
        return (tx === null || tx === void 0 ? void 0 : tx.type) === 'collection' && idsEqual(tx === null || tx === void 0 ? void 0 : tx.paymentId, paymentId);
    });
}
function accountHasCompletedConfiguredExpense(account, paymentId) {
    const idKey = configuredExpenseIdempotencyKey(paymentId);
    return ((account === null || account === void 0 ? void 0 : account.transactions) || []).some((tx) => (tx === null || tx === void 0 ? void 0 : tx.type) === 'expense' &&
        String((tx === null || tx === void 0 ? void 0 : tx.idempotencyKey) || '') === idKey &&
        isCompletedStatus(tx === null || tx === void 0 ? void 0 : tx.status));
}
function evaluateTargetAccountingCompleteness(input) {
    const { account, paymentId, incomeRequired, requiredPassThroughCodes, expenseRequired } = input;
    if (!account) {
        return { complete: false, reason: 'missing_account' };
    }
    if (!Array.isArray(account.transactions)) {
        return { complete: false, reason: 'unexpected_ledger_structure' };
    }
    if (incomeRequired) {
        if (accountHasCompletedIncomeForPayment(account, paymentId)) {
            // valid completed income present
        }
        else if (accountHasIncomeNotCompletedForPayment(account, paymentId)) {
            return { complete: false, reason: 'income_not_completed' };
        }
        else {
            return { complete: false, reason: 'missing_income' };
        }
    }
    for (const code of requiredPassThroughCodes) {
        if (!code)
            return { complete: false, reason: 'unknown_charge_type' };
        if (!accountHasCompletedPassThroughCollection(account, paymentId, code)) {
            return { complete: false, reason: 'missing_pass_through' };
        }
    }
    if (expenseRequired && !accountHasCompletedConfiguredExpense(account, paymentId)) {
        return { complete: false, reason: 'missing_expense' };
    }
    return { complete: true };
}
function incomplete(reason, stats) {
    return { complete: false, reason, stats };
}
function provePaymentAccountingCompleteness(payment, deps) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        if ((0, paymentReconciliationQuery_1.isRecordIncomeEarlyExit)(payment)) {
            return incomplete('not_eligible');
        }
        const paymentId = String((payment === null || payment === void 0 ? void 0 : payment._id) || '');
        const propertyId = String((payment === null || payment === void 0 ? void 0 : payment.propertyId) || '');
        if (!paymentId || !mongoose_1.default.Types.ObjectId.isValid(paymentId)) {
            return incomplete('malformed_payment');
        }
        if (!propertyId || !mongoose_1.default.Types.ObjectId.isValid(propertyId)) {
            return incomplete('missing_property');
        }
        const resolution = yield deps.resolveLedgerTypeForProperty(propertyId);
        const isSale = resolution.ledgerType === 'sale';
        if (payment.paymentType && ((payment.paymentType === 'sale') !== isSale)) {
            return incomplete('payment_type_mismatch');
        }
        const targets = yield buildOwnerIncomeLedgerTargets({
            isSale,
            ledgerType: resolution.ledgerType,
            propertyId,
            developmentId: payment.developmentId,
            developmentUnitId: payment.developmentUnitId,
            findDevelopmentIdForUnit: deps.findDevelopmentIdForUnit,
            unitLookupErrors: 'propagate'
        });
        if (!targets.length) {
            return incomplete('empty_targets');
        }
        for (const target of targets) {
            if (!(target === null || target === void 0 ? void 0 : target.id) || !mongoose_1.default.Types.ObjectId.isValid(String(target.id))) {
                return incomplete('invalid_target');
            }
        }
        const chargeLines = isSale ? [] : yield deps.getCompatibilityChargeLines(payment, payment.companyId);
        if (!Array.isArray(chargeLines)) {
            return incomplete('unexpected_charge_lines');
        }
        const passThroughLines = chargeLines.filter((line) => { var _a; return ((_a = line === null || line === void 0 ? void 0 : line.chargeType) === null || _a === void 0 ? void 0 : _a.category) === 'PASS_THROUGH'; });
        const propertyExpenseLines = chargeLines.filter((line) => { var _a; return ((_a = line === null || line === void 0 ? void 0 : line.chargeType) === null || _a === void 0 ? void 0 : _a.category) === 'PROPERTY_EXPENSE'; });
        const requiredPassThroughCodes = groupRequiredPassThroughCodes(passThroughLines);
        if (requiredPassThroughCodes.some((code) => !code)) {
            return incomplete('unknown_charge_type');
        }
        const passThroughTotal = computePassThroughTotal(passThroughLines);
        const propertyExpenseTotal = computeConfiguredExpenseTotal(propertyExpenseLines);
        const incomeRequired = computeOwnerIncomeAmount({
            isSale,
            ownerAmount: (_a = payment.commissionDetails) === null || _a === void 0 ? void 0 : _a.ownerAmount,
            passThroughTotal
        }) > 0;
        const expenseRequired = propertyExpenseTotal > 0;
        let accountLookups = 0;
        for (const target of targets) {
            const accounts = yield deps.findActivePropertyAccounts(target.id, target.ledger);
            accountLookups += 1;
            if (!Array.isArray(accounts) || accounts.length === 0) {
                return incomplete(isSale && targets.length > 1 ? 'missing_sale_target' : 'missing_account', { accountLookups });
            }
            if (accounts.length > 1) {
                return incomplete('ambiguous_account', { accountLookups });
            }
            const evaluated = evaluateTargetAccountingCompleteness({
                account: accounts[0],
                paymentId,
                incomeRequired,
                requiredPassThroughCodes,
                expenseRequired
            });
            if (!evaluated.complete) {
                const reason = isSale && targets.length > 1 && evaluated.reason === 'missing_income'
                    ? 'missing_sale_target'
                    : evaluated.reason;
                return incomplete(reason || 'not_proven', { accountLookups });
            }
        }
        return { complete: true, stats: { accountLookups } };
    });
}
/**
 * Read-only completeness check. Any throw, timeout, or ambiguous state is
 * "not proven complete" so the existing posting path still runs.
 */
function checkPaymentAccountingCompleteness(payment, deps) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            return yield provePaymentAccountingCompleteness(payment, deps);
        }
        catch (_a) {
            return incomplete('completeness_error');
        }
    });
}
