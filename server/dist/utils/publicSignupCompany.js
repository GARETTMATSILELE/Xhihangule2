"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isPublicSignupAllowed = isPublicSignupAllowed;
exports.publicSignupCompanyFields = publicSignupCompanyFields;
const SIGNUP_COMPANY_FIELDS = [
    'name',
    'tradingName',
    'address',
    'phone',
    'email',
    'website',
    'registrationNumber',
    'tinNumber',
    'vatNumber',
    'description',
    'country',
];
/** Production signup stays closed unless an operator sets ALLOW_PUBLIC_SIGNUP=true. */
function isPublicSignupAllowed(env = process.env) {
    if (env.NODE_ENV !== 'production')
        return true;
    return String(env.ALLOW_PUBLIC_SIGNUP || '').toLowerCase() === 'true';
}
/** Fields a public signup may supply. Subscription, flags, and fiscal secrets are not included. */
function publicSignupCompanyFields(input) {
    const source = input && typeof input === 'object' ? input : {};
    const picked = {};
    for (const key of SIGNUP_COMPANY_FIELDS) {
        if (source[key] !== undefined)
            picked[key] = source[key];
    }
    return picked;
}
