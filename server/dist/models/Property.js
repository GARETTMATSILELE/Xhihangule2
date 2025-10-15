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
exports.Property = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const collections_1 = require("../config/collections");
const PropertySchema = new mongoose_1.Schema({
    name: {
        type: String,
        required: [true, 'Property name is required'],
        trim: true
    },
    address: {
        type: String,
        required: [true, 'Property address is required'],
        trim: true
    },
    type: {
        type: String,
        enum: {
            values: ['apartment', 'house', 'commercial', 'land'],
            message: 'Property type must be one of: apartment, house, commercial, land'
        },
        default: 'apartment'
    },
    status: {
        type: String,
        enum: {
            values: ['available', 'rented', 'maintenance', 'under_offer', 'sold'],
            message: 'Status must be one of: available, rented, maintenance, under_offer, sold'
        },
        default: 'available'
    },
    rent: {
        type: Number,
        min: [0, 'Rent cannot be negative'],
        default: 0
    },
    price: {
        type: Number,
        min: [0, 'Price cannot be negative'],
        default: 0
    },
    bedrooms: {
        type: Number,
        min: [0, 'Number of bedrooms cannot be negative'],
        default: 0
    },
    bathrooms: {
        type: Number,
        min: [0, 'Number of bathrooms cannot be negative'],
        default: 0
    },
    area: {
        type: Number,
        min: [0, 'Area cannot be negative'],
        default: 0
    },
    builtArea: {
        type: Number,
        min: [0, 'Built area cannot be negative'],
        default: 0
    },
    landArea: {
        type: Number,
        min: [0, 'Land area cannot be negative'],
        default: 0
    },
    pricePerSqm: {
        type: Number,
        min: [0, 'Price per sqm cannot be negative'],
        default: 0
    },
    description: {
        type: String,
        default: 'N/A',
        trim: true
    },
    images: [{
            type: String,
            trim: true
        }],
    amenities: [{
            type: String,
            trim: true
        }],
    companyId: {
        type: mongoose_1.default.Schema.Types.ObjectId,
        ref: 'Company',
        required: true,
        immutable: true
    },
    ownerId: {
        type: mongoose_1.default.Schema.Types.ObjectId,
        ref: 'User',
        required: [true, 'Owner ID is required'],
        immutable: true
    },
    agentId: {
        type: mongoose_1.default.Schema.Types.ObjectId,
        ref: 'User',
        required: false
    },
    propertyOwnerId: {
        type: mongoose_1.default.Schema.Types.ObjectId,
        ref: 'PropertyOwner',
        required: false
    },
    occupancyRate: {
        type: Number,
        min: [0, 'Occupancy rate cannot be negative'],
        max: [100, 'Occupancy rate cannot exceed 100%'],
        required: false
    },
    totalRentCollected: {
        type: Number,
        min: [0, 'Total rent collected cannot be negative'],
        required: false
    },
    currentArrears: {
        type: Number,
        min: [0, 'Current arrears cannot be negative'],
        required: false
    },
    nextLeaseExpiry: {
        type: Date
    },
    units: {
        type: Number,
        min: [1, 'Number of units must be at least 1'],
        required: false
    },
    occupiedUnits: {
        type: Number,
        min: [0, 'Number of occupied units cannot be negative'],
        required: false
    },
    // New fields
    rentalType: {
        type: String,
        enum: ['management', 'introduction', 'sale'],
        required: false,
    },
    commission: {
        type: Number,
        min: [0, 'Commission cannot be negative'],
        max: [100, 'Commission cannot exceed 100%'],
        default: 15
    },
    commissionPreaPercent: {
        type: Number,
        min: [0, 'PREA percent cannot be negative'],
        max: [100, 'PREA percent cannot exceed 100%'],
        default: 3
    },
    commissionAgencyPercentRemaining: {
        type: Number,
        min: [0, 'Agency percent cannot be negative'],
        max: [100, 'Agency percent cannot exceed 100%'],
        default: 50
    },
    commissionAgentPercentRemaining: {
        type: Number,
        min: [0, 'Agent percent cannot be negative'],
        max: [100, 'Agent percent cannot exceed 100%'],
        default: 50
    },
    // New fields for levy/municipal fees
    levyOrMunicipalType: {
        type: String,
        enum: ['levy', 'municipal'],
        required: false,
    },
    levyOrMunicipalAmount: {
        type: Number,
        required: false,
    },
    saleType: {
        type: String,
        enum: ['cash', 'installment'],
        required: false
    }
}, {
    timestamps: true
});
// Add indexes for common queries
PropertySchema.index({ ownerId: 1 });
PropertySchema.index({ companyId: 1 });
PropertySchema.index({ status: 1 });
exports.Property = mongoose_1.default.model('Property', PropertySchema, collections_1.COLLECTIONS.PROPERTIES);
