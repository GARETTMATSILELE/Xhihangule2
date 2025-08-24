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
exports.getSalesContract = exports.listSalesContracts = exports.createSalesContract = void 0;
const SalesContract_1 = require("../models/SalesContract");
const createSalesContract = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        if (!req.user)
            return res.status(401).json({ message: 'Unauthorized' });
        const companyId = req.user.companyId;
        const createdBy = req.user.userId;
        const { propertyId, manualPropertyAddress, buyerName, sellerName, currency, totalSalePrice, commissionPercent, preaPercentOfCommission, agencyPercentRemaining, agentPercentRemaining, reference } = req.body || {};
        if (!buyerName || !totalSalePrice) {
            return res.status(400).json({ message: 'buyerName and totalSalePrice are required' });
        }
        const doc = yield SalesContract_1.SalesContract.create({
            companyId,
            propertyId,
            manualPropertyAddress,
            buyerName,
            sellerName,
            currency: currency || 'USD',
            totalSalePrice,
            commissionPercent: commissionPercent !== null && commissionPercent !== void 0 ? commissionPercent : 5,
            preaPercentOfCommission: preaPercentOfCommission !== null && preaPercentOfCommission !== void 0 ? preaPercentOfCommission : 3,
            agencyPercentRemaining: agencyPercentRemaining !== null && agencyPercentRemaining !== void 0 ? agencyPercentRemaining : 50,
            agentPercentRemaining: agentPercentRemaining !== null && agentPercentRemaining !== void 0 ? agentPercentRemaining : 50,
            reference,
            createdBy
        });
        return res.status(201).json({ status: 'success', data: doc });
    }
    catch (err) {
        return res.status(500).json({ message: err.message || 'Failed to create sales contract' });
    }
});
exports.createSalesContract = createSalesContract;
const listSalesContracts = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        if (!req.user)
            return res.status(401).json({ message: 'Unauthorized' });
        const companyId = req.user.companyId;
        const { query } = req;
        const filter = { companyId };
        if (query.reference)
            filter.reference = query.reference;
        if (query.status)
            filter.status = query.status;
        const docs = yield SalesContract_1.SalesContract.find(filter).sort({ createdAt: -1 }).limit(200);
        return res.json({ status: 'success', data: docs });
    }
    catch (err) {
        return res.status(500).json({ message: err.message || 'Failed to list sales contracts' });
    }
});
exports.listSalesContracts = listSalesContracts;
const getSalesContract = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        if (!req.user)
            return res.status(401).json({ message: 'Unauthorized' });
        const companyId = req.user.companyId;
        const { id } = req.params;
        const doc = yield SalesContract_1.SalesContract.findOne({ _id: id, companyId });
        if (!doc)
            return res.status(404).json({ message: 'Sales contract not found' });
        return res.json({ status: 'success', data: doc });
    }
    catch (err) {
        return res.status(500).json({ message: err.message || 'Failed to fetch sales contract' });
    }
});
exports.getSalesContract = getSalesContract;
