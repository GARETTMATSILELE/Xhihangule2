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
const getAgentCommissions = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        console.log('Getting agent commissions for company:', (_a = req.user) === null || _a === void 0 ? void 0 : _a.companyId);
        const companyId = (_b = req.user) === null || _b === void 0 ? void 0 : _b.companyId;
        if (!companyId) {
            throw new errorHandler_1.AppError('Company ID not found', 404);
        }
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
                properties: []
            };
            // Get all active leases for properties managed by this agent
            const properties = yield Property_1.Property.find({ agentId: agent._id });
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
                const commission = rent * 0.1; // 10% commission
                agentDetails.properties.push({
                    propertyId: property._id.toString(),
                    propertyName: property.name,
                    rent,
                    commission
                });
                agentDetails.commission += commission;
                // Add to monthly and yearly totals if lease is current
                if (lease.startDate.getMonth() === currentMonth && lease.startDate.getFullYear() === currentYear) {
                    commissionData.monthly += commission;
                }
                if (lease.startDate.getFullYear() === currentYear) {
                    commissionData.yearly += commission;
                }
                commissionData.total += commission;
            }
            commissionData.details.push(agentDetails);
        }
        console.log('Agent commissions data:', JSON.stringify(commissionData, null, 2));
        res.json(commissionData);
    }
    catch (error) {
        console.error('Error getting agent commissions:', error);
        throw new errorHandler_1.AppError('Failed to get agent commissions', 500);
    }
});
exports.getAgentCommissions = getAgentCommissions;
const getAgencyCommission = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c;
    try {
        console.log('Getting agency commission for company:', (_a = req.user) === null || _a === void 0 ? void 0 : _a.companyId);
        const companyId = (_b = req.user) === null || _b === void 0 ? void 0 : _b.companyId;
        if (!companyId) {
            throw new errorHandler_1.AppError('Company ID not found', 404);
        }
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
            const agencyShare = ((_c = payment.commissionDetails) === null || _c === void 0 ? void 0 : _c.agencyShare) || 0;
            const rentalAmount = payment.amount;
            // Only include payments with agency commission
            if (agencyShare > 0) {
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
                if (payment.paymentDate.getMonth() === currentMonth && payment.paymentDate.getFullYear() === currentYear) {
                    agencyCommission.monthly += agencyShare;
                }
                if (payment.paymentDate.getFullYear() === currentYear) {
                    agencyCommission.yearly += agencyShare;
                }
                agencyCommission.total += agencyShare;
            }
        }
        // Sort details by payment date (most recent first)
        agencyCommission.details.sort((a, b) => new Date(b.paymentDate).getTime() - new Date(a.paymentDate).getTime());
        console.log('Agency commission data:', JSON.stringify(agencyCommission, null, 2));
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
        console.log('Getting PREA commission for company:', (_a = req.user) === null || _a === void 0 ? void 0 : _a.companyId);
        const companyId = (_b = req.user) === null || _b === void 0 ? void 0 : _b.companyId;
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
        console.log('PREA commission data:', JSON.stringify(preaCommission, null, 2));
        res.json(preaCommission);
    }
    catch (error) {
        console.error('Error getting PREA commission:', error);
        throw new errorHandler_1.AppError('Failed to get PREA commission', 500);
    }
});
exports.getPREACommission = getPREACommission;
