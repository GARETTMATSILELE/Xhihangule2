"use strict";
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
const mongoose_1 = __importDefault(require("mongoose"));
const logger_1 = require("../utils/logger");
const LedgerEvent_1 = __importDefault(require("../models/LedgerEvent"));
const propertyAccountService_1 = __importDefault(require("./propertyAccountService"));
class LedgerEventService {
    constructor() {
        this.processing = false;
    }
    static getInstance() {
        if (!LedgerEventService.instance) {
            LedgerEventService.instance = new LedgerEventService();
        }
        return LedgerEventService.instance;
    }
    enqueueOwnerIncomeEvent(paymentId) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const pid = new mongoose_1.default.Types.ObjectId(paymentId);
                // Upsert a pending event only if there isn't already one pending/processing
                const existing = yield LedgerEvent_1.default.findOne({
                    type: 'owner_income',
                    paymentId: pid,
                    status: { $in: ['pending', 'processing', 'failed'] }
                }).lean();
                if (existing)
                    return;
                yield LedgerEvent_1.default.create({
                    type: 'owner_income',
                    paymentId: pid,
                    status: 'pending',
                    attemptCount: 0,
                    nextAttemptAt: new Date()
                });
            }
            catch (e) {
                logger_1.logger.warn('Failed to enqueue owner income event:', (e === null || e === void 0 ? void 0 : e.message) || e);
            }
        });
    }
    computeNextBackoffMs(attempt) {
        // Exponential backoff with jitter: base 5s, cap 10m
        const base = 5000; // 5 seconds
        const cap = 10 * 60 * 1000; // 10 minutes
        const exp = Math.min(cap, base * Math.pow(2, Math.max(0, attempt - 1)));
        const jitter = Math.floor(Math.random() * Math.min(3000, exp * 0.2));
        return exp + jitter;
    }
    processPending() {
        return __awaiter(this, arguments, void 0, function* (limit = 50) {
            if (this.processing)
                return;
            this.processing = true;
            try {
                const now = new Date();
                const items = yield LedgerEvent_1.default.find({
                    status: { $in: ['pending', 'failed'] },
                    nextAttemptAt: { $lte: now }
                }).sort({ createdAt: 1 }).limit(limit);
                for (const ev of items) {
                    try {
                        // Mark processing to avoid double work in concurrent runners
                        ev.status = 'processing';
                        ev.updatedAt = new Date();
                        yield ev.save();
                        yield propertyAccountService_1.default.recordIncomeFromPayment(ev.paymentId.toString());
                        ev.status = 'completed';
                        ev.lastError = undefined;
                        ev.updatedAt = new Date();
                        yield ev.save();
                    }
                    catch (err) {
                        const attempts = (ev.attemptCount || 0) + 1;
                        ev.attemptCount = attempts;
                        ev.status = 'failed';
                        ev.lastError = (err === null || err === void 0 ? void 0 : err.message) ? String(err.message) : String(err);
                        const backoffMs = this.computeNextBackoffMs(attempts);
                        ev.nextAttemptAt = new Date(Date.now() + backoffMs);
                        ev.updatedAt = new Date();
                        yield ev.save();
                        logger_1.logger.warn(`LedgerEvent ${ev._id} failed (attempt ${attempts}), next try in ${Math.round(backoffMs / 1000)}s:`, ev.lastError);
                    }
                }
            }
            catch (outer) {
                logger_1.logger.error('LedgerEvent processing loop failed:', outer);
            }
            finally {
                this.processing = false;
            }
        });
    }
}
exports.default = LedgerEventService.getInstance();
