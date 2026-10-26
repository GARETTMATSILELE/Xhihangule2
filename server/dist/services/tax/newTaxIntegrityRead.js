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
exports.loadNewTaxIntegrity = loadNewTaxIntegrity;
const mongoose_1 = __importDefault(require("mongoose"));
const TaxObligation_1 = require("../../models/TaxObligation");
const JournalEntry_1 = require("../../models/JournalEntry");
const JournalLine_1 = require("../../models/JournalLine");
const ChartOfAccount_1 = require("../../models/ChartOfAccount");
const AccountingException_1 = require("../../models/AccountingException");
const collections_1 = require("../../config/collections");
const chartAccounts_1 = require("./chartAccounts");
const newTaxIntegrity_1 = require("./newTaxIntegrity");
/**
 * Read-only check of taxable payments against obligations and VAT control-account lines.
 * Does not create obligations or post journals.
 */
function loadNewTaxIntegrity(companyId) {
    return __awaiter(this, void 0, void 0, function* () {
        const company = new mongoose_1.default.Types.ObjectId(companyId);
        const [payments, obligations, account, openFailedPostings] = yield Promise.all([
            mongoose_1.default.connection.collection(collections_1.COLLECTIONS.PAYMENTS).find({
                companyId: company,
                $or: [
                    { 'commissionDetails.vatOnCommission': { $gt: 0 } },
                    { vatAmount: { $gt: 0 } }
                ]
            }, {
                projection: {
                    paymentDate: 1,
                    status: 1,
                    amount: 1,
                    paymentType: 1,
                    type: 1,
                    vatAmount: 1,
                    propertyId: 1,
                    reversalOfPaymentId: 1,
                    'commissionDetails.vatOnCommission': 1,
                    'commissionDetails.vatRate': 1
                }
            }).toArray(),
            TaxObligation_1.TaxObligation.find({ companyId: company }).select('paymentId taxType taxAmount status reversalOf createdAt taxPeriod taxRate propertyId').lean(),
            ChartOfAccount_1.ChartOfAccount.findOne({ companyId: company, code: chartAccounts_1.GL.VAT_PAYABLE, isDeleted: { $ne: true } }).select('_id').lean(),
            AccountingException_1.AccountingException.countDocuments({ companyId: company, status: 'open' })
        ]);
        const lines = account
            ? yield JournalLine_1.JournalLine.find({ companyId: company, accountId: account._id }).select('journalEntryId debit credit').lean()
            : [];
        const entries = lines.length
            ? yield JournalEntry_1.JournalEntry.find({ companyId: company, _id: { $in: lines.map((row) => row.journalEntryId) } }).select('sourceId').lean()
            : [];
        const entryById = new Map(entries.map((row) => [String(row._id), String(row.sourceId || '')]));
        const gl = new Map();
        for (const line of lines) {
            const sourceId = entryById.get(String(line.journalEntryId)) || '';
            const current = gl.get(sourceId) || { sourceId, debit: 0, credit: 0 };
            current.debit = Number((current.debit + Number(line.debit || 0)).toFixed(2));
            current.credit = Number((current.credit + Number(line.credit || 0)).toFixed(2));
            gl.set(sourceId, current);
        }
        return (0, newTaxIntegrity_1.assessNewTaxIntegrity)({
            openFailedPostings,
            sources: payments.map((row) => {
                var _a, _b, _c;
                return ({
                    id: String(row._id),
                    kind: String(row.type || row.paymentType || 'other'),
                    status: String(row.status || ''),
                    amount: Number(row.amount || 0),
                    paymentDate: row.paymentDate,
                    vatOnCommission: Number(((_a = row.commissionDetails) === null || _a === void 0 ? void 0 : _a.vatOnCommission) || 0),
                    outputVat: Number(row.vatAmount || 0),
                    taxRate: (_c = (_b = row.commissionDetails) === null || _b === void 0 ? void 0 : _b.vatRate) !== null && _c !== void 0 ? _c : null,
                    propertyId: row.propertyId ? String(row.propertyId) : null,
                    reversalOfPaymentId: row.reversalOfPaymentId ? String(row.reversalOfPaymentId) : null
                });
            }),
            obligations: obligations.map((row) => {
                var _a;
                return ({
                    id: String(row._id),
                    paymentId: row.paymentId ? String(row.paymentId) : '',
                    taxType: String(row.taxType),
                    taxAmount: Number(row.taxAmount || 0),
                    status: String(row.status || ''),
                    reversalOf: row.reversalOf ? String(row.reversalOf) : null,
                    createdAt: row.createdAt,
                    taxPeriod: row.taxPeriod || null,
                    taxRate: (_a = row.taxRate) !== null && _a !== void 0 ? _a : null,
                    propertyId: row.propertyId ? String(row.propertyId) : null
                });
            }),
            gl: [...gl.values()]
        });
    });
}
