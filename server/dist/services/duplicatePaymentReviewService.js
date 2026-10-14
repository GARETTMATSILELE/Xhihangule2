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
exports.detectDuplicatePayments = detectDuplicatePayments;
const mongoose_1 = __importDefault(require("mongoose"));
const Payment_1 = require("../models/Payment");
const FinancialControlException_1 = require("../models/FinancialControlException");
const money_1 = require("../utils/money");
const toId = (value) => new mongoose_1.default.Types.ObjectId(value);
function dayKey(value) {
    const d = value ? new Date(value) : new Date(0);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}
function detectDuplicatePayments(companyId) {
    return __awaiter(this, void 0, void 0, function* () {
        const rows = yield Payment_1.Payment.find({
            companyId: toId(companyId),
            status: { $in: ['completed', 'posted'] },
            isProvisional: { $ne: true },
            reversalOfPaymentId: { $exists: false }
        })
            .select('_id propertyId amount currency paymentDate referenceNumber tenantId')
            .limit(5000)
            .lean();
        const buckets = new Map();
        for (const row of rows) {
            const key = [
                String(row.propertyId || ''),
                (0, money_1.roundMoney)(Number(row.amount || 0)).toFixed(2),
                String(row.currency || 'USD'),
                dayKey(row.paymentDate),
                String(row.tenantId || ''),
                String(row.referenceNumber || '')
            ].join('|');
            const list = buckets.get(key) || [];
            list.push(row);
            buckets.set(key, list);
        }
        let created = 0;
        for (const [, list] of buckets) {
            if (list.length < 2)
                continue;
            const primary = list[0];
            try {
                yield FinancialControlException_1.FinancialControlException.updateOne({
                    companyId: toId(companyId),
                    type: 'DUPLICATE_REVIEW_REQUIRED',
                    entityType: 'Payment',
                    entityId: String(primary._id),
                    status: { $in: ['OPEN', 'UNDER_REVIEW'] }
                }, {
                    $setOnInsert: {
                        companyId: toId(companyId),
                        type: 'DUPLICATE_REVIEW_REQUIRED',
                        severity: 'WARNING',
                        status: 'OPEN',
                        entityType: 'Payment',
                        entityId: String(primary._id),
                        description: `${list.length} completed payments share property, amount, currency, date, and payer/reference. Review only — nothing was merged or deleted.`,
                        expected: 1,
                        actual: list.length,
                        difference: list.length - 1,
                        currency: String(primary.currency || 'USD'),
                        detectedAt: new Date(),
                        detectedBy: 'duplicatePaymentReviewService'
                    }
                }, { upsert: true });
                created += 1;
            }
            catch (_a) {
                // unique partial index may already have an open row
            }
        }
        return created;
    });
}
