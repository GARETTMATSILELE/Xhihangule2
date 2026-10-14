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
exports.glOutputVatForPeriod = glOutputVatForPeriod;
exports.prepareVatReturn = prepareVatReturn;
exports.updateVatReturnStatus = updateVatReturnStatus;
exports.listVatReturns = listVatReturns;
exports.isVatPeriodLocked = isVatPeriodLocked;
exports.assertVatPeriodOpen = assertVatPeriodOpen;
const mongoose_1 = __importDefault(require("mongoose"));
const VatReturn_1 = require("../models/VatReturn");
const TaxObligation_1 = require("../models/TaxObligation");
const Payment_1 = require("../models/Payment");
const ChartOfAccount_1 = require("../models/ChartOfAccount");
const JournalEntry_1 = require("../models/JournalEntry");
const JournalLine_1 = require("../models/JournalLine");
const chartAccounts_1 = require("./tax/chartAccounts");
const money_1 = require("../utils/money");
const errorHandler_1 = require("../middleware/errorHandler");
const toId = (value) => new mongoose_1.default.Types.ObjectId(value);
const periodBounds = (filingPeriod) => {
    const [year, month] = filingPeriod.split('-').map(Number);
    const start = new Date(Date.UTC(year, month - 1, 1));
    const end = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
    return { start, end };
};
function glOutputVatForPeriod(companyId, filingPeriod) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        const companyObjectId = toId(companyId);
        const account = yield ChartOfAccount_1.ChartOfAccount.findOne({
            companyId: companyObjectId,
            code: chartAccounts_1.GL.VAT_PAYABLE,
            isDeleted: { $ne: true }
        }).select('_id').lean();
        if (!account)
            return 0;
        const { start, end } = periodBounds(filingPeriod);
        const entries = yield JournalEntry_1.JournalEntry.find({
            companyId: companyObjectId,
            transactionDate: { $gte: start, $lte: end }
        }).select('_id').lean();
        if (!entries.length)
            return 0;
        const summed = yield JournalLine_1.JournalLine.aggregate([
            {
                $match: {
                    companyId: companyObjectId,
                    accountId: account._id,
                    journalEntryId: { $in: entries.map((row) => row._id) }
                }
            },
            { $group: { _id: null, credits: { $sum: '$credit' } } }
        ]);
        return (0, money_1.roundMoney)(Number(((_a = summed[0]) === null || _a === void 0 ? void 0 : _a.credits) || 0));
    });
}
function prepareVatReturn(companyId, filingPeriod, preparedBy) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c, _d;
        if (!/^\d{4}-\d{2}$/.test(filingPeriod)) {
            throw new errorHandler_1.AppError('filingPeriod must be YYYY-MM', 400);
        }
        const companyObjectId = toId(companyId);
        const vatTypes = ['VAT_OUTPUT', 'VAT_ON_COMMISSION', 'VAT_INPUT', 'VAT_WITHHOLDING'];
        const obligations = yield TaxObligation_1.TaxObligation.find({
            companyId: companyObjectId,
            taxPeriod: filingPeriod,
            taxType: { $in: vatTypes },
            status: { $ne: 'REVERSED' }
        }).lean();
        const payments = yield Payment_1.Payment.find({
            companyId: companyObjectId,
            status: 'completed',
            isProvisional: { $ne: true },
            reversalOfPaymentId: { $exists: false }
        })
            .select('amount paymentDate paymentType commissionDetails vatAmount vatRate vatIncluded')
            .lean();
        const inPeriod = (date) => {
            const d = new Date(date);
            const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
            return key === filingPeriod;
        };
        let taxableSupplies = 0;
        let exemptSupplies = 0;
        let zeroRatedSupplies = 0;
        for (const payment of payments) {
            if (!inPeriod(payment.paymentDate))
                continue;
            const vatOnCommission = Number(((_a = payment === null || payment === void 0 ? void 0 : payment.commissionDetails) === null || _a === void 0 ? void 0 : _a.vatOnCommission) || 0);
            const saleVat = Number((payment === null || payment === void 0 ? void 0 : payment.vatAmount) || 0);
            const commissionNet = Number(((_b = payment === null || payment === void 0 ? void 0 : payment.commissionDetails) === null || _b === void 0 ? void 0 : _b.commissionNet) || ((_c = payment === null || payment === void 0 ? void 0 : payment.commissionDetails) === null || _c === void 0 ? void 0 : _c.totalCommission) || 0);
            const treatment = String(((_d = payment === null || payment === void 0 ? void 0 : payment.commissionDetails) === null || _d === void 0 ? void 0 : _d.vatSupplyTreatment) || '').toUpperCase();
            if (treatment === 'ZERO_RATED') {
                zeroRatedSupplies = (0, money_1.roundMoney)(zeroRatedSupplies + commissionNet);
            }
            else if (vatOnCommission > 0 || saleVat > 0) {
                taxableSupplies = (0, money_1.roundMoney)(taxableSupplies + commissionNet);
            }
            else {
                exemptSupplies = (0, money_1.roundMoney)(exemptSupplies + Number(payment.amount || 0));
            }
        }
        const vatOnCommission = (0, money_1.roundMoney)(obligations.filter((o) => o.taxType === 'VAT_ON_COMMISSION').reduce((s, o) => s + Number(o.taxAmount || 0), 0));
        const vatOnSales = (0, money_1.roundMoney)(obligations.filter((o) => o.taxType === 'VAT_OUTPUT').reduce((s, o) => s + Number(o.taxAmount || 0), 0));
        const inputVat = (0, money_1.roundMoney)(obligations.filter((o) => o.taxType === 'VAT_INPUT').reduce((s, o) => s + Number(o.taxAmount || 0), 0));
        const vatWithholdingCredits = (0, money_1.roundMoney)(obligations.filter((o) => o.taxType === 'VAT_WITHHOLDING').reduce((s, o) => s + Number(o.taxAmount || 0), 0));
        const outputVat = (0, money_1.roundMoney)(vatOnCommission + vatOnSales);
        const netVatPayable = (0, money_1.roundMoney)(outputVat - inputVat - vatWithholdingCredits);
        const glOutputVat = yield glOutputVatForPeriod(companyId, filingPeriod);
        const obligationOutputVat = outputVat;
        const reconciliationDifference = (0, money_1.roundMoney)(obligationOutputVat - glOutputVat);
        const reconciliationStatus = Math.abs(reconciliationDifference) <= 0.005 ? 'MATCHED' : 'RECONCILIATION_REQUIRED';
        const doc = yield VatReturn_1.VatReturn.findOneAndUpdate({ companyId: companyObjectId, filingPeriod }, {
            $set: {
                taxableSupplies,
                exemptSupplies,
                zeroRatedSupplies,
                outputVat,
                inputVat,
                vatOnCommission,
                vatOnSales,
                vatWithholdingCredits,
                adjustments: 0,
                netVatPayable,
                glOutputVat,
                obligationOutputVat,
                reconciliationDifference,
                reconciliationStatus,
                preparedBy: preparedBy ? toId(preparedBy) : undefined,
                status: 'PREPARED'
            },
            $setOnInsert: { companyId: companyObjectId, filingPeriod }
        }, { upsert: true, new: true });
        yield TaxObligation_1.TaxObligation.updateMany({
            companyId: companyObjectId,
            taxPeriod: filingPeriod,
            taxType: { $in: vatTypes },
            status: { $in: ['CALCULATED', 'PAYABLE', 'WITHHELD'] }
        }, { $set: { status: 'RETURN_PREPARED' } });
        return doc;
    });
}
function updateVatReturnStatus(input) {
    return __awaiter(this, void 0, void 0, function* () {
        const row = yield VatReturn_1.VatReturn.findOne({ companyId: toId(input.companyId), filingPeriod: input.filingPeriod });
        if (!row)
            throw new errorHandler_1.AppError('VAT return not found — prepare it first', 404);
        if (input.status === 'PAID') {
            const remaining = yield TaxObligation_1.TaxObligation.find({
                companyId: toId(input.companyId),
                taxPeriod: input.filingPeriod,
                taxType: { $in: ['VAT_OUTPUT', 'VAT_ON_COMMISSION'] },
                status: { $nin: ['PAID', 'RECONCILED', 'REVERSED'] }
            }).select('_id').lean();
            if (remaining.length) {
                throw new errorHandler_1.AppError('VAT return cannot be marked PAID until matching ZIMRA tax payments clear the outstanding obligations', 400);
            }
        }
        if (input.status === 'RECONCILED') {
            const difference = (0, money_1.roundMoney)(Number(row.reconciliationDifference || 0));
            if (Math.abs(difference) > 0.005) {
                const note = String(input.notes || row.reconciliationNote || '').trim();
                if (!note) {
                    throw new errorHandler_1.AppError('RECONCILIATION REQUIRED. A material difference exists between tax-obligation output VAT and GL 2101. Document the timing difference before marking RECONCILED.', 400);
                }
                row.reconciliationStatus = 'TIMING_DIFFERENCE';
                row.reconciliationNote = note;
            }
            else {
                row.reconciliationStatus = 'MATCHED';
            }
        }
        row.status = input.status;
        if (input.zimraReturnReference)
            row.zimraReturnReference = input.zimraReturnReference;
        if (input.paymentReference)
            row.paymentReference = input.paymentReference;
        if (input.paymentDate)
            row.paymentDate = input.paymentDate;
        if (input.amountSubmitted != null)
            row.amountSubmitted = input.amountSubmitted;
        if (input.notes)
            row.notes = input.notes;
        if (input.status === 'SUBMITTED')
            row.submittedAt = new Date();
        if (input.reviewedBy && input.status === 'REVIEWED')
            row.reviewedBy = toId(input.reviewedBy);
        yield row.save();
        if (input.status === 'SUBMITTED') {
            yield TaxObligation_1.TaxObligation.updateMany({
                companyId: toId(input.companyId),
                taxPeriod: input.filingPeriod,
                taxType: { $in: ['VAT_OUTPUT', 'VAT_ON_COMMISSION', 'VAT_INPUT', 'VAT_WITHHOLDING'] },
                status: 'RETURN_PREPARED'
            }, { $set: { status: 'RETURN_SUBMITTED', submittedAt: new Date(), zimraReference: input.zimraReturnReference } });
        }
        return row;
    });
}
function listVatReturns(companyId) {
    return __awaiter(this, void 0, void 0, function* () {
        return VatReturn_1.VatReturn.find({ companyId: toId(companyId) }).sort({ filingPeriod: -1 }).lean();
    });
}
function isVatPeriodLocked(companyId, transactionDate) {
    return __awaiter(this, void 0, void 0, function* () {
        const period = `${transactionDate.getUTCFullYear()}-${String(transactionDate.getUTCMonth() + 1).padStart(2, '0')}`;
        const row = yield VatReturn_1.VatReturn.findOne({
            companyId: toId(companyId),
            filingPeriod: period,
            status: { $in: ['SUBMITTED', 'PAID', 'RECONCILED'] }
        }).select('_id').lean();
        return Boolean(row);
    });
}
function assertVatPeriodOpen(companyId, transactionDate, opts) {
    return __awaiter(this, void 0, void 0, function* () {
        if (opts === null || opts === void 0 ? void 0 : opts.allowAdjustment)
            return;
        if (yield isVatPeriodLocked(companyId, transactionDate)) {
            throw new errorHandler_1.AppError('VAT period is locked. Post an adjustment or reversal in the current open period.', 409);
        }
    });
}
