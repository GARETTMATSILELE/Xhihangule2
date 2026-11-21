"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeOwnerEmail = normalizeOwnerEmail;
exports.phoneDigits = phoneDigits;
exports.validateNewPropertyOwner = validateNewPropertyOwner;
exports.validateOwnerContact = validateOwnerContact;
exports.ownerRetirementMode = ownerRetirementMode;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function normalizeOwnerEmail(email) {
    return String(email || '').trim().toLowerCase();
}
function phoneDigits(phone) {
    return String(phone || '').replace(/\D/g, '');
}
function validateNewPropertyOwner(input) {
    const email = normalizeOwnerEmail(input.email);
    const firstName = String(input.firstName || '').trim();
    const lastName = String(input.lastName || '').trim();
    const phone = String(input.phone || '').trim();
    const password = String(input.password || '');
    if (!email || !password || !firstName || !lastName || !phone) {
        return 'First name, last name, email, phone and password are required';
    }
    if (!EMAIL_RE.test(email))
        return 'Enter a valid email address';
    if (password.length < 6)
        return 'Password must be at least 6 characters';
    const digits = phoneDigits(phone);
    if (digits.length < 7 || digits.length > 15)
        return 'Enter a valid phone number';
    return null;
}
function validateOwnerContact(input) {
    if (input.email !== undefined && String(input.email || '').trim()) {
        if (!EMAIL_RE.test(normalizeOwnerEmail(input.email)))
            return 'Enter a valid email address';
    }
    if (input.phone !== undefined && String(input.phone || '').trim()) {
        const digits = phoneDigits(input.phone);
        if (digits.length < 7 || digits.length > 15)
            return 'Enter a valid phone number';
    }
    return null;
}
/**
 * Hard-delete only when the owner has no property link and no historical record.
 * Anything else is deactivated so leases, ledgers and ownership history stay intact.
 */
function ownerRetirementMode(input) {
    const protectedCount = input.linkedPropertyCount
        + input.leaseCount
        + input.paymentCount
        + input.accountCount
        + input.historyCount
        + input.documentCount;
    return protectedCount > 0 ? 'deactivate' : 'delete';
}
