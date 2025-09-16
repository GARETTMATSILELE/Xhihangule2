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
exports.createPropertyDepositPayout = exports.getPropertyDepositSummary = exports.getPropertyDepositLedger = exports.getPREACommission = exports.getAgencyCommission = exports.getAgentCommissions = void 0;
const User_1 = require("../models/User");
const Lease_1 = require("../models/Lease");
const errorHandler_1 = require("../middleware/errorHandler");
const Payment_1 = require("../models/Payment"); // Added import for Payment
const rentalDeposit_1 = require("../models/rentalDeposit");
const mongoose_1 = __importDefault(require("mongoose"));
// Helper function to get week of year
const getWeekOfYear = (date) => {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
};
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
        // Get all agents for the company
        const agents = yield User_1.User.find({ companyId, role: 'agent' });
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
                    const propKey = (payment === null || payment === void 0 ? void 0 : payment.propertyId) ? payment.propertyId.toString() : String(payment.propertyId || 'unknown');
                    const key = `${propKey}-${year}-${month}`;
                    paymentMap.set(key, true);
                    const commissionKey = `${year}-${month}`;
                    if (agentCommissionMap.has(commissionKey)) {
                        agentCommissionMap.set(commissionKey, agentCommissionMap.get(commissionKey) + perMonthAgentShare);
                    }
                    else {
                        agentCommissionMap.set(commissionKey, perMonthAgentShare);
                    }
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
            if (propertyMap.has(key)) {
                const agg = propertyMap.get(key);
                agg.commission += preaFee;
                agg.rent = rentAmount || agg.rent;
            }
            else {
                propertyMap.set(key, { propertyId: key, propertyName: name, rent: rentAmount, commission: preaFee });
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
