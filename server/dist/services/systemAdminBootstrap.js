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
exports.systemAdminBootstrapDecision = systemAdminBootstrapDecision;
exports.provisionBreakGlassSystemAdmin = provisionBreakGlassSystemAdmin;
const User_1 = require("../models/User");
const AdminAuditLog_1 = __importDefault(require("../models/AdminAuditLog"));
/**
 * Break-glass provisioning is opt-in and create-only.
 * Production startup never creates or repairs an administrator.
 * An existing account is never re-passworded, reactivated, or given roles.
 */
function systemAdminBootstrapDecision(env = process.env) {
    if (env.NODE_ENV === 'production') {
        return { action: 'skip', reason: 'production' };
    }
    if (String(env.ALLOW_SYSTEM_ADMIN_BOOTSTRAP || '').toLowerCase() !== 'true') {
        return { action: 'skip', reason: 'disabled' };
    }
    const email = String(env.SYSTEM_ADMIN_BOOTSTRAP_EMAIL || '').trim().toLowerCase();
    const password = String(env.SYSTEM_ADMIN_BOOTSTRAP_PASSWORD || '');
    if (!email.includes('@') || password.length < 12) {
        return { action: 'skip', reason: 'incomplete' };
    }
    return { action: 'create', email, password };
}
function provisionBreakGlassSystemAdmin() {
    return __awaiter(this, void 0, void 0, function* () {
        const decision = systemAdminBootstrapDecision(process.env);
        if (decision.action === 'skip') {
            if (decision.reason === 'production' && String(process.env.ALLOW_SYSTEM_ADMIN_BOOTSTRAP || '').toLowerCase() === 'true') {
                console.error('ALLOW_SYSTEM_ADMIN_BOOTSTRAP is ignored in production. No administrator was created or changed.');
            }
            if (decision.reason === 'incomplete') {
                console.error('System admin bootstrap is enabled but the email or password is missing or too short. No administrator was created.');
            }
            return 'skipped';
        }
        const existing = yield User_1.User.findOne({ email: decision.email }).select('_id').maxTimeMS(5000);
        if (existing) {
            console.log('System admin bootstrap left the existing user unchanged.', { userId: String(existing._id) });
            return 'exists';
        }
        const user = new User_1.User({
            email: decision.email,
            password: decision.password,
            firstName: 'System',
            lastName: 'Admin',
            role: 'admin',
            roles: ['admin', 'system_admin'],
            isActive: true,
        });
        yield user.save();
        try {
            yield AdminAuditLog_1.default.create({
                actorId: 'startup',
                action: 'system_admin:bootstrap_create',
                payload: { userId: String(user._id) },
                success: true,
                startedAt: new Date(),
                completedAt: new Date(),
            });
        }
        catch (_a) {
            console.error('System admin bootstrap created a user, but the audit record could not be saved.');
        }
        console.log('System admin bootstrap created a new user.', { userId: String(user._id) });
        return 'created';
    });
}
