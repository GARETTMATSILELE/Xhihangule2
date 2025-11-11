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
Object.defineProperty(exports, "__esModule", { value: true });
exports.runReconciliation = void 0;
const reconciliationService_1 = require("../services/reconciliationService");
const runReconciliation = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d;
    if (!req.user) {
        return res.status(401).json({ message: 'Unauthorized' });
    }
    try {
        const role = ((_a = req.user) === null || _a === void 0 ? void 0 : _a.role) || (Array.isArray((_b = req.user) === null || _b === void 0 ? void 0 : _b.roles) ? req.user.roles[0] : undefined);
        const isAdmin = role === 'admin' || (Array.isArray((_c = req.user) === null || _c === void 0 ? void 0 : _c.roles) && req.user.roles.includes('admin'));
        if (!isAdmin) {
            return res.status(403).json({ message: 'Forbidden: admin only' });
        }
        const dryRun = String(req.query.dryRun || ((_d = req.body) === null || _d === void 0 ? void 0 : _d.dryRun) || 'true').toLowerCase() !== 'false';
        const result = yield (0, reconciliationService_1.reconcileDuplicates)(dryRun);
        return res.status(200).json({ dryRun, result });
    }
    catch (e) {
        console.error('Reconciliation failed:', e);
        return res.status(500).json({ message: 'Reconciliation failed', error: (e === null || e === void 0 ? void 0 : e.message) || 'Unknown error' });
    }
});
exports.runReconciliation = runReconciliation;
