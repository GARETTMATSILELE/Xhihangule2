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
exports.createValuation = exports.listValuations = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const Valuation_1 = require("../models/Valuation");
const listValuations = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { companyId, agentId } = req.query;
        const filter = {};
        if (companyId && mongoose_1.default.Types.ObjectId.isValid(companyId))
            filter.companyId = new mongoose_1.default.Types.ObjectId(companyId);
        if (agentId && mongoose_1.default.Types.ObjectId.isValid(agentId))
            filter.agentId = new mongoose_1.default.Types.ObjectId(agentId);
        const items = yield Valuation_1.Valuation.find(filter).sort({ createdAt: -1 }).limit(1000).lean();
        return res.json(items);
    }
    catch (err) {
        return res.status(500).json({ status: 'error', message: (err === null || err === void 0 ? void 0 : err.message) || 'Failed to list valuations' });
    }
});
exports.listValuations = listValuations;
const createValuation = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const body = req.body || {};
        if (!body.companyId || !body.agentId || !body.propertyAddress || !body.country || !body.city || !body.category) {
            return res.status(400).json({ status: 'error', message: 'Missing required fields' });
        }
        const doc = yield Valuation_1.Valuation.create({
            companyId: body.companyId,
            agentId: body.agentId,
            propertyAddress: body.propertyAddress,
            country: body.country,
            city: body.city,
            suburb: body.suburb,
            category: body.category,
            propertyType: body.propertyType,
            bedrooms: body.bedrooms,
            bathrooms: body.bathrooms,
            landSize: body.landSize,
            zoning: body.zoning,
            amenitiesResidential: body.amenitiesResidential,
            amenitiesCommercial: body.amenitiesCommercial,
            amenitiesIndustrial: body.amenitiesIndustrial,
            outBuildings: body.outBuildings,
            staffQuarters: body.staffQuarters,
            cottage: body.cottage,
            estimatedValue: body.estimatedValue
        });
        return res.status(201).json(doc);
    }
    catch (err) {
        return res.status(500).json({ status: 'error', message: (err === null || err === void 0 ? void 0 : err.message) || 'Failed to create valuation' });
    }
});
exports.createValuation = createValuation;
