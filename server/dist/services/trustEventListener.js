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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.stopTrustEventListener = exports.startTrustEventListener = void 0;
const eventBus_1 = require("../events/eventBus");
const trustPaymentPostingService_1 = __importDefault(require("./trustPaymentPostingService"));
const trustEventRetryService_1 = __importDefault(require("./trustEventRetryService"));
const EventDedupRecord_1 = require("../models/EventDedupRecord");
let unsubscribePaymentConfirmed = null;
let unsubscribePaymentReversed = null;
let started = false;
const startTrustEventListener = () => {
    if (started)
        return;
    started = true;
    unsubscribePaymentConfirmed = (0, eventBus_1.subscribe)('payment.confirmed', (payload) => __awaiter(void 0, void 0, void 0, function* () {
        var _a;
        try {
            const eventId = String((payload === null || payload === void 0 ? void 0 : payload.eventId) || `payment.confirmed:${String((payload === null || payload === void 0 ? void 0 : payload.paymentId) || '')}`);
            const existingProcessed = yield EventDedupRecord_1.EventDedupRecord.findOne({
                scope: 'trust-payment-confirmed-listener',
                eventId,
                status: 'processed'
            }).lean();
            if (existingProcessed)
                return;
            const result = yield trustPaymentPostingService_1.default.postBuyerPaymentToTrust(Object.assign(Object.assign({}, payload), { sourceEvent: 'payment.confirmed' }));
            yield EventDedupRecord_1.EventDedupRecord.updateOne({ scope: 'trust-payment-confirmed-listener', eventId }, {
                $set: {
                    status: 'processed',
                    companyId: (payload === null || payload === void 0 ? void 0 : payload.companyId) || undefined,
                    processedAt: new Date(),
                    lastError: ''
                }
            }, { upsert: true });
            try {
                const { getIo } = yield Promise.resolve().then(() => __importStar(require('../config/socket')));
                const io = getIo();
                if (io) {
                    const trustAccountId = String(((_a = result === null || result === void 0 ? void 0 : result.account) === null || _a === void 0 ? void 0 : _a._id) || '');
                    const data = { trustAccountId, event: 'payment.confirmed', timestamp: new Date().toISOString() };
                    io.to(`company-${String((payload === null || payload === void 0 ? void 0 : payload.companyId) || '')}`).emit('trust.updated', data);
                    io.to(`company-${String((payload === null || payload === void 0 ? void 0 : payload.companyId) || '')}`).emit('trustAccountUpdated', data);
                }
            }
            catch (_b) {
                // non-fatal
            }
        }
        catch (error) {
            console.error('payment.confirmed handling failed:', error);
            const eventId = String((payload === null || payload === void 0 ? void 0 : payload.eventId) || `payment.confirmed:${String((payload === null || payload === void 0 ? void 0 : payload.paymentId) || '')}`);
            yield EventDedupRecord_1.EventDedupRecord.updateOne({ scope: 'trust-payment-confirmed-listener', eventId }, { $set: { status: 'failed', companyId: (payload === null || payload === void 0 ? void 0 : payload.companyId) || undefined, lastError: (error === null || error === void 0 ? void 0 : error.message) || 'listener failed' } }, { upsert: true });
            yield trustEventRetryService_1.default.enqueueFailure('payment.confirmed', payload, (error === null || error === void 0 ? void 0 : error.message) || 'Listener failure', payload === null || payload === void 0 ? void 0 : payload.companyId);
        }
    }));
    unsubscribePaymentReversed = (0, eventBus_1.subscribe)('payment.reversed', (payload) => __awaiter(void 0, void 0, void 0, function* () {
        var _a;
        try {
            const eventId = String((payload === null || payload === void 0 ? void 0 : payload.eventId) || `payment.reversed:${String((payload === null || payload === void 0 ? void 0 : payload.paymentId) || '')}`);
            const existingProcessed = yield EventDedupRecord_1.EventDedupRecord.findOne({
                scope: 'trust-payment-reversed-listener',
                eventId,
                status: 'processed'
            }).lean();
            if (existingProcessed)
                return;
            const result = yield trustPaymentPostingService_1.default.reverseBuyerPaymentInTrust(Object.assign(Object.assign({}, payload), { sourceEvent: 'payment.reversed' }));
            yield EventDedupRecord_1.EventDedupRecord.updateOne({ scope: 'trust-payment-reversed-listener', eventId }, {
                $set: {
                    status: 'processed',
                    companyId: (payload === null || payload === void 0 ? void 0 : payload.companyId) || undefined,
                    processedAt: new Date(),
                    lastError: ''
                }
            }, { upsert: true });
            try {
                const { getIo } = yield Promise.resolve().then(() => __importStar(require('../config/socket')));
                const io = getIo();
                if (io) {
                    const trustAccountId = String(((_a = result === null || result === void 0 ? void 0 : result.account) === null || _a === void 0 ? void 0 : _a._id) || '');
                    const data = {
                        trustAccountId,
                        event: 'payment.reversed',
                        paymentId: String((payload === null || payload === void 0 ? void 0 : payload.paymentId) || ''),
                        timestamp: new Date().toISOString()
                    };
                    io.to(`company-${String((payload === null || payload === void 0 ? void 0 : payload.companyId) || '')}`).emit('trust.updated', data);
                    io.to(`company-${String((payload === null || payload === void 0 ? void 0 : payload.companyId) || '')}`).emit('trustAccountUpdated', data);
                }
            }
            catch (_b) {
                // non-fatal
            }
        }
        catch (error) {
            const eventId = String((payload === null || payload === void 0 ? void 0 : payload.eventId) || `payment.reversed:${String((payload === null || payload === void 0 ? void 0 : payload.paymentId) || '')}`);
            yield EventDedupRecord_1.EventDedupRecord.updateOne({ scope: 'trust-payment-reversed-listener', eventId }, { $set: { status: 'failed', companyId: (payload === null || payload === void 0 ? void 0 : payload.companyId) || undefined, lastError: (error === null || error === void 0 ? void 0 : error.message) || 'listener failed' } }, { upsert: true });
            yield trustEventRetryService_1.default.enqueueFailure('payment.reversed', payload, (error === null || error === void 0 ? void 0 : error.message) || 'Listener failure', payload === null || payload === void 0 ? void 0 : payload.companyId);
        }
    }));
    trustEventRetryService_1.default.start();
};
exports.startTrustEventListener = startTrustEventListener;
const stopTrustEventListener = () => {
    if (unsubscribePaymentConfirmed) {
        unsubscribePaymentConfirmed();
        unsubscribePaymentConfirmed = null;
    }
    if (unsubscribePaymentReversed) {
        unsubscribePaymentReversed();
        unsubscribePaymentReversed = null;
    }
    trustEventRetryService_1.default.stop();
    started = false;
};
exports.stopTrustEventListener = stopTrustEventListener;
exports.default = {
    startTrustEventListener: exports.startTrustEventListener,
    stopTrustEventListener: exports.stopTrustEventListener
};
