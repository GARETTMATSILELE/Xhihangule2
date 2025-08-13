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
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPREACommission = exports.getAgencyCommission = exports.getAgentCommissions = void 0;
const User_1 = require("../models/User");
const Lease_1 = require("../models/Lease");
const Property_1 = require("../models/Property");
const errorHandler_1 = require("../middleware/errorHandler");
const Payment_1 = require("../models/Payment"); // Added import for Payment
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
                status: 'completed'
            }).populate('propertyId', 'name address');
            // Create a map of payments by property and month/year for filtering
            const paymentMap = new Map();
            const agentCommissionMap = new Map(); // Track agent commissions by month/year
            payments.forEach(payment => {
                var _a;
                const paymentDate = new Date(payment.paymentDate);
                const month = paymentDate.getMonth();
                const year = paymentDate.getFullYear();
                const key = `${payment.propertyId.toString()}-${year}-${month}`;
                paymentMap.set(key, payment);
                // Track agent commission by month/year
                const commissionKey = `${year}-${month}`;
                const agentShare = ((_a = payment.commissionDetails) === null || _a === void 0 ? void 0 : _a.agentShare) || 0;
                if (agentCommissionMap.has(commissionKey)) {
                    agentCommissionMap.set(commissionKey, agentCommissionMap.get(commissionKey) + agentShare);
                }
                else {
                    agentCommissionMap.set(commissionKey, agentShare);
                }
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
                    const key = `${lease.propertyId.toString()}-${filterYear}-${filterMonth}`;
                    hasPayment = paymentMap.has(key);
                }
                else {
                    // Check entire year
                    const yearPayments = Array.from(paymentMap.keys()).filter(key => key.startsWith(`${lease.propertyId.toString()}-${filterYear}-`));
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
            status: 'completed'
        }).populate('propertyId', 'name address');
        for (const payment of payments) {
            const property = payment.propertyId; // Cast to access populated fields
            const agencyShare = ((_b = payment.commissionDetails) === null || _b === void 0 ? void 0 : _b.agencyShare) || 0;
            const rentalAmount = payment.amount;
            // Only include payments with agency commission
            if (agencyShare > 0) {
                const paymentDate = new Date(payment.paymentDate);
                const paymentYear = paymentDate.getFullYear();
                const paymentMonth = paymentDate.getMonth();
                const paymentWeek = getWeekOfYear(paymentDate);
                const paymentDay = paymentDate.getDate();
                // Apply filters based on filter type
                let shouldInclude = true;
                if (filterPeriod === 'yearly') {
                    shouldInclude = paymentYear === filterYear;
                }
                else if (filterPeriod === 'monthly') {
                    shouldInclude = paymentYear === filterYear && (filterMonth === null || paymentMonth === filterMonth);
                }
                else if (filterPeriod === 'weekly') {
                    shouldInclude = paymentYear === filterYear && (filterWeek === null || paymentWeek === filterWeek);
                }
                else if (filterPeriod === 'daily') {
                    shouldInclude = paymentYear === filterYear &&
                        (filterMonth === null || paymentMonth === filterMonth) &&
                        (filterDay === null || paymentDay === filterDay);
                }
                if (shouldInclude) {
                    const commissionDetail = {
                        paymentId: payment._id.toString(),
                        paymentDate: payment.paymentDate,
                        propertyId: payment.propertyId.toString(),
                        propertyName: (property === null || property === void 0 ? void 0 : property.name) || 'Unknown Property',
                        propertyAddress: (property === null || property === void 0 ? void 0 : property.address) || 'Unknown Address',
                        rentalAmount: rentalAmount,
                        agencyShare: agencyShare
                    };
                    agencyCommission.details.push(commissionDetail);
                    // Add to monthly and yearly totals if payment is in current period
                    if (paymentMonth === currentMonth && paymentYear === currentYear) {
                        agencyCommission.monthly += agencyShare;
                    }
                    if (paymentYear === currentYear) {
                        agencyCommission.yearly += agencyShare;
                    }
                    agencyCommission.total += agencyShare;
                }
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
    var _a;
    try {
        const companyId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.companyId;
        if (!companyId) {
            throw new errorHandler_1.AppError('Company ID not found', 404);
        }
        const preaCommission = {
            monthly: 0,
            yearly: 0,
            total: 0,
            details: []
        };
        const currentDate = new Date();
        const currentMonth = currentDate.getMonth();
        const currentYear = currentDate.getFullYear();
        // Get all active leases for the company
        const properties = yield Property_1.Property.find({ companyId });
        const propertyIds = properties.map(p => p._id);
        const leases = yield Lease_1.Lease.find({
            propertyId: { $in: propertyIds },
            status: 'active'
        });
        for (const lease of leases) {
            const property = properties.find(p => p._id.toString() === lease.propertyId.toString());
            if (!property)
                continue;
            const rent = lease.rentAmount;
            const commission = rent * 0.01; // 1% PREA commission
            preaCommission.details.push({
                propertyId: property._id.toString(),
                propertyName: property.name,
                rent,
                commission
            });
            // Add to monthly and yearly totals if lease is current
            if (lease.startDate.getMonth() === currentMonth && lease.startDate.getFullYear() === currentYear) {
                preaCommission.monthly += commission;
            }
            if (lease.startDate.getFullYear() === currentYear) {
                preaCommission.yearly += commission;
            }
            preaCommission.total += commission;
        }
        res.json(preaCommission);
    }
    catch (error) {
        console.error('Error getting PREA commission:', error);
        throw new errorHandler_1.AppError('Failed to get PREA commission', 500);
    }
});
exports.getPREACommission = getPREACommission;
