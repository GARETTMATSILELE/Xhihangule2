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
exports.TrustEventFailureLog = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const collections_1 = require("../config/collections");
const TrustEventFailureLogSchema = new mongoose_1.Schema({
    companyId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Company', required: false, index: true },
    eventName: { type: String, required: true, index: true },
    payload: { type: mongoose_1.Schema.Types.Mixed, required: true },
    errorMessage: { type: String, required: true },
    attempts: { type: Number, required: true, default: 1, min: 1 },
    status: { type: String, enum: ['pending', 'resolved', 'dead'], default: 'pending', index: true },
    nextRetryAt: { type: Date, required: true, index: true },
    lastTriedAt: { type: Date, required: false }
}, { timestamps: true });
TrustEventFailureLogSchema.index({ status: 1, nextRetryAt: 1 });
TrustEventFailureLogSchema.index({ eventName: 1, createdAt: -1 });
exports.TrustEventFailureLog = mongoose_1.default.model('TrustEventFailureLog', TrustEventFailureLogSchema, collections_1.COLLECTIONS.TRUST_EVENT_FAILURE_LOGS);
