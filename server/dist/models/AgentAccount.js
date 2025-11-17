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
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
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
// Prevent duplicate paymentId-backed entries per agent (commission lane)
agentAccountSchema.index({ agentId: 1, 'transactions.paymentId': 1, 'transactions.type': 1 }, {
    unique: true,
    sparse: true,
    partialFilterExpression: {
        'transactions.type': 'commission',
        'transactions.paymentId': { $exists: true }
    }
});
// Immutability guard for update operations
function isIllegalAgentLedgerMutation(update) {
    const illegalSetters = ['$set', '$unset', '$inc'];
    const illegalRemovers = ['$pull', '$pullAll', '$pop'];
    const allowedAppends = ['$push', '$addToSet'];
    const rootArrays = ['transactions', 'agentPayouts'];
    const startsWithAny = (k) => rootArrays.some(p => k === p || k.startsWith(`${p}.`) || k.startsWith(`${p}.$`));
    for (const op of illegalSetters) {
        const payload = update[op];
        if (!payload)
            continue;
        for (const path of Object.keys(payload)) {
            if (startsWithAny(path))
                return true;
        }
    }
    for (const op of illegalRemovers) {
        const payload = update[op];
        if (!payload)
            continue;
        for (const path of Object.keys(payload)) {
            if (startsWithAny(path))
                return true;
        }
    }
    for (const op of allowedAppends) {
        const payload = update[op];
        if (!payload)
            continue;
        for (const path of Object.keys(payload)) {
            if (!rootArrays.includes(path))
                return true;
        }
    }
    return false;
}
agentAccountSchema.pre(['updateOne', 'updateMany', 'findOneAndUpdate'], function (next) {
    var _a, _b;
    try {
        const update = ((_b = (_a = this).getUpdate) === null || _b === void 0 ? void 0 : _b.call(_a)) || {};
        if (isIllegalAgentLedgerMutation(update)) {
            return next(new Error('AgentAccount ledger is immutable. Use correction entries; do not mutate or delete history.'));
        }
        return next();
    }
    catch (e) {
        return next(e);
    }
});
// Prevent deletion of agent ledgers that contain any history
function guardAgentAccountDeletion(next) {
    return __awaiter(this, void 0, void 0, function* () {
        // Tight policy: agent account ledgers are never deletable
        return next(new Error('Deletion of AgentAccount ledgers is disabled. Ledgers are permanent.'));
    });
}
agentAccountSchema.pre('deleteOne', { document: true, query: false }, guardAgentAccountDeletion);
agentAccountSchema.pre('deleteOne', guardAgentAccountDeletion);
agentAccountSchema.pre('deleteMany', guardAgentAccountDeletion);
agentAccountSchema.pre('findOneAndDelete', guardAgentAccountDeletion);
exports.AgentAccount = mongoose_1.default.model('AgentAccount', agentAccountSchema, collections_1.COLLECTIONS.AGENT_ACCOUNTS);
