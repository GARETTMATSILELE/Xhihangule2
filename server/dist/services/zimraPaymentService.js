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
exports.recordZimraPayment = recordZimraPayment;
exports.attachTaxPaymentReceipt = attachTaxPaymentReceipt;
const mongoose_1 = __importDefault(require("mongoose"));
const TaxObligation_1 = require("../models/TaxObligation");
const TaxPayment_1 = require("../models/TaxPayment");
const VatRecord_1 = require("../models/VatRecord");
const accountingService_1 = __importDefault(require("./accountingService"));
const principalAgentJournal_1 = require("./tax/principalAgentJournal");
const chartAccounts_1 = require("./tax/chartAccounts");
const taxObligationService_1 = require("./taxObligationService");
const money_1 = require("../utils/money");
const errorHandler_1 = require("../middleware/errorHandler");
const toId = (value) => new mongoose_1.default.Types.ObjectId(value);
function recordZimraPayment(input) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        const amount = (0, money_1.roundMoney)(Number(input.amount || 0));
        if (!(amount > 0))
            throw new errorHandler_1.AppError('A positive payment amount is required', 400);
        if (!((_a = input.allocations) === null || _a === void 0 ? void 0 : _a.length))
            throw new errorHandler_1.AppError('At least one tax allocation is required', 400);
        const allocated = (0, money_1.roundMoney)(input.allocations.reduce((s, a) => s + Number(a.amount || 0), 0));
        const unallocatedAmount = (0, money_1.roundMoney)(Number(input.unallocatedAmount || 0));
        if (unallocatedAmount < 0)
            throw new errorHandler_1.AppError('Unallocated amount cannot be negative', 400);
        if (Math.abs(allocated + unallocatedAmount - amount) > 0.0001) {
            throw new errorHandler_1.AppError(`Allocations (${allocated.toFixed(2)}) plus unallocated (${unallocatedAmount.toFixed(2)}) must equal the payment amount (${amount.toFixed(2)}). Overpayments cannot be silently dropped.`, 400);
        }
        if (unallocatedAmount > 0 && !String(input.unallocatedReason || '').trim()) {
            throw new errorHandler_1.AppError('An unallocated amount requires an explicit reason or another documented allocation', 400);
        }
        const types = new Set();
        const allocationDocs = [];
        for (const alloc of input.allocations) {
            const outstanding = yield (0, taxObligationService_1.outstandingForObligation)(alloc.taxObligationId);
            if ((0, money_1.roundMoney)(alloc.amount) - outstanding > 0.0001) {
                throw new errorHandler_1.AppError(`Cannot allocate ${alloc.amount} — outstanding is ${outstanding.toFixed(2)}`, 400);
            }
            const obligation = yield TaxObligation_1.TaxObligation.findById(alloc.taxObligationId).lean();
            if (!obligation || String(obligation.companyId) !== String(input.companyId)) {
                throw new errorHandler_1.AppError('Tax obligation not found', 404);
            }
            if (obligation.status === 'REVERSED')
                throw new errorHandler_1.AppError('Cannot allocate to a reversed obligation', 400);
            types.add(obligation.taxType);
            allocationDocs.push({
                taxObligationId: toId(alloc.taxObligationId),
                taxType: obligation.taxType,
                taxPeriod: obligation.taxPeriod,
                amount: (0, money_1.roundMoney)(alloc.amount)
            });
        }
        const vatTypes = ['VAT_OUTPUT', 'VAT_ON_COMMISSION', 'VAT_INPUT', 'VAT_WITHHOLDING'];
        const isVatPayment = [...types].every((t) => vatTypes.includes(t));
        const lines = isVatPayment
            ? (0, principalAgentJournal_1.buildVatPaymentJournal)({
                amount,
                bankAccountCode: input.bankAccountCode || chartAccounts_1.GL.COMPANY_BANK,
                allocatedAmount: allocated,
                unallocatedAmount
            })
            : [
                ...(0, principalAgentJournal_1.buildWithholdingRemittanceJournal)({ amount: allocated, bankAccountCode: input.bankAccountCode || chartAccounts_1.GL.TRUST_BANK }),
                ...(unallocatedAmount > 0
                    ? [
                        { accountCode: chartAccounts_1.GL.TAX_PREPAYMENT, debit: unallocatedAmount },
                        { accountCode: input.bankAccountCode || chartAccounts_1.GL.TRUST_BANK, credit: unallocatedAmount }
                    ]
                    : [])
            ];
        const identity = [
            input.companyId,
            String(input.zimraReference || '').trim(),
            String(input.paymentReference || '').trim(),
            amount.toFixed(2),
            input.paymentDate.toISOString().slice(0, 10),
            input.allocations.map((a) => `${a.taxObligationId}:${(0, money_1.roundMoney)(a.amount)}`).sort().join(',')
        ].join('|');
        const posted = yield accountingService_1.default.postTransaction({
            companyId: input.companyId,
            reference: `ZIMRA-${String(input.zimraReference || input.paymentReference || identity).slice(0, 80)}`,
            description: `ZIMRA payment ${input.paymentReference || input.zimraReference || ''}`.trim(),
            sourceModule: 'tax',
            sourceId: `taxpay:${identity}`,
            transactionDate: input.paymentDate,
            createdBy: input.createdBy,
            lines
        });
        const payment = yield TaxPayment_1.TaxPayment.create({
            companyId: toId(input.companyId),
            amount,
            currency: 'USD',
            paymentDate: input.paymentDate,
            bankAccountCode: input.bankAccountCode || (isVatPayment ? chartAccounts_1.GL.COMPANY_BANK : chartAccounts_1.GL.TRUST_BANK),
            zimraReference: input.zimraReference,
            paymentReference: input.paymentReference,
            notes: input.notes,
            status: 'POSTED',
            allocations: allocationDocs,
            unallocatedAmount,
            unallocatedReason: unallocatedAmount > 0 ? String(input.unallocatedReason || '').trim() : undefined,
            journalEntryId: posted.journalEntryId,
            createdBy: toId(input.createdBy)
        });
        yield (0, taxObligationService_1.markObligationsPaid)({
            allocations: input.allocations,
            paymentReference: input.paymentReference,
            zimraReference: input.zimraReference,
            paidAt: input.paymentDate
        });
        if (isVatPayment) {
            for (const alloc of input.allocations) {
                const obligation = yield TaxObligation_1.TaxObligation.findById(alloc.taxObligationId).lean();
                if (!(obligation === null || obligation === void 0 ? void 0 : obligation.paymentId))
                    continue;
                yield VatRecord_1.VatRecord.updateOne({
                    companyId: toId(input.companyId),
                    transactionId: String(obligation.paymentId),
                    sourceType: { $in: ['rental', 'sale', 'introduction'] }
                }, { $inc: { vatPaid: (0, money_1.roundMoney)(alloc.amount) } });
            }
        }
        return { paymentId: String(payment._id), journalEntryId: posted.journalEntryId, unallocatedAmount };
    });
}
function attachTaxPaymentReceipt(input) {
    return __awaiter(this, void 0, void 0, function* () {
        const row = yield TaxPayment_1.TaxPayment.findOne({ _id: input.paymentId, companyId: toId(input.companyId) });
        if (!row)
            throw new errorHandler_1.AppError('Tax payment not found', 404);
        row.receiptFileName = input.fileName;
        row.receiptContentType = input.contentType;
        row.receiptData = input.data;
        row.receiptUploadedAt = new Date();
        row.receiptUploadedBy = toId(input.uploadedBy);
        yield row.save();
    });
}
