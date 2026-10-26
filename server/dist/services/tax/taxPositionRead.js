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
exports.loadCompanyTaxPosition = loadCompanyTaxPosition;
const mongoose_1 = __importDefault(require("mongoose"));
const TaxObligation_1 = require("../../models/TaxObligation");
const TaxPayment_1 = require("../../models/TaxPayment");
const TaxRecord_1 = require("../../models/TaxRecord");
const TaxPayout_1 = require("../../models/TaxPayout");
const TrustAccount_1 = require("../../models/TrustAccount");
const Property_1 = require("../../models/Property");
const ChartOfAccount_1 = require("../../models/ChartOfAccount");
const chartAccounts_1 = require("./chartAccounts");
const taxPosition_1 = require("./taxPosition");
const toId = (value) => new mongoose_1.default.Types.ObjectId(value);
/**
 * Read-only company tax position. Does not create obligations, post journals, or edit ledgers.
 */
function loadCompanyTaxPosition(companyId, asOf) {
    return __awaiter(this, void 0, void 0, function* () {
        const company = toId(companyId);
        const [obligations, payments, records, payouts, glRows] = yield Promise.all([
            TaxObligation_1.TaxObligation.find({ companyId: company }).select('taxType propertyId paymentId taxPeriod taxAmount status reversalOf transactionDate').lean(),
            TaxPayment_1.TaxPayment.find({ companyId: company }).select('status amount paymentDate unallocatedAmount allocations').lean(),
            TaxRecord_1.TaxRecord.find({ companyId: company }).select('trustAccountId taxType amount createdAt').lean(),
            TaxPayout_1.TaxPayout.find({ companyId: company }).select('trustAccountId taxType amount createdAt payoutDate').lean(),
            ChartOfAccount_1.ChartOfAccount.find({
                companyId: company,
                code: { $in: [chartAccounts_1.GL.VAT_PAYABLE, chartAccounts_1.GL.ZIMRA_WITHHOLDING] },
                isDeleted: { $ne: true }
            }).select('code balance').lean()
        ]);
        const trustIds = [...records, ...payouts].map((row) => row.trustAccountId).filter(Boolean);
        const trusts = trustIds.length
            ? yield TrustAccount_1.TrustAccount.find({ _id: { $in: trustIds }, companyId: company }).select('propertyId').lean()
            : [];
        const trustProperty = new Map(trusts.map((row) => [String(row._id), row.propertyId ? String(row.propertyId) : '']));
        const propertyIds = [
            ...obligations.map((row) => row.propertyId),
            ...trusts.map((row) => row.propertyId)
        ].filter(Boolean);
        const properties = propertyIds.length
            ? yield Property_1.Property.find({ _id: { $in: propertyIds }, companyId: company }).select('name address').lean()
            : [];
        const propertyName = new Map(properties.map((row) => [String(row._id), String(row.name || row.address || '')]));
        const nameOf = (id) => (id ? propertyName.get(String(id)) || String(id) : undefined);
        return (0, taxPosition_1.buildTaxPosition)({
            asOf,
            obligations: obligations.map((row) => ({
                id: String(row._id),
                taxType: String(row.taxType),
                propertyId: row.propertyId ? String(row.propertyId) : null,
                propertyName: nameOf(row.propertyId),
                paymentId: row.paymentId ? String(row.paymentId) : null,
                taxPeriod: String(row.taxPeriod || ''),
                taxAmount: Number(row.taxAmount || 0),
                status: String(row.status || ''),
                reversalOf: row.reversalOf ? String(row.reversalOf) : null,
                transactionDate: row.transactionDate
            })),
            payments: payments.map((row) => ({
                id: String(row._id),
                status: String(row.status || ''),
                amount: Number(row.amount || 0),
                paymentDate: row.paymentDate,
                unallocatedAmount: Number(row.unallocatedAmount || 0),
                allocations: (row.allocations || []).map((allocation) => ({
                    taxObligationId: String(allocation.taxObligationId),
                    taxType: allocation.taxType ? String(allocation.taxType) : undefined,
                    amount: Number(allocation.amount || 0)
                }))
            })),
            legacyRecords: records.map((row) => {
                const propertyId = trustProperty.get(String(row.trustAccountId)) || (row.propertyId ? String(row.propertyId) : null);
                return {
                    id: String(row._id),
                    taxType: String(row.taxType),
                    propertyId,
                    propertyName: nameOf(propertyId),
                    amount: Number(row.amount || 0),
                    createdAt: row.createdAt
                };
            }),
            legacyPayouts: payouts.map((row) => {
                const propertyId = trustProperty.get(String(row.trustAccountId)) || (row.propertyId ? String(row.propertyId) : null);
                return {
                    id: String(row._id),
                    taxType: String(row.taxType),
                    propertyId,
                    propertyName: nameOf(propertyId),
                    amount: Number(row.amount || 0),
                    createdAt: row.payoutDate || row.createdAt
                };
            }),
            glBalances: glRows.map((row) => ({ code: String(row.code), balance: Number(row.balance || 0) }))
        });
    });
}
