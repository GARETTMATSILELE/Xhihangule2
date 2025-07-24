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
exports.syncPaymentsToPropertyAccounts = syncPaymentsToPropertyAccounts;
const PropertyAccount_1 = __importDefault(require("../models/PropertyAccount"));
const Payment_1 = require("../models/Payment");
function syncPaymentsToPropertyAccounts() {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        const payments = yield Payment_1.Payment.find().sort({ paymentDate: 1 }); // oldest first
        for (const payment of payments) {
            const propertyId = payment.propertyId;
            const ownerAmount = (_a = payment.commissionDetails) === null || _a === void 0 ? void 0 : _a.ownerAmount;
            const paymentDate = payment.paymentDate;
            if (!propertyId || !ownerAmount || !paymentDate)
                continue;
            let account = yield PropertyAccount_1.default.findOne({ propertyId });
            if (!account) {
                account = new PropertyAccount_1.default({ propertyId, transactions: [], runningBalance: 0 });
            }
            // Prevent duplicate payment
            const alreadyExists = account.transactions.some((t) => { var _a; return ((_a = t.paymentId) === null || _a === void 0 ? void 0 : _a.toString()) === payment._id.toString(); });
            if (alreadyExists)
                continue;
            account.transactions.push({
                type: 'income',
                amount: ownerAmount,
                date: paymentDate,
                paymentId: payment._id
            });
            // Sort and recalculate running balance
            account.transactions.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
            account.runningBalance = account.transactions.reduce((sum, t) => {
                return t.type === 'income' ? sum + t.amount : sum - t.amount;
            }, 0);
            account.lastUpdated = new Date();
            yield account.save();
        }
    });
}
