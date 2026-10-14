"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.throwOnceIfArmed = throwOnceIfArmed;
const fired = new Set();
/**
 * Development-only one-shot failure injection.
 * Armed only when NODE_ENV is not production and MANTIS_TEST_SEAM=1,
 * and the payment notes or reversal reason contains the token.
 */
function throwOnceIfArmed(paymentId, haystack, token) {
    if (process.env.NODE_ENV === 'production')
        return;
    if (process.env.MANTIS_TEST_SEAM !== '1')
        return;
    if (!haystack.includes(token))
        return;
    const key = `${token}:${paymentId}`;
    if (fired.has(key))
        return;
    fired.add(key);
    throw new Error(token);
}
