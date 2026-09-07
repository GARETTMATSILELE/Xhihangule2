"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.emitPropertyAccountUpdated = emitPropertyAccountUpdated;
const socket_1 = require("../config/socket");
const logger_1 = require("../utils/logger");
function compactPayload(payload) {
    const data = { eventType: String(payload.eventType) };
    if (payload.companyId)
        data.companyId = String(payload.companyId);
    if (payload.propertyId)
        data.propertyId = String(payload.propertyId);
    if (payload.accountId)
        data.accountId = String(payload.accountId);
    if (payload.paymentId)
        data.paymentId = String(payload.paymentId);
    return data;
}
/**
 * Notification only. Never include calculated balances.
 * Emit only after the accounting mutation has already succeeded.
 */
function emitPropertyAccountUpdated(payload) {
    try {
        const io = (0, socket_1.getIo)();
        const data = compactPayload(payload);
        if (!io) {
            if (process.env.NODE_ENV !== 'production') {
                logger_1.logger.info('propertyAccount.updated skipped (socket not initialized)', data);
            }
            return;
        }
        if (!data.companyId) {
            logger_1.logger.warn('propertyAccount.updated skipped (missing companyId)', data);
            return;
        }
        io.to(`company-${data.companyId}`).emit('propertyAccount.updated', data);
        if (process.env.NODE_ENV !== 'production') {
            logger_1.logger.info('propertyAccount.updated emitted', data);
        }
    }
    catch (error) {
        logger_1.logger.warn('Failed to emit propertyAccount.updated (non-fatal)', error);
    }
}
