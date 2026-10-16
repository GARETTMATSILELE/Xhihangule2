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
Object.defineProperty(exports, "__esModule", { value: true });
exports.logStuckRegistrationCheckouts = logStuckRegistrationCheckouts;
const PaymentSession_1 = require("../models/PaymentSession");
const logger_1 = require("../utils/logger");
const STUCK_AFTER_MS = 2 * 60 * 60 * 1000;
/**
 * Detection only. Does not activate a company or retry a checkout.
 */
function logStuckRegistrationCheckouts() {
    return __awaiter(this, arguments, void 0, function* (now = new Date()) {
        const cutoff = new Date(now.getTime() - STUCK_AFTER_MS);
        const rows = yield PaymentSession_1.PaymentSession.find({
            status: { $in: ['pending', 'provider_created'] },
            createdAt: { $lte: cutoff }
        }).select('_id companyId status provider createdAt').limit(50).lean();
        for (const row of rows) {
            logger_1.logger.warn('registration_checkout_stuck', {
                correlationId: String(row._id),
                paymentSessionId: String(row._id),
                companyId: row.companyId ? String(row.companyId) : undefined,
                status: row.status,
                provider: row.provider,
                failureClass: 'permanent'
            });
        }
        return rows.length;
    });
}
