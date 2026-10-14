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
exports.assignmentStatusForExistingPeriod = assignmentStatusForExistingPeriod;
exports.resolveTaxPeriod = resolveTaxPeriod;
exports.resolveRelevantTaxPeriods = resolveRelevantTaxPeriods;
exports.assertTaxPeriodsAllowPosting = assertTaxPeriodsAllowPosting;
exports.listTaxPeriods = listTaxPeriods;
exports.openTaxPeriod = openTaxPeriod;
exports.updateTaxPeriodStatus = updateTaxPeriodStatus;
const mongoose_1 = __importDefault(require("mongoose"));
const TaxPeriod_1 = require("../models/TaxPeriod");
const AccountingEventLog_1 = require("../models/AccountingEventLog");
const errorHandler_1 = require("../middleware/errorHandler");
const accountingPeriodService_1 = require("./accountingPeriodService");
const taxMetadataTypes_1 = require("./tax/taxMetadataTypes");
const CLOSED_STATUSES = ['FINALIZED', 'LOCKED'];
function assignmentStatusForExistingPeriod(status) {
    return CLOSED_STATUSES.includes(status) ? 'PERIOD_CLOSED' : 'ASSIGNED';
}
function asObjectId(value, label = 'id') {
    if (!mongoose_1.default.Types.ObjectId.isValid(value))
        throw new errorHandler_1.AppError(`Invalid ${label}`, 400);
    return new mongoose_1.default.Types.ObjectId(value);
}
function resolveTaxPeriod(input) {
    return __awaiter(this, void 0, void 0, function* () {
        const periodKey = (0, taxMetadataTypes_1.calendarPeriodKey)(input.transactionDate);
        const bounds = (0, taxMetadataTypes_1.calendarPeriodBounds)(periodKey);
        const accounting = yield (0, accountingPeriodService_1.findPeriodForDate)(input.companyId, input.transactionDate);
        const existing = yield TaxPeriod_1.TaxPeriod.findOne({
            companyId: asObjectId(input.companyId, 'companyId'),
            taxType: input.taxType,
            periodKey
        });
        if (!existing) {
            return {
                taxType: input.taxType,
                periodKey,
                periodStart: bounds.periodStart,
                periodEnd: bounds.periodEnd,
                taxPeriodId: null,
                status: 'PERIOD_REQUIRED',
                assignmentStatus: 'PERIOD_REQUIRED',
                accountingPeriodId: (accounting === null || accounting === void 0 ? void 0 : accounting._id) ? String(accounting._id) : null
            };
        }
        return {
            taxType: input.taxType,
            periodKey,
            periodStart: existing.periodStart,
            periodEnd: existing.periodEnd,
            taxPeriodId: String(existing._id),
            status: existing.status,
            assignmentStatus: assignmentStatusForExistingPeriod(existing.status),
            accountingPeriodId: existing.accountingPeriodId
                ? String(existing.accountingPeriodId)
                : (accounting === null || accounting === void 0 ? void 0 : accounting._id)
                    ? String(accounting._id)
                    : null
        };
    });
}
function resolveRelevantTaxPeriods(input) {
    return __awaiter(this, void 0, void 0, function* () {
        const unique = Array.from(new Set(input.taxTypes));
        return Promise.all(unique.map((taxType) => resolveTaxPeriod({ companyId: input.companyId, taxType, transactionDate: input.transactionDate })));
    });
}
function assertTaxPeriodsAllowPosting(periods) {
    return __awaiter(this, void 0, void 0, function* () {
        const closed = periods.find((period) => period.assignmentStatus === 'PERIOD_CLOSED');
        if (closed) {
            throw new errorHandler_1.AppError(`Tax period ${closed.periodKey} (${closed.taxType}) is ${closed.status}. Corrections must use a later open period.`, 409);
        }
    });
}
function listTaxPeriods(companyId, taxType) {
    return __awaiter(this, void 0, void 0, function* () {
        const query = { companyId: asObjectId(companyId, 'companyId') };
        if (taxType && taxMetadataTypes_1.TAX_PERIOD_TAX_TYPES.includes(taxType))
            query.taxType = taxType;
        return TaxPeriod_1.TaxPeriod.find(query).sort({ periodStart: -1, taxType: 1 });
    });
}
function openTaxPeriod(input) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!taxMetadataTypes_1.TAX_PERIOD_TAX_TYPES.includes(input.taxType)) {
            throw new errorHandler_1.AppError('Invalid taxType', 400);
        }
        if (!/^\d{4}-\d{2}$/.test(input.periodKey))
            throw new errorHandler_1.AppError('periodKey must be YYYY-MM', 400);
        const bounds = (0, taxMetadataTypes_1.calendarPeriodBounds)(input.periodKey);
        const accounting = yield (0, accountingPeriodService_1.findPeriodForDate)(input.companyId, bounds.periodStart);
        try {
            const created = yield TaxPeriod_1.TaxPeriod.create({
                companyId: asObjectId(input.companyId, 'companyId'),
                taxType: input.taxType,
                periodKey: input.periodKey,
                periodStart: bounds.periodStart,
                periodEnd: bounds.periodEnd,
                status: 'OPEN',
                openedAt: new Date(),
                openedBy: asObjectId(input.userId, 'userId'),
                notes: input.notes,
                accountingPeriodId: (accounting === null || accounting === void 0 ? void 0 : accounting._id) || null
            });
            yield AccountingEventLog_1.AccountingEventLog.create({
                companyId: asObjectId(input.companyId, 'companyId'),
                eventType: 'TAX_PERIOD_OPENED',
                sourceModule: 'individual_tax_period',
                sourceId: String(created._id),
                success: true,
                message: `Opened ${input.taxType} ${input.periodKey}`,
                metadata: { taxType: input.taxType, periodKey: input.periodKey }
            });
            return created;
        }
        catch (error) {
            if ((error === null || error === void 0 ? void 0 : error.code) === 11000)
                throw new errorHandler_1.AppError('Tax period already exists for that type and month', 409);
            throw error;
        }
    });
}
function updateTaxPeriodStatus(input) {
    return __awaiter(this, void 0, void 0, function* () {
        const row = yield TaxPeriod_1.TaxPeriod.findOne({
            _id: asObjectId(input.periodId, 'periodId'),
            companyId: asObjectId(input.companyId, 'companyId')
        });
        if (!row)
            throw new errorHandler_1.AppError('Tax period not found', 404);
        const before = row.status;
        row.status = input.status;
        if (input.notes !== undefined)
            row.notes = input.notes;
        if (input.status === 'REVIEW') {
            row.reviewedAt = new Date();
            row.reviewedBy = asObjectId(input.userId, 'userId');
        }
        if (CLOSED_STATUSES.includes(input.status) || input.status === 'FINALIZED') {
            row.closedAt = new Date();
            row.closedBy = asObjectId(input.userId, 'userId');
        }
        yield row.save();
        const eventType = input.status === 'FINALIZED'
            ? row.taxType === 'VAT'
                ? 'VAT_FINALIZED'
                : row.taxType === 'PRESUMPTIVE_RENTAL_INCOME_TAX'
                    ? 'RENTAL_TAX_FINALIZED'
                    : row.taxType === 'INCOME_TAX'
                        ? 'INCOME_TAX_PERIOD_FINALIZED'
                        : 'TAX_PERIOD_FINALIZED'
            : input.status === 'AMENDED'
                ? 'VAT_AMENDED'
                : 'TAX_PERIOD_REVIEWED';
        yield AccountingEventLog_1.AccountingEventLog.create({
            companyId: asObjectId(input.companyId, 'companyId'),
            eventType,
            sourceModule: 'individual_tax_period',
            sourceId: String(row._id),
            success: true,
            message: `Tax period ${row.periodKey} ${before} → ${input.status}`,
            metadata: { before, after: input.status }
        });
        return row;
    });
}
