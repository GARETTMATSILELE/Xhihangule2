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
exports.executeHistoricalAccountingRepairReceipt = exports.getHistoricalAccountingDryRun = void 0;
const historicalAccountingReconciliation_1 = require("../services/historicalAccountingReconciliation");
const getHistoricalAccountingDryRun = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    if (!req.user)
        return res.status(401).json({ message: 'Unauthorized' });
    const companyId = String(req.user.companyId || '');
    if (!companyId)
        return res.status(400).json({ message: 'companyId is required' });
    try {
        const report = yield (0, historicalAccountingReconciliation_1.dryRunCompanyHistoricalAccounting)(companyId);
        return res.json(report);
    }
    catch (error) {
        return res.status(500).json({ message: (error === null || error === void 0 ? void 0 : error.message) || 'Historical accounting dry run failed' });
    }
});
exports.getHistoricalAccountingDryRun = getHistoricalAccountingDryRun;
const executeHistoricalAccountingRepairReceipt = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c;
    if (!req.user)
        return res.status(401).json({ message: 'Unauthorized' });
    const companyId = String(req.user.companyId || '');
    const userId = String(req.user.userId || '');
    if (!companyId || !userId)
        return res.status(400).json({ message: 'Accountant identity is required' });
    try {
        const result = yield (0, historicalAccountingReconciliation_1.executeHistoricalAccountingRepair)({
            companyId,
            paymentId: String(req.params.id || ''),
            authorisedBy: userId,
            confirm: ((_a = req.body) === null || _a === void 0 ? void 0 : _a.confirm) === true,
            reason: typeof ((_b = req.body) === null || _b === void 0 ? void 0 : _b.reason) === 'string' ? req.body.reason : '',
            fingerprint: typeof ((_c = req.body) === null || _c === void 0 ? void 0 : _c.fingerprint) === 'string' ? req.body.fingerprint : ''
        });
        if (result.ok === false)
            return res.status(409).json(result);
        return res.json(result);
    }
    catch (error) {
        return res.status(500).json({ message: (error === null || error === void 0 ? void 0 : error.message) || 'Historical accounting repair failed' });
    }
});
exports.executeHistoricalAccountingRepairReceipt = executeHistoricalAccountingRepairReceipt;
