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
exports.Company = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const collections_1 = require("../config/collections");
const bankAccountSchema = new mongoose_1.Schema({
    accountNumber: {
        type: String,
        required: true,
        trim: true
    },
    accountName: {
        type: String,
        required: true,
        trim: true
    },
    accountType: {
        type: String,
        enum: ['USD NOSTRO', 'ZiG'],
        required: true
    },
    bankName: {
        type: String,
        required: true,
        trim: true
    },
    branchName: {
        type: String,
        required: true,
        trim: true
    },
    branchCode: {
        type: String,
        required: true,
        trim: true
    }
});
const companySchema = new mongoose_1.Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    address: {
        type: String,
        required: true,
        trim: true
    },
    phone: {
        type: String,
        required: true,
        trim: true
    },
    email: {
        type: String,
        required: true,
        trim: true,
        lowercase: true
    },
    website: {
        type: String,
        trim: true
    },
    registrationNumber: {
        type: String,
        required: true,
        trim: true
    },
    tinNumber: {
        type: String,
        required: true,
        trim: true
    },
    vatNumber: {
        type: String,
        trim: true
    },
    ownerId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    logo: {
        type: String
    },
    isActive: {
        type: Boolean,
        default: true
    },
    subscriptionStatus: {
        type: String,
        enum: ['active', 'inactive', 'trial'],
        default: 'trial'
    },
    subscriptionEndDate: {
        type: Date
    },
    bankAccounts: {
        type: [bankAccountSchema],
        default: [],
        validate: {
            validator: function (accounts) {
                return accounts.length <= 2;
            },
            message: 'Company can have a maximum of 2 bank accounts'
        }
    },
    commissionConfig: {
        preaPercentOfTotal: {
            type: Number,
            min: 0,
            max: 1,
            default: 0.03
        },
        agentPercentOfRemaining: {
            type: Number,
            min: 0,
            max: 1,
            default: 0.6
        },
        agencyPercentOfRemaining: {
            type: Number,
            min: 0,
            max: 1,
            default: 0.4
        }
    },
    plan: {
        type: String,
        enum: ['INDIVIDUAL', 'SME', 'ENTERPRISE'],
        default: 'ENTERPRISE'
    },
    propertyLimit: {
        type: Number,
        default: null
    },
    featureFlags: {
        commissionEnabled: {
            type: Boolean,
            default: true
        },
        agentAccounts: {
            type: Boolean,
            default: true
        },
        propertyAccounts: {
            type: Boolean,
            default: true
        }
    },
    fiscalConfig: {
        enabled: { type: Boolean, default: false },
        providerName: { type: String, trim: true },
        agentName: { type: String, trim: true },
        deviceSerial: { type: String, trim: true },
        fdmsBaseUrl: { type: String, trim: true },
        apiKey: { type: String, trim: true },
        apiUsername: { type: String, trim: true },
        apiPassword: { type: String, trim: true }
    },
    // Receivables cutover month/year and opening balances
    receivablesCutover: {
        year: { type: Number, min: 1900, max: 2100 },
        month: { type: Number, min: 1, max: 12 }
    },
    rentReceivableOpeningBalance: { type: Number, default: 0, min: 0 },
    levyReceivableOpeningBalance: { type: Number, default: 0, min: 0 },
    revenue: { type: Number, default: 0, min: 0 }
}, {
    timestamps: true
});
// Ensure agent + agency percentages of remaining equal 1.0
companySchema.pre('validate', function (next) {
    // @ts-ignore
    const cfg = this.commissionConfig;
    if (cfg) {
        const sum = Number(cfg.agentPercentOfRemaining || 0) + Number(cfg.agencyPercentOfRemaining || 0);
        // allow small floating errors
        if (Math.abs(sum - 1) > 1e-6) {
            this.invalidate('commissionConfig.agencyPercentOfRemaining', 'Agent and Agency percentages of remaining must sum to 1.0');
        }
        if (cfg.preaPercentOfTotal < 0 || cfg.preaPercentOfTotal > 1) {
            this.invalidate('commissionConfig.preaPercentOfTotal', 'PREA percent must be between 0 and 1');
        }
    }
    next();
});
// Remove index definitions as they are now handled in indexes.ts
exports.Company = mongoose_1.default.model('Company', companySchema, collections_1.COLLECTIONS.COMPANIES);
exports.default = exports.Company;
