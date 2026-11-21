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
exports.rejectHistoricalVatReceipt = exports.recogniseHistoricalVatReceipt = exports.getHistoricalVatSchedule = void 0;
const historicalVatRecognitionService_1 = require("../services/historicalVatRecognitionService");
function accountantId(req) {
    var _a;
    return String(((_a = req.user) === null || _a === void 0 ? void 0 : _a.userId) || '');
}
const getHistoricalVatSchedule = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    if (!req.user)
        return res.status(401).json({ message: 'Unauthorized' });
    const companyId = String(req.user.companyId || '');
    if (!companyId)
        return res.status(400).json({ message: 'companyId is required' });
    try {
        const schedule = yield (0, historicalVatRecognitionService_1.buildHistoricalVatSchedule)(companyId);
        return res.json(Object.assign(Object.assign({}, schedule), { automaticRecognition: false }));
    }
    catch (error) {
        return res.status(500).json({ message: (error === null || error === void 0 ? void 0 : error.message) || 'Failed to build the historical VAT schedule' });
    }
});
exports.getHistoricalVatSchedule = getHistoricalVatSchedule;
const recogniseHistoricalVatReceipt = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d, _e;
    if (!req.user)
        return res.status(401).json({ message: 'Unauthorized' });
    const companyId = String(req.user.companyId || '');
    const userId = accountantId(req);
    if (!companyId || !userId)
        return res.status(400).json({ message: 'Accountant identity is required' });
    try {
        const result = yield (0, historicalVatRecognitionService_1.recogniseHistoricalVat)({
            companyId,
            paymentId: String(req.params.id || ''),
            approvedBy: userId,
            confirm: ((_a = req.body) === null || _a === void 0 ? void 0 : _a.confirm) === true,
            reason: typeof ((_b = req.body) === null || _b === void 0 ? void 0 : _b.reason) === 'string' ? req.body.reason : '',
            physicalBookReference: typeof ((_c = req.body) === null || _c === void 0 ? void 0 : _c.physicalBookReference) === 'string' ? req.body.physicalBookReference : '',
            septemberTaxTreatmentApproved: ((_d = req.body) === null || _d === void 0 ? void 0 : _d.septemberTaxTreatmentApproved) === true,
            taxTreatmentBasis: typeof ((_e = req.body) === null || _e === void 0 ? void 0 : _e.taxTreatmentBasis) === 'string' ? req.body.taxTreatmentBasis : ''
        });
        if (result.ok === false && result.status === 'blocked') {
            return res.status(400).json(result);
        }
        return res.json(result);
    }
    catch (error) {
        return res.status(500).json({ message: (error === null || error === void 0 ? void 0 : error.message) || 'Historical VAT recognition failed' });
    }
});
exports.recogniseHistoricalVatReceipt = recogniseHistoricalVatReceipt;
const rejectHistoricalVatReceipt = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    if (!req.user)
        return res.status(401).json({ message: 'Unauthorized' });
    const companyId = String(req.user.companyId || '');
    const userId = accountantId(req);
    if (!companyId || !userId)
        return res.status(400).json({ message: 'Accountant identity is required' });
    try {
        const result = yield (0, historicalVatRecognitionService_1.rejectHistoricalVat)({
            companyId,
            paymentId: String(req.params.id || ''),
            rejectedBy: userId,
            reason: typeof ((_a = req.body) === null || _a === void 0 ? void 0 : _a.reason) === 'string' ? req.body.reason : ''
        });
        if (result.ok === false && result.status === 'blocked')
            return res.status(400).json(result);
        return res.json(result);
    }
    catch (error) {
        return res.status(500).json({ message: (error === null || error === void 0 ? void 0 : error.message) || 'Historical VAT rejection failed' });
    }
});
exports.rejectHistoricalVatReceipt = rejectHistoricalVatReceipt;
