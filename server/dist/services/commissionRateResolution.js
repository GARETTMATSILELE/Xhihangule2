"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.COMMISSION_RATE_REQUIRED = void 0;
exports.resolveStoredCommissionPercentage = resolveStoredCommissionPercentage;
exports.COMMISSION_RATE_REQUIRED = 'COMMISSION_RATE_REQUIRED';
/**
 * The stored property commission percentage is the only rate a payment may use.
 * A missing or invalid percentage is a configuration error. 100% is not assumed.
 */
function resolveStoredCommissionPercentage(value) {
    if (value == null || value === '') {
        return {
            ok: false,
            code: exports.COMMISSION_RATE_REQUIRED,
            message: 'A property commission percentage from 0 to 100 is required. 100% is not assumed.'
        };
    }
    const percent = typeof value === 'number' ? value : Number(String(value).trim());
    if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
        return {
            ok: false,
            code: exports.COMMISSION_RATE_REQUIRED,
            message: 'Property commission percentage must be a number from 0 to 100. 100% is not assumed.'
        };
    }
    return { ok: true, percent };
}
