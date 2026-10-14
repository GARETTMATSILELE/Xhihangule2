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
exports.utcMonthBounds = utcMonthBounds;
exports.listAccountingPeriods = listAccountingPeriods;
exports.ensureCurrentOpenPeriod = ensureCurrentOpenPeriod;
exports.createAccountingPeriod = createAccountingPeriod;
exports.findPeriodForDate = findPeriodForDate;
exports.assertPeriodAllowsPosting = assertPeriodAllowsPosting;
exports.closeAccountingPeriod = closeAccountingPeriod;
exports.reopenAccountingPeriod = reopenAccountingPeriod;
const mongoose_1 = __importDefault(require("mongoose"));
const AccountingPeriod_1 = require("../models/AccountingPeriod");
const AccountingEventLog_1 = require("../models/AccountingEventLog");
const errorHandler_1 = require("../middleware/errorHandler");
const toId = (value) => new mongoose_1.default.Types.ObjectId(value);
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
function ensureCurrentOpenPeriod(companyId) {
    return __awaiter(this, void 0, void 0, function* () {
        const { periodStart, periodEnd } = utcMonthBounds();
        const existing = yield AccountingPeriod_1.AccountingPeriod.findOne({
            companyId: toId(companyId),
            periodStart,
            periodEnd
        });
        if (existing)
            return existing;
        return AccountingPeriod_1.AccountingPeriod.create({
            companyId: toId(companyId),
            periodStart,
            periodEnd,
            status: 'OPEN'
        });
    });
}
function createAccountingPeriod(input) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!(input.periodEnd > input.periodStart)) {
            throw new errorHandler_1.AppError('periodEnd must be after periodStart', 400);
        }
        try {
            return yield AccountingPeriod_1.AccountingPeriod.create({
                companyId: toId(input.companyId),
                periodStart: input.periodStart,
                periodEnd: input.periodEnd,
                status: 'OPEN'
            });
        }
        catch (err) {
            if ((err === null || err === void 0 ? void 0 : err.code) === 11000)
                throw new errorHandler_1.AppError('An accounting period already exists for that range', 409);
            throw err;
        }
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
 * If no period document covers the date, posting is allowed (legacy OPEN default).
 * CLOSED rejects. SOFT_CLOSED requires overrideReason.
 */
function assertPeriodAllowsPosting(input) {
    return __awaiter(this, void 0, void 0, function* () {
        const period = yield findPeriodForDate(input.companyId, input.transactionDate);
        if (!period)
            return { allowed: true, periodStatus: 'UNMANAGED' };
        if (period.status === 'OPEN')
            return { allowed: true, periodStatus: 'OPEN' };
        if (period.status === 'SOFT_CLOSED') {
            if (!String(input.overrideReason || '').trim()) {
                throw new errorHandler_1.AppError(`Period ${period.periodStart.toISOString().slice(0, 10)} is SOFT_CLOSED. An accountant override reason is required to post.`, 409);
            }
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
            return { allowed: true, periodStatus: 'SOFT_CLOSED' };
        }
        throw new errorHandler_1.AppError(`Period ${period.periodStart.toISOString().slice(0, 10)} is CLOSED. Corrections must use a reversal plus a new posting in an open period.`, 409);
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
