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
exports.CompanyExpenseUniquenessUnverifiedError = exports.COMPANY_EXPENSE_ENABLEMENT_EVIDENCE = exports.COMPANY_EXPENSE_UNKEYED_POLICY = exports.CompanyExpenseIdempotencyInProgressError = exports.CompanyExpenseIdempotencyError = void 0;
exports.inspectCompanyExpenseUniqueness = inspectCompanyExpenseUniqueness;
exports.recordCompanyAccountExpense = recordCompanyAccountExpense;
const mongoose_1 = __importDefault(require("mongoose"));
const CompanyAccount_1 = require("../models/CompanyAccount");
const CompanyExpenseClaim_1 = require("../models/CompanyExpenseClaim");
const accountingIntegrationService_1 = __importDefault(require("./accountingIntegrationService"));
const journalDuplicateKey_1 = require("./journalDuplicateKey");
const operationalSignal_1 = require("./operationalSignal");
const money_1 = require("../utils/money");
class CompanyExpenseIdempotencyError extends Error {
    constructor() {
        super('This idempotency key was already used for a different company expense');
        this.statusCode = 409;
        this.code = 'IDEMPOTENCY_CONFLICT';
        this.name = 'CompanyExpenseIdempotencyError';
    }
}
exports.CompanyExpenseIdempotencyError = CompanyExpenseIdempotencyError;
class CompanyExpenseIdempotencyInProgressError extends Error {
    constructor() {
        super('This company expense idempotency key is already being recorded');
        this.statusCode = 409;
        this.code = 'EXPENSE_IDEMPOTENCY_IN_PROGRESS';
        this.name = 'CompanyExpenseIdempotencyInProgressError';
    }
}
exports.CompanyExpenseIdempotencyInProgressError = CompanyExpenseIdempotencyInProgressError;
const KEY_PATTERN = /^[A-Za-z0-9:_-]{8,200}$/;
const CLAIM_STALE_MS = 2 * 60 * 1000;
/**
 * A request without an idempotency key is a new expense operation.
 * The server does not invent a key, and two such requests are not collapsed.
 */
exports.COMPANY_EXPENSE_UNKEYED_POLICY = 'A company expense request without an idempotency key is a separate operation. Identical unkeyed requests are not treated as retries.';
/**
 * Production evidence required before COMPANY_EXPENSE_CLAIM_UNIQUENESS=verified.
 * Application startup does not set this value, and one stored transaction is not evidence.
 */
exports.COMPANY_EXPENSE_ENABLEMENT_EVIDENCE = [
    'A read-only count of companyexpenseclaims grouped by companyId and idempotencyKey shows no group with more than one document.',
    'Missing and null companyId or idempotencyKey values were counted and reviewed.',
    'The Cosmos DB partition key was read and a unique index on { companyId: 1, idempotencyKey: 1 } is supported for that key.',
    'Index company_expense_claim_identity exists, is unique, and its key is exactly those two fields.',
    'The operator then sets COMPANY_EXPENSE_CLAIM_UNIQUENESS=verified. Startup success does not set it.',
    'A local test that left one expense transaction does not enable the gate.'
];
class CompanyExpenseUniquenessUnverifiedError extends Error {
    constructor(reason) {
        super('Keyed company expenses are closed until the claim unique index is independently verified');
        this.statusCode = 503;
        this.code = 'EXPENSE_IDEMPOTENCY_UNVERIFIED';
        this.name = 'CompanyExpenseUniquenessUnverifiedError';
        this.reason = reason;
    }
}
exports.CompanyExpenseUniquenessUnverifiedError = CompanyExpenseUniquenessUnverifiedError;
function inspectCompanyExpenseUniqueness() {
    return __awaiter(this, void 0, void 0, function* () {
        if (process.env.COMPANY_EXPENSE_CLAIM_UNIQUENESS !== 'verified') {
            return { available: false, reason: 'attestation_absent' };
        }
        try {
            if (process.env.NODE_ENV !== 'production' && process.env.MANTIS_TEST_SEAM === '1' && global.__failExpenseUniquenessProbe) {
                global.__failExpenseUniquenessProbe = false;
                throw new Error('EXPENSE_UNIQUENESS_PROBE_FAILED');
            }
            const indexes = yield CompanyExpenseClaim_1.CompanyExpenseClaim.collection.indexes();
            const found = indexes.find((index) => index.name === 'company_expense_claim_identity' && index.unique === true);
            const key = ((found === null || found === void 0 ? void 0 : found.key) || {});
            const fields = Object.keys(key);
            if (!found || fields.length !== 2 || key.companyId !== 1 || key.idempotencyKey !== 1) {
                return { available: false, reason: 'unique_index_absent' };
            }
            return { available: true, reason: 'attestation_and_unique_index' };
        }
        catch (error) {
            const code = Number(error === null || error === void 0 ? void 0 : error.code);
            const message = String((error === null || error === void 0 ? void 0 : error.message) || error);
            if (code === 26 || /ns does not exist|NamespaceNotFound/i.test(message)) {
                return { available: false, reason: 'unique_index_absent' };
            }
            (0, operationalSignal_1.signalOperationalFailure)('company_expense_idempotency_unready', {
                reason: 'uniqueness_probe_failed',
                error: message.slice(0, 200)
            });
            return { available: false, reason: 'uniqueness_probe_failed' };
        }
    });
}
function money(value) {
    return Math.round(Number(value || 0) * 100) / 100;
}
function day(value) {
    if (!value)
        return '';
    const date = value instanceof Date ? value : new Date(String(value));
    if (Number.isNaN(date.getTime()))
        return '';
    return date.toISOString().slice(0, 10);
}
function requestFingerprint(input, type, amount) {
    return JSON.stringify({
        type,
        amount,
        description: input.description || input.category || '',
        reference: input.reference || '',
        paymentMethod: input.paymentMethod || '',
        currency: input.currency || 'USD',
        payee: input.payee || '',
        date: input.date ? day(input.date) : ''
    });
}
function claimIdentityConflict(error, companyId, idempotencyKey) {
    const details = (0, journalDuplicateKey_1.duplicateKeyDetails)(error);
    if (!details)
        return false;
    const fields = Object.keys(details.pattern);
    if (fields.length !== 2 || !fields.includes('companyId') || !fields.includes('idempotencyKey'))
        return false;
    return (0, money_1.idsEqual)(details.value.companyId, companyId) && String(details.value.idempotencyKey || '') === idempotencyKey;
}
function pauseForClaimRaceTest() {
    return __awaiter(this, void 0, void 0, function* () {
        if (process.env.NODE_ENV === 'production' || process.env.MANTIS_TEST_SEAM !== '1')
            return;
        const delay = Number(global.__companyExpenseClaimDelayMs || 0);
        if (delay > 0)
            yield new Promise((resolve) => setTimeout(resolve, delay));
    });
}
function findStored(companyId, idempotencyKey) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        const account = yield CompanyAccount_1.CompanyAccount.findOne({ companyId, 'transactions.idempotencyKey': idempotencyKey });
        const transaction = (_a = account === null || account === void 0 ? void 0 : account.transactions) === null || _a === void 0 ? void 0 : _a.find((row) => row.idempotencyKey === idempotencyKey);
        return { account, transaction };
    });
}
function syncStoredExpense(companyId, idempotencyKey, transaction, processedBy) {
    return __awaiter(this, void 0, void 0, function* () {
        if (transaction.type !== 'expense')
            return;
        const sourceId = `company-expense:${companyId}:${idempotencyKey}`;
        const reference = transaction.referenceNumber || `CEXP-${idempotencyKey}`;
        yield accountingIntegrationService_1.default.syncExpenseCreated({
            companyId,
            sourceId,
            reference,
            amount: Number(transaction.amount),
            description: transaction.description || 'Company expense',
            date: transaction.date,
            createdBy: processedBy
        });
    });
}
function ensureAccount(companyId) {
    return __awaiter(this, void 0, void 0, function* () {
        let account = yield CompanyAccount_1.CompanyAccount.findOne({ companyId });
        if (account)
            return account;
        try {
            return yield CompanyAccount_1.CompanyAccount.create({
                companyId,
                transactions: [],
                runningBalance: 0,
                totalIncome: 0,
                totalExpenses: 0
            });
        }
        catch (error) {
            account = yield CompanyAccount_1.CompanyAccount.findOne({ companyId });
            if (!account)
                throw error;
            return account;
        }
    });
}
function appendExpense(input) {
    return __awaiter(this, void 0, void 0, function* () {
        const existing = yield findStored(input.companyId, input.idempotencyKey);
        if (existing.transaction)
            return existing;
        const account = yield ensureAccount(input.companyId);
        const now = new Date();
        const txId = new mongoose_1.default.Types.ObjectId();
        const transaction = {
            _id: txId,
            type: input.type,
            amount: input.amount,
            date: input.date,
            description: input.description,
            referenceNumber: input.reference,
            paymentMethod: input.paymentMethod,
            currency: input.currency || 'USD',
            notes: input.payee,
            idempotencyKey: input.idempotencyKey,
            processedBy: input.processedBy && mongoose_1.default.Types.ObjectId.isValid(input.processedBy)
                ? new mongoose_1.default.Types.ObjectId(input.processedBy)
                : undefined,
            createdAt: now,
            updatedAt: now
        };
        const totals = input.type === 'income'
            ? { totalIncome: input.amount, runningBalance: input.amount }
            : { totalExpenses: input.amount, runningBalance: -input.amount };
        const updated = yield CompanyAccount_1.CompanyAccount.findOneAndUpdate({ _id: account._id, 'transactions.idempotencyKey': { $ne: input.idempotencyKey } }, { $push: { transactions: transaction }, $inc: totals, $set: { lastUpdated: now } }, { new: true });
        if (!updated)
            return findStored(input.companyId, input.idempotencyKey);
        const storedTx = updated.transactions.find((row) => String(row.idempotencyKey || '') === input.idempotencyKey) || transaction;
        return { account: updated, transaction: storedTx };
    });
}
function finishClaim(claim, companyId, transaction, processedBy) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            if (claim.type === 'expense') {
                yield syncStoredExpense(companyId, claim.idempotencyKey, transaction, processedBy);
            }
            yield CompanyExpenseClaim_1.CompanyExpenseClaim.updateOne({ _id: claim._id }, { $set: { status: 'posted', transactionId: transaction._id } });
        }
        catch (error) {
            yield CompanyExpenseClaim_1.CompanyExpenseClaim.updateOne({ _id: claim._id }, { $set: { status: 'post_failed', transactionId: transaction._id } });
            throw error;
        }
    });
}
/**
 * Record one company-account expense.
 *
 * Keyed requests insert a top-level claim before the ledger append. Concurrent
 * safety requires the unique { companyId, idempotencyKey } index on
 * companyexpenseclaims. That index is declared and is not created here.
 * Without it, two claim inserts can both succeed and both append. The code
 * does not treat that race as a successful idempotent retry.
 *
 * Unkeyed requests follow COMPANY_EXPENSE_UNKEYED_POLICY.
 */
function recordCompanyAccountExpense(input) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        const companyId = String(input.companyId || '').trim();
        if (!mongoose_1.default.Types.ObjectId.isValid(companyId)) {
            const error = new Error('companyId is required');
            error.statusCode = 400;
            throw error;
        }
        const amount = money(input.amount);
        if (!(amount > 0)) {
            const error = new Error('Valid amount is required');
            error.statusCode = 400;
            throw error;
        }
        const rawKey = String(input.idempotencyKey || '').trim();
        if (rawKey && !KEY_PATTERN.test(rawKey)) {
            const error = new Error('Idempotency key must be a stable 8 to 200 character token');
            error.statusCode = 400;
            throw error;
        }
        const type = input.type === 'income' ? 'income' : 'expense';
        const txDate = input.date ? new Date(input.date) : new Date();
        if (Number.isNaN(txDate.getTime())) {
            const error = new Error('Valid date is required');
            error.statusCode = 400;
            throw error;
        }
        if (!rawKey) {
            const account = yield ensureAccount(companyId);
            const now = new Date();
            const txId = new mongoose_1.default.Types.ObjectId();
            const reference = input.reference || `EXP-${String(txId)}`;
            const transaction = {
                _id: txId,
                type,
                amount,
                date: txDate,
                description: input.description || input.category || undefined,
                referenceNumber: reference,
                paymentMethod: input.paymentMethod || undefined,
                currency: input.currency || 'USD',
                notes: input.payee || undefined,
                processedBy: input.processedBy && mongoose_1.default.Types.ObjectId.isValid(input.processedBy)
                    ? new mongoose_1.default.Types.ObjectId(input.processedBy)
                    : undefined,
                createdAt: now,
                updatedAt: now
            };
            const totals = type === 'income'
                ? { totalIncome: amount, runningBalance: amount }
                : { totalExpenses: amount, runningBalance: -amount };
            const updated = yield CompanyAccount_1.CompanyAccount.findOneAndUpdate({ _id: account._id }, { $push: { transactions: transaction }, $inc: totals, $set: { lastUpdated: now } }, { new: true });
            if (type === 'expense') {
                yield syncStoredExpense(companyId, String(txId), Object.assign(Object.assign({}, transaction), { type: 'expense' }), input.processedBy);
            }
            return { account: updated, transaction, reused: false };
        }
        const readiness = yield inspectCompanyExpenseUniqueness();
        if (!readiness.available) {
            (0, operationalSignal_1.signalOperationalFailure)('company_expense_idempotency_unready', {
                companyId,
                reason: readiness.reason,
                idempotencyKey: rawKey
            });
            throw new CompanyExpenseUniquenessUnverifiedError(readiness.reason);
        }
        const fingerprint = requestFingerprint(input, type, amount);
        const reference = input.reference || `CEXP-${rawKey}`;
        const existingClaims = yield CompanyExpenseClaim_1.CompanyExpenseClaim.find({ companyId, idempotencyKey: rawKey });
        if (existingClaims.length > 1) {
            if (new Set(existingClaims.map((row) => row.fingerprint)).size > 1) {
                throw new CompanyExpenseIdempotencyError();
            }
            const stored = yield findStored(companyId, rawKey);
            if (stored.transaction) {
                if (money(stored.transaction.amount) !== money(existingClaims[0].amount)) {
                    throw new CompanyExpenseIdempotencyError();
                }
                if (!(0, money_1.idsEqual)((_a = stored.account) === null || _a === void 0 ? void 0 : _a.companyId, companyId))
                    throw new CompanyExpenseIdempotencyError();
                const posted = existingClaims.find((row) => row.transactionId) || existingClaims[0];
                yield finishClaim(posted, companyId, stored.transaction, input.processedBy);
                return { account: stored.account, transaction: stored.transaction, reused: true, claimConflictObserved: false };
            }
            (0, operationalSignal_1.signalOperationalFailure)('company_expense_claim_conflict', { companyId, idempotencyKey: rawKey, claims: existingClaims.length });
            throw new CompanyExpenseIdempotencyError();
        }
        let claim = existingClaims[0] || null;
        let claimConflictObserved = false;
        if (!claim) {
            try {
                const forced = process.env.NODE_ENV !== 'production' && process.env.MANTIS_TEST_SEAM === '1'
                    ? global.__companyExpenseDuplicateKey
                    : undefined;
                if (forced) {
                    global.__companyExpenseDuplicateKey = undefined;
                    const duplicate = new Error('E11000 duplicate key error');
                    duplicate.code = 11000;
                    duplicate.keyPattern = forced.pattern;
                    duplicate.keyValue = forced.value;
                    throw duplicate;
                }
                claim = yield CompanyExpenseClaim_1.CompanyExpenseClaim.create({
                    companyId,
                    idempotencyKey: rawKey,
                    fingerprint,
                    amount,
                    type,
                    reference,
                    description: input.description || input.category || undefined,
                    status: 'claimed'
                });
                yield pauseForClaimRaceTest();
            }
            catch (error) {
                if (Number(error === null || error === void 0 ? void 0 : error.code) !== 11000)
                    throw error;
                if (!claimIdentityConflict(error, companyId, rawKey)) {
                    (0, operationalSignal_1.signalOperationalFailure)('company_expense_duplicate_key_unidentified', { companyId, idempotencyKey: rawKey });
                    throw error;
                }
                claimConflictObserved = true;
                claim = yield CompanyExpenseClaim_1.CompanyExpenseClaim.findOne({ companyId, idempotencyKey: rawKey });
                if (!claim)
                    throw error;
            }
        }
        if (!(0, money_1.idsEqual)(claim.companyId, companyId) || claim.idempotencyKey !== rawKey || claim.fingerprint !== fingerprint) {
            throw new CompanyExpenseIdempotencyError();
        }
        if (!claim.transactionId) {
            const staleBefore = new Date(Date.now() - CLAIM_STALE_MS);
            const owned = yield CompanyExpenseClaim_1.CompanyExpenseClaim.findOneAndUpdate({
                _id: claim._id,
                transactionId: { $exists: false },
                $or: [
                    { status: 'claimed' },
                    { status: 'appending', updatedAt: { $lte: staleBefore } }
                ]
            }, { $set: { status: 'appending', updatedAt: new Date() } }, { new: true });
            if (!owned) {
                const current = yield CompanyExpenseClaim_1.CompanyExpenseClaim.findById(claim._id);
                if (current === null || current === void 0 ? void 0 : current.transactionId) {
                    claim = current;
                }
                else if (current && current.fingerprint !== fingerprint) {
                    throw new CompanyExpenseIdempotencyError();
                }
                else {
                    throw new CompanyExpenseIdempotencyInProgressError();
                }
            }
            else {
                claim = owned;
            }
        }
        if (!claim.transactionId) {
            const appended = yield appendExpense({
                companyId,
                idempotencyKey: rawKey,
                type,
                amount: claim.amount,
                date: txDate,
                description: claim.description,
                reference: claim.reference || reference,
                paymentMethod: input.paymentMethod,
                currency: input.currency,
                payee: input.payee,
                processedBy: input.processedBy
            });
            if (!appended.transaction)
                throw new Error('Company expense was not stored');
            yield finishClaim(claim, companyId, appended.transaction, input.processedBy);
            return { account: appended.account, transaction: appended.transaction, reused: false, claimConflictObserved };
        }
        const stored = yield findStored(companyId, rawKey);
        if (!stored.transaction)
            throw new Error('Company expense claim has no stored transaction');
        if (money(stored.transaction.amount) !== money(claim.amount))
            throw new CompanyExpenseIdempotencyError();
        yield finishClaim(claim, companyId, stored.transaction, input.processedBy);
        return { account: stored.account, transaction: stored.transaction, reused: true, claimConflictObserved };
    });
}
