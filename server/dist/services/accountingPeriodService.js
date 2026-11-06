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
exports.ACCOUNTING_POSTING_RULESET = void 0;
exports.rangesOverlap = rangesOverlap;
exports.calendarPeriodIdentity = calendarPeriodIdentity;
exports.decidePeriodPosting = decidePeriodPosting;
exports.previewAccountingPeriod = previewAccountingPeriod;
exports.assertPeriodActivationConfirmed = assertPeriodActivationConfirmed;
exports.isCurrentAccountingMonth = isCurrentAccountingMonth;
exports.utcMonthBounds = utcMonthBounds;
exports.listAccountingPeriods = listAccountingPeriods;
exports.openExplicitPeriodForDate = openExplicitPeriodForDate;
exports.ensureCurrentOpenPeriod = ensureCurrentOpenPeriod;
exports.ensurePeriodIdentityIndex = ensurePeriodIdentityIndex;
exports.activateAccountingPeriod = activateAccountingPeriod;
exports.createAccountingPeriod = createAccountingPeriod;
exports.findPeriodForDate = findPeriodForDate;
exports.ensureCurrentPeriodForFinancialOperation = ensureCurrentPeriodForFinancialOperation;
exports.assertPeriodAllowsPosting = assertPeriodAllowsPosting;
exports.closeAccountingPeriod = closeAccountingPeriod;
exports.reopenAccountingPeriod = reopenAccountingPeriod;
const mongoose_1 = __importDefault(require("mongoose"));
const AccountingPeriod_1 = require("../models/AccountingPeriod");
const AccountingEventLog_1 = require("../models/AccountingEventLog");
const errorHandler_1 = require("../middleware/errorHandler");
const toId = (value) => new mongoose_1.default.Types.ObjectId(value);
function rangesOverlap(startA, endA, startB, endB) {
    return startA < endB && endA > startB;
}
function calendarPeriodIdentity(start, end) {
    return {
        financialYear: start.getUTCFullYear(),
        period: start.getUTCMonth() + 1
    };
}
/** A missing period is not open. Only an explicit OPEN document allows ordinary posting. */
function decidePeriodPosting(status, overrideReason) {
    if (!status)
        return { allowed: false, periodStatus: 'UNMANAGED', code: 'PERIOD_NOT_ESTABLISHED' };
    if (status === 'OPEN')
        return { allowed: true, periodStatus: 'OPEN', code: 'OPEN' };
    if (status === 'CLOSED')
        return { allowed: false, periodStatus: 'CLOSED', code: 'PERIOD_CLOSED' };
    if (!String(overrideReason || '').trim()) {
        return { allowed: false, periodStatus: 'SOFT_CLOSED', code: 'PERIOD_SOFT_CLOSED' };
    }
    return { allowed: true, periodStatus: 'SOFT_CLOSED', code: 'SOFT_CLOSED_OVERRIDE' };
}
function previewAccountingPeriod(financialYear, month) {
    if (!Number.isInteger(financialYear) || financialYear < 1900 || financialYear > 2100) {
        throw new errorHandler_1.AppError('A financial year is required', 400, 'PERIOD_YEAR_REQUIRED');
    }
    if (!Number.isInteger(month) || month < 1 || month > 12) {
        throw new errorHandler_1.AppError('A calendar month from 1 to 12 is required', 400, 'PERIOD_MONTH_REQUIRED');
    }
    const periodStart = new Date(Date.UTC(financialYear, month - 1, 1, 0, 0, 0, 0));
    const periodEnd = new Date(Date.UTC(financialYear, month, 0, 23, 59, 59, 999));
    return { financialYear, month, periodStart, periodEnd };
}
function assertPeriodActivationConfirmed(confirmed) {
    if (confirmed !== true) {
        throw new errorHandler_1.AppError('Explicit confirmation is required before an accounting period can be opened.', 400, 'PERIOD_CONFIRMATION_REQUIRED');
    }
}
exports.ACCOUNTING_POSTING_RULESET = 'current-month-auto-2026-11';
function isCurrentAccountingMonth(transactionDate, now = new Date()) {
    return transactionDate.getUTCFullYear() === now.getUTCFullYear()
        && transactionDate.getUTCMonth() === now.getUTCMonth();
}
function utcMonthBounds(date = new Date()) {
    const periodStart = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1, 0, 0, 0, 0));
    const periodEnd = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0, 23, 59, 59, 999));
    return { periodStart, periodEnd };
}
function logPeriodEvent(input) {
    return __awaiter(this, void 0, void 0, function* () {
        yield AccountingEventLog_1.AccountingEventLog.create({
            companyId: toId(input.companyId),
            eventType: input.eventType,
            sourceModule: 'period',
            sourceId: input.sourceId,
            success: true,
            message: input.message,
            metadata: input.metadata
        });
    });
}
function listAccountingPeriods(companyId) {
    return __awaiter(this, void 0, void 0, function* () {
        return AccountingPeriod_1.AccountingPeriod.find({ companyId: toId(companyId) }).sort({ periodStart: -1 }).lean();
    });
}
function openExplicitPeriodForDate(input) {
    return __awaiter(this, void 0, void 0, function* () {
        const { periodStart, periodEnd } = utcMonthBounds(input.date);
        const existing = yield AccountingPeriod_1.AccountingPeriod.findOne({
            companyId: toId(input.companyId),
            periodStart,
            periodEnd
        });
        if (existing)
            return existing;
        return createAccountingPeriod({
            companyId: input.companyId,
            periodStart,
            periodEnd,
            createdBy: input.createdBy
        });
    });
}
function ensureCurrentOpenPeriod(companyId) {
    return __awaiter(this, void 0, void 0, function* () {
        const { periodStart, periodEnd } = utcMonthBounds();
        return AccountingPeriod_1.AccountingPeriod.findOne({
            companyId: toId(companyId),
            periodStart,
            periodEnd
        });
    });
}
let periodIndexReady = false;
function ensurePeriodIdentityIndex() {
    return __awaiter(this, void 0, void 0, function* () {
        if (periodIndexReady)
            return;
        try {
            yield AccountingPeriod_1.AccountingPeriod.collection.createIndex({ companyId: 1, financialYear: 1, month: 1 }, { unique: true, name: 'company_financial_year_month_unique' });
            periodIndexReady = true;
        }
        catch (error) {
            const message = String((error === null || error === void 0 ? void 0 : error.message) || '');
            if ((error === null || error === void 0 ? void 0 : error.code) === 85 || (error === null || error === void 0 ? void 0 : error.code) === 86 || /already exists/i.test(message)) {
                periodIndexReady = true;
                return;
            }
            throw new errorHandler_1.AppError('The accounting period identity index is not available. The period was not created.', 503, 'PERIOD_INDEX_UNAVAILABLE');
        }
    });
}
function existingPeriodForIdentity(companyId, financialYear, month) {
    return __awaiter(this, void 0, void 0, function* () {
        return AccountingPeriod_1.AccountingPeriod.findOne({
            companyId: toId(companyId),
            financialYear,
            month
        });
    });
}
function insertOpenPeriod(input) {
    return __awaiter(this, void 0, void 0, function* () {
        yield ensurePeriodIdentityIndex();
        const sameCompany = yield AccountingPeriod_1.AccountingPeriod.find({ companyId: toId(input.companyId) })
            .select('periodStart periodEnd financialYear month')
            .lean();
        const overlap = sameCompany.find((row) => (!(row.financialYear === input.financialYear && row.month === input.month)
            && rangesOverlap(input.periodStart, input.periodEnd, new Date(row.periodStart), new Date(row.periodEnd))));
        if (overlap)
            throw new errorHandler_1.AppError('Accounting periods for a company cannot overlap', 409, 'PERIOD_OVERLAP');
        const held = yield existingPeriodForIdentity(input.companyId, input.financialYear, input.month);
        if (held)
            return { period: held, created: false, alreadyExisted: true };
        try {
            const created = yield AccountingPeriod_1.AccountingPeriod.create({
                companyId: toId(input.companyId),
                financialYear: input.financialYear,
                month: input.month,
                period: input.month,
                periodStart: input.periodStart,
                periodEnd: input.periodEnd,
                startDate: input.periodStart,
                endDate: input.periodEnd,
                status: 'OPEN',
                createdBy: input.createdBy ? toId(input.createdBy) : undefined
            });
            yield logPeriodEvent({
                companyId: input.companyId,
                eventType: 'period_created',
                sourceId: String(created._id),
                message: input.automatic ? 'Current accounting period opened automatically' : 'Period opened explicitly',
                metadata: {
                    actorId: input.createdBy,
                    automatic: Boolean(input.automatic),
                    financialYear: input.financialYear,
                    period: input.month,
                    before: null,
                    after: 'OPEN'
                }
            });
            return { period: created, created: true, alreadyExisted: false };
        }
        catch (err) {
            if ((err === null || err === void 0 ? void 0 : err.code) === 11000) {
                const existing = yield existingPeriodForIdentity(input.companyId, input.financialYear, input.month);
                if (existing)
                    return { period: existing, created: false, alreadyExisted: true };
                throw new errorHandler_1.AppError('An accounting period already exists for that company and month', 409, 'PERIOD_ALREADY_EXISTS');
            }
            throw err;
        }
    });
}
function activateAccountingPeriod(input) {
    return __awaiter(this, void 0, void 0, function* () {
        assertPeriodActivationConfirmed(input.confirmed);
        const preview = previewAccountingPeriod(input.financialYear, input.month);
        return insertOpenPeriod({
            companyId: input.companyId,
            financialYear: preview.financialYear,
            month: preview.month,
            periodStart: preview.periodStart,
            periodEnd: preview.periodEnd,
            createdBy: input.createdBy
        });
    });
}
function createAccountingPeriod(input) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!(input.periodEnd > input.periodStart)) {
            throw new errorHandler_1.AppError('periodEnd must be after periodStart', 400);
        }
        const identity = calendarPeriodIdentity(input.periodStart, input.periodEnd);
        const result = yield insertOpenPeriod({
            companyId: input.companyId,
            financialYear: identity.financialYear,
            month: identity.period,
            periodStart: input.periodStart,
            periodEnd: input.periodEnd,
            createdBy: input.createdBy
        });
        return result.period;
    });
}
function findPeriodForDate(companyId, transactionDate) {
    return __awaiter(this, void 0, void 0, function* () {
        return AccountingPeriod_1.AccountingPeriod.findOne({
            companyId: toId(companyId),
            periodStart: { $lte: transactionDate },
            periodEnd: { $gte: transactionDate }
        });
    });
}
/**
 * Safe monthly rollover for one company.
 * The first financial write in the clock's current month establishes that month as OPEN.
 * Earlier months are not created, closed, reopened, or rewritten. A dashboard read does not call this.
 */
function ensureCurrentPeriodForFinancialOperation(input) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!isCurrentAccountingMonth(input.transactionDate))
            return;
        const existing = yield findPeriodForDate(input.companyId, input.transactionDate);
        if (existing)
            return;
        const { periodStart, periodEnd } = utcMonthBounds(input.transactionDate);
        const identity = calendarPeriodIdentity(periodStart, periodEnd);
        const actorId = input.actorId && mongoose_1.default.Types.ObjectId.isValid(input.actorId) ? input.actorId : undefined;
        yield insertOpenPeriod({
            companyId: input.companyId,
            financialYear: identity.financialYear,
            month: identity.period,
            periodStart,
            periodEnd,
            createdBy: actorId,
            automatic: true
        });
    });
}
/**
 * A missing historical period is not open. The current month is established automatically.
 * CLOSED rejects. SOFT_CLOSED requires an authorised reason. A closed period is never reopened here.
 */
function assertPeriodAllowsPosting(input) {
    return __awaiter(this, void 0, void 0, function* () {
        yield ensureCurrentPeriodForFinancialOperation({
            companyId: input.companyId,
            transactionDate: input.transactionDate,
            actorId: input.actorId
        });
        const period = yield findPeriodForDate(input.companyId, input.transactionDate);
        const decision = decidePeriodPosting((period === null || period === void 0 ? void 0 : period.status) || null, input.overrideReason);
        if (!decision.allowed) {
            const message = decision.code === 'PERIOD_NOT_ESTABLISHED'
                ? 'No accounting period covers this date. Historical periods are not opened automatically.'
                : decision.code === 'PERIOD_SOFT_CLOSED'
                    ? `Period ${period === null || period === void 0 ? void 0 : period.periodStart.toISOString().slice(0, 10)} is SOFT_CLOSED. An accountant override reason is required to post.`
                    : `Period ${period === null || period === void 0 ? void 0 : period.periodStart.toISOString().slice(0, 10)} is CLOSED. Corrections must use a reversal plus a new posting in an open period.`;
            throw new errorHandler_1.AppError(message, 409, decision.code);
        }
        if (decision.code === 'SOFT_CLOSED_OVERRIDE' && period) {
            yield logPeriodEvent({
                companyId: input.companyId,
                eventType: 'period_soft_close_override',
                sourceId: String(period._id),
                message: 'Posting override on SOFT_CLOSED period',
                metadata: {
                    actorId: input.actorId,
                    reason: String(input.overrideReason).trim(),
                    sourceModule: input.sourceModule,
                    sourceId: input.sourceId,
                    before: 'SOFT_CLOSED',
                    after: 'SOFT_CLOSED'
                }
            });
        }
        return { allowed: true, periodStatus: decision.periodStatus };
    });
}
function closeAccountingPeriod(input) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!String(input.reason || '').trim())
            throw new errorHandler_1.AppError('A close reason is required', 400);
        const row = yield AccountingPeriod_1.AccountingPeriod.findOne({ _id: input.periodId, companyId: toId(input.companyId) });
        if (!row)
            throw new errorHandler_1.AppError('Accounting period not found', 404);
        if (row.status === 'CLOSED' && input.status === 'CLOSED') {
            throw new errorHandler_1.AppError('Period is already CLOSED', 409);
        }
        const before = row.status;
        row.status = input.status;
        row.closedBy = toId(input.actorId);
        row.closedAt = new Date();
        row.closeReason = String(input.reason).trim();
        yield row.save();
        yield logPeriodEvent({
            companyId: input.companyId,
            eventType: input.status === 'CLOSED' ? 'period_closed' : 'period_soft_closed',
            sourceId: String(row._id),
            message: `Period ${input.status}`,
            metadata: {
                actorId: input.actorId,
                reason: row.closeReason,
                before,
                after: row.status
            }
        });
        return row;
    });
}
function reopenAccountingPeriod(input) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!String(input.reason || '').trim())
            throw new errorHandler_1.AppError('A reopen reason is required', 400);
        const row = yield AccountingPeriod_1.AccountingPeriod.findOne({ _id: input.periodId, companyId: toId(input.companyId) });
        if (!row)
            throw new errorHandler_1.AppError('Accounting period not found', 404);
        if (row.status === 'OPEN')
            throw new errorHandler_1.AppError('Period is already OPEN', 409);
        const before = row.status;
        row.status = 'OPEN';
        row.reopenedBy = toId(input.actorId);
        row.reopenedAt = new Date();
        row.reopenReason = String(input.reason).trim();
        row.reopeningReason = row.reopenReason;
        yield row.save();
        yield logPeriodEvent({
            companyId: input.companyId,
            eventType: 'period_reopened',
            sourceId: String(row._id),
            message: 'Period reopened',
            metadata: {
                actorId: input.actorId,
                reason: row.reopenReason,
                before,
                after: 'OPEN'
            }
        });
        return row;
    });
}
