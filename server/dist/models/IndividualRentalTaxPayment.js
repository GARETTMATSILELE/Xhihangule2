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
exports.IndividualRentalTaxPayment = exports.RENTAL_TAX_PAYMENT_STATUSES = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const collections_1 = require("../config/collections");
exports.RENTAL_TAX_PAYMENT_STATUSES = ['POSTED', 'REVERSED'];
const IndividualRentalTaxPaymentSchema = new mongoose_1.Schema({
    companyId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Company', required: true, index: true, immutable: true },
    ownerId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    propertyId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Property', default: null, index: true },
    taxPeriodId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'TaxPeriod', default: null, index: true },
    taxPeriodKey: { type: String, required: true, index: true },
    taxType: { type: String, enum: ['PRESUMPTIVE_RENTAL_INCOME_TAX'], default: 'PRESUMPTIVE_RENTAL_INCOME_TAX', required: true },
    amount: { type: Number, required: true, min: 0.01 },
    currency: { type: String, default: 'USD' },
    paymentDate: { type: Date, required: true },
    paymentMethod: { type: String, default: null, trim: true },
    paymentReference: { type: String, default: null, trim: true },
    zimraReference: { type: String, default: null, trim: true },
    documentId: { type: String, default: null, trim: true },
    notes: { type: String, default: null, trim: true },
    status: { type: String, enum: exports.RENTAL_TAX_PAYMENT_STATUSES, default: 'POSTED', index: true },
    recordedBy: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User', default: null }
}, { timestamps: true });
IndividualRentalTaxPaymentSchema.index({ companyId: 1, taxPeriodKey: 1, paymentDate: -1 });
IndividualRentalTaxPaymentSchema.index({ companyId: 1, taxPeriodId: 1, status: 1 });
exports.IndividualRentalTaxPayment = mongoose_1.default.model('IndividualRentalTaxPayment', IndividualRentalTaxPaymentSchema, collections_1.COLLECTIONS.INDIVIDUAL_RENTAL_TAX_PAYMENTS);
