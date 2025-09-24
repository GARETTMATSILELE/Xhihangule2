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
Object.defineProperty(exports, "__esModule", { value: true });
exports.Valuation = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const collections_1 = require("../config/collections");
const ValuationSchema = new mongoose_1.Schema({
    companyId: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    agentId: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    propertyAddress: { type: String, required: true, trim: true },
    country: { type: String, required: true, trim: true },
    city: { type: String, required: true, trim: true, index: true },
    suburb: { type: String, required: false, trim: true, index: true },
    category: { type: String, enum: ['residential', 'commercial_office', 'industrial'], required: true, index: true },
    propertyType: { type: String, enum: ['townhouse', 'house', 'apartment', 'cluster', 'semidetached'], required: false },
    bedrooms: { type: Number, min: 0 },
    bathrooms: { type: Number, min: 0 },
    landSize: { type: Number, min: 0 },
    zoning: { type: String, trim: true },
    amenitiesResidential: [{ type: String, trim: true }],
    amenitiesCommercial: [{ type: String, trim: true }],
    amenitiesIndustrial: [{ type: String, trim: true }],
    outBuildings: { type: Boolean, default: false },
    staffQuarters: { type: Boolean, default: false },
    cottage: { type: Boolean, default: false },
    estimatedValue: { type: Number, min: 0 }
}, { timestamps: true });
exports.Valuation = mongoose_1.default.model('Valuation', ValuationSchema, collections_1.COLLECTIONS.VALUATIONS);
