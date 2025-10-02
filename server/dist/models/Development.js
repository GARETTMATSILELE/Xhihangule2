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
exports.Development = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const collections_1 = require("../config/collections");
const DevelopmentSchema = new mongoose_1.Schema({
    name: {
        type: String,
        required: [true, 'Development name is required'],
        trim: true
    },
    type: {
        type: String,
        enum: {
            values: ['stands', 'apartments', 'houses', 'semidetached', 'townhouses'],
            message: 'Type must be one of: stands, apartments, houses, semidetached, townhouses'
        },
        required: true,
        index: true
    },
    description: {
        type: String,
        trim: true
    },
    companyId: {
        type: mongoose_1.default.Schema.Types.ObjectId,
        ref: 'Company',
        required: true,
        index: true
    },
    owner: {
        firstName: { type: String, trim: true },
        lastName: { type: String, trim: true },
        companyName: { type: String, trim: true },
        email: { type: String, trim: true },
        idNumber: { type: String, trim: true },
        phone: { type: String, trim: true }
    },
    variations: [{
            id: { type: String, required: true },
            label: { type: String, required: true, trim: true },
            count: { type: Number, required: true, min: [1, 'Count must be at least 1'] },
            price: { type: Number, min: [0, 'Price cannot be negative'] },
            size: { type: Number, min: [0, 'Size cannot be negative'] }
        }],
    cachedStats: {
        totalUnits: { type: Number, default: 0, min: 0 },
        availableUnits: { type: Number, default: 0, min: 0 },
        underOfferUnits: { type: Number, default: 0, min: 0 },
        soldUnits: { type: Number, default: 0, min: 0 }
    },
    createdBy: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'User' }
}, {
    timestamps: true
});
DevelopmentSchema.index({ companyId: 1 });
DevelopmentSchema.index({ name: 'text' });
exports.Development = mongoose_1.default.model('Development', DevelopmentSchema, collections_1.COLLECTIONS.DEVELOPMENTS);
