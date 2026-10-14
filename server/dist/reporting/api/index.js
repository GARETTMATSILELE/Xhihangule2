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
const express_1 = __importDefault(require("express"));
const mongoose_1 = __importDefault(require("mongoose"));
const propertyAccess_1 = require("../../utils/propertyAccess");
const Company_1 = require("../../models/Company");
const PropertyAccount_1 = __importDefault(require("../../models/PropertyAccount"));
const auth_1 = require("../../middleware/auth");
const reportFactory_1 = require("../reportFactory");
const router = express_1.default.Router();
const toPeriod = (period) => {
    const now = new Date();
    const [yearRaw, monthRaw] = String(period || '').split('-');
    const year = yearRaw ? Number(yearRaw) : now.getUTCFullYear();
    const month = monthRaw ? Number(monthRaw) : now.getUTCMonth() + 1;
    const startDate = new Date(Date.UTC(year, month - 1, 1));
    const endDate = new Date(Date.UTC(year, month, 0));
    const label = `${year.toString().padStart(4, '0')}-${month.toString().padStart(2, '0')}`;
    return {
        startDate: startDate.toISOString().slice(0, 10),
        endDate: endDate.toISOString().slice(0, 10),
        label
    };
};
const toIsoDate = (value) => {
    if (!value)
        return undefined;
    const date = new Date(String(value));
    if (Number.isNaN(date.getTime()))
        return undefined;
    return date.toISOString().slice(0, 10);
};
const toStatementPeriod = (query) => {
    if (String(query.includeAllTransactions || '').toLowerCase() === 'true') {
        return {
            startDate: '1900-01-01',
            endDate: '9999-12-31',
            label: 'All Transactions'
        };
    }
    const from = toIsoDate(query.from);
    const to = toIsoDate(query.to);
    if (from && to) {
        return {
            startDate: from,
            endDate: to,
            label: `${from} - ${to}`
        };
    }
    return toPeriod(String(query.period || ''));
};
const isReportFormat = (value) => ['pdf', 'excel', 'csv', 'json'].includes(value);
const getCompanyBrand = (companyId) => __awaiter(void 0, void 0, void 0, function* () {
    const company = yield Company_1.Company.findById(companyId).select('name tradingName logo').lean();
    return {
        name: String((company === null || company === void 0 ? void 0 : company.tradingName) || (company === null || company === void 0 ? void 0 : company.name) || '').trim() || undefined,
        logo: String((company === null || company === void 0 ? void 0 : company.logo) || '').trim() || undefined
    };
});
const resolveStatementPropertyId = (propertyOrAccountId) => __awaiter(void 0, void 0, void 0, function* () {
    if (!mongoose_1.default.isValidObjectId(propertyOrAccountId))
        return propertyOrAccountId;
    const account = yield PropertyAccount_1.default.findById(propertyOrAccountId).select('propertyId').lean();
    return (account === null || account === void 0 ? void 0 : account.propertyId) ? String(account.propertyId) : propertyOrAccountId;
});
router.get('/owner/:propertyId', auth_1.auth, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        const companyId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.companyId;
        if (!companyId)
            return res.status(400).json({ message: 'Company ID is required' });
        const company = yield getCompanyBrand(companyId);
        const propertyId = yield resolveStatementPropertyId(String(req.params.propertyId));
        if (!(yield (0, propertyAccess_1.callerCanAccessProperty)(req, propertyId))) {
            return res.status(404).json({ message: 'Property not found' });
        }
        const ledgerType = String(req.query.ledger || req.query.ledgerType || '').toLowerCase();
        if (ledgerType !== 'rental' && ledgerType !== 'sale') {
            return res.status(400).json({
                code: 'LEDGER_REQUIRED',
                message: 'Owner statement requires ledger=rental or ledger=sale.'
            });
        }
        const dto = yield reportFactory_1.reportFactory.createOwnerStatement({
            companyId,
            propertyId,
            ledgerType,
            period: toStatementPeriod(req.query),
            generatedBy: (_b = req.user) === null || _b === void 0 ? void 0 : _b.userId,
            companyName: company.name,
            companyLogo: company.logo,
            correlationId: String(req.requestId || '')
        });
        return res.json(dto);
    }
    catch (error) {
        return res.status(500).json({ message: (error === null || error === void 0 ? void 0 : error.message) || 'Failed to create owner statement' });
    }
}));
router.get('/owner/:propertyId/:format', auth_1.auth, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        const companyId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.companyId;
        if (!companyId)
            return res.status(400).json({ message: 'Company ID is required' });
        const format = String(req.params.format || '').toLowerCase();
        if (!isReportFormat(format))
            return res.status(400).json({ message: 'Unsupported report format' });
        const company = yield getCompanyBrand(companyId);
        const propertyId = yield resolveStatementPropertyId(String(req.params.propertyId));
        if (!(yield (0, propertyAccess_1.callerCanAccessProperty)(req, propertyId))) {
            return res.status(404).json({ message: 'Property not found' });
        }
        const ledgerType = String(req.query.ledger || req.query.ledgerType || '').toLowerCase();
        if (ledgerType !== 'rental' && ledgerType !== 'sale') {
            return res.status(400).json({
                code: 'LEDGER_REQUIRED',
                message: 'Owner statement requires ledger=rental or ledger=sale.'
            });
        }
        const result = yield reportFactory_1.reportFactory.exportOwnerStatement({
            companyId,
            propertyId,
            ledgerType,
            period: toStatementPeriod(req.query),
            generatedBy: (_b = req.user) === null || _b === void 0 ? void 0 : _b.userId,
            companyName: company.name,
            companyLogo: company.logo,
            correlationId: String(req.requestId || '')
        }, format);
        res.setHeader('Content-Type', result.contentType);
        res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
        return res.status(200).send(result.buffer);
    }
    catch (error) {
        return res.status(500).json({ message: (error === null || error === void 0 ? void 0 : error.message) || 'Failed to export owner statement' });
    }
}));
exports.default = router;
