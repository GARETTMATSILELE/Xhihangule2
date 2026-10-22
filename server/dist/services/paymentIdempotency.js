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
exports.idempotencyHolderIsRetired = idempotencyHolderIsRetired;
exports.findLiveIdempotentPayment = findLiveIdempotentPayment;
const mongoose_1 = __importDefault(require("mongoose"));
const Payment_1 = require("../models/Payment");
/**
 * A reversed, voided, or negative receipt must not keep answering later submits
 * of the same form. The key belongs to the live receipt only.
 */
function idempotencyHolderIsRetired(payment) {
    if (!payment)
        return false;
    if (payment.reversalOfPaymentId)
        return true;
    if (Number(payment.amount || 0) < 0)
        return true;
    if (String(payment.reversalState || '') === 'reversed')
        return true;
    const status = String(payment.status || '').toLowerCase();
    const posting = String(payment.postingStatus || '').toLowerCase();
    if (status === 'reversed' || status === 'failed')
        return true;
    if (posting === 'reversed' || posting === 'voided')
        return true;
    return false;
}
/**
 * Return the live payment for this key.
 * If the key is still sitting on a reversed receipt, release it and return null
 * so the caller can store a new receipt.
 */
function findLiveIdempotentPayment(params) {
    return __awaiter(this, void 0, void 0, function* () {
        const key = String(params.idempotencyKey || '').trim();
        if (!key || !params.companyId)
            return null;
        const companyId = mongoose_1.default.Types.ObjectId.isValid(String(params.companyId))
            ? new mongoose_1.default.Types.ObjectId(String(params.companyId))
            : params.companyId;
        let query = Payment_1.Payment.findOne({ companyId, idempotencyKey: key });
        if (params.session)
            query = query.session(params.session);
        const existing = yield query.lean();
        if (!existing)
            return null;
        if (!idempotencyHolderIsRetired(existing))
            return existing;
        const release = Payment_1.Payment.updateOne({ _id: existing._id, idempotencyKey: key }, { $unset: { idempotencyKey: 1 } });
        if (params.session)
            release.session(params.session);
        yield release;
        return null;
    });
}
