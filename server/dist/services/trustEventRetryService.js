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
const TrustEventFailureLog_1 = require("../models/TrustEventFailureLog");
const trustPaymentPostingService_1 = __importDefault(require("./trustPaymentPostingService"));
const MAX_ATTEMPTS = 5;
const PROCESS_INTERVAL_MS = 60000;
class TrustEventRetryService {
    constructor() {
        this.timer = null;
        this.started = false;
    }
    calcNextRetry(attempts) {
        const backoffMinutes = Math.min(60, Math.pow(2, Math.max(0, attempts - 1)));
        return new Date(Date.now() + backoffMinutes * 60000);
    }
    enqueueFailure(eventName, payload, errorMessage, companyId) {
        return __awaiter(this, void 0, void 0, function* () {
            yield TrustEventFailureLog_1.TrustEventFailureLog.create({
                companyId,
                eventName,
                payload,
                errorMessage,
                attempts: 1,
                status: 'pending',
                nextRetryAt: this.calcNextRetry(1),
                lastTriedAt: new Date()
            });
        });
    }
    processPending() {
        return __awaiter(this, void 0, void 0, function* () {
            const now = new Date();
            const jobs = yield TrustEventFailureLog_1.TrustEventFailureLog.find({
                status: 'pending',
                nextRetryAt: { $lte: now }
            })
                .sort({ nextRetryAt: 1 })
                .limit(50);
            for (const job of jobs) {
                try {
                    if (job.eventName === 'payment.confirmed') {
                        yield trustPaymentPostingService_1.default.postBuyerPaymentToTrust(job.payload);
                    }
                    else if (job.eventName === 'payment.reversed') {
                        yield trustPaymentPostingService_1.default.reverseBuyerPaymentInTrust(job.payload);
                    }
                    job.status = 'resolved';
                    job.errorMessage = '';
                    job.lastTriedAt = new Date();
                    yield job.save();
                }
                catch (error) {
                    const nextAttempts = Number(job.attempts || 1) + 1;
                    job.attempts = nextAttempts;
                    job.errorMessage = (error === null || error === void 0 ? void 0 : error.message) || 'Retry failed';
                    job.lastTriedAt = new Date();
                    if (nextAttempts >= MAX_ATTEMPTS) {
                        job.status = 'dead';
                    }
                    else {
                        job.status = 'pending';
                        job.nextRetryAt = this.calcNextRetry(nextAttempts);
                    }
                    yield job.save();
                }
            }
        });
    }
    start() {
        if (this.started)
            return;
        this.started = true;
        this.timer = setInterval(() => {
            void this.processPending();
        }, PROCESS_INTERVAL_MS);
    }
    stop() {
        this.started = false;
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
    }
}
exports.default = new TrustEventRetryService();
