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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.requestRoles = requestRoles;
exports.isSystemAdminUser = isSystemAdminUser;
exports.isAdminOrSystemAdminUser = isAdminOrSystemAdminUser;
exports.requireExplicitMigrationConfirmation = requireExplicitMigrationConfirmation;
exports.startMigrationAudit = startMigrationAudit;
exports.finishMigrationAudit = finishMigrationAudit;
const errorHandler_1 = require("../middleware/errorHandler");
const AdminAuditLog_1 = __importDefault(require("../models/AdminAuditLog"));
function requestRoles(req) {
    var _a, _b;
    return (((_a = req.user) === null || _a === void 0 ? void 0 : _a.roles) || [(_b = req.user) === null || _b === void 0 ? void 0 : _b.role]).filter(Boolean);
}
function isSystemAdminUser(req) {
    return requestRoles(req).includes('system_admin');
}
function isAdminOrSystemAdminUser(req) {
    const roles = requestRoles(req);
    return roles.includes('admin') || roles.includes('system_admin');
}
/**
 * Explicit historical/migration confirmation. Never treat a GET or a silent POST as consent.
 */
function requireExplicitMigrationConfirmation(req) {
    var _a, _b, _c, _d;
    const confirm = ((_a = req.body) === null || _a === void 0 ? void 0 : _a.confirm) === true || String(((_b = req.query) === null || _b === void 0 ? void 0 : _b.confirm) || '').toLowerCase() === 'true';
    const reason = String(((_c = req.body) === null || _c === void 0 ? void 0 : _c.reason) || ((_d = req.query) === null || _d === void 0 ? void 0 : _d.reason) || '').trim();
    if (!confirm || !reason) {
        throw new errorHandler_1.AppError('Historical financial migration requires confirm=true and a non-empty reason. This is not a reconciliation or integrity action.', 400);
    }
    return { reason };
}
function startMigrationAudit(req, action, payload) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b;
        try {
            return yield AdminAuditLog_1.default.create({
                actorId: String(((_a = req.user) === null || _a === void 0 ? void 0 : _a.userId) || ''),
                actorEmail: String(((_b = req.user) === null || _b === void 0 ? void 0 : _b.email) || ''),
                action,
                payload,
                success: false,
                startedAt: new Date()
            });
        }
        catch (_c) {
            return null;
        }
    });
}
function finishMigrationAudit(doc, success, result, error) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!(doc === null || doc === void 0 ? void 0 : doc._id))
            return;
        try {
            const completedAt = new Date();
            const durationMs = doc.startedAt ? completedAt.getTime() - new Date(doc.startedAt).getTime() : undefined;
            yield AdminAuditLog_1.default.updateOne({ _id: doc._id }, { $set: { success, result, error, completedAt, durationMs } });
        }
        catch (_a) {
            /* audit must never block the operator response */
        }
    });
}
