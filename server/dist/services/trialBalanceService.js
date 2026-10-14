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
exports.buildTrialBalance = buildTrialBalance;
const mongoose_1 = __importDefault(require("mongoose"));
const JournalLine_1 = require("../models/JournalLine");
const JournalEntry_1 = require("../models/JournalEntry");
const ChartOfAccount_1 = require("../models/ChartOfAccount");
const money_1 = require("../utils/money");
const toId = (value) => new mongoose_1.default.Types.ObjectId(value);
function buildTrialBalance(input) {
    return __awaiter(this, void 0, void 0, function* () {
        const companyObjectId = toId(input.companyId);
        const dateFilter = { companyId: companyObjectId };
        if (input.from || input.to) {
            const entryQuery = { companyId: companyObjectId };
            if (input.from || input.to) {
                entryQuery.transactionDate = Object.assign(Object.assign({}, (input.from ? { $gte: input.from } : {})), (input.to ? { $lte: input.to } : {}));
            }
            const entries = yield JournalEntry_1.JournalEntry.find(entryQuery).select('_id').lean();
            dateFilter.journalEntryId = { $in: entries.map((row) => row._id) };
        }
        const [grouped, journalCount, postingCount] = yield Promise.all([
            JournalLine_1.JournalLine.aggregate([
                { $match: dateFilter },
                {
                    $group: {
                        _id: '$accountId',
                        debit: { $sum: '$debit' },
                        credit: { $sum: '$credit' },
                        lines: { $sum: 1 }
                    }
                }
            ]),
            JournalEntry_1.JournalEntry.countDocuments(input.from || input.to
                ? {
                    companyId: companyObjectId,
                    transactionDate: Object.assign(Object.assign({}, (input.from ? { $gte: input.from } : {})), (input.to ? { $lte: input.to } : {}))
                }
                : { companyId: companyObjectId }),
            JournalLine_1.JournalLine.countDocuments(dateFilter)
        ]);
        const accounts = yield ChartOfAccount_1.ChartOfAccount.find({
            companyId: companyObjectId,
            _id: { $in: grouped.map((row) => row._id) }
        })
            .select('code name')
            .lean();
        const nameById = new Map(accounts.map((row) => [String(row._id), row]));
        const rows = grouped.map((row) => {
            const meta = nameById.get(String(row._id));
            const debit = (0, money_1.roundMoney)(Number(row.debit || 0));
            const credit = (0, money_1.roundMoney)(Number(row.credit || 0));
            return {
                accountId: String(row._id),
                accountCode: (meta === null || meta === void 0 ? void 0 : meta.code) || 'UNKNOWN',
                accountName: (meta === null || meta === void 0 ? void 0 : meta.name) || 'Unknown account',
                debit,
                credit,
                balance: (0, money_1.roundMoney)(debit - credit)
            };
        }).sort((a, b) => a.accountCode.localeCompare(b.accountCode));
        const totalDebits = (0, money_1.roundMoney)(rows.reduce((s, r) => s + r.debit, 0));
        const totalCredits = (0, money_1.roundMoney)(rows.reduce((s, r) => s + r.credit, 0));
        const difference = (0, money_1.roundMoney)(totalDebits - totalCredits);
        const unknownAccounts = rows.filter((r) => r.accountCode === 'UNKNOWN').length;
        let status = Math.abs(difference) <= 0.005 ? 'BALANCED' : 'UNBALANCED';
        if (unknownAccounts > 0 && status === 'BALANCED')
            status = 'REQUIRES_REVIEW';
        return {
            totalDebits,
            totalCredits,
            difference,
            accountCount: rows.length,
            journalCount,
            postingCount,
            dateRange: {
                from: input.from ? input.from.toISOString() : undefined,
                to: input.to ? input.to.toISOString() : undefined
            },
            currency: input.currency || 'USD',
            status,
            accounts: rows
        };
    });
}
