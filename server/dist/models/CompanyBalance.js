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
exports.CompanyBalance = exports.getCompanyBalanceId = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const collections_1 = require("../config/collections");
const CompanyBalanceSchema = new mongoose_1.Schema({
    _id: { type: String, required: true },
    companyId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Company', required: true, unique: true },
    totalRevenue: { type: Number, default: 0 },
    totalExpenses: { type: Number, default: 0 },
    netProfit: { type: Number, default: 0 },
    vatPayable: { type: Number, default: 0 },
    commissionLiability: { type: Number, default: 0 },
    lastUpdated: { type: Date, default: Date.now }
}, { versionKey: false });
CompanyBalanceSchema.index({ companyId: 1 }, { unique: true });
CompanyBalanceSchema.index({ lastUpdated: -1 });
const getCompanyBalanceId = (companyId) => `${companyId}:company_financials`;
exports.getCompanyBalanceId = getCompanyBalanceId;
exports.CompanyBalance = mongoose_1.default.model('CompanyBalance', CompanyBalanceSchema, collections_1.COLLECTIONS.COMPANY_BALANCES);
