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
exports.getPropertyFinancialSnapshot = getPropertyFinancialSnapshot;
exports.getPropertyFinancialSnapshots = getPropertyFinancialSnapshots;
exports.mergeMonthlyIncome = mergeMonthlyIncome;
exports.aggregateOwnerLedgerTotals = aggregateOwnerLedgerTotals;
const mongoose_1 = __importDefault(require("mongoose"));
const Property_1 = require("../models/Property");
const Lease_1 = require("../models/Lease");
const propertyAccountService_1 = __importDefault(require("./propertyAccountService"));
const errorHandler_1 = require("../middleware/errorHandler");
function monthKey(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}
function buildMonthlyIncome(transactions) {
    const map = {};
    for (const t of transactions) {
        if (t.type !== 'income' || t.status !== 'completed')
            continue;
        const d = t.date ? new Date(t.date) : new Date();
        const key = monthKey(d);
        map[key] = (map[key] || 0) + Number(t.amount || 0);
    }
    return Object.entries(map)
        .sort(([a], [b]) => a.localeCompare(b))
        .slice(-12)
        .map(([month, amount]) => ({ month, amount }));
}
function getPropertyFinancialSnapshot(propertyId, companyId, _legacyLedgerHint) {
    return __awaiter(this, void 0, void 0, function* () {
        const pid = new mongoose_1.default.Types.ObjectId(propertyId);
        const cid = new mongoose_1.default.Types.ObjectId(companyId);
        const property = yield Property_1.Property.findOne({ _id: pid, companyId: cid, isDeleted: { $ne: true } }).lean();
        if (!property)
            throw new errorHandler_1.AppError('Property not found', 404);
        const account = (yield propertyAccountService_1.default.getPropertyAccount(propertyId));
        const transactions = Array.isArray(account.transactions) ? account.transactions : [];
        const activeLease = yield Lease_1.Lease.findOne({
            propertyId: pid,
            companyId: cid,
            status: 'active',
        })
            .select('rentAmount')
            .lean();
        return {
            propertyId: String(property._id),
            propertyName: property.name,
            address: property.address || '',
            monthlyRent: Number(property.rent || (activeLease === null || activeLease === void 0 ? void 0 : activeLease.rentAmount) || 0),
            tenantArrears: Number(property.currentArrears || 0),
            ledger: {
                accountId: String(account._id),
                ledgerType: account.ledgerType,
                runningBalance: Number(account.runningBalance || 0),
                totalIncome: Number(account.totalIncome || 0),
                totalExpenses: Number(account.totalExpenses || 0),
                totalOwnerPayouts: Number(account.totalOwnerPayouts || 0),
            },
            monthlyIncomeByMonth: buildMonthlyIncome(transactions),
        };
    });
}
function getPropertyFinancialSnapshots(propertyIds, companyId, _legacyLedgerHint) {
    return __awaiter(this, void 0, void 0, function* () {
        const map = new Map();
        yield Promise.all(propertyIds.map((id) => __awaiter(this, void 0, void 0, function* () {
            try {
                const snap = yield getPropertyFinancialSnapshot(String(id), companyId);
                map.set(String(id), snap);
            }
            catch (_a) {
                // Property may be deleted or missing ledger — skip
            }
        })));
        return map;
    });
}
function mergeMonthlyIncome(snapshots) {
    const map = {};
    for (const s of snapshots) {
        for (const row of s.monthlyIncomeByMonth) {
            map[row.month] = (map[row.month] || 0) + row.amount;
        }
    }
    return Object.entries(map)
        .sort(([a], [b]) => a.localeCompare(b))
        .slice(-12)
        .map(([month, amount]) => ({ month, amount }));
}
function aggregateOwnerLedgerTotals(snapshots) {
    return snapshots.reduce((acc, s) => ({
        rentCollected: acc.rentCollected + s.ledger.totalIncome,
        totalExpenses: acc.totalExpenses + s.ledger.totalExpenses,
        ownerPayouts: acc.ownerPayouts + s.ledger.totalOwnerPayouts,
        trustBalance: acc.trustBalance + s.ledger.runningBalance,
        tenantArrears: acc.tenantArrears + s.tenantArrears,
        monthlyRevenue: acc.monthlyRevenue + s.monthlyRent,
    }), { rentCollected: 0, totalExpenses: 0, ownerPayouts: 0, trustBalance: 0, tenantArrears: 0, monthlyRevenue: 0 });
}
