"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isPublicSignupAllowed = isPublicSignupAllowed;
exports.signupEmailAllowlist = signupEmailAllowlist;
exports.signupAllowlistConfigured = signupAllowlistConfigured;
exports.publicSignupDecision = publicSignupDecision;
exports.publicSignupCompanyFields = publicSignupCompanyFields;
const normalization_1 = require("./normalization");
const registrationPaymentPolicy_1 = require("../services/registrationPaymentPolicy");
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
/**
 * Comma-separated emails. Blank means no allowlist.
 * Entries that are not email addresses are ignored.
 * A non-blank value with no valid emails does not mean everyone may register.
 */
function signupEmailAllowlist(env = process.env) {
    return String(env.SIGNUP_EMAIL_ALLOWLIST || '')
        .split(',')
        .map((email) => (0, normalization_1.normalizeEmail)(email))
        .filter((email) => (0, registrationPaymentPolicy_1.isRegistrationEmail)(email));
}
function signupAllowlistConfigured(env = process.env) {
    return String(env.SIGNUP_EMAIL_ALLOWLIST || '').trim().length > 0;
}
function publicSignupDecision(env = process.env, email) {
    const signupEnabled = isPublicSignupAllowed(env);
    const allowlist = signupEmailAllowlist(env);
    const allowlistConfigured = signupAllowlistConfigured(env);
    const allowlistRestricted = allowlistConfigured;
    if (!signupEnabled) {
        return { signupEnabled: false, allowlistRestricted, emailAllowed: false, code: 'SIGNUP_DISABLED' };
    }
    if (allowlistConfigured && allowlist.length === 0) {
        return { signupEnabled: true, allowlistRestricted: true, emailAllowed: false, code: 'SIGNUP_NOT_INVITED' };
    }
    const normalized = (0, normalization_1.normalizeEmail)(email);
    if (allowlistRestricted && normalized) {
        const emailAllowed = allowlist.includes(normalized);
        return {
            signupEnabled: true,
            allowlistRestricted,
            emailAllowed,
            code: emailAllowed ? undefined : 'SIGNUP_NOT_INVITED'
        };
    }
    return { signupEnabled: true, allowlistRestricted, emailAllowed: true };
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
