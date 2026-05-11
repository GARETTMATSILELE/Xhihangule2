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
exports.getCompanyDepositSummaries = exports.createPropertyDepositPayout = exports.getPropertyDepositSummary = exports.getTaxPropertyReport = exports.getTaxPayoutReceipt = exports.uploadTaxPayoutReceipt = exports.createTaxPayout = exports.getTaxLedgers = exports.getCommissionReports = exports.getCommissionAccount = exports.getPropertyDepositLedger = exports.getPREACommission = exports.getAgencyCommission = exports.getAgentCommissions = void 0;
const User_1 = require("../models/User");
const Lease_1 = require("../models/Lease");
const Property_1 = require("../models/Property");
const errorHandler_1 = require("../middleware/errorHandler");
const Payment_1 = require("../models/Payment"); // Added import for Payment
const rentalDeposit_1 = require("../models/rentalDeposit");
const AgentAccount_1 = require("../models/AgentAccount");
const TrustAccount_1 = require("../models/TrustAccount");
const TaxRecord_1 = require("../models/TaxRecord");
const TaxPayout_1 = require("../models/TaxPayout");
const mongoose_1 = __importDefault(require("mongoose"));
// Helper function to get week of year
const getWeekOfYear = (date) => {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
};
const TAX_TYPES = ['VAT', 'VAT_ON_COMMISSION', 'CGT'];
const formatTaxTypeLabel = (taxType) => {
    if (taxType === 'VAT_ON_COMMISSION')
        return 'VAT on Commission';
    return taxType;
};
const escapeHtml = (value) => String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
const formatMoney = (value) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(value || 0));
const formatDate = (value) => new Date(value).toLocaleDateString();
const getAgentCommissions = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const companyId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.companyId;
        if (!companyId) {
            throw new errorHandler_1.AppError('Company ID not found', 404);
        }
        // Get query parameters for filtering
        const { year, month } = req.query;
        const filterYear = year ? parseInt(year) : new Date().getFullYear();
        const filterMonth = month !== undefined ? parseInt(month) : null;
        // Get all agents for the company (include sales as agents)
        const agents = yield User_1.User.find({ companyId, role: { $in: ['agent', 'sales'] } });
        const commissionData = {
            monthly: 0,
            yearly: 0,
            total: 0,
            details: []
        };
        const currentDate = new Date();
        const currentMonth = currentDate.getMonth();
        const currentYear = currentDate.getFullYear();
        for (const agent of agents) {
            const agentDetails = {
                agentId: agent._id.toString(),
                agentName: `${agent.firstName} ${agent.lastName}`,
                commission: 0,
                monthlyCommissions: [],
                commissionEntries: [],
                properties: []
            };
            // Get all leases where this agent is the owner (agent who created/manages the lease)
            const leases = yield Lease_1.Lease.find({
                ownerId: agent._id,
                status: 'active'
            }).populate('propertyId', 'name address');
            // Get all payments for properties managed by this agent
            const propertyIds = leases.map(lease => lease.propertyId);
            const payments = yield Payment_1.Payment.find({
                propertyId: { $in: propertyIds },
                status: 'completed',
                commissionFinalized: true
            }).populate('propertyId', 'name address');
            // Create a map of payments by property and month/year for filtering (using rental period)
            const paymentMap = new Map();
            const agentCommissionMap = new Map(); // Track agent commissions by month/year (using rental period)
            payments.forEach(payment => {
                var _a;
                // Determine rental months covered by this payment, including advance payments
                const coveredMonths = [];
                const advanceMonths = payment.advanceMonthsPaid;
                const startPeriod = payment.advancePeriodStart;
                const endPeriod = payment.advancePeriodEnd;
                if (advanceMonths && advanceMonths > 1 && startPeriod && endPeriod) {
                    // Expand range from start to end inclusive
                    let y = startPeriod.year;
                    let m0 = startPeriod.month - 1; // convert to 0-based
                    const endY = endPeriod.year;
                    const endM0 = endPeriod.month - 1;
                    while (y < endY || (y === endY && m0 <= endM0)) {
                        coveredMonths.push({ year: y, month: m0 });
                        m0 += 1;
                        if (m0 > 11) {
                            m0 = 0;
                            y += 1;
                        }
                    }
                }
                else {
                    // Single rental period month/year
                    const y = payment.rentalPeriodYear;
                    const m0 = payment.rentalPeriodMonth - 1; // 0-based
                    if (typeof y === 'number' && typeof m0 === 'number' && m0 >= 0 && m0 <= 11) {
                        coveredMonths.push({ year: y, month: m0 });
                    }
                }
                // Fallback to paymentDate month/year if rental period is not set (legacy records)
                if (coveredMonths.length === 0) {
                    const fallbackDate = new Date(payment.paymentDate);
                    coveredMonths.push({ year: fallbackDate.getFullYear(), month: fallbackDate.getMonth() });
                }
                // Allocate agent share evenly across covered months
                const totalAgentShare = ((_a = payment.commissionDetails) === null || _a === void 0 ? void 0 : _a.agentShare) || 0;
                const perMonthAgentShare = coveredMonths.length > 0 ? totalAgentShare / coveredMonths.length : 0;
                coveredMonths.forEach(({ year, month }) => {
                    const propKeyRental = (payment === null || payment === void 0 ? void 0 : payment.propertyId) ? payment.propertyId.toString() : String(payment.propertyId || 'unknown');
                    const key = `${propKeyRental}-${year}-${month}`;
                    paymentMap.set(key, true);
                    const commissionKey = `${year}-${month}`;
                    if (agentCommissionMap.has(commissionKey)) {
                        agentCommissionMap.set(commissionKey, agentCommissionMap.get(commissionKey) + perMonthAgentShare);
                    }
                    else {
                        agentCommissionMap.set(commissionKey, perMonthAgentShare);
                    }
                    // Push commission entry per month covered
                    const propObj = payment.propertyId;
                    agentDetails.commissionEntries.push({
                        paymentId: payment._id.toString(),
                        propertyId: propKeyRental,
                        propertyName: (propObj && propObj.name) || payment.manualPropertyAddress || 'Manual Entry',
                        propertyAddress: (propObj && propObj.address) || payment.manualPropertyAddress,
                        paymentDate: payment.paymentDate,
                        referenceNumber: payment.referenceNumber,
                        year,
                        month,
                        amount: perMonthAgentShare
                    });
                });
            });
            // Include sales payments commissions for users with role 'sales' (and agents who make sales)
            const salesPayments = yield Payment_1.Payment.find({
                companyId,
                status: 'completed',
                commissionFinalized: true,
                paymentType: 'sale',
                agentId: agent._id
            }).populate('propertyId', 'name address');
            salesPayments.forEach(payment => {
                var _a;
                const paymentDate = new Date(payment.paymentDate);
                const y = paymentDate.getFullYear();
                const m0 = paymentDate.getMonth();
                const totalAgentShare = ((_a = payment.commissionDetails) === null || _a === void 0 ? void 0 : _a.agentShare) || 0;
                const perMonthAgentShare = totalAgentShare; // sales are one-off; allocate to payment month
                // Mark payment presence for this property-month to support filtered views
                const propKey = (payment === null || payment === void 0 ? void 0 : payment.propertyId) ? payment.propertyId.toString() : String(payment.propertyId || 'unknown');
                const presenceKey = `${propKey}-${y}-${m0}`;
                paymentMap.set(presenceKey, true);
                const commissionKey = `${y}-${m0}`;
                if (agentCommissionMap.has(commissionKey)) {
                    agentCommissionMap.set(commissionKey, agentCommissionMap.get(commissionKey) + perMonthAgentShare);
                }
                else {
                    agentCommissionMap.set(commissionKey, perMonthAgentShare);
                }
                // Push commission entry for the sales payment month
                const propObj = payment.propertyId;
                agentDetails.commissionEntries.push({
                    paymentId: payment._id.toString(),
                    propertyId: propKey,
                    propertyName: (propObj && propObj.name) || payment.manualPropertyAddress || 'Manual Entry',
                    propertyAddress: (propObj && propObj.address) || payment.manualPropertyAddress,
                    paymentDate: payment.paymentDate,
                    referenceNumber: payment.referenceNumber,
                    year: y,
                    month: m0,
                    amount: perMonthAgentShare
                });
            });
            // Process each lease to build property details
            for (const lease of leases) {
                const property = lease.propertyId; // Cast to access populated fields
                if (!property)
                    continue;
                const rent = lease.rentAmount;
                const commission = rent * 0.1; // Default commission calculation
                // Check if this property has payments for the filtered period
                let hasPayment = false;
                if (filterMonth !== null) {
                    // Check specific month
                    const leaseKey = (lease === null || lease === void 0 ? void 0 : lease.propertyId) ? lease.propertyId.toString() : String(lease.propertyId || 'unknown');
                    const key = `${leaseKey}-${filterYear}-${filterMonth}`;
                    hasPayment = paymentMap.has(key);
                }
                else {
                    // Check entire year
                    const leaseKey = (lease === null || lease === void 0 ? void 0 : lease.propertyId) ? lease.propertyId.toString() : String(lease.propertyId || 'unknown');
                    const prefix = `${leaseKey}-${filterYear}-`;
                    const yearPayments = Array.from(paymentMap.keys()).filter(key => key.startsWith(prefix));
                    hasPayment = yearPayments.length > 0;
                }
                agentDetails.properties.push({
                    propertyId: property._id.toString(),
                    propertyName: property.name,
                    rent,
                    commission,
                    hasPayment
                });
            }
            // Calculate agent commissions from actual payment data
            let totalAgentCommission = 0;
            // Build monthly commissions array from actual payment data
            for (const [key, agentShare] of agentCommissionMap) {
                const [year, month] = key.split('-').map(Number);
                // Apply filters if specified
                if (filterYear && year !== filterYear)
                    continue;
                if (filterMonth !== null && month !== filterMonth)
                    continue;
                agentDetails.monthlyCommissions.push({
                    month,
                    year,
                    commission: agentShare
                });
                totalAgentCommission += agentShare;
                // Add to monthly and yearly totals if in current period
                if (month === currentMonth && year === currentYear) {
                    commissionData.monthly += agentShare;
                }
                if (year === currentYear) {
                    commissionData.yearly += agentShare;
                }
                commissionData.total += agentShare;
            }
            agentDetails.commission = totalAgentCommission;
            commissionData.details.push(agentDetails);
        }
        res.json(commissionData);
    }
    catch (error) {
        console.error('Error getting agent commissions:', error);
        throw new errorHandler_1.AppError('Failed to get agent commissions', 500);
    }
});
exports.getAgentCommissions = getAgentCommissions;
const getAgencyCommission = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        const companyId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.companyId;
        if (!companyId) {
            throw new errorHandler_1.AppError('Company ID not found', 404);
        }
        // Get query parameters for filtering
        const { year, month, week, day, filterType } = req.query;
        const filterYear = year ? parseInt(year) : new Date().getFullYear();
        const filterMonth = month !== undefined ? parseInt(month) : null;
        const filterWeek = week !== undefined ? parseInt(week) : null;
        const filterDay = day !== undefined ? parseInt(day) : null;
        const filterPeriod = filterType || 'monthly';
        const agencyCommission = {
            monthly: 0,
            yearly: 0,
            total: 0,
            details: []
        };
        const currentDate = new Date();
        const currentMonth = currentDate.getMonth();
        const currentYear = currentDate.getFullYear();
        // Get all payments for the company with commission details
        const payments = yield Payment_1.Payment.find({
            companyId,
            status: 'completed',
            commissionFinalized: true
        }).populate('propertyId', 'name address');
        for (const payment of payments) {
            const property = payment.propertyId; // Cast to access populated fields
            const agencyShare = ((_b = payment.commissionDetails) === null || _b === void 0 ? void 0 : _b.agencyShare) || 0;
            const rentalAmount = payment.amount;
            if (agencyShare <= 0)
                continue;
            // Compute rental-period coverage (expand advances)
            const coveredMonths = [];
            const advanceMonths = payment.advanceMonthsPaid;
            const startPeriod = payment.advancePeriodStart;
            const endPeriod = payment.advancePeriodEnd;
            if (advanceMonths && advanceMonths > 1 && startPeriod && endPeriod) {
                let y = startPeriod.year;
                let m0 = startPeriod.month - 1;
                const endY = endPeriod.year;
                const endM0 = endPeriod.month - 1;
                while (y < endY || (y === endY && m0 <= endM0)) {
                    coveredMonths.push({ year: y, month: m0 });
                    m0 += 1;
                    if (m0 > 11) {
                        m0 = 0;
                        y += 1;
                    }
                }
            }
            else {
                const y = payment.rentalPeriodYear;
                const m0 = payment.rentalPeriodMonth - 1;
                if (typeof y === 'number' && typeof m0 === 'number' && m0 >= 0 && m0 <= 11) {
                    coveredMonths.push({ year: y, month: m0 });
                }
            }
            if (coveredMonths.length === 0) {
                const d = new Date(payment.paymentDate);
                coveredMonths.push({ year: d.getFullYear(), month: d.getMonth() });
            }
            const perMonthAgencyShare = agencyShare / coveredMonths.length;
            // Payment-date components (for daily/weekly filtering only)
            const paymentDate = new Date(payment.paymentDate);
            const paymentYear = paymentDate.getFullYear();
            const paymentMonth = paymentDate.getMonth();
            const paymentWeek = getWeekOfYear(paymentDate);
            const paymentDay = paymentDate.getDate();
            // Apply filters
            let shouldInclude = true;
            if (filterPeriod === 'yearly') {
                shouldInclude = coveredMonths.some(cm => cm.year === filterYear);
            }
            else if (filterPeriod === 'monthly') {
                shouldInclude = coveredMonths.some(cm => cm.year === filterYear && (filterMonth === null || cm.month === filterMonth));
            }
            else if (filterPeriod === 'weekly') {
                shouldInclude = paymentYear === filterYear && (filterWeek === null || paymentWeek === filterWeek);
            }
            else if (filterPeriod === 'daily') {
                shouldInclude = paymentYear === filterYear &&
                    (filterMonth === null || paymentMonth === filterMonth) &&
                    (filterDay === null || paymentDay === filterDay);
            }
            if (!shouldInclude)
                continue;
            // Push detail row (single row per payment) with manual entry fallbacks
            agencyCommission.details.push({
                paymentId: payment._id.toString(),
                paymentDate: payment.paymentDate,
                propertyId: (payment === null || payment === void 0 ? void 0 : payment.propertyId) ? payment.propertyId.toString() : String(payment.propertyId || ''),
                propertyName: (property === null || property === void 0 ? void 0 : property.name) || payment.manualPropertyAddress || 'Manual Entry',
                propertyAddress: (property === null || property === void 0 ? void 0 : property.address) || payment.manualPropertyAddress || 'Manual Entry',
                rentalAmount: rentalAmount,
                agencyShare: agencyShare
            });
            // Totals:
            // - Monthly/Yearly tracked for current period using rental period months
            coveredMonths.forEach(({ year, month }) => {
                if (year === currentYear) {
                    agencyCommission.yearly += perMonthAgencyShare;
                    if (month === currentMonth) {
                        agencyCommission.monthly += perMonthAgencyShare;
                    }
                }
            });
            // - Filtered total: for monthly/yearly, sum only matching covered months; for daily/weekly, sum full payment share
            if (filterPeriod === 'yearly') {
                coveredMonths.forEach(({ year }) => {
                    if (year === filterYear)
                        agencyCommission.total += perMonthAgencyShare;
                });
            }
            else if (filterPeriod === 'monthly') {
                coveredMonths.forEach(({ year, month }) => {
                    if (year === filterYear && (filterMonth === null || month === filterMonth)) {
                        agencyCommission.total += perMonthAgencyShare;
                    }
                });
            }
            else {
                agencyCommission.total += agencyShare;
            }
        }
        // Sort details by payment date (most recent first)
        agencyCommission.details.sort((a, b) => new Date(b.paymentDate).getTime() - new Date(a.paymentDate).getTime());
        res.json(agencyCommission);
    }
    catch (error) {
        console.error('Error getting agency commission:', error);
        throw new errorHandler_1.AppError('Failed to get agency commission', 500);
    }
});
exports.getAgencyCommission = getAgencyCommission;
const getPREACommission = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        const companyId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.companyId;
        if (!companyId) {
            throw new errorHandler_1.AppError('Company ID not found', 404);
        }
        // Get query parameters for filtering (align with agency filters)
        const { year, month, week, day, filterType } = req.query;
        const filterYear = year ? parseInt(year) : new Date().getFullYear();
        const filterMonth = month !== undefined ? parseInt(month) : null;
        const filterWeek = week !== undefined ? parseInt(week) : null;
        const filterDay = day !== undefined ? parseInt(day) : null;
        const filterPeriod = filterType || 'monthly';
        const preaCommission = {
            monthly: 0,
            yearly: 0,
            total: 0,
            details: []
        };
        const currentDate = new Date();
        const currentMonth = currentDate.getMonth();
        const currentYear = currentDate.getFullYear();
        // Get payments and compute PREA from commissionDetails.preaFee
        const payments = yield Payment_1.Payment.find({
            companyId,
            status: 'completed',
            commissionFinalized: true
        }).populate('propertyId', 'name address');
        // Aggregate PREA by property after applying filters
        const propertyMap = new Map();
        for (const payment of payments) {
            const property = payment.propertyId;
            const preaFee = ((_b = payment.commissionDetails) === null || _b === void 0 ? void 0 : _b.preaFee) || 0;
            if (preaFee <= 0)
                continue;
            // Compute rental-period coverage (expand advances)
            const coveredMonths = [];
            const advanceMonths = payment.advanceMonthsPaid;
            const startPeriod = payment.advancePeriodStart;
            const endPeriod = payment.advancePeriodEnd;
            if (advanceMonths && advanceMonths > 1 && startPeriod && endPeriod) {
                let y = startPeriod.year;
                let m0 = startPeriod.month - 1;
                const endY = endPeriod.year;
                const endM0 = endPeriod.month - 1;
                while (y < endY || (y === endY && m0 <= endM0)) {
                    coveredMonths.push({ year: y, month: m0 });
                    m0 += 1;
                    if (m0 > 11) {
                        m0 = 0;
                        y += 1;
                    }
                }
            }
            else {
                const y = payment.rentalPeriodYear;
                const m0 = payment.rentalPeriodMonth - 1;
                if (typeof y === 'number' && typeof m0 === 'number' && m0 >= 0 && m0 <= 11) {
                    coveredMonths.push({ year: y, month: m0 });
                }
            }
            if (coveredMonths.length === 0) {
                const d = new Date(payment.paymentDate);
                coveredMonths.push({ year: d.getFullYear(), month: d.getMonth() });
            }
            const perMonthPreaFee = preaFee / coveredMonths.length;
            // Payment-date components (for daily/weekly filtering only)
            const paymentDate = new Date(payment.paymentDate);
            const paymentYear = paymentDate.getFullYear();
            const paymentMonth = paymentDate.getMonth();
            const paymentWeek = getWeekOfYear(paymentDate);
            const paymentDay = paymentDate.getDate();
            // Apply filters
            let shouldInclude = true;
            if (filterPeriod === 'yearly') {
                shouldInclude = coveredMonths.some(cm => cm.year === filterYear);
            }
            else if (filterPeriod === 'monthly') {
                shouldInclude = coveredMonths.some(cm => cm.year === filterYear && (filterMonth === null || cm.month === filterMonth));
            }
            else if (filterPeriod === 'weekly') {
                shouldInclude = paymentYear === filterYear && (filterWeek === null || paymentWeek === filterWeek);
            }
            else if (filterPeriod === 'daily') {
                shouldInclude = paymentYear === filterYear &&
                    (filterMonth === null || paymentMonth === filterMonth) &&
                    (filterDay === null || paymentDay === filterDay);
            }
            if (!shouldInclude)
                continue;
            const key = (payment === null || payment === void 0 ? void 0 : payment.propertyId) ? payment.propertyId.toString() : String(payment.propertyId || '');
            const name = (property === null || property === void 0 ? void 0 : property.name) || payment.manualPropertyAddress || 'Manual Entry';
            const rentAmount = typeof payment.amount === 'number' ? payment.amount : 0;
            // Compute contribution for the selected filter period to align detail rows with totals
            let contributionForFilter = 0;
            if (filterPeriod === 'yearly') {
                coveredMonths.forEach(({ year }) => {
                    if (year === filterYear)
                        contributionForFilter += perMonthPreaFee;
                });
            }
            else if (filterPeriod === 'monthly') {
                coveredMonths.forEach(({ year, month }) => {
                    if (year === filterYear && (filterMonth === null || month === filterMonth)) {
                        contributionForFilter += perMonthPreaFee;
                    }
                });
            }
            else {
                contributionForFilter = preaFee;
            }
            if (contributionForFilter > 0) {
                if (propertyMap.has(key)) {
                    const agg = propertyMap.get(key);
                    agg.commission += contributionForFilter;
                    agg.rent = rentAmount || agg.rent;
                }
                else {
                    propertyMap.set(key, { propertyId: key, propertyName: name, rent: rentAmount, commission: contributionForFilter });
                }
            }
            // Monthly/Yearly/Total using rental period months for current and filtered periods
            coveredMonths.forEach(({ year, month }) => {
                if (year === currentYear) {
                    preaCommission.yearly += perMonthPreaFee;
                    if (month === currentMonth) {
                        preaCommission.monthly += perMonthPreaFee;
                    }
                }
            });
            if (filterPeriod === 'yearly') {
                coveredMonths.forEach(({ year }) => {
                    if (year === filterYear)
                        preaCommission.total += perMonthPreaFee;
                });
            }
            else if (filterPeriod === 'monthly') {
                coveredMonths.forEach(({ year, month }) => {
                    if (year === filterYear && (filterMonth === null || month === filterMonth)) {
                        preaCommission.total += perMonthPreaFee;
                    }
                });
            }
            else {
                preaCommission.total += preaFee;
            }
        }
        preaCommission.details = Array.from(propertyMap.values());
        res.json(preaCommission);
    }
    catch (error) {
        console.error('Error getting PREA commission:', error);
        throw new errorHandler_1.AppError('Failed to get PREA commission', 500);
    }
});
exports.getPREACommission = getPREACommission;
// Deposits: Get property deposit ledger (payments and payouts) with running balance
const getPropertyDepositLedger = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { propertyId } = req.params;
        if (!propertyId) {
            return res.status(400).json({ message: 'Property ID is required' });
        }
        const entries = yield rentalDeposit_1.RentalDeposit.find({ propertyId })
            .sort({ depositDate: 1 })
            .lean();
        let balance = 0;
        const ledger = entries.map((e) => {
            if (e.type === 'payout') {
                balance -= e.depositAmount;
            }
            else {
                balance += e.depositAmount;
            }
            return Object.assign(Object.assign({}, e), { runningBalance: balance });
        });
        res.json({ success: true, data: { entries: ledger, balance } });
    }
    catch (error) {
        console.error('Error getting deposit ledger:', error);
        res.status(500).json({ success: false, message: 'Failed to get deposit ledger' });
    }
});
exports.getPropertyDepositLedger = getPropertyDepositLedger;
const getCommissionAccount = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c;
    try {
        const companyId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.companyId;
        if (!companyId) {
            throw new errorHandler_1.AppError('Company ID not found', 404);
        }
        const companyObjectId = new mongoose_1.default.Types.ObjectId(companyId);
        const { fromYear, fromMonth, toYear, toMonth } = req.query;
        const parsedFromYear = fromYear ? parseInt(fromYear, 10) : undefined;
        const parsedFromMonth = fromMonth ? parseInt(fromMonth, 10) : undefined; // 1-12
        const parsedToYear = toYear ? parseInt(toYear, 10) : undefined;
        const parsedToMonth = toMonth ? parseInt(toMonth, 10) : undefined; // 1-12
        const hasFromFilter = typeof parsedFromYear === 'number' && typeof parsedFromMonth === 'number' &&
            !Number.isNaN(parsedFromYear) && !Number.isNaN(parsedFromMonth) &&
            parsedFromMonth >= 1 && parsedFromMonth <= 12;
        const hasToFilter = typeof parsedToYear === 'number' && typeof parsedToMonth === 'number' &&
            !Number.isNaN(parsedToYear) && !Number.isNaN(parsedToMonth) &&
            parsedToMonth >= 1 && parsedToMonth <= 12;
        const rangeStart = hasFromFilter ? new Date(parsedFromYear, parsedFromMonth - 1, 1, 0, 0, 0, 0) : null;
        const rangeEnd = hasToFilter ? new Date(parsedToYear, parsedToMonth, 0, 23, 59, 59, 999) : null;
        // Credits: commission received by company (agency share from completed/finalized payments)
        const payments = yield Payment_1.Payment.find({
            companyId: companyObjectId,
            status: 'completed',
            commissionFinalized: true
        })
            .select('paymentDate commissionDetails propertyId manualPropertyAddress referenceNumber')
            .populate('propertyId', 'address')
            .lean();
        const users = yield User_1.User.find({
            companyId: companyObjectId,
            $or: [
                { role: { $in: ['agent', 'sales'] } },
                { roles: { $in: ['agent', 'sales'] } }
            ]
        })
            .select('_id firstName lastName')
            .lean();
        const userNameById = new Map();
        const companyAgentIds = [];
        users.forEach((u) => {
            const id = String(u._id);
            const name = `${u.firstName || ''} ${u.lastName || ''}`.trim() || 'Unknown Agent';
            userNameById.set(id, name);
            companyAgentIds.push(new mongoose_1.default.Types.ObjectId(id));
        });
        // Debits: completed payouts made from agent accounts
        const agentAccounts = yield AgentAccount_1.AgentAccount.find({
            agentId: { $in: companyAgentIds }
        })
            .select('agentId transactions')
            .lean();
        const rawEntries = [];
        for (const payment of payments) {
            const agencyShare = Number(((_b = payment === null || payment === void 0 ? void 0 : payment.commissionDetails) === null || _b === void 0 ? void 0 : _b.agencyShare) || 0);
            if (agencyShare <= 0)
                continue;
            const propertyAddress = ((_c = payment === null || payment === void 0 ? void 0 : payment.propertyId) === null || _c === void 0 ? void 0 : _c.address) ||
                (payment === null || payment === void 0 ? void 0 : payment.manualPropertyAddress) ||
                'Manual Entry';
            const reference = (payment === null || payment === void 0 ? void 0 : payment.referenceNumber) ? String(payment.referenceNumber) : undefined;
            rawEntries.push({
                entryId: `payment-${String(payment._id)}`,
                date: payment.paymentDate,
                description: `Commission received from ${propertyAddress}`,
                propertyAddress,
                debit: 0,
                credit: agencyShare,
                sourceType: 'commission_received',
                reference
            });
        }
        for (const account of agentAccounts) {
            const agentId = String(account.agentId);
            const agentName = userNameById.get(agentId) || 'Unknown Agent';
            const transactions = Array.isArray(account.transactions) ? account.transactions : [];
            for (const tx of transactions) {
                if (tx.type !== 'payout' || tx.status !== 'completed')
                    continue;
                const amount = Number(tx.amount || 0);
                if (amount <= 0)
                    continue;
                rawEntries.push({
                    entryId: `payout-${String(tx._id || '')}-${agentId}`,
                    date: tx.date,
                    description: `Commission payout to ${agentName}`,
                    agentName,
                    debit: amount,
                    credit: 0,
                    sourceType: 'agent_payout',
                    reference: tx.reference
                });
            }
        }
        rawEntries.sort((a, b) => {
            const t = new Date(a.date).getTime() - new Date(b.date).getTime();
            if (t !== 0)
                return t;
            return a.entryId.localeCompare(b.entryId);
        });
        let openingBalance = 0;
        let runningBalance = 0;
        let totalCommissionReceived = 0;
        let totalPayouts = 0;
        const entries = [];
        for (const entry of rawEntries) {
            const entryDate = new Date(entry.date);
            const inRangeStart = !rangeStart || entryDate >= rangeStart;
            const inRangeEnd = !rangeEnd || entryDate <= rangeEnd;
            const inRange = inRangeStart && inRangeEnd;
            if (rangeStart && entryDate < rangeStart) {
                openingBalance += entry.credit - entry.debit;
            }
            if (!inRange) {
                continue;
            }
            totalCommissionReceived += entry.credit;
            totalPayouts += entry.debit;
            runningBalance += entry.credit - entry.debit;
            entries.push(Object.assign(Object.assign({}, entry), { balance: Number((openingBalance + runningBalance).toFixed(2)) }));
        }
        const response = {
            totalCommissionReceived: Number(totalCommissionReceived.toFixed(2)),
            totalPayouts: Number(totalPayouts.toFixed(2)),
            openingBalance: Number(openingBalance.toFixed(2)),
            balance: Number((openingBalance + runningBalance).toFixed(2)),
            entries
        };
        res.json(response);
    }
    catch (error) {
        console.error('Error getting commission account ledger:', error);
        throw new errorHandler_1.AppError('Failed to get commission account ledger', 500);
    }
});
exports.getCommissionAccount = getCommissionAccount;
const getCommissionReports = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c;
    try {
        const companyId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.companyId;
        if (!companyId) {
            throw new errorHandler_1.AppError('Company ID not found', 404);
        }
        const companyObjectId = new mongoose_1.default.Types.ObjectId(companyId);
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const payments = yield Payment_1.Payment.find({
            companyId: companyObjectId,
            status: 'completed',
            commissionFinalized: true,
            isProvisional: { $ne: true },
            isInSuspense: { $ne: true }
        })
            .select('paymentType saleId paymentDate paymentMethod referenceNumber commissionDetails propertyId manualPropertyAddress rentalPeriodMonth rentalPeriodYear advanceMonthsPaid advancePeriodStart advancePeriodEnd')
            .populate('propertyId', 'name propertyName address title')
            .lean();
        const properties = new Map();
        const getPropertyLabel = (payment) => {
            var _a, _b, _c, _d;
            const propertyId = (payment === null || payment === void 0 ? void 0 : payment.propertyId) ? String(payment.propertyId._id || payment.propertyId) : `manual-${String(payment._id)}`;
            const propertyTitle = ((_a = payment === null || payment === void 0 ? void 0 : payment.propertyId) === null || _a === void 0 ? void 0 : _a.name) || ((_b = payment === null || payment === void 0 ? void 0 : payment.propertyId) === null || _b === void 0 ? void 0 : _b.propertyName) || ((_c = payment === null || payment === void 0 ? void 0 : payment.propertyId) === null || _c === void 0 ? void 0 : _c.title) || (payment === null || payment === void 0 ? void 0 : payment.manualPropertyAddress) || 'Manual Property';
            const propertyAddress = ((_d = payment === null || payment === void 0 ? void 0 : payment.propertyId) === null || _d === void 0 ? void 0 : _d.address) || (payment === null || payment === void 0 ? void 0 : payment.manualPropertyAddress) || '';
            return { propertyId, propertyTitle, propertyAddress };
        };
        const mapTrustSource = (paymentMethod) => {
            return paymentMethod === 'cash' ? 'Cash' : 'Bank';
        };
        const getCoveredMonths = (payment) => {
            const covered = [];
            const advanceMonths = payment === null || payment === void 0 ? void 0 : payment.advanceMonthsPaid;
            const startPeriod = payment === null || payment === void 0 ? void 0 : payment.advancePeriodStart;
            const endPeriod = payment === null || payment === void 0 ? void 0 : payment.advancePeriodEnd;
            if (advanceMonths && advanceMonths > 1 && startPeriod && endPeriod) {
                let y = startPeriod.year;
                let m0 = startPeriod.month - 1;
                const endY = endPeriod.year;
                const endM0 = endPeriod.month - 1;
                while (y < endY || (y === endY && m0 <= endM0)) {
                    covered.push({ year: y, month: m0 });
                    m0 += 1;
                    if (m0 > 11) {
                        m0 = 0;
                        y += 1;
                    }
                }
            }
            else {
                const y = payment === null || payment === void 0 ? void 0 : payment.rentalPeriodYear;
                const m0 = (payment === null || payment === void 0 ? void 0 : payment.rentalPeriodMonth) - 1;
                if (typeof y === 'number' && typeof m0 === 'number' && m0 >= 0 && m0 <= 11) {
                    covered.push({ year: y, month: m0 });
                }
            }
            if (covered.length === 0) {
                const d = new Date(payment.paymentDate);
                covered.push({ year: d.getFullYear(), month: d.getMonth() });
            }
            return covered;
        };
        const addAccount = (property, key, label, openingDate) => {
            const existing = property.accounts.get(key);
            if (existing) {
                if (openingDate.getTime() < existing.openingDate.getTime()) {
                    existing.openingDate = openingDate;
                }
                return existing;
            }
            const created = {
                key,
                label,
                openingDate,
                expectedCommission: 0,
                paymentCredits: []
            };
            property.accounts.set(key, created);
            return created;
        };
        for (const payment of payments) {
            const agencyShare = Number(((_b = payment === null || payment === void 0 ? void 0 : payment.commissionDetails) === null || _b === void 0 ? void 0 : _b.agencyShare) || 0);
            const totalCommission = Number(((_c = payment === null || payment === void 0 ? void 0 : payment.commissionDetails) === null || _c === void 0 ? void 0 : _c.totalCommission) || 0);
            // Use agencyShare as the canonical company commission figure.
            // Fallback to totalCommission only for older records that predate agencyShare persistence.
            const companyCommission = agencyShare > 0 ? agencyShare : totalCommission;
            if (companyCommission <= 0)
                continue;
            const { propertyId, propertyTitle, propertyAddress } = getPropertyLabel(payment);
            if (!properties.has(propertyId)) {
                properties.set(propertyId, {
                    propertyId,
                    propertyTitle,
                    propertyAddress,
                    accounts: new Map()
                });
            }
            const property = properties.get(propertyId);
            const trustSource = mapTrustSource(String(payment.paymentMethod || ''));
            const referenceLabel = (payment === null || payment === void 0 ? void 0 : payment.referenceNumber) ? ` (${payment.referenceNumber})` : '';
            if (payment.paymentType === 'rental') {
                const coveredMonths = getCoveredMonths(payment);
                const perMonthCommission = companyCommission / coveredMonths.length;
                for (const cm of coveredMonths) {
                    const accountKey = `rental-${cm.year}-${cm.month}`;
                    const label = `Rental Commission ${monthNames[cm.month]} ${cm.year}`;
                    const openingDate = new Date(cm.year, cm.month, 1, 0, 0, 0, 0);
                    const account = addAccount(property, accountKey, label, openingDate);
                    account.expectedCommission += perMonthCommission;
                    account.paymentCredits.push({
                        entryId: `payment-${String(payment._id)}-${accountKey}`,
                        date: new Date(payment.paymentDate),
                        amount: perMonthCommission,
                        description: `Commission received from Trust Account (${trustSource})${referenceLabel}`
                    });
                }
            }
            else if (payment.paymentType === 'sale') {
                const saleKey = (payment === null || payment === void 0 ? void 0 : payment.saleId) ? String(payment.saleId) : String(payment._id);
                const accountKey = `sale-${saleKey}`;
                const label = (payment === null || payment === void 0 ? void 0 : payment.saleId) ? `Sale Commission (${saleKey.slice(-6)})` : `Sale Commission (${String(payment._id).slice(-6)})`;
                const openingDate = new Date(payment.paymentDate);
                const account = addAccount(property, accountKey, label, openingDate);
                account.expectedCommission += companyCommission;
                account.paymentCredits.push({
                    entryId: `payment-${String(payment._id)}-${accountKey}`,
                    date: new Date(payment.paymentDate),
                    amount: companyCommission,
                    description: `Commission received from Trust Account (${trustSource})${referenceLabel}`
                });
            }
            else {
                const coveredMonths = getCoveredMonths(payment);
                const perMonthCommission = companyCommission / coveredMonths.length;
                for (const cm of coveredMonths) {
                    const accountKey = `introduction-${cm.year}-${cm.month}`;
                    const label = `Introduction Commission ${monthNames[cm.month]} ${cm.year}`;
                    const openingDate = new Date(cm.year, cm.month, 1, 0, 0, 0, 0);
                    const account = addAccount(property, accountKey, label, openingDate);
                    account.expectedCommission += perMonthCommission;
                    account.paymentCredits.push({
                        entryId: `payment-${String(payment._id)}-${accountKey}`,
                        date: new Date(payment.paymentDate),
                        amount: perMonthCommission,
                        description: `Commission received from Trust Account (${trustSource})${referenceLabel}`
                    });
                }
            }
        }
        const reports = [];
        for (const property of properties.values()) {
            const entriesWithoutBalance = [];
            let totalExpected = 0;
            let totalReceived = 0;
            const sortedAccounts = Array.from(property.accounts.values()).sort((a, b) => {
                const d = a.openingDate.getTime() - b.openingDate.getTime();
                if (d !== 0)
                    return d;
                return a.key.localeCompare(b.key);
            });
            for (const account of sortedAccounts) {
                totalExpected += account.expectedCommission;
                entriesWithoutBalance.push({
                    entryId: `opening-${property.propertyId}-${account.key}`,
                    accountKey: account.key,
                    date: account.openingDate,
                    description: `Opening balance - ${account.label}`,
                    debit: Number(account.expectedCommission.toFixed(2)),
                    credit: 0,
                    sourceType: 'opening'
                });
                const sortedCredits = account.paymentCredits.sort((a, b) => {
                    const t = a.date.getTime() - b.date.getTime();
                    if (t !== 0)
                        return t;
                    return a.entryId.localeCompare(b.entryId);
                });
                for (const credit of sortedCredits) {
                    totalReceived += credit.amount;
                    entriesWithoutBalance.push({
                        entryId: credit.entryId,
                        accountKey: account.key,
                        date: credit.date,
                        description: credit.description,
                        debit: 0,
                        credit: Number(credit.amount.toFixed(2)),
                        sourceType: 'payment'
                    });
                }
            }
            entriesWithoutBalance.sort((a, b) => {
                const t = new Date(a.date).getTime() - new Date(b.date).getTime();
                if (t !== 0)
                    return t;
                // Opening entries should appear before payments on same date
                if (a.sourceType !== b.sourceType)
                    return a.sourceType === 'opening' ? -1 : 1;
                return a.entryId.localeCompare(b.entryId);
            });
            let runningBalance = 0;
            const entries = entriesWithoutBalance.map((entry) => {
                runningBalance += entry.debit - entry.credit;
                return Object.assign(Object.assign({}, entry), { balance: Number(runningBalance.toFixed(2)) });
            });
            reports.push({
                propertyId: property.propertyId,
                propertyTitle: property.propertyTitle,
                propertyAddress: property.propertyAddress,
                totalExpectedCommission: Number(totalExpected.toFixed(2)),
                totalReceivedCommission: Number(totalReceived.toFixed(2)),
                closingBalance: Number(runningBalance.toFixed(2)),
                entries
            });
        }
        reports.sort((a, b) => a.propertyTitle.localeCompare(b.propertyTitle));
        const response = { properties: reports };
        return res.json(response);
    }
    catch (error) {
        console.error('Error getting commission reports:', error);
        throw new errorHandler_1.AppError('Failed to get commission reports', 500);
    }
});
exports.getCommissionReports = getCommissionReports;
const getTaxLedgers = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const companyId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.companyId;
        if (!companyId) {
            throw new errorHandler_1.AppError('Company ID not found', 404);
        }
        const companyObjectId = new mongoose_1.default.Types.ObjectId(companyId);
        const [records, payouts] = yield Promise.all([
            TaxRecord_1.TaxRecord.find({ companyId: companyObjectId, taxType: { $in: TAX_TYPES } })
                .select('trustAccountId taxType amount createdAt')
                .lean(),
            TaxPayout_1.TaxPayout.find({ companyId: companyObjectId, taxType: { $in: TAX_TYPES } })
                .select('trustAccountId taxType amount payoutDate reference createdAt receiptFileName receiptContentType receiptUploadedAt')
                .lean()
        ]);
        const trustAccountIds = Array.from(new Set([...records, ...payouts]
            .map((item) => String((item === null || item === void 0 ? void 0 : item.trustAccountId) || ''))
            .filter(Boolean)));
        if (trustAccountIds.length === 0) {
            const emptyPayload = { VAT: [], VAT_ON_COMMISSION: [], CGT: [] };
            return res.json(emptyPayload);
        }
        const trustAccounts = yield TrustAccount_1.TrustAccount.find({
            _id: { $in: trustAccountIds.map((id) => new mongoose_1.default.Types.ObjectId(id)) },
            companyId: companyObjectId
        })
            .select('_id propertyId')
            .lean();
        const propertyIds = Array.from(new Set(trustAccounts
            .map((account) => String((account === null || account === void 0 ? void 0 : account.propertyId) || ''))
            .filter(Boolean)));
        const properties = yield Property_1.Property.find({ _id: { $in: propertyIds } })
            .select('_id name address')
            .lean();
        const propertyById = new Map();
        properties.forEach((property) => propertyById.set(String(property._id), property));
        const trustById = new Map();
        trustAccounts.forEach((account) => trustById.set(String(account._id), account));
        const groupedEntries = new Map();
        const debitTotals = new Map();
        const creditTotals = new Map();
        for (const record of records) {
            const trustAccountId = String(record.trustAccountId);
            const key = `${trustAccountId}:${record.taxType}`;
            const amount = Number(record.amount || 0);
            if (amount <= 0)
                continue;
            const entry = {
                entryId: `opening-${String(record._id)}`,
                date: new Date(record.createdAt || Date.now()),
                description: `${formatTaxTypeLabel(record.taxType)} payable opening balance`,
                debit: amount,
                credit: 0,
                balance: 0,
                sourceType: 'opening'
            };
            const existing = groupedEntries.get(key) || [];
            existing.push(entry);
            groupedEntries.set(key, existing);
            debitTotals.set(key, Number((debitTotals.get(key) || 0) + amount));
        }
        for (const payout of payouts) {
            const trustAccountId = String(payout.trustAccountId);
            const key = `${trustAccountId}:${payout.taxType}`;
            const amount = Number(payout.amount || 0);
            if (amount <= 0)
                continue;
            const entry = {
                entryId: `payout-${String(payout._id)}`,
                date: new Date(payout.payoutDate || payout.createdAt || Date.now()),
                description: `${formatTaxTypeLabel(payout.taxType)} payout to ZIMRA`,
                debit: 0,
                credit: amount,
                balance: 0,
                sourceType: 'payout',
                reference: payout.reference ? String(payout.reference) : undefined,
                payoutId: String(payout._id),
                receiptFileName: payout.receiptFileName ? String(payout.receiptFileName) : undefined,
                receiptContentType: payout.receiptContentType ? String(payout.receiptContentType) : undefined,
                receiptUploadedAt: payout.receiptUploadedAt ? new Date(payout.receiptUploadedAt) : undefined
            };
            const existing = groupedEntries.get(key) || [];
            existing.push(entry);
            groupedEntries.set(key, existing);
            creditTotals.set(key, Number((creditTotals.get(key) || 0) + amount));
        }
        const response = { VAT: [], VAT_ON_COMMISSION: [], CGT: [] };
        for (const [key, entries] of groupedEntries.entries()) {
            const [trustAccountId, taxTypeRaw] = key.split(':');
            const taxType = taxTypeRaw;
            if (!TAX_TYPES.includes(taxType))
                continue;
            const trustAccount = trustById.get(trustAccountId);
            if (!trustAccount)
                continue;
            const propertyId = String(trustAccount.propertyId || '');
            if (!propertyId)
                continue;
            const property = propertyById.get(propertyId);
            entries.sort((a, b) => {
                const t = new Date(a.date).getTime() - new Date(b.date).getTime();
                if (t !== 0)
                    return t;
                if (a.sourceType !== b.sourceType)
                    return a.sourceType === 'opening' ? -1 : 1;
                return a.entryId.localeCompare(b.entryId);
            });
            let runningBalance = 0;
            const ledgerEntries = entries.map((entry) => {
                runningBalance = Number((runningBalance + Number(entry.debit || 0) - Number(entry.credit || 0)).toFixed(2));
                return Object.assign(Object.assign({}, entry), { balance: runningBalance });
            });
            const ledger = {
                propertyId,
                trustAccountId,
                propertyName: (property === null || property === void 0 ? void 0 : property.name) || 'Unknown Property',
                propertyAddress: (property === null || property === void 0 ? void 0 : property.address) || '',
                totalDebit: Number((debitTotals.get(key) || 0).toFixed(2)),
                totalCredit: Number((creditTotals.get(key) || 0).toFixed(2)),
                closingBalance: Number((Number(debitTotals.get(key) || 0) - Number(creditTotals.get(key) || 0)).toFixed(2)),
                entries: ledgerEntries
            };
            response[taxType].push(ledger);
        }
        response.VAT.sort((a, b) => b.closingBalance - a.closingBalance);
        response.VAT_ON_COMMISSION.sort((a, b) => b.closingBalance - a.closingBalance);
        response.CGT.sort((a, b) => b.closingBalance - a.closingBalance);
        return res.json(response);
    }
    catch (error) {
        console.error('Error getting tax ledgers:', error);
        throw new errorHandler_1.AppError('Failed to get tax ledgers', 500);
    }
});
exports.getTaxLedgers = getTaxLedgers;
const createTaxPayout = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d;
    try {
        const companyId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.companyId;
        const userId = (_b = req.user) === null || _b === void 0 ? void 0 : _b.userId;
        if (!companyId || !userId) {
            throw new errorHandler_1.AppError('Unauthorized', 401);
        }
        const { propertyId, taxType, amount, payoutDate, reference, notes } = req.body;
        if (!propertyId || !taxType || !TAX_TYPES.includes(taxType)) {
            return res.status(400).json({ message: 'propertyId and valid taxType are required' });
        }
        const payoutAmount = Number(amount || 0);
        if (payoutAmount <= 0) {
            return res.status(400).json({ message: 'A positive payout amount is required' });
        }
        const companyObjectId = new mongoose_1.default.Types.ObjectId(companyId);
        const propertyObjectId = new mongoose_1.default.Types.ObjectId(propertyId);
        const trustAccount = yield TrustAccount_1.TrustAccount.findOne({
            companyId: companyObjectId,
            propertyId: propertyObjectId
        })
            .select('_id')
            .lean();
        if (!(trustAccount === null || trustAccount === void 0 ? void 0 : trustAccount._id)) {
            return res.status(404).json({ message: 'Trust account not found for selected property' });
        }
        const trustAccountObjectId = new mongoose_1.default.Types.ObjectId(String(trustAccount._id));
        const [recordTotals, payoutTotals] = yield Promise.all([
            TaxRecord_1.TaxRecord.aggregate([
                { $match: { companyId: companyObjectId, trustAccountId: trustAccountObjectId, taxType } },
                { $group: { _id: null, total: { $sum: '$amount' } } }
            ]),
            TaxPayout_1.TaxPayout.aggregate([
                { $match: { companyId: companyObjectId, trustAccountId: trustAccountObjectId, taxType } },
                { $group: { _id: null, total: { $sum: '$amount' } } }
            ])
        ]);
        const totalDebit = Number(((_c = recordTotals === null || recordTotals === void 0 ? void 0 : recordTotals[0]) === null || _c === void 0 ? void 0 : _c.total) || 0);
        const totalCredit = Number(((_d = payoutTotals === null || payoutTotals === void 0 ? void 0 : payoutTotals[0]) === null || _d === void 0 ? void 0 : _d.total) || 0);
        const outstanding = Number((totalDebit - totalCredit).toFixed(2));
        if (outstanding <= 0) {
            return res.status(400).json({ message: `No outstanding ${formatTaxTypeLabel(taxType)} balance for this property` });
        }
        if (payoutAmount - outstanding > 0.0001) {
            return res.status(400).json({ message: `Payout exceeds outstanding ${formatTaxTypeLabel(taxType)} balance (${outstanding.toFixed(2)})` });
        }
        const payout = yield TaxPayout_1.TaxPayout.create({
            companyId: companyObjectId,
            trustAccountId: trustAccountObjectId,
            propertyId: propertyObjectId,
            taxType,
            amount: Number(payoutAmount.toFixed(2)),
            payoutDate: payoutDate ? new Date(payoutDate) : new Date(),
            reference: reference ? String(reference).trim() : undefined,
            notes: notes ? String(notes).trim() : undefined,
            createdBy: new mongoose_1.default.Types.ObjectId(userId)
        });
        return res.status(201).json({ message: 'Tax payout recorded', data: payout });
    }
    catch (error) {
        console.error('Error creating tax payout:', error);
        throw new errorHandler_1.AppError('Failed to create tax payout', 500);
    }
});
exports.createTaxPayout = createTaxPayout;
const uploadTaxPayoutReceipt = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        const companyId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.companyId;
        const userId = (_b = req.user) === null || _b === void 0 ? void 0 : _b.userId;
        if (!companyId || !userId) {
            return res.status(401).json({ message: 'Unauthorized' });
        }
        const { payoutId } = req.params;
        if (!payoutId) {
            return res.status(400).json({ message: 'Missing payoutId' });
        }
        if (!req.file) {
            return res.status(400).json({ message: 'No file uploaded' });
        }
        const mimeType = String(req.file.mimetype || '').toLowerCase();
        const isAllowed = mimeType === 'application/pdf' || mimeType.startsWith('image/');
        if (!isAllowed) {
            return res.status(400).json({ message: 'Only PDF or image receipts are allowed' });
        }
        const companyObjectId = new mongoose_1.default.Types.ObjectId(companyId);
        const payout = yield TaxPayout_1.TaxPayout.findOne({ _id: payoutId, companyId: companyObjectId });
        if (!payout) {
            return res.status(404).json({ message: 'Tax payout not found' });
        }
        payout.receiptFileName = String(req.file.originalname || 'receipt');
        payout.receiptContentType = mimeType;
        payout.receiptData = req.file.buffer;
        payout.receiptUploadedAt = new Date();
        payout.receiptUploadedBy = new mongoose_1.default.Types.ObjectId(userId);
        yield payout.save();
        return res.json({
            message: 'Receipt uploaded successfully',
            data: {
                payoutId: String(payout._id),
                receiptFileName: payout.receiptFileName,
                receiptContentType: payout.receiptContentType,
                receiptUploadedAt: payout.receiptUploadedAt
            }
        });
    }
    catch (error) {
        console.error('Error uploading tax payout receipt:', error);
        throw new errorHandler_1.AppError('Failed to upload tax payout receipt', 500);
    }
});
exports.uploadTaxPayoutReceipt = uploadTaxPayoutReceipt;
const getTaxPayoutReceipt = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const companyId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.companyId;
        if (!companyId) {
            return res.status(401).json({ message: 'Unauthorized' });
        }
        const { payoutId } = req.params;
        if (!payoutId) {
            return res.status(400).json({ message: 'Missing payoutId' });
        }
        const payout = yield TaxPayout_1.TaxPayout.findOne({
            _id: payoutId,
            companyId: new mongoose_1.default.Types.ObjectId(companyId)
        }).select('+receiptData receiptContentType receiptFileName');
        if (!payout) {
            return res.status(404).json({ message: 'Tax payout not found' });
        }
        if (!payout.receiptData || !payout.receiptContentType) {
            return res.status(404).json({ message: 'Receipt not found for this payout' });
        }
        const safeFileName = String(payout.receiptFileName || `tax-receipt-${payoutId}`).replace(/[^a-z0-9.\-_]+/gi, '-');
        res.setHeader('Content-Type', payout.receiptContentType);
        res.setHeader('Content-Disposition', `inline; filename="${safeFileName}"`);
        return res.send(payout.receiptData);
    }
    catch (error) {
        console.error('Error getting tax payout receipt:', error);
        throw new errorHandler_1.AppError('Failed to get tax payout receipt', 500);
    }
});
exports.getTaxPayoutReceipt = getTaxPayoutReceipt;
const getTaxPropertyReport = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const companyId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.companyId;
        if (!companyId) {
            return res.status(401).send('Unauthorized');
        }
        const { propertyId } = req.params;
        const taxTypeRaw = String(req.query.taxType || 'VAT');
        const taxType = TAX_TYPES.includes(taxTypeRaw) ? taxTypeRaw : 'VAT';
        if (!propertyId) {
            return res.status(400).send('Missing propertyId');
        }
        const companyObjectId = new mongoose_1.default.Types.ObjectId(companyId);
        const propertyObjectId = new mongoose_1.default.Types.ObjectId(propertyId);
        const [property, trustAccount] = yield Promise.all([
            Property_1.Property.findOne({ _id: propertyObjectId, companyId: companyObjectId })
                .select('name address')
                .lean(),
            TrustAccount_1.TrustAccount.findOne({ companyId: companyObjectId, propertyId: propertyObjectId })
                .select('_id')
                .lean()
        ]);
        if (!(trustAccount === null || trustAccount === void 0 ? void 0 : trustAccount._id)) {
            return res.status(404).send('Trust account not found for this property');
        }
        const trustAccountObjectId = new mongoose_1.default.Types.ObjectId(String(trustAccount._id));
        const [records, payouts] = yield Promise.all([
            TaxRecord_1.TaxRecord.find({ companyId: companyObjectId, trustAccountId: trustAccountObjectId, taxType })
                .select('_id amount createdAt')
                .lean(),
            TaxPayout_1.TaxPayout.find({ companyId: companyObjectId, trustAccountId: trustAccountObjectId, taxType })
                .select('_id amount payoutDate reference createdAt receiptFileName receiptContentType receiptUploadedAt')
                .lean()
        ]);
        const entries = [];
        for (const record of records) {
            const amount = Number(record.amount || 0);
            if (amount <= 0)
                continue;
            entries.push({
                entryId: `opening-${String(record._id)}`,
                date: new Date(record.createdAt || Date.now()),
                description: `${formatTaxTypeLabel(taxType)} payable opening balance`,
                debit: amount,
                credit: 0,
                balance: 0,
                sourceType: 'opening'
            });
        }
        for (const payout of payouts) {
            const amount = Number(payout.amount || 0);
            if (amount <= 0)
                continue;
            entries.push({
                entryId: `payout-${String(payout._id)}`,
                date: new Date(payout.payoutDate || payout.createdAt || Date.now()),
                description: `${formatTaxTypeLabel(taxType)} payout to ZIMRA`,
                debit: 0,
                credit: amount,
                balance: 0,
                sourceType: 'payout',
                reference: payout.reference ? String(payout.reference) : undefined,
                payoutId: String(payout._id),
                receiptFileName: payout.receiptFileName ? String(payout.receiptFileName) : undefined,
                receiptContentType: payout.receiptContentType ? String(payout.receiptContentType) : undefined,
                receiptUploadedAt: payout.receiptUploadedAt ? new Date(payout.receiptUploadedAt) : undefined
            });
        }
        entries.sort((a, b) => {
            const t = new Date(a.date).getTime() - new Date(b.date).getTime();
            if (t !== 0)
                return t;
            if (a.sourceType !== b.sourceType)
                return a.sourceType === 'opening' ? -1 : 1;
            return a.entryId.localeCompare(b.entryId);
        });
        let runningBalance = 0;
        const ledgerRows = entries.map((entry) => {
            runningBalance = Number((runningBalance + Number(entry.debit || 0) - Number(entry.credit || 0)).toFixed(2));
            return Object.assign(Object.assign({}, entry), { balance: runningBalance });
        });
        const totalDebit = Number(ledgerRows.reduce((sum, row) => sum + Number(row.debit || 0), 0).toFixed(2));
        const totalCredit = Number(ledgerRows.reduce((sum, row) => sum + Number(row.credit || 0), 0).toFixed(2));
        const closingBalance = Number((totalDebit - totalCredit).toFixed(2));
        const payoutStatusLabel = closingBalance <= 0.005 ? 'Paid Out' : 'Outstanding';
        const latestReceiptPayoutMeta = [...ledgerRows]
            .reverse()
            .find((row) => row.sourceType === 'payout' && row.payoutId && row.receiptUploadedAt);
        let receiptHtml = '';
        if (latestReceiptPayoutMeta === null || latestReceiptPayoutMeta === void 0 ? void 0 : latestReceiptPayoutMeta.payoutId) {
            const payoutWithReceipt = yield TaxPayout_1.TaxPayout.findOne({
                _id: latestReceiptPayoutMeta.payoutId,
                companyId: companyObjectId
            }).select('+receiptData receiptContentType receiptFileName receiptUploadedAt payoutDate reference');
            if ((payoutWithReceipt === null || payoutWithReceipt === void 0 ? void 0 : payoutWithReceipt.receiptData) && (payoutWithReceipt === null || payoutWithReceipt === void 0 ? void 0 : payoutWithReceipt.receiptContentType)) {
                const receiptMime = String(payoutWithReceipt.receiptContentType).toLowerCase();
                const receiptBase64 = Buffer.from(payoutWithReceipt.receiptData).toString('base64');
                const receiptDateLabel = formatDate(payoutWithReceipt.payoutDate || payoutWithReceipt.createdAt || new Date());
                const receiptRef = payoutWithReceipt.reference ? String(payoutWithReceipt.reference) : '-';
                if (receiptMime.startsWith('image/')) {
                    receiptHtml = `
            <h2>Uploaded Receipt</h2>
            <div class="meta">
              <div><span class="label">Attached To Payout:</span> ${escapeHtml(receiptDateLabel)}</div>
              <div><span class="label">Reference:</span> ${escapeHtml(receiptRef)}</div>
            </div>
            <div class="receipt-wrap">
              <img src="data:${receiptMime};base64,${receiptBase64}" alt="VAT receipt" />
            </div>
          `;
                }
                else if (receiptMime === 'application/pdf') {
                    receiptHtml = `
            <h2>Uploaded Receipt</h2>
            <div class="meta">
              <div><span class="label">Attached To Payout:</span> ${escapeHtml(receiptDateLabel)}</div>
              <div><span class="label">Reference:</span> ${escapeHtml(receiptRef)}</div>
            </div>
            <object data="data:${receiptMime};base64,${receiptBase64}" type="application/pdf" width="100%" height="720">
              <p>Receipt PDF is attached but cannot be displayed in this browser.</p>
            </object>
          `;
                }
            }
        }
        const transactionRows = ledgerRows
            .map((entry) => `
        <tr>
          <td>${escapeHtml(formatDate(entry.date))}</td>
          <td>${escapeHtml(`${entry.description}${entry.reference ? ` (${entry.reference})` : ''}`)}</td>
          <td class="right">${entry.debit > 0 ? escapeHtml(formatMoney(entry.debit)) : '-'}</td>
          <td class="right">${entry.credit > 0 ? escapeHtml(formatMoney(entry.credit)) : '-'}</td>
          <td class="right">${escapeHtml(formatMoney(entry.balance))}</td>
        </tr>
      `)
            .join('');
        const html = `<!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8" />
        <title>${escapeHtml(formatTaxTypeLabel(taxType))} Property Report</title>
        <style>
          body { font-family: Arial, sans-serif; color: #222; padding: 24px; }
          h1 { margin: 0 0 6px; font-size: 22px; }
          h2 { margin: 22px 0 8px; font-size: 18px; }
          .meta { margin: 10px 0; color: #444; }
          .meta div { margin: 4px 0; }
          .label { color: #666; display: inline-block; min-width: 170px; }
          table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 13px; }
          th, td { padding: 8px; border-bottom: 1px solid #eaeaea; }
          th { text-align: left; background: #fafafa; }
          .right { text-align: right; }
          .receipt-wrap { margin-top: 12px; border: 1px solid #ddd; padding: 8px; }
          .receipt-wrap img { max-width: 100%; max-height: 950px; object-fit: contain; display: block; margin: 0 auto; }
          @media print {
            body { padding: 12px; }
          }
        </style>
      </head>
      <body>
        <h1>${escapeHtml(formatTaxTypeLabel(taxType))} Property Report</h1>
        <div class="meta">
          <div><span class="label">Property Name:</span> ${escapeHtml((property === null || property === void 0 ? void 0 : property.name) || 'Unknown Property')}</div>
          <div><span class="label">Property Address:</span> ${escapeHtml((property === null || property === void 0 ? void 0 : property.address) || '-')}</div>
          <div><span class="label">${escapeHtml(formatTaxTypeLabel(taxType))} Account Status:</span> ${escapeHtml(payoutStatusLabel)}</div>
          <div><span class="label">Total Debit:</span> ${escapeHtml(formatMoney(totalDebit))}</div>
          <div><span class="label">Total Credit:</span> ${escapeHtml(formatMoney(totalCredit))}</div>
          <div><span class="label">Outstanding Balance:</span> ${escapeHtml(formatMoney(closingBalance))}</div>
        </div>
        <h2>Transactions</h2>
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Description</th>
              <th class="right">Dr</th>
              <th class="right">Cr</th>
              <th class="right">Balance</th>
            </tr>
          </thead>
          <tbody>${transactionRows || '<tr><td colspan="5">No transactions found.</td></tr>'}</tbody>
        </table>
        ${receiptHtml}
        <script>window.print && window.print();</script>
      </body>
      </html>`;
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        return res.send(html);
    }
    catch (error) {
        console.error('Error getting tax property report:', error);
        throw new errorHandler_1.AppError('Failed to get tax property report', 500);
    }
});
exports.getTaxPropertyReport = getTaxPropertyReport;
// Deposits: Get property deposit summary (currently held)
const getPropertyDepositSummary = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        const { propertyId } = req.params;
        if (!propertyId) {
            return res.status(400).json({ message: 'Property ID is required' });
        }
        const agg = yield rentalDeposit_1.RentalDeposit.aggregate([
            { $match: { propertyId: new (require('mongoose').Types.ObjectId)(propertyId) } },
            {
                $group: {
                    _id: '$type',
                    total: { $sum: '$depositAmount' }
                }
            }
        ]);
        const totalPaid = ((_a = agg.find(a => a._id === 'payment')) === null || _a === void 0 ? void 0 : _a.total) || 0;
        const totalPayout = ((_b = agg.find(a => a._id === 'payout')) === null || _b === void 0 ? void 0 : _b.total) || 0;
        const held = totalPaid - totalPayout;
        res.json({ success: true, data: { totalPaid, totalPayout, held } });
    }
    catch (error) {
        console.error('Error getting deposit summary:', error);
        res.status(500).json({ success: false, message: 'Failed to get deposit summary' });
    }
});
exports.getPropertyDepositSummary = getPropertyDepositSummary;
// Deposits: Create a deposit payout entry (reduces held balance)
const createPropertyDepositPayout = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        const { propertyId } = req.params;
        const { amount, paymentMethod, notes, recipientName } = req.body;
        if (!propertyId || !amount || amount <= 0) {
            return res.status(400).json({ success: false, message: 'Property ID and valid amount are required' });
        }
        // Get current held amount
        const agg = yield rentalDeposit_1.RentalDeposit.aggregate([
            { $match: { propertyId: new mongoose_1.default.Types.ObjectId(propertyId) } },
            { $group: { _id: '$type', total: { $sum: '$depositAmount' } } }
        ]);
        const totalPaid = ((_a = agg.find(a => a._id === 'payment')) === null || _a === void 0 ? void 0 : _a.total) || 0;
        const totalPayout = ((_b = agg.find(a => a._id === 'payout')) === null || _b === void 0 ? void 0 : _b.total) || 0;
        const held = totalPaid - totalPayout;
        if (amount > held) {
            return res.status(400).json({ success: false, message: 'Payout exceeds held deposit' });
        }
        const entry = yield rentalDeposit_1.RentalDeposit.create({
            propertyId: new mongoose_1.default.Types.ObjectId(propertyId),
            agentId: new mongoose_1.default.Types.ObjectId(req.user.userId),
            companyId: new mongoose_1.default.Types.ObjectId(req.user.companyId),
            tenantId: new mongoose_1.default.Types.ObjectId(req.body.tenantId || req.user.userId),
            depositAmount: amount,
            depositDate: new Date(),
            type: 'payout',
            referenceNumber: `DEP-PAYOUT-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`,
            notes: notes || '',
            processedBy: new mongoose_1.default.Types.ObjectId(req.user.userId),
            paymentMethod: paymentMethod || 'bank_transfer',
            recipientName: recipientName || ''
        });
        res.json({ success: true, data: entry });
    }
    catch (error) {
        console.error('Error creating deposit payout:', error);
        res.status(500).json({ success: false, message: 'Failed to create deposit payout' });
    }
});
exports.createPropertyDepositPayout = createPropertyDepositPayout;
// Deposits: Company-wide trust accounts summary (per property) with payouts
const getCompanyDepositSummaries = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const companyId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.companyId;
        if (!companyId) {
            return res.status(401).json({ success: false, message: 'Unauthorized' });
        }
        const companyObjectId = new mongoose_1.default.Types.ObjectId(companyId);
        // Aggregate totals per property by type (payment vs payout)
        const totals = yield rentalDeposit_1.RentalDeposit.aggregate([
            { $match: { companyId: companyObjectId } },
            {
                $group: {
                    _id: { propertyId: '$propertyId', type: '$type' },
                    total: { $sum: '$depositAmount' }
                }
            }
        ]);
        const perProperty = {};
        for (const row of totals) {
            const propId = String(row._id.propertyId);
            if (!perProperty[propId]) {
                perProperty[propId] = { propertyId: propId, totalPaid: 0, totalPayout: 0 };
            }
            if (row._id.type === 'payment')
                perProperty[propId].totalPaid += Number(row.total || 0);
            if (row._id.type === 'payout')
                perProperty[propId].totalPayout += Number(row.total || 0);
        }
        const propertyIds = Object.keys(perProperty).map((id) => new mongoose_1.default.Types.ObjectId(id));
        const properties = yield Property_1.Property.find({ _id: { $in: propertyIds } }, 'name address').lean();
        const propertyInfo = new Map();
        properties.forEach((p) => propertyInfo.set(String(p._id), { name: p.name, address: p.address }));
        // Fetch payouts list per property (latest first)
        const payouts = yield rentalDeposit_1.RentalDeposit.find({ companyId: companyObjectId, type: 'payout' })
            .sort({ depositDate: -1 })
            .lean();
        const payoutMap = new Map();
        payouts.forEach((p) => {
            const key = String(p.propertyId);
            const list = payoutMap.get(key) || [];
            list.push({
                amount: Number(p.depositAmount || 0),
                depositDate: p.depositDate,
                recipientName: p.recipientName,
                referenceNumber: p.referenceNumber,
                notes: p.notes
            });
            payoutMap.set(key, list);
        });
        const result = Object.values(perProperty).map((pp) => {
            const info = propertyInfo.get(pp.propertyId) || {};
            const held = (pp.totalPaid || 0) - (pp.totalPayout || 0);
            const propPayouts = (payoutMap.get(pp.propertyId) || []).slice(0, 5); // last 5 payouts
            return {
                propertyId: pp.propertyId,
                propertyName: info.name || 'Unknown Property',
                propertyAddress: info.address || '',
                totalPaid: pp.totalPaid || 0,
                totalPayout: pp.totalPayout || 0,
                held,
                payouts: propPayouts
            };
        }).sort((a, b) => b.held - a.held);
        return res.json({ success: true, data: result });
    }
    catch (error) {
        console.error('Error getting company deposit summaries:', error);
        return res.status(500).json({ success: false, message: 'Failed to get trust accounts summary' });
    }
});
exports.getCompanyDepositSummaries = getCompanyDepositSummaries;
