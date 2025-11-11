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
exports.AgentAccount = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const collections_1 = require("../config/collections");
const transactionSchema = new mongoose_1.Schema({
    type: {
        type: String,
        enum: ['commission', 'payout', 'penalty', 'adjustment'],
        required: true
    },
    amount: {
        type: Number,
        required: true
    },
    date: {
        type: Date,
        required: true,
        default: Date.now
    },
    paymentId: {
        type: mongoose_1.default.Schema.Types.ObjectId,
        ref: 'Payment'
    },
    description: {
        type: String,
        required: true
    },
    reference: {
        type: String
    },
    status: {
        type: String,
        enum: ['pending', 'completed', 'failed', 'cancelled'],
        default: 'completed'
    },
    runningBalance: {
        type: Number
    },
    notes: {
        type: String
    },
    category: {
        type: String
    }
}, { _id: true });
const agentPayoutSchema = new mongoose_1.Schema({
    amount: {
        type: Number,
        required: true
    },
    date: {
        type: Date,
        required: true,
        default: Date.now
    },
    paymentMethod: {
        type: String,
        enum: ['bank_transfer', 'cash', 'mobile_money', 'check'],
        required: true
    },
    recipientId: {
        type: String,
        required: true
    },
    recipientName: {
        type: String,
        required: true
    },
    referenceNumber: {
        type: String,
        required: true,
        unique: true
    },
    status: {
        type: String,
        enum: ['pending', 'completed', 'failed', 'cancelled'],
        default: 'pending'
    },
    notes: {
        type: String
    },
    processedBy: {
        type: mongoose_1.default.Schema.Types.ObjectId,
        ref: 'User'
    },
    processedAt: {
        type: Date
    }
}, { _id: true });
const agentAccountSchema = new mongoose_1.Schema({
    agentId: {
        type: mongoose_1.default.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        unique: true
    },
    agentName: {
        type: String
    },
    agentEmail: {
        type: String
    },
    transactions: [transactionSchema],
    agentPayouts: [agentPayoutSchema],
    runningBalance: {
        type: Number,
        default: 0
    },
    totalCommissions: {
        type: Number,
        default: 0
    },
    totalPayouts: {
        type: Number,
        default: 0
    },
    totalPenalties: {
        type: Number,
        default: 0
    },
    lastCommissionDate: {
        type: Date
    },
    lastPayoutDate: {
        type: Date
    },
    lastPenaltyDate: {
        type: Date
    },
    isActive: {
        type: Boolean,
        default: true
    },
    lastUpdated: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});
// Index for efficient queries
agentAccountSchema.index({ agentId: 1 });
agentAccountSchema.index({ 'transactions.date': -1 });
agentAccountSchema.index({ 'agentPayouts.date': -1 });
agentAccountSchema.index({ 'transactions.paymentId': 1 });
// Enforce no duplicate commission reference per agent
agentAccountSchema.index({ agentId: 1, 'transactions.type': 1, 'transactions.reference': 1 }, {
    unique: true,
    partialFilterExpression: {
        'transactions.type': 'commission',
        'transactions.reference': { $exists: true, $type: 'string', $ne: '' }
    }
});
exports.AgentAccount = mongoose_1.default.model('AgentAccount', agentAccountSchema, collections_1.COLLECTIONS.AGENT_ACCOUNTS);
