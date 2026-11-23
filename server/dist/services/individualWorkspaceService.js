"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
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
exports.IndividualWorkspaceService = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const individualReportDocument_1 = require("./individualReportDocument");
const Company_1 = require("../models/Company");
const Property_1 = require("../models/Property");
const Tenant_1 = require("../models/Tenant");
const Lease_1 = require("../models/Lease");
const Payment_1 = require("../models/Payment");
const MaintenanceRequest_1 = require("../models/MaintenanceRequest");
const propertyAccountService_1 = __importDefault(require("./propertyAccountService"));
const errorHandler_1 = require("../middleware/errorHandler");
const individualAccountingService_1 = __importDefault(require("./individualAccountingService"));
const individualTaxMetadataService_1 = __importDefault(require("./individualTaxMetadataService"));
const LandlordFinancialTransaction_1 = require("../models/LandlordFinancialTransaction");
const TransactionTaxSnapshot_1 = require("../models/TransactionTaxSnapshot");
const propertyAccountTotals_1 = require("./propertyAccountTotals");
const individualReportingPeriod_1 = require("./individualReportingPeriod");
const rentalPeriodCoverage_1 = require("./rentalPeriodCoverage");
const INCOME_CATEGORIES = ['Rent', 'Parking', 'Levy Recovery', 'Utilities Recovery', 'Storage Income', 'Other Income'];
const EXPENSE_CATEGORIES = ['Maintenance', 'Municipal', 'Levies', 'Security', 'Insurance', 'Gardening', 'Cleaning', 'Repairs', 'Utilities', 'Legal', 'Other'];
function asObjectId(value) {
    if (!mongoose_1.default.Types.ObjectId.isValid(value))
        throw new errorHandler_1.AppError('Invalid id', 400);
    return new mongoose_1.default.Types.ObjectId(value);
}
function monthBounds(month) {
    if (!month) {
        const now = new Date();
        return {
            start: new Date(now.getFullYear(), now.getMonth(), 1),
            end: new Date(now.getFullYear(), now.getMonth() + 1, 1)
        };
    }
    const [year, monthIndex] = month.split('-').map(Number);
    if (!year || !monthIndex || monthIndex < 1 || monthIndex > 12)
        throw new errorHandler_1.AppError('Month must use YYYY-MM format', 400);
    return {
        start: new Date(year, monthIndex - 1, 1),
        end: new Date(year, monthIndex, 1)
    };
}
function monthKey(value) {
    const date = value ? new Date(value) : new Date();
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}
function txSignedAmount(tx) {
    const amount = Number((tx === null || tx === void 0 ? void 0 : tx.amount) || 0);
    if ((tx === null || tx === void 0 ? void 0 : tx.type) === 'income')
        return amount;
    if ((tx === null || tx === void 0 ? void 0 : tx.type) === 'opening_balance')
        return (tx === null || tx === void 0 ? void 0 : tx.direction) === 'debit' ? -amount : amount;
    return -amount;
}
function buildRunningLedger(transactions) {
    let runningBalance = 0;
    return [...transactions]
        .sort((a, b) => new Date(a.date || a.createdAt).getTime() - new Date(b.date || b.createdAt).getTime())
        .map((tx) => {
        var _a, _b;
        runningBalance += txSignedAmount(tx);
        return Object.assign(Object.assign({}, ((_b = (_a = tx.toObject) === null || _a === void 0 ? void 0 : _a.call(tx)) !== null && _b !== void 0 ? _b : tx)), { runningBalance });
    });
}
function trendFromTransactions(transactions, type) {
    const months = {};
    for (const tx of transactions) {
        const isIncome = tx.type === 'income';
        if (type === 'income' && !isIncome)
            continue;
        if (type === 'expense' && (isIncome || tx.type === 'opening_balance'))
            continue;
        const key = monthKey(tx.date);
        months[key] = (months[key] || 0) + Number(tx.amount || 0);
    }
    return Object.entries(months)
        .sort(([a], [b]) => a.localeCompare(b))
        .slice(-12)
        .map(([month, amount]) => ({ month, amount }));
}
function collectionStatus(expected, collected) {
    if (expected <= 0 || collected >= expected)
        return 'green';
    if (collected > 0)
        return 'amber';
    return 'red';
}
function entityId(value) {
    if (!value)
        return '';
    if (typeof value === 'string')
        return value;
    if (typeof value === 'object') {
        // Mongoose ObjectId exposes `_id` as itself; never recurse into that.
        if (typeof value.toHexString === 'function') {
            return String(value);
        }
        const obj = value;
        if (obj.$oid)
            return String(obj.$oid);
        if (obj._id && obj._id !== value)
            return entityId(obj._id);
    }
    try {
        return String(value);
    }
    catch (_a) {
        return '';
    }
}
function collectOccupiedPropertyIds(tenants, leases) {
    const occupied = new Set();
    const endedLeaseStatuses = new Set(['terminated', 'closed', 'draft', 'pending_approval']);
    for (const tenant of tenants || []) {
        if (String((tenant === null || tenant === void 0 ? void 0 : tenant.status) || 'Active').toLowerCase() === 'inactive')
            continue;
        const linked = [
            entityId(tenant === null || tenant === void 0 ? void 0 : tenant.propertyId),
            ...((Array.isArray(tenant === null || tenant === void 0 ? void 0 : tenant.propertyIds) ? tenant.propertyIds : []).map(entityId))
        ].filter(Boolean);
        linked.forEach((propertyId) => occupied.add(propertyId));
    }
    for (const lease of leases || []) {
        if (endedLeaseStatuses.has(String((lease === null || lease === void 0 ? void 0 : lease.status) || '').toLowerCase()))
            continue;
        if (!entityId(lease === null || lease === void 0 ? void 0 : lease.tenantId))
            continue;
        const propertyId = entityId(lease === null || lease === void 0 ? void 0 : lease.propertyId);
        if (propertyId)
            occupied.add(propertyId);
    }
    return occupied;
}
function withinPeriod(value, start, end) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime()))
        return false;
    if (start && date < start)
        return false;
    if (end && date >= end)
        return false;
    return true;
}
function isMaintenanceEntry(entry) {
    const category = String((entry === null || entry === void 0 ? void 0 : entry.category) || '').toLowerCase();
    const type = String((entry === null || entry === void 0 ? void 0 : entry.type) || '').toLowerCase();
    const transactionCategory = String((entry === null || entry === void 0 ? void 0 : entry.transactionCategory) || '').toUpperCase();
    return category.includes('maintenance') || type === 'maintenance' || type === 'repair' || transactionCategory === 'MAINTENANCE';
}
function mergeCurrencyAmounts(lists) {
    const totals = new Map();
    lists.forEach((list) => {
        list.forEach((row) => totals.set(row.currency, (totals.get(row.currency) || 0) + Number(row.amount || 0)));
    });
    return Array.from(totals.entries()).map(([currency, amount]) => ({ currency, amount: Number(amount.toFixed(2)) }));
}
class IndividualWorkspaceService {
    assertIndividualCompany(companyId) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!companyId)
                throw new errorHandler_1.AppError('Company ID is required', 400);
            const company = yield Company_1.Company.findById(companyId).select('_id workspaceType plan featureFlags').lean();
            if (!company)
                throw new errorHandler_1.AppError('Company not found', 404);
            const isIndividual = company.workspaceType === 'individual' || company.plan === 'INDIVIDUAL';
            if (!isIndividual)
                throw new errorHandler_1.AppError('Individual workspace access required', 403);
            return company;
        });
    }
    getCompanyProperties(companyId) {
        return __awaiter(this, void 0, void 0, function* () {
            const properties = yield Property_1.Property.find({ companyId: asObjectId(companyId), isDeleted: { $ne: true } }).sort({ name: 1 }).lean();
            const { applyDueRentChanges } = yield Promise.resolve().then(() => __importStar(require('./individualPropertyEditService')));
            const applied = yield applyDueRentChanges(properties);
            if (!applied)
                return properties;
            return Property_1.Property.find({ companyId: asObjectId(companyId), isDeleted: { $ne: true } }).sort({ name: 1 }).lean();
        });
    }
    getAccounts(properties) {
        return __awaiter(this, void 0, void 0, function* () {
            return Promise.all(properties.map((property) => __awaiter(this, void 0, void 0, function* () {
                var _a;
                let account;
                try {
                    account = yield propertyAccountService_1.default.getPropertyAccount(String(property._id));
                }
                catch (error) {
                    // A legacy or partially-created property should not make the whole
                    // individual workspace unusable. Treat missing ledgers as empty
                    // profit-centre ledgers until the first income/expense is posted.
                    const status = Number((error === null || error === void 0 ? void 0 : error.statusCode) || (error === null || error === void 0 ? void 0 : error.status) || ((_a = error === null || error === void 0 ? void 0 : error.response) === null || _a === void 0 ? void 0 : _a.status) || 0);
                    if (status !== 404)
                        throw error;
                    account = {
                        _id: '',
                        propertyId: String(property._id),
                        ledgerType: 'rental',
                        transactions: [],
                        ownerPayouts: [],
                        runningBalance: 0,
                        totalIncome: 0,
                        totalExpenses: 0,
                        totalOwnerPayouts: 0
                    };
                }
                return { property, account };
            })));
        });
    }
    propertyMetrics(row, activeLeaseCountByProperty, collectedThisMonth, occupiedPropertyIds, periodStart, periodEnd, yearStart, yearEnd, periodDays = 30, breakdown) {
        const { property, account } = row;
        const units = Math.max(1, Number(property.units || 1));
        const isOccupied = occupiedPropertyIds.has(String(property._id));
        const occupiedUnits = isOccupied ? units : 0;
        const occupancyPercent = isOccupied ? 100 : 0;
        const monthlyRent = Number(property.rent || 0);
        const expectedRent = activeLeaseCountByProperty.has(String(property._id)) ? monthlyRent : 0;
        const collectedRent = Number(collectedThisMonth.get(String(property._id)) || 0);
        const pnl = (0, propertyAccountTotals_1.sumPropertyAccountPeriodPnl)(account.transactions, periodStart, periodEnd);
        const ytd = (0, propertyAccountTotals_1.sumPropertyAccountPeriodPnl)(account.transactions, yearStart, yearEnd);
        const lifetime = (0, propertyAccountTotals_1.sumPropertyAccountPeriodPnl)(account.transactions);
        const monthlyIncome = pnl.income;
        const monthlyExpenses = pnl.expenses;
        const netProfit = pnl.net;
        const collectionPercent = expectedRent > 0 ? Math.min(100, Math.round((collectedRent / expectedRent) * 100)) : 100;
        const expenseRatio = monthlyIncome > 0 ? Math.round((monthlyExpenses / monthlyIncome) * 100) : 0;
        const profitabilityPercent = monthlyIncome > 0 ? Math.round((netProfit / monthlyIncome) * 100) : 0;
        const currencyBuckets = breakdown
            ? (0, propertyAccountTotals_1.sumPropertyAccountPeriodPnlByCurrency)(account.transactions, periodStart, periodEnd, breakdown.currency)
            : [];
        const unpaidBills = breakdown
            ? (0, propertyAccountTotals_1.sumPendingOperatingBills)(account.transactions, periodStart, periodEnd, breakdown.currency)
            : [];
        return Object.assign({ propertyId: String(property._id), propertyName: property.name, address: property.address, image: Array.isArray(property.images) ? property.images[0] : undefined, status: property.status, occupancyStatus: occupiedUnits > 0 ? 'Occupied' : 'Vacant', units,
            occupiedUnits, vacantUnits: Math.max(0, units - occupiedUnits), monthlyRent,
            expectedRent,
            collectedRent, outstandingRent: Math.max(0, expectedRent - collectedRent), rentCollectionStatus: collectionStatus(expectedRent, collectedRent), monthlyIncome,
            monthlyExpenses,
            netProfit, yearToDateProfit: ytd.net, financialYearProfit: ytd.net, annualisedRunRate: Number(((netProfit / Math.max(1, periodDays)) * 365).toFixed(2)), lifetimeIncome: lifetime.income, lifetimeExpenses: lifetime.expenses, lifetimeNet: lifetime.net, runningBalance: Number(account.runningBalance || 0), occupancyPercent,
            collectionPercent,
            profitabilityPercent,
            expenseRatio, maintenanceDue: property.status === 'maintenance' || property.propertyOperationalStatus === 'Under Maintenance' }, (breakdown ? {
            reportingCurrency: currencyBuckets.length === 1 ? currencyBuckets[0].currency : breakdown.currency,
            currencyTotals: currencyBuckets.length > 1 ? currencyBuckets : undefined,
            unpaidBills
        } : {}));
    }
    accountPreferences(companyId) {
        return __awaiter(this, void 0, void 0, function* () {
            const company = yield Company_1.Company.findById(companyId).select('name workspacePreferences').lean();
            const preferences = (company === null || company === void 0 ? void 0 : company.workspacePreferences) || {};
            return {
                name: String((company === null || company === void 0 ? void 0 : company.name) || 'Property owner'),
                currency: String(preferences.currency || 'USD'),
                timeZone: String(preferences.timezone || 'Africa/Harare')
            };
        });
    }
    getSummary(companyId, periodBasis, options) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b;
            const prefs = options ? yield this.accountPreferences(companyId) : { name: '', currency: 'USD', timeZone: 'UTC' };
            const zone = (options === null || options === void 0 ? void 0 : options.timeZone) === 'account' ? prefs.timeZone : 'UTC';
            let period;
            try {
                period = options
                    ? (0, individualReportingPeriod_1.resolveReportingPeriod)(periodBasis, new Date(), { start: options.start, end: options.end, timeZone: zone })
                    : (0, individualReportingPeriod_1.resolveReportingPeriod)(periodBasis);
            }
            catch (error) {
                if ((error === null || error === void 0 ? void 0 : error.message) === 'CUSTOM_PERIOD_REQUIRED')
                    throw new errorHandler_1.AppError('Choose a start and end date', 400);
                if ((error === null || error === void 0 ? void 0 : error.message) === 'CUSTOM_PERIOD_INVALID')
                    throw new errorHandler_1.AppError('The end date must be on or after the start date', 400);
                throw error;
            }
            const ytd = options
                ? (0, individualReportingPeriod_1.resolveReportingPeriod)('year_to_date', new Date(), { timeZone: zone })
                : (0, individualReportingPeriod_1.resolveReportingPeriod)('year_to_date');
            const periodDays = (0, individualReportingPeriod_1.daysInRange)(period.start, period.end) || 30;
            const [propertiesAll, tenants, leases, payments, maintenance] = yield Promise.all([
                this.getCompanyProperties(companyId),
                Tenant_1.Tenant.find({ companyId: asObjectId(companyId) }).lean(),
                Lease_1.Lease.find({ companyId: asObjectId(companyId), status: { $in: ['active', 'expiring_soon'] } }).lean(),
                Payment_1.Payment.find({ companyId: asObjectId(companyId), status: { $in: ['completed', 'paid', 'success'] } }).sort({ paymentDate: -1 }).limit(200).lean(),
                MaintenanceRequest_1.MaintenanceRequest.find({ companyId: asObjectId(companyId) }).sort({ updatedAt: -1 }).limit(50).lean()
            ]);
            if ((options === null || options === void 0 ? void 0 : options.propertyId) && !mongoose_1.default.Types.ObjectId.isValid(options.propertyId)) {
                throw new errorHandler_1.AppError('Choose a valid property', 400);
            }
            const properties = (options === null || options === void 0 ? void 0 : options.propertyId)
                ? propertiesAll.filter((property) => String(property._id) === options.propertyId)
                : propertiesAll;
            const rows = yield this.getAccounts(properties);
            const allowedIds = new Set(properties.map((property) => String(property._id)));
            const collectRent = (start, end) => {
                const amounts = new Map();
                const currencies = new Map();
                const windowStart = start || new Date(0);
                const windowEnd = end || new Date();
                for (const payment of payments) {
                    if (!(0, rentalPeriodCoverage_1.countsTowardRentReceipt)(payment))
                        continue;
                    const pid = String(payment.propertyId || '');
                    if (!allowedIds.has(pid))
                        continue;
                    const date = new Date(payment.paymentDate || payment.createdAt);
                    if (date >= windowStart && date < windowEnd) {
                        amounts.set(pid, (amounts.get(pid) || 0) + Number(payment.amount || 0));
                        const code = String(payment.currency || prefs.currency || 'USD');
                        if (!currencies.has(pid))
                            currencies.set(pid, new Set());
                        currencies.get(pid).add(code);
                    }
                }
                return { amounts, currencies };
            };
            const collected = collectRent(period.start, period.end);
            const collectedThisMonth = collected.amounts;
            const activeLeaseCountByProperty = new Map();
            for (const lease of leases)
                activeLeaseCountByProperty.set(String(lease.propertyId), (activeLeaseCountByProperty.get(String(lease.propertyId)) || 0) + 1);
            const occupiedPropertyIds = collectOccupiedPropertyIds(tenants, leases);
            const propertyMetrics = rows.map((row) => this.propertyMetrics(row, activeLeaseCountByProperty, collectedThisMonth, occupiedPropertyIds, period.start, period.end, ytd.start, ytd.end, periodDays, options ? { currency: prefs.currency } : undefined));
            if (options) {
                propertyMetrics.forEach((metric) => {
                    const codes = Array.from(collected.currencies.get(metric.propertyId) || []);
                    if (codes.length > 1)
                        metric.rentCurrencies = codes;
                });
            }
            let comparison = null;
            if (options === null || options === void 0 ? void 0 : options.includeComparison) {
                const previous = (0, individualReportingPeriod_1.previousReportingPeriod)(period, zone);
                if ((previous === null || previous === void 0 ? void 0 : previous.start) && (previous === null || previous === void 0 ? void 0 : previous.end)) {
                    const previousCollected = collectRent(previous.start, previous.end);
                    const previousMetrics = rows.map((row) => this.propertyMetrics(row, activeLeaseCountByProperty, previousCollected.amounts, occupiedPropertyIds, previous.start, previous.end, ytd.start, ytd.end, (0, individualReportingPeriod_1.daysInRange)(previous.start, previous.end) || 30));
                    const previousById = new Map(previousMetrics.map((metric) => [metric.propertyId, metric]));
                    propertyMetrics.forEach((metric) => {
                        const prior = previousById.get(metric.propertyId);
                        if (!prior)
                            return;
                        metric.previous = {
                            monthlyIncome: prior.monthlyIncome,
                            monthlyExpenses: prior.monthlyExpenses,
                            netProfit: prior.netProfit,
                            outstandingRent: prior.outstandingRent
                        };
                    });
                    const previousIncome = previousMetrics.reduce((sum, metric) => sum + metric.monthlyIncome, 0);
                    const previousExpenses = previousMetrics.reduce((sum, metric) => sum + metric.monthlyExpenses, 0);
                    const previousExpected = previousMetrics.reduce((sum, metric) => sum + metric.expectedRent, 0);
                    const previousCollectedRent = previousMetrics.reduce((sum, metric) => sum + metric.collectedRent, 0);
                    comparison = {
                        label: previous.label,
                        monthlyIncome: previousIncome,
                        monthlyExpenses: previousExpenses,
                        netProfit: previousIncome - previousExpenses,
                        outstandingRent: Math.max(0, previousExpected - previousCollectedRent)
                    };
                }
            }
            const monthlyIncome = propertyMetrics.reduce((sum, p) => sum + p.monthlyIncome, 0);
            const monthlyExpenses = propertyMetrics.reduce((sum, p) => sum + p.monthlyExpenses, 0);
            const yearToDateProfit = propertyMetrics.reduce((sum, p) => sum + p.yearToDateProfit, 0);
            const annualisedRunRate = propertyMetrics.reduce((sum, p) => sum + p.annualisedRunRate, 0);
            const expectedRent = propertyMetrics.reduce((sum, p) => sum + p.expectedRent, 0);
            const collectedRent = propertyMetrics.reduce((sum, p) => sum + p.collectedRent, 0);
            const allTransactions = rows.flatMap((row) => row.account.transactions || []);
            const recentActivity = [
                ...payments.slice(0, 10).map((payment) => ({
                    type: 'rent_payment',
                    date: payment.paymentDate || payment.createdAt,
                    description: payment.referenceNumber ? `Rent payment ${payment.referenceNumber}` : 'Rent payment recorded',
                    amount: Number(payment.amount || 0),
                    propertyId: String(payment.propertyId || '')
                })),
                ...allTransactions
                    .filter((tx) => tx.type !== 'income')
                    .slice(-10)
                    .map((tx) => ({
                    type: 'expense',
                    date: tx.date || tx.createdAt,
                    description: tx.description,
                    amount: Number(tx.amount || 0),
                    propertyId: ''
                })),
                ...leases
                    .filter((lease) => lease.endDate && new Date(lease.endDate).getTime() < Date.now() + 45 * 24 * 60 * 60 * 1000)
                    .slice(0, 10)
                    .map((lease) => ({
                    type: 'lease_renewal',
                    date: lease.endDate,
                    description: 'Lease renewal due',
                    amount: 0,
                    propertyId: String(lease.propertyId || '')
                })),
                ...maintenance.slice(0, 10).map((item) => ({
                    type: 'maintenance',
                    date: item.updatedAt || item.createdAt,
                    description: item.title || 'Maintenance request',
                    amount: Number(item.paidAmount || item.estimatedCost || 0),
                    propertyId: String(item.propertyId || '')
                }))
            ].sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime()).slice(0, 20);
            const rentCurrencies = new Set();
            collected.currencies.forEach((codes) => codes.forEach((code) => rentCurrencies.add(code)));
            const currencyBuckets = new Map();
            propertyMetrics.forEach((metric) => {
                var _a;
                const buckets = ((_a = metric.currencyTotals) === null || _a === void 0 ? void 0 : _a.length)
                    ? metric.currencyTotals
                    : [{ currency: metric.reportingCurrency || prefs.currency, income: metric.monthlyIncome, expenses: metric.monthlyExpenses }];
                buckets.forEach((bucket) => {
                    const current = currencyBuckets.get(bucket.currency) || { income: 0, expenses: 0 };
                    current.income += Number(bucket.income || 0);
                    current.expenses += Number(bucket.expenses || 0);
                    currencyBuckets.set(bucket.currency, current);
                });
            });
            const currencyTotals = Array.from(currencyBuckets.entries()).map(([currency, bucket]) => ({
                currency,
                income: Number(bucket.income.toFixed(2)),
                expenses: Number(bucket.expenses.toFixed(2)),
                net: Number((bucket.income - bucket.expenses).toFixed(2))
            }));
            const notices = [];
            if (currencyTotals.length > 1)
                notices.push('Income and expenses are shown separately by currency. They are not converted or added together.');
            if (rentCurrencies.size > 1)
                notices.push('Rent receipts in this period use more than one currency, so outstanding rent is not shown as one total.');
            const result = {
                period: Object.assign({ basis: period.basis, label: period.label, start: ((_a = period.start) === null || _a === void 0 ? void 0 : _a.toISOString()) || null, end: ((_b = period.end) === null || _b === void 0 ? void 0 : _b.toISOString()) || null }, (options ? { timeZone: zone, taxScope: (0, individualReportingPeriod_1.periodTaxScope)(period, zone) } : {})),
                summary: {
                    totalProperties: properties.length,
                    totalTenants: tenants.length,
                    occupiedUnits: propertyMetrics.filter((p) => p.occupancyStatus === 'Occupied').length,
                    vacantUnits: propertyMetrics.filter((p) => p.occupancyStatus !== 'Occupied').length,
                    monthlyIncome,
                    monthlyExpenses,
                    netProfit: monthlyIncome - monthlyExpenses,
                    yearToDateProfit,
                    financialYearProfit: yearToDateProfit,
                    annualisedRunRate: Number(annualisedRunRate.toFixed(2)),
                    rentCollected: collectedRent,
                    outstandingRent: Math.max(0, expectedRent - collectedRent),
                    netMonthlyCashflow: monthlyIncome - monthlyExpenses,
                    rentCollectionRate: expectedRent > 0 ? Math.round((collectedRent / expectedRent) * 100) : 100
                },
                charts: {
                    incomeTrend: trendFromTransactions(allTransactions, 'income'),
                    expenseTrend: trendFromTransactions(allTransactions, 'expense'),
                    cashflowTrend: trendFromTransactions(allTransactions).map((row) => ({ month: row.month, amount: row.amount })),
                    propertyProfitability: propertyMetrics.map((p) => ({ propertyName: p.propertyName, netProfit: p.netProfit })),
                    occupancyRate: propertyMetrics.map((p) => ({ propertyName: p.propertyName, occupancyPercent: p.occupancyPercent })),
                    rentCollectionTrend: propertyMetrics.map((p) => ({ propertyName: p.propertyName, collectionPercent: p.collectionPercent }))
                },
                properties: propertyMetrics,
                recentActivity
            };
            if (options) {
                const allTransactions = rows.flatMap((row) => row.account.transactions || []);
                result.account = { name: prefs.name, currency: prefs.currency, timeZone: prefs.timeZone };
                result.propertyChoices = propertiesAll.map((property) => ({ propertyId: String(property._id), propertyName: property.name }));
                result.comparison = comparison;
                result.currencyNotice = notices[0] || null;
                result.outstandingRentReliable = rentCurrencies.size <= 1;
                result.currencyTotals = currencyTotals.length > 1 ? currencyTotals : undefined;
                result.unpaidBills = mergeCurrencyAmounts(propertyMetrics.map((metric) => metric.unpaidBills || []));
                result.periodSeries = options.includeSeries
                    ? (0, propertyAccountTotals_1.sumPropertyAccountPeriodSeries)(allTransactions, period.start, period.end, (date) => (0, individualReportingPeriod_1.formatMonthKey)(date, zone), prefs.currency)
                    : undefined;
            }
            return result;
        });
    }
    getAccounting(companyId, periodBasis, options) {
        return __awaiter(this, void 0, void 0, function* () {
            const data = yield this.getSummary(companyId, periodBasis, options);
            const properties = [...data.properties].sort((a, b) => b.netProfit - a.netProfit);
            return Object.assign(Object.assign({}, data), { overview: {
                    periodLabel: data.period.label,
                    incomeThisMonth: data.summary.monthlyIncome,
                    expensesThisMonth: data.summary.monthlyExpenses,
                    netProfit: data.summary.netProfit,
                    yearToDateProfit: data.summary.yearToDateProfit,
                    outstandingRent: data.summary.outstandingRent
                }, topPerformingProperties: properties.slice(0, 5), worstPerformingProperties: properties.slice(-5).reverse() });
        });
    }
    getLedger(companyId, propertyId) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b;
            const property = yield Property_1.Property.findOne({ _id: asObjectId(propertyId), companyId: asObjectId(companyId), isDeleted: { $ne: true } }).lean();
            if (!property)
                throw new errorHandler_1.AppError('Property not found', 404);
            const account = yield propertyAccountService_1.default.getPropertyAccount(propertyId);
            return {
                property,
                account: Object.assign(Object.assign({}, ((_b = (_a = account.toObject) === null || _a === void 0 ? void 0 : _a.call(account)) !== null && _b !== void 0 ? _b : account)), { transactions: buildRunningLedger(account.transactions || []) })
            };
        });
    }
    listEntries(companyId, type, filters) {
        return __awaiter(this, void 0, void 0, function* () {
            const properties = filters.propertyId
                ? [yield Property_1.Property.findOne({ _id: asObjectId(filters.propertyId), companyId: asObjectId(companyId), isDeleted: { $ne: true } }).lean()]
                : yield this.getCompanyProperties(companyId);
            const propertyList = properties.filter(Boolean);
            const rows = yield this.getAccounts(propertyList);
            const bounds = filters.month ? monthBounds(filters.month) : null;
            const mapped = rows.flatMap(({ property, account }) => {
                return (account.transactions || [])
                    .filter((tx) => type === 'income' ? tx.type === 'income' : tx.type !== 'income' && tx.type !== 'opening_balance')
                    .filter((tx) => {
                    if (!bounds)
                        return true;
                    const date = new Date(tx.date || tx.createdAt);
                    return date >= bounds.start && date < bounds.end;
                })
                    .map((tx) => { var _a, _b; return (Object.assign(Object.assign({}, ((_b = (_a = tx.toObject) === null || _a === void 0 ? void 0 : _a.call(tx)) !== null && _b !== void 0 ? _b : tx)), { propertyId: String(property._id), propertyName: property.name })); });
            }).sort((a, b) => new Date(b.date || b.createdAt).getTime() - new Date(a.date || a.createdAt).getTime());
            const paIds = mapped.map((tx) => tx._id).filter(Boolean);
            const canonical = paIds.length
                ? yield LandlordFinancialTransaction_1.LandlordFinancialTransaction.find({
                    companyId: asObjectId(companyId),
                    propertyAccountTransactionId: { $in: paIds }
                })
                    .select('_id propertyAccountTransactionId taxPeriodKey taxCalculationStatus deductibility capitalOrRevenue settlementStatus currency')
                    .lean()
                : [];
            const snapshots = canonical.length
                ? yield TransactionTaxSnapshot_1.TransactionTaxSnapshot.find({
                    companyId: asObjectId(companyId),
                    sourceType: 'LandlordFinancialTransaction',
                    sourceId: { $in: canonical.map((row) => row._id) }
                })
                    .select('sourceId taxPeriodKey taxPeriodId taxCalculationStatus vatTreatment rentalTaxTreatment taxTypesRelevant classificationSource reviewReasons')
                    .lean()
                : [];
            const lftByPa = new Map(canonical.map((row) => [String(row.propertyAccountTransactionId), row]));
            const snapBySource = new Map(snapshots.map((row) => [String(row.sourceId), row]));
            return mapped
                .map((tx) => {
                const lft = lftByPa.get(String(tx._id));
                const snap = lft ? snapBySource.get(String(lft._id)) : null;
                return Object.assign(Object.assign({}, tx), { taxPeriodKey: (snap === null || snap === void 0 ? void 0 : snap.taxPeriodKey) || (lft === null || lft === void 0 ? void 0 : lft.taxPeriodKey) || null, taxPeriodId: (snap === null || snap === void 0 ? void 0 : snap.taxPeriodId) ? String(snap.taxPeriodId) : null, taxCalculationStatus: (snap === null || snap === void 0 ? void 0 : snap.taxCalculationStatus) || (lft === null || lft === void 0 ? void 0 : lft.taxCalculationStatus) || null, vatTreatment: (snap === null || snap === void 0 ? void 0 : snap.vatTreatment) || null, rentalTaxTreatment: (snap === null || snap === void 0 ? void 0 : snap.rentalTaxTreatment) || null, taxTypesRelevant: (snap === null || snap === void 0 ? void 0 : snap.taxTypesRelevant) || [], deductibility: (lft === null || lft === void 0 ? void 0 : lft.deductibility) || tx.deductibility || null, capitalOrRevenue: (lft === null || lft === void 0 ? void 0 : lft.capitalOrRevenue) || tx.capitalOrRevenue || null, obligationStatus: (lft === null || lft === void 0 ? void 0 : lft.settlementStatus) || null, currency: (lft === null || lft === void 0 ? void 0 : lft.currency) || tx.currency || null, taxAmount: null, vatAmount: null });
            })
                .filter((tx) => {
                if (filters.taxPeriodKey && tx.taxPeriodKey !== filters.taxPeriodKey)
                    return false;
                if (filters.taxPeriodId && tx.taxPeriodId !== filters.taxPeriodId)
                    return false;
                if (filters.taxCalculationStatus && tx.taxCalculationStatus !== filters.taxCalculationStatus)
                    return false;
                if (filters.taxType && !(tx.taxTypesRelevant || []).includes(filters.taxType))
                    return false;
                if (filters.taxTreatment && tx.vatTreatment !== filters.taxTreatment && tx.rentalTaxTreatment !== filters.taxTreatment)
                    return false;
                return true;
            });
        });
    }
    postEntry(companyId, userId, entryType, body, idempotencyKey) {
        return __awaiter(this, void 0, void 0, function* () {
            const propertyId = String(body.propertyId || body.property || '');
            const canonical = yield individualAccountingService_1.default.postEntry({
                companyId,
                userId,
                entryType: entryType === 'maintenance' ? 'maintenance' : entryType,
                propertyId,
                category: body.category,
                description: body.description,
                amount: Number(body.amount || 0),
                date: body.date,
                reference: body.reference || body.referenceNumber,
                notes: body.notes,
                receiptUrl: body.receiptUrl,
                attachments: body.attachments,
                supplier: body.supplier,
                supplierTin: body.supplierTin,
                supplierVatNumber: body.supplierVatNumber,
                invoiceNumber: body.invoiceNumber,
                paymentMethod: body.paymentMethod,
                currency: body.currency,
                vatMode: body.vatMode,
                capitalOrRevenue: body.capitalOrRevenue,
                deductibility: body.deductibility,
                inputVatEligibility: body.inputVatEligibility,
                paymentStatus: body.paymentStatus,
                sourceMaintenanceId: body.sourceMaintenanceId || body.maintenanceId,
                overrideReason: body.overrideReason,
                idempotencyKey: idempotencyKey || body.idempotencyKey
            });
            const account = yield propertyAccountService_1.default.getOrCreatePropertyAccount(propertyId);
            const tax = yield individualTaxMetadataService_1.default.getForSource(companyId, 'LandlordFinancialTransaction', String(canonical._id));
            return { account, tax };
        });
    }
    correctEntry(companyId, userId, propertyId, transactionId, body, mode) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                yield individualAccountingService_1.default.reverseEntry({
                    companyId,
                    userId,
                    propertyId,
                    transactionId,
                    mode,
                    replacement: mode === 'edit'
                        ? Object.assign({ companyId,
                            userId, entryType: body.entryType || (body.category && String(body.category).toUpperCase().includes('INCOME') ? 'income' : 'expense'), propertyId }, body) : undefined
                });
                return this.getLedger(companyId, propertyId);
            }
            catch (error) {
                if (Number((error === null || error === void 0 ? void 0 : error.statusCode) || 0) !== 404)
                    throw error;
            }
            const ledger = yield this.getLedger(companyId, propertyId);
            const tx = (ledger.account.transactions || []).find((item) => String(item._id) === String(transactionId));
            if (!tx)
                throw new errorHandler_1.AppError('Ledger entry not found', 404);
            const reversalType = tx.type === 'income' ? 'expense' : 'income';
            yield this.postEntry(companyId, userId, reversalType, {
                propertyId,
                amount: Number(tx.amount || 0),
                date: new Date(),
                category: reversalType === 'income' ? 'Other Income' : 'Other',
                description: `${mode === 'delete' ? 'Delete' : 'Edit'} reversal: ${tx.description || tx.category || 'ledger entry'}`,
                reference: `REV-${String(tx._id).slice(-8)}`,
                notes: `Correction entry for ${tx._id}`
            }, `${mode}:reversal:${transactionId}`);
            if (mode === 'delete')
                return this.getLedger(companyId, propertyId);
            const newType = tx.type === 'income' ? 'income' : 'expense';
            yield this.postEntry(companyId, userId, newType, Object.assign(Object.assign({}, body), { propertyId }), `${mode}:replacement:${transactionId}`);
            return this.getLedger(companyId, propertyId);
        });
    }
    markMaintenanceApproved(companyId, id) {
        return __awaiter(this, void 0, void 0, function* () {
            const request = yield MaintenanceRequest_1.MaintenanceRequest.findOneAndUpdate({ _id: asObjectId(id), companyId: asObjectId(companyId) }, { $set: { status: 'approved', lastActivityAt: new Date() } }, { new: true });
            if (!request)
                throw new errorHandler_1.AppError('Maintenance request not found', 404);
            return request;
        });
    }
    recordMaintenanceExpense(companyId, userId, id, body, idempotencyKey) {
        return __awaiter(this, void 0, void 0, function* () {
            const request = yield MaintenanceRequest_1.MaintenanceRequest.findOne({ _id: asObjectId(id), companyId: asObjectId(companyId) });
            if (!request)
                throw new errorHandler_1.AppError('Maintenance request not found', 404);
            const amount = Number(body.amount || request.paidAmount || request.estimatedCost || request.requestedAmount || 0);
            const account = yield this.postEntry(companyId, userId, 'maintenance', {
                propertyId: String(request.propertyId),
                amount,
                date: body.date || new Date(),
                category: 'Maintenance',
                description: body.description || request.title || 'Maintenance expense',
                reference: body.reference || request.paymentReference,
                attachments: body.attachments
            }, idempotencyKey || `maintenance:${id}`);
            request.status = 'closed';
            request.paymentStatus = 'paid';
            request.paidAmount = amount;
            request.paymentDate = body.date ? new Date(body.date) : new Date();
            request.paymentReference = body.reference || request.paymentReference;
            request.lastActivityAt = new Date();
            yield request.save();
            return { request, account };
        });
    }
    getReport(companyId_1, reportType_1, format_1) {
        return __awaiter(this, arguments, void 0, function* (companyId, reportType, format, filters = {}) {
            var _a, _b, _c, _d, _e;
            const shaped = Boolean(filters.period || filters.start || filters.end || filters.propertyId || filters.timeZone || filters.category);
            const data = yield this.getAccounting(companyId, shaped ? (filters.period || 'this_month') : undefined, shaped ? {
                start: filters.start,
                end: filters.end,
                propertyId: filters.propertyId,
                timeZone: filters.timeZone === 'account' ? 'account' : undefined,
                includeSeries: true
            } : undefined);
            const taxFilters = {
                taxPeriodId: filters.taxPeriodId,
                taxPeriodKey: filters.taxPeriodKey,
                taxTreatment: filters.taxTreatment,
                taxCalculationStatus: filters.taxCalculationStatus,
                taxType: filters.taxType
            };
            const accountCurrency = ((_a = data.account) === null || _a === void 0 ? void 0 : _a.currency) || 'USD';
            const applyDates = Boolean(filters.period || filters.start || filters.end);
            const periodStart = applyDates && data.period.start ? new Date(data.period.start) : undefined;
            const periodEnd = applyDates && data.period.end ? new Date(data.period.end) : undefined;
            const performanceRow = (property) => {
                var _a;
                if (((_a = property.currencyTotals) === null || _a === void 0 ? void 0 : _a.length) > 1) {
                    return property.currencyTotals.map((bucket) => ({
                        property: property.propertyName,
                        currency: bucket.currency,
                        income: bucket.income,
                        expenses: bucket.expenses,
                        netProfit: bucket.net
                    }));
                }
                const row = {
                    property: property.propertyName,
                    income: property.monthlyIncome,
                    expenses: property.monthlyExpenses,
                    netProfit: property.netProfit,
                    yearToDateProfit: property.yearToDateProfit,
                    annualisedRunRate: property.annualisedRunRate,
                    expenseRatio: property.expenseRatio,
                    profitabilityPercent: property.profitabilityPercent
                };
                if (shaped)
                    row.currency = property.reportingCurrency || accountCurrency;
                return [row];
            };
            let rows;
            let note = '';
            switch (reportType) {
                case 'rent-collection':
                    rows = data.properties.map((property) => {
                        var _a, _b;
                        const row = {
                            property: property.propertyName,
                            expectedRent: property.expectedRent,
                            collectedRent: property.collectedRent,
                            outstandingRent: ((_a = property.rentCurrencies) === null || _a === void 0 ? void 0 : _a.length) ? null : property.outstandingRent,
                            collectionPercent: property.collectionPercent,
                            status: property.rentCollectionStatus
                        };
                        if (shaped)
                            row.currency = property.reportingCurrency || accountCurrency;
                        if ((_b = property.rentCurrencies) === null || _b === void 0 ? void 0 : _b.length)
                            row.currencies = property.rentCurrencies.join(', ');
                        return row;
                    });
                    if (filters.reportKey === 'tenant-ledger') {
                        note = 'Rent is reported by property. A line-by-line tenant statement is not produced by the reporting service.';
                    }
                    break;
                case 'expense': {
                    const entries = yield this.listEntries(companyId, 'expense', Object.assign(Object.assign({}, taxFilters), { propertyId: filters.propertyId }));
                    rows = entries
                        .filter((entry) => !applyDates || withinPeriod(entry.date || entry.createdAt, periodStart, periodEnd))
                        .filter((entry) => filters.category !== 'Maintenance' || isMaintenanceEntry(entry))
                        .map((entry) => ({
                        date: entry.date || entry.createdAt,
                        property: entry.propertyName || '',
                        category: entry.category || entry.type || '',
                        description: entry.description || '',
                        amount: Number(entry.amount || 0),
                        currency: entry.currency || accountCurrency,
                        reference: entry.referenceNumber || entry.reference || '',
                        status: entry.status || ''
                    }));
                    break;
                }
                case 'property-ledger': {
                    const properties = filters.propertyId
                        ? (yield this.getCompanyProperties(companyId)).filter((property) => String(property._id) === filters.propertyId)
                        : yield this.getCompanyProperties(companyId);
                    const accounts = yield this.getAccounts(properties);
                    rows = accounts.flatMap(({ property, account }) => buildRunningLedger(account.transactions || [])
                        .filter((entry) => !applyDates || withinPeriod(entry.date || entry.createdAt, periodStart, periodEnd))
                        .map((entry) => ({
                        date: entry.date || entry.createdAt,
                        property: property.name,
                        entry: entry.type,
                        category: entry.category || '',
                        description: entry.description || '',
                        amount: txSignedAmount(entry),
                        balance: Number(entry.runningBalance || 0),
                        reference: entry.referenceNumber || ''
                    })));
                    note = 'The balance is the running ledger balance and includes activity from before this period.';
                    break;
                }
                case 'profit-loss':
                case 'cashflow':
                case 'tax-preparation':
                case 'property-performance':
                    rows = data.properties.flatMap((property) => performanceRow(property));
                    if (reportType === 'cashflow')
                        note = 'Income and operating expenses recorded on the property ledger. This is not a bank reconciliation.';
                    if (reportType === 'tax-preparation')
                        note = 'Property result for the selected period. This is not a tax assessment.';
                    break;
                case 'occupancy':
                    rows = data.properties.map((property) => ({
                        property: property.propertyName,
                        units: property.units,
                        occupiedUnits: property.occupiedUnits,
                        vacantUnits: property.vacantUnits,
                        occupancyPercent: property.occupancyPercent
                    }));
                    break;
                default:
                    rows = data.properties;
            }
            const titles = {
                'profit-loss': 'Profit & Loss',
                'income-statement': 'Income Statement',
                cashflow: 'Cashflow',
                'expense-summary': 'Expense Summary',
                'property-performance': 'Property Performance',
                'property-ledger': 'Property Ledger',
                occupancy: 'Occupancy Report',
                'maintenance-summary': 'Maintenance Summary',
                'rent-collection': 'Rent Collection',
                'tenant-ledger': 'Rent by Property',
                'tax-preparation': 'Tax Summary',
                'tax-summary': 'Tax Summary'
            };
            const title = (filters.reportKey && titles[filters.reportKey]) || titles[reportType] || 'Report';
            const generatedAt = new Date().toISOString();
            const propertyName = filters.propertyId ? (((_b = data.properties[0]) === null || _b === void 0 ? void 0 : _b.propertyName) || 'Selected property') : 'All properties';
            const body = {
                reportType,
                reportKey: filters.reportKey || reportType,
                title,
                rows,
                filters: Object.assign(Object.assign({}, taxFilters), { period: data.period.basis, propertyId: filters.propertyId || null, category: filters.category || null }),
                generatedAt,
                period: data.period,
                account: data.account || null,
                propertyName,
                currency: ((_c = data.currencyTotals) === null || _c === void 0 ? void 0 : _c.length) > 1 ? null : (((_d = data.account) === null || _d === void 0 ? void 0 : _d.currency) || null),
                currencyNotice: data.currencyNotice || null,
                series: data.periodSeries || [],
                note: note || null
            };
            if (format === 'pdf') {
                return {
                    contentType: 'application/pdf',
                    body: yield (0, individualReportDocument_1.toPdf)({
                        title,
                        ownerName: (_e = data.account) === null || _e === void 0 ? void 0 : _e.name,
                        periodLabel: data.period.label,
                        propertyName,
                        currency: body.currency || undefined,
                        generatedAt: generatedAt.slice(0, 10),
                        note: note || data.currencyNotice || undefined
                    }, rows)
                };
            }
            if (format === 'csv' || format === 'excel') {
                return {
                    contentType: format === 'excel' ? 'application/vnd.ms-excel' : 'text/csv',
                    body: (0, individualReportDocument_1.toCsv)(rows)
                };
            }
            return { contentType: 'application/json', body };
        });
    }
    getPropertyFinancialOverview(companyId, propertyId) {
        return __awaiter(this, void 0, void 0, function* () {
            const { buildPropertyFinancialOverview } = yield Promise.resolve().then(() => __importStar(require('./individualJurisdiction/operations')));
            const property = yield Property_1.Property.findOne({
                _id: asObjectId(propertyId),
                companyId: asObjectId(companyId),
                isDeleted: { $ne: true }
            }).lean();
            if (!property)
                throw new errorHandler_1.AppError('Property not found', 404);
            const now = new Date();
            const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
            const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
            const payments = yield Payment_1.Payment.find({
                companyId: asObjectId(companyId),
                propertyId: asObjectId(propertyId),
                status: { $in: ['completed', 'paid', 'success'] }
            }).lean();
            let rentCollected = 0;
            for (const payment of payments) {
                if (!(0, rentalPeriodCoverage_1.countsTowardRentReceipt)(payment))
                    continue;
                const date = new Date(payment.paymentDate || payment.createdAt);
                if (date >= periodStart && date < periodEnd)
                    rentCollected += Number(payment.amount || 0);
            }
            const expenses = yield this.listEntries(companyId, 'expense', { propertyId });
            return buildPropertyFinancialOverview({
                currency: String(property.operatingCurrency || 'USD'),
                monthlyRent: Number(property.rent || 0),
                rentCollected,
                transactions: (Array.isArray(expenses) ? expenses : []).map((row) => ({
                    type: row.type,
                    category: row.category,
                    amount: Number(row.amount || 0),
                    currency: row.currency,
                    date: row.date,
                    obligationStatus: row.obligationStatus
                })),
                periodStart,
                periodEnd
            });
        });
    }
}
exports.IndividualWorkspaceService = IndividualWorkspaceService;
exports.default = new IndividualWorkspaceService();
