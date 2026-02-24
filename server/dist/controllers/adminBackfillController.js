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
exports.getTrustBackfillStatus = exports.runTrustBackfill = void 0;
const AdminAuditLog_1 = __importDefault(require("../models/AdminAuditLog"));
const trustBackfillService_1 = require("../services/trustBackfillService");
function startAudit(req, action, payload) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b;
        try {
            const actorId = String(((_a = req.user) === null || _a === void 0 ? void 0 : _a.userId) || '');
            const actorEmail = String(((_b = req.user) === null || _b === void 0 ? void 0 : _b.email) || '');
            return yield AdminAuditLog_1.default.create({
                actorId,
                actorEmail,
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
function finishAudit(doc, success, result, error) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!doc)
            return;
        try {
            const completedAt = new Date();
            const durationMs = doc.startedAt ? completedAt.getTime() - new Date(doc.startedAt).getTime() : undefined;
            yield AdminAuditLog_1.default.updateOne({ _id: doc._id }, { $set: { success, result, error, completedAt, durationMs } });
        }
        catch (_a) { }
    });
}
const runTrustBackfill = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c;
    const dryRun = Boolean((_a = req.body) === null || _a === void 0 ? void 0 : _a.dryRun);
    const limit = Math.min(50, Math.max(1, Number(((_b = req.body) === null || _b === void 0 ? void 0 : _b.limit) || 50)));
    const audit = yield startAudit(req, 'maintenance:trust_backfill', { dryRun, limit });
    try {
        const result = yield (0, trustBackfillService_1.backfillTrustAccounts)({
            dryRun,
            limit,
            performedBy: String(((_c = req.user) === null || _c === void 0 ? void 0 : _c.userId) || '')
        });
        yield finishAudit(audit, true, result);
        return res.json({ message: dryRun ? 'Dry run completed' : 'Backfill completed', data: result });
    }
    catch (error) {
        yield finishAudit(audit, false, undefined, (error === null || error === void 0 ? void 0 : error.message) || 'Backfill failed');
        return res.status(500).json({ message: (error === null || error === void 0 ? void 0 : error.message) || 'Backfill failed' });
    }
});
exports.runTrustBackfill = runTrustBackfill;
const getTrustBackfillStatus = (_req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const state = yield (0, trustBackfillService_1.getTrustBackfillState)();
    return res.json({ data: state || null });
});
exports.getTrustBackfillStatus = getTrustBackfillStatus;
