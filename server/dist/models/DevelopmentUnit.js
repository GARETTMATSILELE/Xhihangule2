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
exports.DevelopmentUnit = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const collections_1 = require("../config/collections");
const DevelopmentUnitSchema = new mongoose_1.Schema({
    developmentId: {
        type: mongoose_1.default.Schema.Types.ObjectId,
        ref: 'Development',
        required: true,
        index: true
    },
    variationId: { type: String, required: true, index: true },
    status: { type: String, enum: ['available', 'under_offer', 'sold'], default: 'available', index: true },
    unitNumber: { type: Number, required: true, min: [1, 'Unit number must be >= 1'] },
    unitCode: { type: String, trim: true },
    price: { type: Number, min: [0, 'Price cannot be negative'] },
    buyerId: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'Buyer' },
    buyerName: { type: String, trim: true },
    collaborators: [{ type: mongoose_1.default.Schema.Types.ObjectId, ref: 'User', default: [] }],
    meta: {
        block: { type: String, trim: true },
        floor: { type: String, trim: true },
        bedrooms: { type: Number, min: 0 },
        bathrooms: { type: Number, min: 0 },
        standSize: { type: Number, min: 0 }
    },
    statusHistory: [{
            from: { type: String, enum: ['available', 'under_offer', 'sold'] },
            to: { type: String, enum: ['available', 'under_offer', 'sold'], required: true },
            at: { type: Date, default: Date.now },
            by: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'User' }
        }],
    reservedBy: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'User' },
    reservedAt: { type: Date },
    reservationExpiresAt: { type: Date },
    soldAt: { type: Date },
    dealId: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'Deal' },
    soldByAgentId: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'User' }
}, {
    timestamps: true
});
DevelopmentUnitSchema.index({ developmentId: 1, status: 1 });
DevelopmentUnitSchema.index({ developmentId: 1, variationId: 1 });
DevelopmentUnitSchema.index({ developmentId: 1, variationId: 1, unitNumber: 1 }, { unique: true });
DevelopmentUnitSchema.index({ collaborators: 1 });
exports.DevelopmentUnit = mongoose_1.default.model('DevelopmentUnit', DevelopmentUnitSchema, collections_1.COLLECTIONS.DEVELOPMENT_UNITS);
