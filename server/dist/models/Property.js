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
            values: ['apartment', 'house', 'commercial'],
            message: 'Property type must be one of: apartment, house, commercial'
        },
        default: 'apartment'
    },
    status: {
        type: String,
        enum: {
            values: ['available', 'rented', 'maintenance'],
            message: 'Status must be one of: available, rented, maintenance'
        },
        default: 'available'
    },
    rent: {
        type: Number,
        min: [0, 'Rent cannot be negative'],
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
        required: true
    },
    ownerId: {
        type: mongoose_1.default.Schema.Types.ObjectId,
        ref: 'User',
        required: [true, 'Owner ID is required']
    },
    occupancyRate: {
        type: Number,
        min: [0, 'Occupancy rate cannot be negative'],
        max: [100, 'Occupancy rate cannot exceed 100%'],
        default: 0
    },
    totalRentCollected: {
        type: Number,
        min: [0, 'Total rent collected cannot be negative'],
        default: 0
    },
    currentArrears: {
        type: Number,
        min: [0, 'Current arrears cannot be negative'],
        default: 0
    },
    nextLeaseExpiry: {
        type: Date
    },
    units: {
        type: Number,
        min: [1, 'Number of units must be at least 1'],
        default: 1
    },
    occupiedUnits: {
        type: Number,
        min: [0, 'Number of occupied units cannot be negative'],
        default: 0
    }
}, {
    timestamps: true
});
// Add indexes for common queries
PropertySchema.index({ ownerId: 1 });
PropertySchema.index({ companyId: 1 });
PropertySchema.index({ status: 1 });
exports.Property = mongoose_1.default.model('Property', PropertySchema, collections_1.COLLECTIONS.PROPERTIES);
