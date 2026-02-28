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
const DashboardKpiSnapshot_1 = __importDefault(require("../models/DashboardKpiSnapshot"));
const CompanyAccount_1 = require("../models/CompanyAccount");
const Invoice_1 = require("../models/Invoice");
const Payment_1 = require("../models/Payment");
const LevyPayment_1 = require("../models/LevyPayment");
const Lease_1 = require("../models/Lease");
const Property_1 = require("../models/Property");
const Company_1 = __importDefault(require("../models/Company"));
const toObjectId = (id) => new mongoose_1.default.Types.ObjectId(id);
const toMoney = (value) => Number(Number(value || 0).toFixed(2));
const monthKey = (year, month) => `${year}-${month}`;
const iterateMonths = (start, end, cb, hardCapMonths = 240) => {
    let year = start.getFullYear();
    let month = start.getMonth() + 1;
    let count = 0;
    while ((year < end.getFullYear() || (year === end.getFullYear() && month <= end.getMonth() + 1)) && count < hardCapMonths) {
        cb(year, month);
        month += 1;
        if (month > 12) {
            month = 1;
            year += 1;
        }
        count += 1;
    }
};
class DashboardKpiService {
    refreshCompanySnapshot(companyId) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l;
            const companyObjectId = toObjectId(companyId);
            const [company, account, invoiceTotals, rentalProperties, activeLeases, completedRentalPayments, completedLevyPayments] = yield Promise.all([
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
                    .select('_id rent levyOrMunicipalType levyOrMunicipalAmount')
                    .lean(),
                Lease_1.Lease.find({ companyId: companyObjectId, status: 'active' })
                    .select('propertyId startDate endDate')
                    .lean(),
                Payment_1.Payment.find({
                    companyId: companyObjectId,
                    status: { $in: ['completed'] },
                    paymentType: { $nin: ['sale'] }
                })
                    .select('propertyId paymentDate paymentType status rentalPeriodMonth rentalPeriodYear advanceMonthsPaid advancePeriodStart advancePeriodEnd')
                    .lean(),
                LevyPayment_1.LevyPayment.find({
                    companyId: companyObjectId,
                    status: { $in: ['completed', 'paid_out', 'paid'] }
                })
                    .select('propertyId paymentDate status levyPeriodMonth levyPeriodYear advanceMonthsPaid advancePeriodStart advancePeriodEnd')
                    .lean()
            ]);
            const expenses = toMoney(Number((account === null || account === void 0 ? void 0 : account.totalExpenses) || 0));
            const invoices = toMoney(Number(((_a = invoiceTotals[0]) === null || _a === void 0 ? void 0 : _a.total) || 0));
            const cutY = Number((_b = company === null || company === void 0 ? void 0 : company.receivablesCutover) === null || _b === void 0 ? void 0 : _b.year);
            const cutM = Number((_c = company === null || company === void 0 ? void 0 : company.receivablesCutover) === null || _c === void 0 ? void 0 : _c.month);
            const cutoverDate = cutY && cutM ? new Date(cutY, cutM - 1, 1) : null;
            const now = new Date();
            const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
            const paidByProperty = new Map();
            const markPaid = (propertyId, year, month) => {
                if (!paidByProperty.has(propertyId))
                    paidByProperty.set(propertyId, new Set());
                paidByProperty.get(propertyId).add(monthKey(year, month));
            };
            for (const payment of completedRentalPayments) {
                const paymentType = String(payment.paymentType || '').toLowerCase();
                if (paymentType === 'levy' || paymentType === 'municipal' || paymentType === 'sale')
                    continue;
                const propertyId = (payment === null || payment === void 0 ? void 0 : payment.propertyId) ? String(payment.propertyId) : '';
                if (!propertyId)
                    continue;
                const monthsPaid = Number((payment === null || payment === void 0 ? void 0 : payment.advanceMonthsPaid) || 1);
                const sy = Number((_d = payment === null || payment === void 0 ? void 0 : payment.advancePeriodStart) === null || _d === void 0 ? void 0 : _d.year);
                const sm = Number((_e = payment === null || payment === void 0 ? void 0 : payment.advancePeriodStart) === null || _e === void 0 ? void 0 : _e.month);
                const ey = Number((_f = payment === null || payment === void 0 ? void 0 : payment.advancePeriodEnd) === null || _f === void 0 ? void 0 : _f.year);
                const em = Number((_g = payment === null || payment === void 0 ? void 0 : payment.advancePeriodEnd) === null || _g === void 0 ? void 0 : _g.month);
                if (monthsPaid > 1 && sy && sm && ey && em) {
                    let year = sy;
                    let month = sm;
                    while (year < ey || (year === ey && month <= em)) {
                        markPaid(propertyId, year, month);
                        month += 1;
                        if (month > 12) {
                            month = 1;
                            year += 1;
                        }
                    }
                }
                else {
                    const month = Number((payment === null || payment === void 0 ? void 0 : payment.rentalPeriodMonth) || ((payment === null || payment === void 0 ? void 0 : payment.paymentDate) ? new Date(payment.paymentDate).getMonth() + 1 : 0));
                    const year = Number((payment === null || payment === void 0 ? void 0 : payment.rentalPeriodYear) || ((payment === null || payment === void 0 ? void 0 : payment.paymentDate) ? new Date(payment.paymentDate).getFullYear() : 0));
                    if (year && month)
                        markPaid(propertyId, year, month);
                }
            }
            const leasesByProperty = new Map();
            for (const lease of activeLeases) {
                const propertyId = (lease === null || lease === void 0 ? void 0 : lease.propertyId) ? String(lease.propertyId) : '';
                if (!propertyId)
                    continue;
                if (!leasesByProperty.has(propertyId))
                    leasesByProperty.set(propertyId, []);
                leasesByProperty.get(propertyId).push(lease);
            }
            let outstandingRentals = 0;
            let outstandingLevies = 0;
            for (const property of rentalProperties) {
                const propertyId = (property === null || property === void 0 ? void 0 : property._id) ? String(property._id) : '';
                if (!propertyId)
                    continue;
                const monthlyRent = Number((property === null || property === void 0 ? void 0 : property.rent) || 0);
                if (monthlyRent <= 0)
                    continue;
                const paidKeys = paidByProperty.get(propertyId) || new Set();
                const missingMonths = new Set();
                const leases = leasesByProperty.get(propertyId) || [];
                for (const lease of leases) {
                    const start = (lease === null || lease === void 0 ? void 0 : lease.startDate) ? new Date(lease.startDate) : null;
                    const end = (lease === null || lease === void 0 ? void 0 : lease.endDate) ? new Date(lease.endDate) : currentMonthStart;
                    if (!start || Number.isNaN(start.getTime()) || !end || Number.isNaN(end.getTime()))
                        continue;
                    let normalizedStart = new Date(start.getFullYear(), start.getMonth(), 1);
                    if (cutoverDate && normalizedStart.getTime() < cutoverDate.getTime())
                        normalizedStart = cutoverDate;
                    const normalizedEnd = new Date(Math.min(end.getTime(), currentMonthStart.getTime()));
                    if (normalizedStart.getTime() > normalizedEnd.getTime())
                        continue;
                    iterateMonths(normalizedStart, normalizedEnd, (year, month) => {
                        const key = monthKey(year, month);
                        if (!paidKeys.has(key))
                            missingMonths.add(key);
                    });
                }
                outstandingRentals = toMoney(outstandingRentals + missingMonths.size * monthlyRent);
            }
            const paidLeviesByProperty = new Map();
            const markLevyPaid = (propertyId, year, month) => {
                if (!paidLeviesByProperty.has(propertyId))
                    paidLeviesByProperty.set(propertyId, new Set());
                paidLeviesByProperty.get(propertyId).add(monthKey(year, month));
            };
            for (const levy of completedLevyPayments) {
                const propertyId = (levy === null || levy === void 0 ? void 0 : levy.propertyId) ? String(levy.propertyId) : '';
                if (!propertyId)
                    continue;
                const monthsPaid = Number((levy === null || levy === void 0 ? void 0 : levy.advanceMonthsPaid) || 1);
                const sy = Number((_h = levy === null || levy === void 0 ? void 0 : levy.advancePeriodStart) === null || _h === void 0 ? void 0 : _h.year);
                const sm = Number((_j = levy === null || levy === void 0 ? void 0 : levy.advancePeriodStart) === null || _j === void 0 ? void 0 : _j.month);
                const ey = Number((_k = levy === null || levy === void 0 ? void 0 : levy.advancePeriodEnd) === null || _k === void 0 ? void 0 : _k.year);
                const em = Number((_l = levy === null || levy === void 0 ? void 0 : levy.advancePeriodEnd) === null || _l === void 0 ? void 0 : _l.month);
                if (monthsPaid > 1 && sy && sm && ey && em) {
                    let year = sy;
                    let month = sm;
                    while (year < ey || (year === ey && month <= em)) {
                        markLevyPaid(propertyId, year, month);
                        month += 1;
                        if (month > 12) {
                            month = 1;
                            year += 1;
                        }
                    }
                }
                else {
                    const month = Number((levy === null || levy === void 0 ? void 0 : levy.levyPeriodMonth) || ((levy === null || levy === void 0 ? void 0 : levy.paymentDate) ? new Date(levy.paymentDate).getMonth() + 1 : 0));
                    const year = Number((levy === null || levy === void 0 ? void 0 : levy.levyPeriodYear) || ((levy === null || levy === void 0 ? void 0 : levy.paymentDate) ? new Date(levy.paymentDate).getFullYear() : 0));
                    if (year && month)
                        markLevyPaid(propertyId, year, month);
                }
            }
            for (const property of rentalProperties) {
                if (String((property === null || property === void 0 ? void 0 : property.levyOrMunicipalType) || '').toLowerCase() !== 'levy')
                    continue;
                const propertyId = (property === null || property === void 0 ? void 0 : property._id) ? String(property._id) : '';
                if (!propertyId)
                    continue;
                const monthlyLevy = Number((property === null || property === void 0 ? void 0 : property.levyOrMunicipalAmount) || 0);
                if (monthlyLevy <= 0)
                    continue;
                const paidKeys = paidLeviesByProperty.get(propertyId) || new Set();
                const missingMonths = new Set();
                const leases = leasesByProperty.get(propertyId) || [];
                for (const lease of leases) {
                    const start = (lease === null || lease === void 0 ? void 0 : lease.startDate) ? new Date(lease.startDate) : null;
                    const end = (lease === null || lease === void 0 ? void 0 : lease.endDate) ? new Date(lease.endDate) : currentMonthStart;
                    if (!start || Number.isNaN(start.getTime()) || !end || Number.isNaN(end.getTime()))
                        continue;
                    let normalizedStart = new Date(start.getFullYear(), start.getMonth(), 1);
                    if (cutoverDate && normalizedStart.getTime() < cutoverDate.getTime())
                        normalizedStart = cutoverDate;
                    const normalizedEnd = new Date(Math.min(end.getTime(), currentMonthStart.getTime()));
                    if (normalizedStart.getTime() > normalizedEnd.getTime())
                        continue;
                    iterateMonths(normalizedStart, normalizedEnd, (year, month) => {
                        const key = monthKey(year, month);
                        if (!paidKeys.has(key))
                            missingMonths.add(key);
                    });
                }
                outstandingLevies = toMoney(outstandingLevies + missingMonths.size * monthlyLevy);
            }
            yield DashboardKpiSnapshot_1.default.updateOne({ companyId: companyObjectId }, {
                $set: {
                    companyId: companyObjectId,
                    expenses,
                    invoices,
                    outstandingRentals,
                    outstandingLevies,
                    lastUpdated: new Date()
                }
            }, { upsert: true });
            return {
                expenses,
                invoices,
                outstandingRentals,
                outstandingLevies,
                lastUpdated: new Date().toISOString()
            };
        });
    }
    getCompanySnapshot(companyId) {
        return __awaiter(this, void 0, void 0, function* () {
            const companyObjectId = toObjectId(companyId);
            const existing = yield DashboardKpiSnapshot_1.default.findOne({ companyId: companyObjectId }).lean();
            if (existing) {
                // Self-heal older snapshot documents created before outstandingLevies existed.
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
