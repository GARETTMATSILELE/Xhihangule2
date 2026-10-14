"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.COMPANY_ASSIGNABLE_ROLES = void 0;
exports.assertCompanyAssignableRoleSet = assertCompanyAssignableRoleSet;
const errorHandler_1 = require("../middleware/errorHandler");
/** Roles a company administrator may assign. Platform and portal roles are excluded. */
exports.COMPANY_ASSIGNABLE_ROLES = ['admin', 'agent', 'accountant', 'owner', 'sales', 'principal', 'prea'];
function isAssignable(value) {
    return exports.COMPANY_ASSIGNABLE_ROLES.includes(value);
}
/**
 * Rejects platform roles such as system_admin before any user document is written.
 * Returns only the fields the caller actually sent.
 */
function assertCompanyAssignableRoleSet(role, roles) {
    const requested = [];
    if (typeof role === 'string' && role.trim())
        requested.push(role.trim());
    if (Array.isArray(roles)) {
        for (const entry of roles) {
            if (typeof entry === 'string' && entry.trim())
                requested.push(entry.trim());
        }
    }
    if (requested.some((name) => !isAssignable(name))) {
        throw new errorHandler_1.AppError('That role cannot be assigned by a company administrator', 403);
    }
    const unique = Array.from(new Set(requested)).filter(isAssignable);
    if (Array.isArray(roles)) {
        if (unique.length === 0) {
            throw new errorHandler_1.AppError('At least one valid role is required', 400);
        }
        const requestedPrimary = typeof role === 'string' ? role.trim() : '';
        const primary = isAssignable(requestedPrimary) && unique.includes(requestedPrimary)
            ? requestedPrimary
            : unique[0];
        return { role: primary, roles: unique };
    }
    if (typeof role === 'string') {
        const trimmed = role.trim();
        if (isAssignable(trimmed))
            return { role: trimmed };
    }
    return {};
}
