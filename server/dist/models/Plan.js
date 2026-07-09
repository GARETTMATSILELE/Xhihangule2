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
exports.Plan = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const PlanSchema = new mongoose_1.Schema({
    code: { type: String, enum: ['INDIVIDUAL', 'SME', 'ENTERPRISE'], required: true, unique: true, index: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    monthlyPrice: { type: Number, required: true, min: 0, default: 0 },
    annualPrice: { type: Number, required: true, min: 0, default: 0 },
    currency: { type: String, enum: ['USD', 'ZiG', 'ZWL'], default: 'USD' },
    limits: {
        maxUsers: { type: Number, default: null },
        maxProperties: { type: Number, default: null },
        maxTenants: { type: Number, default: null },
        maxLeases: { type: Number, default: null },
        maxStorage: { type: Number, default: null }
    },
    featureFlags: {
        maintenance: { type: Boolean, default: true },
        reports: { type: Boolean, default: true },
        accounting: { type: Boolean, default: true },
        ownersPortal: { type: Boolean, default: true },
        whatsappIntegration: { type: Boolean, default: false },
        apiAccess: { type: Boolean, default: false },
        commissionEnabled: { type: Boolean, default: true },
        agentAccounts: { type: Boolean, default: true },
        propertyAccounts: { type: Boolean, default: true }
    },
    isActive: { type: Boolean, default: true, index: true },
    createdBy: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });
exports.Plan = mongoose_1.default.model('Plan', PlanSchema, 'plans');
exports.default = exports.Plan;
