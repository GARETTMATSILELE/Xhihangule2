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
exports.buildFinancialTrace = buildFinancialTrace;
exports.listTrustVisibility = listTrustVisibility;
const mongoose_1 = __importDefault(require("mongoose"));
const Payment_1 = require("../models/Payment");
const TrustTransaction_1 = require("../models/TrustTransaction");
const TaxObligation_1 = require("../models/TaxObligation");
const ownerWaterfall_1 = require("../reporting/ownerWaterfall");
const transactionDomain_1 = require("./transactionDomain");
const paymentAccountingReconciliation_1 = require("./paymentAccountingReconciliation");
const postingLabel = (required, present) => {
    if (!required)
        return 'Not Applicable';
    return present ? 'Complete' : 'Incomplete';
};
function buildFinancialTrace(companyId, paymentId) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j;
        if (!mongoose_1.default.isValidObjectId(paymentId))
            return null;
        const payment = yield Payment_1.Payment.findOne({ _id: paymentId, companyId }).lean();
        if (!payment)
            return null;
        const details = payment.commissionDetails || {};
        const levy = Number((_b = (_a = details.levy) !== null && _a !== void 0 ? _a : payment.levyAllocated) !== null && _b !== void 0 ? _b : 0);
        const gross = Number((_d = (_c = details.grossRent) !== null && _c !== void 0 ? _c : payment.amount) !== null && _d !== void 0 ? _d : 0);
        const commission = Number((_f = (_e = details.commissionNet) !== null && _e !== void 0 ? _e : details.totalCommission) !== null && _f !== void 0 ? _f : 0);
        const vat = Number((_h = (_g = details.vatOnCommission) !== null && _g !== void 0 ? _g : details.vatAmount) !== null && _h !== void 0 ? _h : 0);
        const vatRate = details.vatRate == null ? undefined : Number(details.vatRate);
        const recordedOwner = ((_j = details.paymentAllocation) === null || _j === void 0 ? void 0 : _j.ownerPayable) != null
            ? Number(details.paymentAllocation.ownerPayable)
            : (details.ownerAmount != null ? Number(details.ownerAmount) - levy : undefined);
        const waterfall = (0, ownerWaterfall_1.explainOwnerWaterfall)({
            grossAmount: gross,
            commissionAmount: commission,
            levyAmount: levy,
            vatOnCommission: vat,
            vatRate: Number.isFinite(Number(vatRate)) ? Number(vatRate) : undefined,
            recordedOwnerAmount: recordedOwner
        });
        const domain = (0, transactionDomain_1.historicalTransactionDomain)(payment);
        const recon = yield (0, paymentAccountingReconciliation_1.reconcilePayment)(String(payment._id));
        const expected = recon.expected || {};
        const actual = recon.actual || {};
        const taxCount = yield TaxObligation_1.TaxObligation.countDocuments({ companyId, paymentId: payment._id });
        const trustCount = domain === 'SALE'
            ? yield TrustTransaction_1.TrustTransaction.countDocuments({ companyId, paymentId: payment._id })
            : 0;
        const reversalPaymentId = payment.reversalPaymentId ? String(payment.reversalPaymentId) : undefined;
        const reversalOfPaymentId = payment.reversalOfPaymentId ? String(payment.reversalOfPaymentId) : undefined;
        return {
            payment: {
                id: String(payment._id),
                date: payment.paymentDate,
                amount: Number(payment.amount || 0),
                method: payment.paymentMethod,
                type: payment.paymentType,
                domain,
                propertyId: payment.propertyId ? String(payment.propertyId) : undefined,
                tenantId: payment.tenantId ? String(payment.tenantId) : undefined,
                leaseId: payment.leaseId ? String(payment.leaseId) : undefined,
                reference: payment.referenceNumber,
                currency: payment.currency || 'USD',
                status: payment.status,
                accountingState: payment.accountingStatus || recon.status,
                accountingComplete: Boolean(payment.accountingComplete)
            },
            allocation: waterfall,
            posting: {
                ownerIncome: postingLabel(Boolean(expected.ownerIncome), Boolean(actual.ownerIncome)),
                agentCommission: postingLabel(Boolean(expected.agentCommission), Boolean(actual.agentCommission)),
                companyCommission: postingLabel(Boolean(expected.companyCommission), Boolean(actual.companyCommission)),
                journal: postingLabel(Boolean(expected.journal), Boolean(actual.journal)),
                trust: domain === 'SALE' ? postingLabel(true, trustCount > 0) : 'Not Applicable',
                tax: postingLabel(vat > 0, taxCount > 0)
            },
            reversal: {
                state: payment.reversalState || null,
                reversalPaymentId: reversalPaymentId || null,
                reversalOfPaymentId: reversalOfPaymentId || null
            },
            retry: {
                safe: true,
                effect: 'Retry posts only missing accounting artifacts for this payment. It does not create a second income line, commission line, journal, tax obligation, or reversal.'
            }
        };
    });
}
function listTrustVisibility(companyId_1) {
    return __awaiter(this, arguments, void 0, function* (companyId, limit = 50) {
        const rows = yield TrustTransaction_1.TrustTransaction.find({ companyId })
            .sort({ createdAt: -1 })
            .limit(Math.min(100, Math.max(1, limit)))
            .lean();
        const paymentIds = rows.map((row) => row.paymentId).filter(Boolean);
        const payments = yield Payment_1.Payment.find({ _id: { $in: paymentIds }, companyId })
            .select('_id transactionDomain paymentType referenceNumber')
            .lean();
        const byId = new Map(payments.map((row) => [String(row._id), row]));
        return rows.map((row) => {
            const payment = row.paymentId ? byId.get(String(row.paymentId)) : undefined;
            const domain = payment ? (0, transactionDomain_1.historicalTransactionDomain)(payment) : undefined;
            return {
                id: String(row._id),
                date: row.createdAt,
                paymentId: row.paymentId ? String(row.paymentId) : undefined,
                reference: row.reference,
                type: row.type,
                credit: Number(row.credit || 0),
                debit: Number(row.debit || 0),
                balance: Number(row.runningBalance || 0),
                domain: domain || null,
                historicalRentalTrust: domain === 'RENTAL',
                saleTrust: domain === 'SALE'
            };
        });
    });
}
