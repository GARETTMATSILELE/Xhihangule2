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
exports.getOutstandingRangeForLease = exports.computeOutstandingForLease = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const DashboardKpiSnapshot_1 = __importDefault(require("../models/DashboardKpiSnapshot"));
const CompanyAccount_1 = require("../models/CompanyAccount");
const Invoice_1 = require("../models/Invoice");
const Payment_1 = require("../models/Payment");
const LevyPayment_1 = require("../models/LevyPayment");
const Lease_1 = require("../models/Lease");
const Property_1 = require("../models/Property");
const Tenant_1 = require("../models/Tenant");
const Company_1 = __importDefault(require("../models/Company"));
const introductionCommissionService_1 = require("./introductionCommissionService");
const outstandingLeaseCalculation_1 = require("./outstandingLeaseCalculation");
Object.defineProperty(exports, "computeOutstandingForLease", { enumerable: true, get: function () { return outstandingLeaseCalculation_1.computeOutstandingForLease; } });
Object.defineProperty(exports, "getOutstandingRangeForLease", { enumerable: true, get: function () { return outstandingLeaseCalculation_1.getOutstandingRangeForLease; } });
const toObjectId = (id) => new mongoose_1.default.Types.ObjectId(id);
const toMoney = (value) => Number(Number(value || 0).toFixed(2));
const monthKey = outstandingLeaseCalculation_1.outstandingMonthKey;
const formatMonthLabel = outstandingLeaseCalculation_1.formatOutstandingMonthLabel;
const iterateMonths = outstandingLeaseCalculation_1.iterateOutstandingMonths;
class DashboardKpiService {
    markCoveredMonths(entries, getPropertyId, getSingleMonth) {
        var _a, _b, _c, _d;
        const coveredByProperty = new Map();
        const markCovered = (propertyId, year, month) => {
            if (!coveredByProperty.has(propertyId))
                coveredByProperty.set(propertyId, new Set());
            coveredByProperty.get(propertyId).add(monthKey(year, month));
        };
        for (const entry of entries) {
            const propertyId = getPropertyId(entry);
            if (!propertyId)
                continue;
            const monthsPaid = Number((entry === null || entry === void 0 ? void 0 : entry.advanceMonthsPaid) || 1);
            const sy = Number((_a = entry === null || entry === void 0 ? void 0 : entry.advancePeriodStart) === null || _a === void 0 ? void 0 : _a.year);
            const sm = Number((_b = entry === null || entry === void 0 ? void 0 : entry.advancePeriodStart) === null || _b === void 0 ? void 0 : _b.month);
            const ey = Number((_c = entry === null || entry === void 0 ? void 0 : entry.advancePeriodEnd) === null || _c === void 0 ? void 0 : _c.year);
            const em = Number((_d = entry === null || entry === void 0 ? void 0 : entry.advancePeriodEnd) === null || _d === void 0 ? void 0 : _d.month);
            if (monthsPaid > 1 && sy && sm && ey && em) {
                let year = sy;
                let month = sm;
                while (year < ey || (year === ey && month <= em)) {
                    markCovered(propertyId, year, month);
                    month += 1;
                    if (month > 12) {
                        month = 1;
                        year += 1;
                    }
                }
                continue;
            }
            const singleMonth = getSingleMonth(entry);
            if ((singleMonth === null || singleMonth === void 0 ? void 0 : singleMonth.year) && (singleMonth === null || singleMonth === void 0 ? void 0 : singleMonth.month)) {
                markCovered(propertyId, singleMonth.year, singleMonth.month);
            }
        }
        return coveredByProperty;
    }
    buildOutstandingBreakdown(params) {
        const { properties, leasesByProperty, paidByProperty, tenantById, currentMonthStart, cutoverDate, getMonthlyAmount, includeProperty = () => true, introductionRemainingByKey, mode = 'rent' } = params;
        return properties
            .filter(includeProperty)
            .map((property) => {
            const propertyId = (property === null || property === void 0 ? void 0 : property._id) ? String(property._id) : '';
            if (!propertyId)
                return null;
            const monthlyAmount = Number(getMonthlyAmount(property) || 0);
            if (monthlyAmount <= 0)
                return null;
            const paidKeys = paidByProperty.get(propertyId) || new Set();
            const leases = leasesByProperty.get(propertyId) || [];
            const propertyMissingMonths = new Set();
            const tenants = [];
            let totalAmount = 0;
            for (const lease of leases) {
                const tenantId = (lease === null || lease === void 0 ? void 0 : lease.tenantId) ? String(lease.tenantId) : '';
                const leaseId = (lease === null || lease === void 0 ? void 0 : lease._id) ? String(lease._id) : '';
                const introKey = `${propertyId}:${tenantId}:${leaseId}`;
                const rentalType = String((property === null || property === void 0 ? void 0 : property.rentalType) || '').toLowerCase();
                const defaultIntro = Number((lease === null || lease === void 0 ? void 0 : lease.rentAmount) || (lease === null || lease === void 0 ? void 0 : lease.monthlyRent) || (property === null || property === void 0 ? void 0 : property.rent) || 0);
                const introductionRemaining = rentalType === 'introduction'
                    ? ((introductionRemainingByKey === null || introductionRemainingByKey === void 0 ? void 0 : introductionRemainingByKey.has(introKey))
                        ? Number(introductionRemainingByKey.get(introKey) || 0)
                        : defaultIntro)
                    : 0;
                const computed = (0, outstandingLeaseCalculation_1.computeOutstandingForLease)({
                    rentalType,
                    leaseStart: lease === null || lease === void 0 ? void 0 : lease.startDate,
                    leaseEnd: lease === null || lease === void 0 ? void 0 : lease.endDate,
                    currentMonthStart,
                    cutoverDate,
                    paidKeys,
                    monthlyAmount,
                    introductionRemaining,
                    mode
                });
                if (!computed.labels.length)
                    continue;
                computed.labels.forEach((label) => propertyMissingMonths.add(label));
                totalAmount = toMoney(totalAmount + computed.totalAmount);
                const tenant = tenantById.get(tenantId);
                const tenantName = tenant
                    ? (`${tenant.firstName || ''} ${tenant.lastName || ''}`.trim() ||
                        tenant.name ||
                        tenant.fullName ||
                        'Unknown Tenant')
                    : 'Unknown Tenant';
                tenants.push({
                    tenantId,
                    tenantName,
                    labels: computed.labels
                });
            }
            if (!propertyMissingMonths.size)
                return null;
            return {
                propertyId,
                propertyName: (property === null || property === void 0 ? void 0 : property.name) || 'Unnamed Property',
                propertyAddress: (property === null || property === void 0 ? void 0 : property.address) || '',
                totalOwedMonths: propertyMissingMonths.size,
                totalAmount,
                tenants
            };
        })
            .filter((row) => Boolean(row))
            .sort((a, b) => b.totalOwedMonths - a.totalOwedMonths);
    }
    getCompanyOutstandingBreakdown(companyId) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b, _c, _d, _e;
            const companyObjectId = toObjectId(companyId);
            const [company, account, invoiceTotals, rentalProperties, activeLeases, completedRentalPayments, completedLevyPayments, tenants] = yield Promise.all([
                Company_1.default.findById(companyObjectId)
                    .select('receivablesCutover')
                    .lean(),
                CompanyAccount_1.CompanyAccount.findOne({ companyId: companyObjectId }).select('totalExpenses').lean(),
                Invoice_1.Invoice.aggregate([
                    { $match: { companyId: companyObjectId } },
                    { $group: { _id: null, total: { $sum: '$totalAmount' } } }
                ]),
                Property_1.Property.find({
                    companyId: companyObjectId,
                    rentalType: { $nin: ['sale', 'sales'] }
                })
                    .select('_id name address rent levyOrMunicipalType levyOrMunicipalAmount rentalType')
                    .lean(),
                Lease_1.Lease.find({ companyId: companyObjectId, status: 'active' })
                    .select('propertyId tenantId startDate endDate status rentAmount monthlyRent')
                    .lean(),
                Payment_1.Payment.find({
                    companyId: companyObjectId,
                    status: { $in: ['completed'] },
                    paymentType: { $nin: ['sale'] }
                })
                    .select('propertyId tenantId leaseId paymentDate paymentType status rentalPeriodMonth rentalPeriodYear advanceMonthsPaid advancePeriodStart advancePeriodEnd amount depositAmount reversalOfPaymentId commissionDetails.commissionBase commissionDetails.totalCommission')
                    .lean(),
                LevyPayment_1.LevyPayment.find({
                    companyId: companyObjectId,
                    status: { $in: ['completed', 'paid_out', 'paid'] }
                })
                    .select('propertyId paymentDate status levyPeriodMonth levyPeriodYear advanceMonthsPaid advancePeriodStart advancePeriodEnd')
                    .lean(),
                Tenant_1.Tenant.find({ companyId: companyObjectId })
                    .select('_id firstName lastName name fullName')
                    .lean()
            ]);
            const expenses = toMoney(Number((account === null || account === void 0 ? void 0 : account.totalExpenses) || 0));
            const invoices = toMoney(Number(((_a = invoiceTotals[0]) === null || _a === void 0 ? void 0 : _a.total) || 0));
            const cutY = Number((_b = company === null || company === void 0 ? void 0 : company.receivablesCutover) === null || _b === void 0 ? void 0 : _b.year);
            const cutM = Number((_c = company === null || company === void 0 ? void 0 : company.receivablesCutover) === null || _c === void 0 ? void 0 : _c.month);
            const cutoverDate = cutY && cutM ? new Date(cutY, cutM - 1, 1) : null;
            const now = new Date();
            const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
            const tenantById = new Map(tenants.map((tenant) => [String(tenant._id), tenant]));
            const leasesByProperty = new Map();
            for (const lease of activeLeases) {
                const propertyId = (lease === null || lease === void 0 ? void 0 : lease.propertyId) ? String(lease.propertyId) : '';
                if (!propertyId)
                    continue;
                if (!leasesByProperty.has(propertyId))
                    leasesByProperty.set(propertyId, []);
                leasesByProperty.get(propertyId).push(lease);
            }
            const rentalPaidByProperty = this.markCoveredMonths(completedRentalPayments.filter((payment) => {
                const paymentType = String((payment === null || payment === void 0 ? void 0 : payment.paymentType) || '').toLowerCase();
                return paymentType !== 'levy' && paymentType !== 'municipal' && paymentType !== 'sale';
            }), (payment) => ((payment === null || payment === void 0 ? void 0 : payment.propertyId) ? String(payment.propertyId) : ''), (payment) => {
                const month = Number((payment === null || payment === void 0 ? void 0 : payment.rentalPeriodMonth) || ((payment === null || payment === void 0 ? void 0 : payment.paymentDate) ? new Date(payment.paymentDate).getMonth() + 1 : 0));
                const year = Number((payment === null || payment === void 0 ? void 0 : payment.rentalPeriodYear) || ((payment === null || payment === void 0 ? void 0 : payment.paymentDate) ? new Date(payment.paymentDate).getFullYear() : 0));
                return year && month ? { year, month } : null;
            });
            const rentalTypeByProperty = new Map(rentalProperties.map((property) => [String(property._id), String((property === null || property === void 0 ? void 0 : property.rentalType) || '').toLowerCase()]));
            for (const payment of completedRentalPayments) {
                const propertyId = (payment === null || payment === void 0 ? void 0 : payment.propertyId) ? String(payment.propertyId) : '';
                if (!propertyId || rentalTypeByProperty.get(propertyId) !== 'introduction')
                    continue;
                const monthsPaid = Number((payment === null || payment === void 0 ? void 0 : payment.advanceMonthsPaid) || 1);
                if (monthsPaid <= 1)
                    continue;
                const hasPeriod = Number((_d = payment === null || payment === void 0 ? void 0 : payment.advancePeriodStart) === null || _d === void 0 ? void 0 : _d.year) && Number((_e = payment === null || payment === void 0 ? void 0 : payment.advancePeriodStart) === null || _e === void 0 ? void 0 : _e.month);
                if (hasPeriod)
                    continue;
                const month = Number((payment === null || payment === void 0 ? void 0 : payment.rentalPeriodMonth) || ((payment === null || payment === void 0 ? void 0 : payment.paymentDate) ? new Date(payment.paymentDate).getMonth() + 1 : 0));
                const year = Number((payment === null || payment === void 0 ? void 0 : payment.rentalPeriodYear) || ((payment === null || payment === void 0 ? void 0 : payment.paymentDate) ? new Date(payment.paymentDate).getFullYear() : 0));
                if (!year || !month)
                    continue;
                if (!rentalPaidByProperty.has(propertyId))
                    rentalPaidByProperty.set(propertyId, new Set());
                let y = year;
                let m = month;
                for (let i = 0; i < monthsPaid; i += 1) {
                    rentalPaidByProperty.get(propertyId).add(monthKey(y, m));
                    m += 1;
                    if (m > 12) {
                        m = 1;
                        y += 1;
                    }
                }
            }
            const levyPaidByProperty = this.markCoveredMonths(completedLevyPayments, (payment) => ((payment === null || payment === void 0 ? void 0 : payment.propertyId) ? String(payment.propertyId) : ''), (payment) => {
                const month = Number((payment === null || payment === void 0 ? void 0 : payment.levyPeriodMonth) || ((payment === null || payment === void 0 ? void 0 : payment.paymentDate) ? new Date(payment.paymentDate).getMonth() + 1 : 0));
                const year = Number((payment === null || payment === void 0 ? void 0 : payment.levyPeriodYear) || ((payment === null || payment === void 0 ? void 0 : payment.paymentDate) ? new Date(payment.paymentDate).getFullYear() : 0));
                return year && month ? { year, month } : null;
            });
            const introductionRemainingByKey = new Map();
            const introPaymentsByKey = new Map();
            for (const payment of completedRentalPayments) {
                const paymentType = String((payment === null || payment === void 0 ? void 0 : payment.paymentType) || '').toLowerCase();
                if (paymentType === 'levy' || paymentType === 'municipal' || paymentType === 'sale')
                    continue;
                const propertyId = (payment === null || payment === void 0 ? void 0 : payment.propertyId) ? String(payment.propertyId) : '';
                const tenantId = (payment === null || payment === void 0 ? void 0 : payment.tenantId) ? String(payment.tenantId) : '';
                const leaseId = (payment === null || payment === void 0 ? void 0 : payment.leaseId) ? String(payment.leaseId) : '';
                if (!propertyId || !tenantId || !leaseId)
                    continue;
                const key = `${propertyId}:${tenantId}:${leaseId}`;
                if (!introPaymentsByKey.has(key))
                    introPaymentsByKey.set(key, []);
                introPaymentsByKey.get(key).push(payment);
            }
            const rentByLease = new Map();
            for (const lease of activeLeases) {
                const propertyId = (lease === null || lease === void 0 ? void 0 : lease.propertyId) ? String(lease.propertyId) : '';
                const tenantId = (lease === null || lease === void 0 ? void 0 : lease.tenantId) ? String(lease.tenantId) : '';
                const leaseId = (lease === null || lease === void 0 ? void 0 : lease._id) ? String(lease._id) : '';
                if (!propertyId || !tenantId || !leaseId)
                    continue;
                rentByLease.set(`${propertyId}:${tenantId}:${leaseId}`, Number((lease === null || lease === void 0 ? void 0 : lease.rentAmount) || (lease === null || lease === void 0 ? void 0 : lease.monthlyRent) || 0));
            }
            const rentByProperty = new Map(rentalProperties.map((property) => [String(property._id), Number((property === null || property === void 0 ? void 0 : property.rent) || 0)]));
            for (const [key, payments] of introPaymentsByKey.entries()) {
                const propertyId = key.split(':')[0];
                const oneMonth = Number(rentByLease.get(key) || rentByProperty.get(propertyId) || 0);
                const consumed = (0, introductionCommissionService_1.introductionConsumedFromPayments)(payments);
                introductionRemainingByKey.set(key, toMoney(Math.max(0, oneMonth - consumed)));
            }
            const rentals = this.buildOutstandingBreakdown({
                properties: rentalProperties,
                leasesByProperty,
                paidByProperty: rentalPaidByProperty,
                tenantById,
                currentMonthStart,
                cutoverDate,
                getMonthlyAmount: (property) => Number((property === null || property === void 0 ? void 0 : property.rent) || 0),
                introductionRemainingByKey,
                mode: 'rent'
            });
            const levies = this.buildOutstandingBreakdown({
                properties: rentalProperties,
                leasesByProperty,
                paidByProperty: levyPaidByProperty,
                tenantById,
                currentMonthStart,
                cutoverDate,
                getMonthlyAmount: (property) => Number((property === null || property === void 0 ? void 0 : property.levyOrMunicipalAmount) || 0),
                includeProperty: (property) => String((property === null || property === void 0 ? void 0 : property.levyOrMunicipalType) || '').toLowerCase() === 'levy',
                introductionRemainingByKey,
                mode: 'levy'
            });
            const outstandingRentals = toMoney(rentals.reduce((sum, row) => sum + row.totalAmount, 0));
            const outstandingLevies = toMoney(levies.reduce((sum, row) => sum + row.totalAmount, 0));
            const lastUpdated = new Date().toISOString();
            yield DashboardKpiSnapshot_1.default.updateOne({ companyId: companyObjectId }, {
                $set: {
                    companyId: companyObjectId,
                    expenses,
                    invoices,
                    outstandingRentals,
                    outstandingLevies,
                    lastUpdated: new Date(lastUpdated)
                }
            }, { upsert: true });
            return {
                expenses,
                invoices,
                outstandingRentals,
                outstandingLevies,
                rentals,
                levies,
                lastUpdated
            };
        });
    }
    refreshCompanySnapshot(companyId) {
        return __awaiter(this, void 0, void 0, function* () {
            const data = yield this.getCompanyOutstandingBreakdown(companyId);
            return {
                expenses: data.expenses,
                invoices: data.invoices,
                outstandingRentals: data.outstandingRentals,
                outstandingLevies: data.outstandingLevies,
                lastUpdated: data.lastUpdated
            };
        });
    }
    getCompanySnapshot(companyId) {
        return __awaiter(this, void 0, void 0, function* () {
            const companyObjectId = toObjectId(companyId);
            const existing = yield DashboardKpiSnapshot_1.default.findOne({ companyId: companyObjectId }).lean();
            if (existing) {
                if (typeof existing.outstandingLevies !== 'number') {
                    return this.refreshCompanySnapshot(companyId);
                }
                return {
                    expenses: toMoney(Number(existing.expenses || 0)),
                    invoices: toMoney(Number(existing.invoices || 0)),
                    outstandingRentals: toMoney(Number(existing.outstandingRentals || 0)),
                    outstandingLevies: toMoney(Number(existing.outstandingLevies || 0)),
                    lastUpdated: existing.lastUpdated ? new Date(existing.lastUpdated).toISOString() : new Date().toISOString()
                };
            }
            return this.refreshCompanySnapshot(companyId);
        });
    }
}
exports.default = new DashboardKpiService();
