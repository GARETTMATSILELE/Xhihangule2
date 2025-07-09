"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CommissionService = void 0;
const errorHandler_1 = require("../middleware/errorHandler");
const RATES = {
    residential: {
        totalCommission: 0.10, // 10%
        preaFee: 0.02, // 2%
        agentShare: 0.05, // 5%
        agencyShare: 0.03, // 3%
    },
    commercial: {
        totalCommission: 0.15, // 15%
        preaFee: 0.03, // 3%
        agentShare: 0.07, // 7%
        agencyShare: 0.05, // 5%
    }
};
class CommissionService {
    constructor() { }
    static getInstance() {
        if (!CommissionService.instance) {
            CommissionService.instance = new CommissionService();
        }
        return CommissionService.instance;
    }
    calculateCommission(amount, propertyType) {
        if (amount <= 0) {
            throw new errorHandler_1.AppError('Amount must be greater than 0', 400, 'INVALID_AMOUNT');
        }
        const rate = RATES[propertyType.toLowerCase()];
        if (!rate) {
            throw new errorHandler_1.AppError('Invalid property type', 400, 'INVALID_PROPERTY_TYPE');
        }
        return {
            totalCommission: amount * rate.totalCommission,
            preaFee: amount * rate.preaFee,
            agentShare: amount * rate.agentShare,
            agencyShare: amount * rate.agencyShare,
            ownerAmount: amount * (1 - rate.totalCommission)
        };
    }
    getRates(propertyType) {
        const rate = RATES[propertyType.toLowerCase()];
        if (!rate) {
            throw new errorHandler_1.AppError('Invalid property type', 400, 'INVALID_PROPERTY_TYPE');
        }
        return Object.assign({}, rate);
    }
}
exports.CommissionService = CommissionService;
