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
const mongoose_1 = __importDefault(require("mongoose"));
const Payment_1 = require("../models/Payment");
const trustAccountService_1 = __importDefault(require("./trustAccountService"));
const transactionDomain_1 = require("./transactionDomain");
const TrustTransaction_1 = require("../models/TrustTransaction");
const testFailureSeam_1 = require("./testFailureSeam");
class TrustPaymentPostingService {
    postBuyerPaymentToTrust(payload) {
        return __awaiter(this, void 0, void 0, function* () {
            const payment = yield Payment_1.Payment.findById(payload.paymentId).lean();
            if (!payment) {
                throw new Error(`Payment not found: ${payload.paymentId}`);
            }
            const normalizedStatus = String(payment.status || '').toLowerCase();
            if (normalizedStatus !== 'completed' && normalizedStatus !== 'confirmed') {
                throw new Error(`Payment ${payload.paymentId} is not confirmed/completed`);
            }
            if (payment.isProvisional === true) {
                return { skipped: true, reason: 'provisional' };
            }
            if (!(0, transactionDomain_1.mayPostSaleTrust)(payment)) {
                return { skipped: true, reason: 'not_sale_domain' };
            }
            if (!mongoose_1.default.Types.ObjectId.isValid(String(payload.propertyId || ''))) {
                throw new Error('Invalid propertyId in payment event');
            }
            const result = yield trustAccountService_1.default.recordBuyerPayment({
                companyId: String(payload.companyId),
                propertyId: String(payload.propertyId),
                amount: Number(payload.amount || 0),
                reference: payload.reference,
                paymentId: String(payload.paymentId),
                sourceEvent: payload.sourceEvent || 'payment.confirmed',
                createdBy: payload.performedBy
            });
            return result;
        });
    }
    reverseBuyerPaymentInTrust(payload) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            const originalPayment = yield Payment_1.Payment.findById(payload.paymentId).lean();
            if (!originalPayment) {
                throw new Error(`Original payment not found: ${payload.paymentId}`);
            }
            if (!(0, transactionDomain_1.mayPostSaleTrust)(originalPayment)) {
                return { skipped: true, reason: 'not_sale_domain' };
            }
            const propertyId = String(originalPayment.propertyId || '');
            if (!mongoose_1.default.Types.ObjectId.isValid(propertyId)) {
                throw new Error('Invalid propertyId in reversal event');
            }
            (0, testFailureSeam_1.throwOnceIfArmed)(String(payload.paymentId), `${String(originalPayment.notes || '')} ${String(payload.reason || '')}`, 'PHASE27_FAIL_TRUST');
            const receipt = yield TrustTransaction_1.TrustTransaction.findOne({
                paymentId: originalPayment._id,
                type: 'BUYER_PAYMENT',
                credit: { $gt: 0 }
            }).sort({ createdAt: 1 }).lean();
            if (!receipt) {
                return { skipped: true, reason: 'no_trust_receipt' };
            }
            const reversalPaymentId = String(payload.reversalPaymentId || '').trim();
            const reversalAmount = Math.abs(Number(receipt.credit || 0));
            if (reversalAmount <= 0) {
                throw new Error('Reversal amount must be greater than zero');
            }
            const result = yield trustAccountService_1.default.reverseBuyerPayment({
                companyId: String(payload.companyId),
                propertyId,
                amount: reversalAmount,
                paymentId: reversalPaymentId || undefined,
                reference: `reversal:${String(payload.paymentId)}`,
                sourceEvent: payload.sourceEvent || 'payment.reversed',
                createdBy: payload.performedBy
            });
            const trustAccountId = String(((_a = result === null || result === void 0 ? void 0 : result.account) === null || _a === void 0 ? void 0 : _a._id) || '');
            if (trustAccountId) {
                try {
                    yield trustAccountService_1.default.calculateSettlement({
                        companyId: String(payload.companyId),
                        trustAccountId,
                        createdBy: payload.performedBy
                    });
                }
                catch (settlementError) {
                    // Keep trust reversal successful even if settlement refresh is not applicable.
                    console.warn('Skipping trust settlement refresh after reversal:', (settlementError === null || settlementError === void 0 ? void 0 : settlementError.message) || settlementError);
                }
                try {
                    yield trustAccountService_1.default.verifyAndRepairAccountInvariants({
                        companyId: String(payload.companyId),
                        trustAccountId,
                        performedBy: payload.performedBy,
                        sourceEvent: payload.sourceEvent || 'payment.reversed'
                    });
                }
                catch (invariantError) {
                    // Keep reversal resilient; invariants are repaired opportunistically.
                    console.warn('Trust invariant check after reversal failed:', (invariantError === null || invariantError === void 0 ? void 0 : invariantError.message) || invariantError);
                }
            }
            return result;
        });
    }
}
exports.default = new TrustPaymentPostingService();
