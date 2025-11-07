"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getUserRoles = getUserRoles;
exports.hasRole = hasRole;
exports.hasAnyRole = hasAnyRole;
function getUserRoles(req) {
    var _a, _b;
    const single = (_a = req === null || req === void 0 ? void 0 : req.user) === null || _a === void 0 ? void 0 : _a.role;
    const multi = ((_b = req === null || req === void 0 ? void 0 : req.user) === null || _b === void 0 ? void 0 : _b.roles) || (single ? [single] : []);
    return Array.isArray(multi) ? multi : (single ? [single] : []);
}
function hasRole(req, role) {
    const roles = getUserRoles(req);
    return roles.includes(role);
}
function hasAnyRole(req, rolesToCheck) {
    const roles = getUserRoles(req);
    return rolesToCheck.some(r => roles.includes(r));
}
