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
exports.detectNegativeBalances = detectNegativeBalances;
const mongoose_1 = __importDefault(require("mongoose"));
const ChartOfAccount_1 = require("../models/ChartOfAccount");
const FinancialControlException_1 = require("../models/FinancialControlException");
const chartAccounts_1 = require("./tax/chartAccounts");
const money_1 = require("../utils/money");
const toId = (value) => new mongoose_1.default.Types.ObjectId(value);
const WATCH = [
    chartAccounts_1.GL.TRUST_BANK,
    chartAccounts_1.GL.OWNER_PAYABLE,
    chartAccounts_1.GL.SELLER_PAYABLE,
    chartAccounts_1.GL.ZIMRA_WITHHOLDING,
    chartAccounts_1.GL.TENANT_DEPOSITS,
    chartAccounts_1.GL.LEVY_PAYABLE,
    chartAccounts_1.GL.VAT_PAYABLE,
    chartAccounts_1.GL.AGENCY_REVENUE,
    chartAccounts_1.GL.COMPANY_BANK
];
function detectNegativeBalances(companyId) {
    return __awaiter(this, void 0, void 0, function* () {
        const rows = yield ChartOfAccount_1.ChartOfAccount.find({
            companyId: toId(companyId),
            code: { $in: WATCH },
            isDeleted: { $ne: true }
        })
            .select('code name balance type')
            .lean();
        let created = 0;
        for (const row of rows) {
            const balance = (0, money_1.roundMoney)(Number(row.balance || 0));
            if (balance >= -0.005)
                continue;
            try {
                yield FinancialControlException_1.FinancialControlException.updateOne({
                    companyId: toId(companyId),
                    type: 'NEGATIVE_BALANCE_REVIEW',
                    entityType: 'ChartOfAccount',
                    entityId: String(row._id),
                    status: { $in: ['OPEN', 'UNDER_REVIEW'] }
                }, {
                    $setOnInsert: {
                        companyId: toId(companyId),
                        type: 'NEGATIVE_BALANCE_REVIEW',
                        severity: 'HIGH',
                        status: 'OPEN',
                        entityType: 'ChartOfAccount',
                        entityId: String(row._id),
                        description: `GL ${row.code} ${row.name} has a negative balance of ${balance}. Classify as permitted, temporary, or unexplained. Detection only — not auto-corrected.`,
                        expected: 0,
                        actual: balance,
                        difference: balance,
                        currency: 'USD',
                        detectedAt: new Date(),
                        detectedBy: 'negativeBalanceReviewService'
                    }
                }, { upsert: true });
                created += 1;
            }
            catch (_a) {
                // already open
            }
        }
        return created;
    });
}
