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
exports.deleteSalesFile = exports.downloadSalesFile = exports.uploadSalesFile = exports.listSalesFiles = void 0;
const SalesFile_1 = __importDefault(require("../models/SalesFile"));
const Property_1 = require("../models/Property");
const Deal_1 = require("../models/Deal");
const salesDocs_1 = require("../constants/salesDocs");
const listSalesFiles = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        if (!((_a = req.user) === null || _a === void 0 ? void 0 : _a.companyId))
            return res.status(401).json({ message: 'Authentication required' });
        const { propertyId, dealId, stage } = req.query;
        const query = { companyId: req.user.companyId };
        if (propertyId)
            query.propertyId = propertyId;
        if (dealId)
            query.dealId = dealId;
        if (stage)
            query.stage = stage;
        const files = yield SalesFile_1.default.find(query).sort({ uploadedAt: -1 });
        res.json({ files });
    }
    catch (e) {
        res.status(500).json({ message: 'Failed to list sales files' });
    }
});
exports.listSalesFiles = listSalesFiles;
const uploadSalesFile = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        if (!((_a = req.user) === null || _a === void 0 ? void 0 : _a.companyId))
            return res.status(401).json({ message: 'Authentication required' });
        if (!req.file)
            return res.status(400).json({ message: 'No file uploaded' });
        const { propertyId, dealId, stage, docType } = req.body;
        if (!propertyId || !docType)
            return res.status(400).json({ message: 'Missing propertyId or docType' });
        const companyId = req.user.companyId;
        const prop = yield Property_1.Property.findOne({ _id: propertyId, companyId });
        if (!prop)
            return res.status(404).json({ message: 'Property not found' });
        // If uploading against a deal, validate ownership and stage/docType compatibility
        if (dealId) {
            const deal = yield Deal_1.Deal.findOne({ _id: dealId, companyId });
            if (!deal)
                return res.status(404).json({ message: 'Deal not found' });
            if (stage) {
                const allowed = salesDocs_1.ALLOWED_DOCS_BY_STAGE[stage] || [];
                if (!allowed.includes(docType)) {
                    return res.status(400).json({ message: `Doc type ${docType} not allowed for stage ${stage}` });
                }
            }
        }
        const rec = yield SalesFile_1.default.create({
            propertyId,
            dealId,
            companyId,
            fileName: req.file.originalname,
            docType,
            fileUrl: req.file.buffer.toString('base64'),
            uploadedBy: req.user.userId,
            stage
        });
        res.status(201).json({ message: 'Uploaded', file: rec });
    }
    catch (e) {
        res.status(500).json({ message: 'Failed to upload sales file' });
    }
});
exports.uploadSalesFile = uploadSalesFile;
const downloadSalesFile = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const f = yield SalesFile_1.default.findById(req.params.id);
        if (!f)
            return res.status(404).json({ message: 'File not found' });
        const buffer = Buffer.from(f.fileUrl, 'base64');
        res.setHeader('Content-Type', 'application/octet-stream');
        res.setHeader('Content-Disposition', `attachment; filename="${f.fileName}"`);
        res.send(buffer);
    }
    catch (e) {
        res.status(500).json({ message: 'Failed to download sales file' });
    }
});
exports.downloadSalesFile = downloadSalesFile;
const deleteSalesFile = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const f = yield SalesFile_1.default.findById(req.params.id);
        if (!f)
            return res.status(404).json({ message: 'File not found' });
        yield f.deleteOne();
        res.json({ message: 'File deleted successfully' });
    }
    catch (e) {
        res.status(500).json({ message: 'Failed to delete sales file' });
    }
});
exports.deleteSalesFile = deleteSalesFile;
