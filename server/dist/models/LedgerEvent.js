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
exports.LedgerEvent = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const LedgerEventSchema = new mongoose_1.Schema({
    type: { type: String, enum: ['owner_income'], required: true },
    paymentId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Payment', required: true },
    status: { type: String, enum: ['pending', 'processing', 'failed', 'completed'], default: 'pending', index: true },
    attemptCount: { type: Number, default: 0 },
    nextAttemptAt: { type: Date, default: () => new Date() },
    lastError: { type: String, default: undefined }
}, { timestamps: true });
// Helpful index to pick work
LedgerEventSchema.index({ status: 1, nextAttemptAt: 1, createdAt: 1 });
// Idempotency guard so we don't pile up events for the same payment/type in non-completed states
LedgerEventSchema.index({ type: 1, paymentId: 1, status: 1 });
exports.LedgerEvent = mongoose_1.default.models.LedgerEvent || mongoose_1.default.model('LedgerEvent', LedgerEventSchema);
exports.default = exports.LedgerEvent;
