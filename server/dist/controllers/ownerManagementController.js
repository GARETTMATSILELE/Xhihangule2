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
exports.ownerProfilePatch = exports.ownerFullProfile = exports.ownerDocumentPdf = exports.propertyOwnershipHistory = exports.ownershipHistoryCreate = exports.ownerHistoryList = exports.ownerProfileExtras = exports.ownerPreferencesUpsert = exports.ownerBankingUpsert = exports.ownerDocumentsUpload = exports.ownerDocumentsList = exports.ownerMaintenance = exports.ownerFinancials = exports.ownerPortfolio = exports.ownersDashboard = exports.propertyLedgerSnapshot = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const errorHandler_1 = require("../middleware/errorHandler");
const PropertyOwner_1 = require("../models/PropertyOwner");
const Company_1 = require("../models/Company");
const propertyFinancialSnapshotService_1 = require("../services/propertyFinancialSnapshotService");
const ownerManagementService_1 = require("../services/ownerManagementService");
const ctx = (req) => {
    const user = req.user;
    if (!(user === null || user === void 0 ? void 0 : user.companyId))
        throw new errorHandler_1.AppError('Company context required', 403);
    return { companyId: user.companyId, userId: user.userId };
};
const ownerIdParam = (req) => {
    const id = req.params.ownerId || req.params.id || req.body.ownerId;
    if (!id || !mongoose_1.default.Types.ObjectId.isValid(id))
        throw new errorHandler_1.AppError('Invalid owner ID', 400);
    return String(id);
};
/** Same ledger snapshot as GET /accountants/property-accounts/:propertyId */
const propertyLedgerSnapshot = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { companyId } = ctx(req);
    const propertyId = req.params.propertyId;
    if (!propertyId || !mongoose_1.default.Types.ObjectId.isValid(propertyId)) {
        throw new errorHandler_1.AppError('Invalid property ID', 400);
    }
    const ledger = req.query.ledger || 'rental';
    const snapshot = yield (0, propertyFinancialSnapshotService_1.getPropertyFinancialSnapshot)(propertyId, companyId, ledger);
    res.json(snapshot);
});
exports.propertyLedgerSnapshot = propertyLedgerSnapshot;
const ownersDashboard = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { companyId } = ctx(req);
    const [kpis, owners] = yield Promise.all([
        (0, ownerManagementService_1.getOwnersDashboard)(companyId),
        (0, ownerManagementService_1.getOwnerListSummaries)(companyId),
    ]);
    res.json(Object.assign(Object.assign({}, kpis), { owners }));
});
exports.ownersDashboard = ownersDashboard;
const ownerPortfolio = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { companyId } = ctx(req);
    const data = yield (0, ownerManagementService_1.getOwnerPortfolio)(ownerIdParam(req), companyId);
    res.json(data);
});
exports.ownerPortfolio = ownerPortfolio;
const ownerFinancials = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { companyId } = ctx(req);
    const data = yield (0, ownerManagementService_1.getOwnerFinancials)(ownerIdParam(req), companyId);
    res.json(data);
});
exports.ownerFinancials = ownerFinancials;
const ownerMaintenance = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { companyId } = ctx(req);
    const data = yield (0, ownerManagementService_1.getOwnerMaintenance)(ownerIdParam(req), companyId);
    res.json(data);
});
exports.ownerMaintenance = ownerMaintenance;
const ownerDocumentsList = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { companyId } = ctx(req);
    const docs = yield (0, ownerManagementService_1.getOwnerDocuments)(ownerIdParam(req), companyId);
    res.json(docs);
});
exports.ownerDocumentsList = ownerDocumentsList;
const ownerDocumentsUpload = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { companyId, userId } = ctx(req);
    const ownerId = req.body.ownerId || ownerIdParam(req);
    const doc = yield (0, ownerManagementService_1.uploadOwnerDocument)({
        ownerId,
        companyId,
        userId: userId,
        documentType: req.body.documentType,
        fileName: req.body.fileName,
        fileUrl: req.body.fileUrl,
        mimeType: req.body.mimeType,
        fileSize: req.body.fileSize,
    });
    res.status(201).json(doc);
});
exports.ownerDocumentsUpload = ownerDocumentsUpload;
const ownerBankingUpsert = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { companyId } = ctx(req);
    const banking = yield (0, ownerManagementService_1.upsertOwnerBanking)(ownerIdParam(req), companyId, req.body);
    res.json(banking);
});
exports.ownerBankingUpsert = ownerBankingUpsert;
const ownerPreferencesUpsert = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { companyId } = ctx(req);
    const prefs = yield (0, ownerManagementService_1.upsertOwnerPreferences)(ownerIdParam(req), companyId, req.body);
    res.json(prefs);
});
exports.ownerPreferencesUpsert = ownerPreferencesUpsert;
const ownerProfileExtras = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { companyId } = ctx(req);
    const extras = yield (0, ownerManagementService_1.getOwnerProfileExtras)(ownerIdParam(req), companyId);
    res.json(extras);
});
exports.ownerProfileExtras = ownerProfileExtras;
const ownerHistoryList = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { companyId } = ctx(req);
    const history = yield (0, ownerManagementService_1.getOwnershipHistory)(ownerIdParam(req), companyId);
    res.json(history);
});
exports.ownerHistoryList = ownerHistoryList;
const ownershipHistoryCreate = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { companyId, userId } = ctx(req);
    const history = yield (0, ownerManagementService_1.addOwnershipHistory)({
        propertyId: req.body.propertyId,
        ownerId: req.body.ownerId || ownerIdParam(req),
        companyId,
        userId: userId,
        startDate: req.body.startDate,
        endDate: req.body.endDate,
        ownershipPercentage: req.body.ownershipPercentage,
        notes: req.body.notes,
    });
    res.status(201).json(history);
});
exports.ownershipHistoryCreate = ownershipHistoryCreate;
const propertyOwnershipHistory = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { companyId } = ctx(req);
    const history = yield (0, ownerManagementService_1.getPropertyOwnershipHistory)(req.params.propertyId, companyId);
    res.json(history);
});
exports.propertyOwnershipHistory = propertyOwnershipHistory;
const ownerDocumentPdf = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { companyId } = ctx(req);
    const type = (req.params.docType || 'owner-statement');
    const company = yield Company_1.Company.findById(companyId).select('name').lean();
    const pdf = yield (0, ownerManagementService_1.generateOwnerDocument)({
        type,
        ownerId: ownerIdParam(req),
        companyId,
        companyName: (company === null || company === void 0 ? void 0 : company.name) || 'Company',
    });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${type}-${ownerIdParam(req)}.pdf"`);
    res.send(pdf);
});
exports.ownerDocumentPdf = ownerDocumentPdf;
const ownerFullProfile = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { companyId } = ctx(req);
    const ownerId = ownerIdParam(req);
    const [portfolio, financials, maintenance, documents, history, extras] = yield Promise.all([
        (0, ownerManagementService_1.getOwnerPortfolio)(ownerId, companyId),
        (0, ownerManagementService_1.getOwnerFinancials)(ownerId, companyId),
        (0, ownerManagementService_1.getOwnerMaintenance)(ownerId, companyId),
        (0, ownerManagementService_1.getOwnerDocuments)(ownerId, companyId),
        (0, ownerManagementService_1.getOwnershipHistory)(ownerId, companyId),
        (0, ownerManagementService_1.getOwnerProfileExtras)(ownerId, companyId),
    ]);
    res.json({ portfolio, financials, maintenance, documents, history, extras });
});
exports.ownerFullProfile = ownerFullProfile;
/** Extend owner record with profile fields (non-destructive). */
const ownerProfilePatch = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { companyId } = ctx(req);
    const allowed = [
        'firstName', 'lastName', 'email', 'phone', 'nationalId', 'passportNumber',
        'taxNumber', 'address', 'active',
    ];
    const updates = {};
    for (const key of allowed) {
        if (req.body[key] !== undefined)
            updates[key] = req.body[key];
    }
    const owner = yield PropertyOwner_1.PropertyOwner.findOneAndUpdate({ _id: ownerIdParam(req), companyId }, { $set: updates }, { new: true, runValidators: true }).select('-password');
    if (!owner)
        throw new errorHandler_1.AppError('Property owner not found', 404);
    res.json(owner);
});
exports.ownerProfilePatch = ownerProfilePatch;
