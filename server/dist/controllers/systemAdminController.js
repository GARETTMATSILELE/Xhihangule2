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
exports.manualRenewSubscription = exports.listCompanySubscriptions = exports.fullSync = exports.ledgerMaintenance = exports.reconcile = exports.getBackups = exports.runBackup = exports.removeSystemAdmin = exports.addSystemAdmin = exports.listSystemAdmins = exports.getStatus = void 0;
const errorHandler_1 = require("../middleware/errorHandler");
const User_1 = require("../models/User");
const backupService_1 = require("../services/backupService");
const reconciliationService_1 = require("../services/reconciliationService");
const propertyAccountService_1 = require("../services/propertyAccountService");
const databaseSyncService_1 = __importDefault(require("../services/databaseSyncService"));
const AdminAuditLog_1 = __importDefault(require("../models/AdminAuditLog"));
const Company_1 = require("../models/Company");
const Subscription_1 = require("../models/Subscription");
function requireSystemAdmin(req) {
    var _a, _b;
    const roles = Array.isArray((_a = req.user) === null || _a === void 0 ? void 0 : _a.roles) ? req.user.roles : (((_b = req.user) === null || _b === void 0 ? void 0 : _b.role) ? [req.user.role] : []);
    if (!roles.includes('system_admin')) {
        throw new errorHandler_1.AppError('System admin required', 403);
    }
}
function startAudit(req, action, payload) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b;
        try {
            const actorId = String(((_a = req.user) === null || _a === void 0 ? void 0 : _a.userId) || '');
            const actorEmail = String(((_b = req.user) === null || _b === void 0 ? void 0 : _b.email) || '');
            const doc = yield AdminAuditLog_1.default.create({
                actorId,
                actorEmail,
                action,
                payload,
                success: false,
                startedAt: new Date()
            });
            return doc;
        }
        catch (_c) {
            return null;
        }
    });
}
function finishAudit(doc, success, result, error) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!doc)
            return;
        try {
            const completedAt = new Date();
            const durationMs = doc.startedAt ? (completedAt.getTime() - new Date(doc.startedAt).getTime()) : undefined;
            yield AdminAuditLog_1.default.updateOne({ _id: doc._id }, { $set: { success, result, error, completedAt, durationMs } });
        }
        catch (_a) { }
    });
}
const getStatus = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    requireSystemAdmin(req);
    res.json({ status: 'ok', time: new Date().toISOString(), user: ((_a = req.user) === null || _a === void 0 ? void 0 : _a.email) || null });
});
exports.getStatus = getStatus;
const listSystemAdmins = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    requireSystemAdmin(req);
    const docs = yield User_1.User.find({ $or: [{ role: 'system_admin' }, { roles: 'system_admin' }] }).select('_id email firstName lastName role roles isActive companyId').lean();
    res.json({ data: docs });
});
exports.listSystemAdmins = listSystemAdmins;
const addSystemAdmin = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    requireSystemAdmin(req);
    const { email, userId } = req.body || {};
    if (!email && !userId)
        throw new errorHandler_1.AppError('email or userId required', 400);
    const audit = yield startAudit(req, 'system_admin:add', { email, userId });
    try {
        const query = email ? { email } : { _id: userId };
        const user = yield User_1.User.findOne(query);
        if (!user)
            throw new errorHandler_1.AppError('User not found', 404);
        const roles = Array.isArray(user.roles) ? user.roles : [user.role];
        const newRoles = Array.from(new Set([...(roles || []), 'system_admin']));
        user.roles = newRoles;
        if (user.role !== 'admin') {
            user.role = 'admin'; // keep admin as primary role for compatibility
        }
        yield user.save();
        yield finishAudit(audit, true, { userId: user._id });
        res.json({ message: 'User promoted to system_admin', userId: user._id });
    }
    catch (e) {
        yield finishAudit(audit, false, undefined, (e === null || e === void 0 ? void 0 : e.message) || String(e));
        throw e;
    }
});
exports.addSystemAdmin = addSystemAdmin;
const removeSystemAdmin = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    requireSystemAdmin(req);
    const { id } = req.params;
    const audit = yield startAudit(req, 'system_admin:remove', { id });
    try {
        const user = yield User_1.User.findById(id);
        if (!user)
            throw new errorHandler_1.AppError('User not found', 404);
        const roles = Array.isArray(user.roles) ? user.roles : [user.role];
        const newRoles = roles.filter(r => r !== 'system_admin');
        user.roles = newRoles;
        yield user.save();
        yield finishAudit(audit, true, { userId: user._id });
        res.json({ message: 'system_admin role removed', userId: user._id });
    }
    catch (e) {
        yield finishAudit(audit, false, undefined, (e === null || e === void 0 ? void 0 : e.message) || String(e));
        throw e;
    }
});
exports.removeSystemAdmin = removeSystemAdmin;
const runBackup = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    requireSystemAdmin(req);
    const audit = yield startAudit(req, 'backup:run', {});
    try {
        const result = yield (0, backupService_1.runDatabaseBackup)();
        yield finishAudit(audit, true, result);
        res.json({ message: 'Backup completed', data: result });
    }
    catch (e) {
        yield finishAudit(audit, false, undefined, (e === null || e === void 0 ? void 0 : e.message) || String(e));
        throw new errorHandler_1.AppError((e === null || e === void 0 ? void 0 : e.message) || 'Backup failed', 500);
    }
});
exports.runBackup = runBackup;
const getBackups = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    requireSystemAdmin(req);
    const items = yield (0, backupService_1.listBackups)(50);
    res.json({ data: items });
});
exports.getBackups = getBackups;
const reconcile = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    requireSystemAdmin(req);
    const { dryRun } = req.body || {};
    const audit = yield startAudit(req, 'maintenance:reconcile', { dryRun: Boolean(dryRun) });
    try {
        const result = yield (0, reconciliationService_1.reconcileDuplicates)(Boolean(dryRun));
        yield finishAudit(audit, true, result);
        res.json({ message: 'Reconcile completed', data: result });
    }
    catch (e) {
        yield finishAudit(audit, false, undefined, (e === null || e === void 0 ? void 0 : e.message) || String(e));
        throw new errorHandler_1.AppError((e === null || e === void 0 ? void 0 : e.message) || 'Reconcile failed', 500);
    }
});
exports.reconcile = reconcile;
const ledgerMaintenance = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    requireSystemAdmin(req);
    const { companyId, dryRun } = req.body || {};
    const audit = yield startAudit(req, 'maintenance:ledger', { companyId, dryRun: Boolean(dryRun) });
    try {
        const result = yield (0, propertyAccountService_1.runPropertyLedgerMaintenance)({ companyId, dryRun: Boolean(dryRun) });
        yield finishAudit(audit, true, result);
        res.json({ message: 'Ledger maintenance completed', data: result });
    }
    catch (e) {
        yield finishAudit(audit, false, undefined, (e === null || e === void 0 ? void 0 : e.message) || String(e));
        throw new errorHandler_1.AppError((e === null || e === void 0 ? void 0 : e.message) || 'Ledger maintenance failed', 500);
    }
});
exports.ledgerMaintenance = ledgerMaintenance;
const fullSync = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    requireSystemAdmin(req);
    const audit = yield startAudit(req, 'sync:full', {});
    try {
        const svc = databaseSyncService_1.default.getInstance();
        const stats = yield svc.performFullSync();
        yield finishAudit(audit, true, stats);
        res.json({ message: 'Full sync completed', data: stats });
    }
    catch (e) {
        yield finishAudit(audit, false, undefined, (e === null || e === void 0 ? void 0 : e.message) || String(e));
        throw new errorHandler_1.AppError((e === null || e === void 0 ? void 0 : e.message) || 'Full sync failed', 500);
    }
});
exports.fullSync = fullSync;
const listCompanySubscriptions = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    requireSystemAdmin(req);
    // List all companies with their subscription details
    const companies = yield Company_1.Company.find({}).select('_id name email plan subscriptionStatus subscriptionEndDate').lean();
    const subs = yield Subscription_1.Subscription.find({}).select('companyId plan cycle status currentPeriodEnd nextPaymentAt trialEndDate').lean();
    const subMap = new Map();
    for (const s of subs) {
        subMap.set(String(s.companyId), s);
    }
    const data = companies.map((c) => {
        const s = subMap.get(String(c._id));
        return {
            companyId: String(c._id),
            name: c.name,
            email: c.email,
            plan: c.plan,
            subscriptionStatus: c.subscriptionStatus,
            subscriptionEndDate: c.subscriptionEndDate,
            subscription: s ? {
                plan: s.plan,
                cycle: s.cycle,
                status: s.status,
                currentPeriodEnd: s.currentPeriodEnd || s.trialEndDate,
                nextPaymentAt: s.nextPaymentAt
            } : null
        };
    });
    res.json({ data });
});
exports.listCompanySubscriptions = listCompanySubscriptions;
const manualRenewSubscription = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    requireSystemAdmin(req);
    const { companyId, cycle } = req.body || {};
    if (!companyId) {
        throw new errorHandler_1.AppError('companyId is required', 400);
    }
    const audit = yield startAudit(req, 'subscription:manualRenew', { companyId, cycle });
    try {
        const company = yield Company_1.Company.findById(companyId);
        if (!company)
            throw new errorHandler_1.AppError('Company not found', 404);
        const sub = yield Subscription_1.Subscription.findOne({ companyId });
        if (!sub)
            throw new errorHandler_1.AppError('Subscription not found for company', 404);
        const effectiveCycle = cycle && (cycle === 'monthly' || cycle === 'yearly') ? cycle : sub.cycle || 'monthly';
        const now = new Date();
        const startingPoint = sub.currentPeriodEnd && sub.currentPeriodEnd > now ? new Date(sub.currentPeriodEnd) : now;
        const newEnd = new Date(startingPoint);
        if (effectiveCycle === 'monthly') {
            newEnd.setMonth(newEnd.getMonth() + 1);
        }
        else {
            newEnd.setFullYear(newEnd.getFullYear() + 1);
        }
        sub.status = 'active';
        sub.cycle = effectiveCycle;
        sub.currentPeriodStart = startingPoint;
        sub.currentPeriodEnd = newEnd;
        sub.nextPaymentAt = newEnd;
        yield sub.save();
        // update company fields for convenience
        company.subscriptionStatus = 'active';
        company.subscriptionEndDate = newEnd;
        yield company.save();
        yield finishAudit(audit, true, { companyId, newEnd, cycle: effectiveCycle });
        res.json({ message: 'Subscription renewed', data: { companyId, newEnd, cycle: effectiveCycle } });
    }
    catch (e) {
        yield finishAudit(audit, false, undefined, (e === null || e === void 0 ? void 0 : e.message) || String(e));
        throw e;
    }
});
exports.manualRenewSubscription = manualRenewSubscription;
