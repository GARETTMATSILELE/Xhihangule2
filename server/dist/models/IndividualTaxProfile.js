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
exports.IndividualTaxProfile = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const collections_1 = require("../config/collections");
const rentalTaxTypes_1 = require("../services/tax/rentalTaxTypes");
const IndividualTaxProfileSchema = new mongoose_1.Schema({
    companyId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Company', required: true, unique: true, index: true },
    userId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User', required: false, default: null, index: true },
    taxpayerType: { type: String, enum: rentalTaxTypes_1.TAXPAYER_TYPES, default: 'INDIVIDUAL' },
    legalName: { type: String, trim: true, required: false },
    tradingName: { type: String, trim: true, required: false },
    nationalIdOrCompanyRegistrationReference: { type: String, trim: true, required: false },
    incomeTaxRegistered: { type: Boolean, default: false },
    incomeTaxRegistrationDate: { type: Date, required: false, default: null },
    rentalTaxRegime: { type: String, enum: rentalTaxTypes_1.RENTAL_TAX_REGIMES, default: 'ACCOUNTANT_REVIEW', index: true },
    rentalTaxRegistrationDate: { type: Date, required: false, default: null },
    taxResidence: { type: String, trim: true, required: false, default: 'ZW' },
    taxYearStartMonth: { type: Number, min: 1, max: 12, default: 1 },
    accountantName: { type: String, trim: true, required: false },
    accountantContact: { type: String, trim: true, required: false },
    taxNotes: { type: String, trim: true, required: false },
    version: { type: Number, default: 1, min: 1 }
}, { timestamps: true });
exports.IndividualTaxProfile = mongoose_1.default.model('IndividualTaxProfile', IndividualTaxProfileSchema, collections_1.COLLECTIONS.INDIVIDUAL_TAX_PROFILES);
