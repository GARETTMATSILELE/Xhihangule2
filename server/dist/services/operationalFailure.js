"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ExpenseSyncError = void 0;
exports.classifyOperationalFailure = classifyOperationalFailure;
const transactionDomain_1 = require("./transactionDomain");
class ExpenseSyncError extends Error {
    constructor(message, failureClass, code = 'EXPENSE_SYNC_FAILED') {
        super(message);
        this.name = 'ExpenseSyncError';
        this.failureClass = failureClass;
        this.code = code;
    }
}
exports.ExpenseSyncError = ExpenseSyncError;
/**
 * Transient means a later bounded retry may succeed.
 * Conflict is a duplicate-key error that was not proven to be the same operation.
 * Permanent means validation or a business rule; those are not retried until an accountant acts.
 */
function classifyOperationalFailure(error) {
    if (error instanceof ExpenseSyncError)
        return error.failureClass;
    if ((0, transactionDomain_1.isPermanentAccountingFailure)(error))
        return 'permanent';
    const err = error;
    const code = Number(err === null || err === void 0 ? void 0 : err.code);
    if (code === 11000)
        return 'conflict';
    const message = String((err === null || err === void 0 ? void 0 : err.message) || '');
    if (code === 16500
        || code === 50
        || code === 89
        || code === 91
        || /throttl|TooManyRequests|ECONNRESET|ETIMEDOUT|timed out|connection.*closed|MongoNetwork|server selection/i.test(message)) {
        return 'transient';
    }
    const status = Number(err === null || err === void 0 ? void 0 : err.statusCode);
    if (status >= 400 && status < 500)
        return 'permanent';
    return 'transient';
}
