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
exports.createDealFromLead = exports.dealsSummary = exports.progressDeal = exports.deleteDeal = exports.updateDeal = exports.createDeal = exports.listDeals = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const Deal_1 = require("../models/Deal");
const errorHandler_1 = require("../middleware/errorHandler");
const access_1 = require("../utils/access");
const SalesFile_1 = __importDefault(require("../models/SalesFile"));
const Property_1 = require("../models/Property");
const Lead_1 = require("../models/Lead");
const salesDocs_1 = require("../constants/salesDocs");
const archiver_1 = __importDefault(require("archiver"));
const stream_1 = require("stream");
const listDeals = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        if (!((_a = req.user) === null || _a === void 0 ? void 0 : _a.userId))
            throw new errorHandler_1.AppError('Authentication required', 401);
        if (!req.user.companyId)
            throw new errorHandler_1.AppError('Company ID not found', 400);
        const query = { companyId: new mongoose_1.default.Types.ObjectId(req.user.companyId) };
        if (!(0, access_1.hasAnyRole)(req, ['admin', 'accountant'])) {
            query.ownerId = new mongoose_1.default.Types.ObjectId(req.user.userId);
        }
        if (req.query.propertyId) {
            query.propertyId = new mongoose_1.default.Types.ObjectId(String(req.query.propertyId));
        }
        if (req.query.stage) {
            query.stage = String(req.query.stage);
        }
        const deals = yield Deal_1.Deal.find(query).sort({ createdAt: -1 });
        res.json({ status: 'success', data: deals });
    }
    catch (error) {
        if (error instanceof errorHandler_1.AppError) {
            return res.status(error.statusCode).json({ status: 'error', message: error.message });
        }
        res.status(500).json({ status: 'error', message: 'Failed to fetch deals' });
    }
});
exports.listDeals = listDeals;
const createDeal = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        if (!((_a = req.user) === null || _a === void 0 ? void 0 : _a.userId))
            throw new errorHandler_1.AppError('Authentication required', 401);
        if (!req.user.companyId)
            throw new errorHandler_1.AppError('Company ID not found', 400);
        const { propertyId, buyerName, buyerEmail, buyerPhone, stage, offerPrice, closeDate, notes } = req.body;
        if (!propertyId || !buyerName || offerPrice == null) {
            throw new errorHandler_1.AppError('Missing required fields: propertyId, buyerName, offerPrice', 400);
        }
        const deal = yield Deal_1.Deal.create({
            propertyId,
            buyerName,
            buyerEmail,
            buyerPhone,
            stage: stage || 'Offer',
            offerPrice,
            closeDate: closeDate || null,
            notes: notes || '',
            won: false,
            companyId: req.user.companyId,
            ownerId: req.user.userId
        });
        res.status(201).json({ status: 'success', data: deal });
    }
    catch (error) {
        if (error instanceof errorHandler_1.AppError) {
            return res.status(error.statusCode).json({ status: 'error', message: error.message });
        }
        res.status(500).json({ status: 'error', message: 'Failed to create deal' });
    }
});
exports.createDeal = createDeal;
const updateDeal = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        if (!((_a = req.user) === null || _a === void 0 ? void 0 : _a.userId))
            throw new errorHandler_1.AppError('Authentication required', 401);
        if (!req.user.companyId)
            throw new errorHandler_1.AppError('Company ID not found', 400);
        const { id } = req.params;
        const updates = req.body || {};
        const deal = yield Deal_1.Deal.findOneAndUpdate({ _id: id, companyId: req.user.companyId }, updates, { new: true });
        if (!deal)
            throw new errorHandler_1.AppError('Deal not found', 404);
        res.json({ status: 'success', data: deal });
    }
    catch (error) {
        if (error instanceof errorHandler_1.AppError) {
            return res.status(error.statusCode).json({ status: 'error', message: error.message });
        }
        res.status(500).json({ status: 'error', message: 'Failed to update deal' });
    }
});
exports.updateDeal = updateDeal;
const deleteDeal = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        if (!((_a = req.user) === null || _a === void 0 ? void 0 : _a.userId))
            throw new errorHandler_1.AppError('Authentication required', 401);
        if (!req.user.companyId)
            throw new errorHandler_1.AppError('Company ID not found', 400);
        const { id } = req.params;
        const deal = yield Deal_1.Deal.findOneAndDelete({ _id: id, companyId: req.user.companyId });
        if (!deal)
            throw new errorHandler_1.AppError('Deal not found', 404);
        res.json({ status: 'success', message: 'Deal deleted' });
    }
    catch (error) {
        if (error instanceof errorHandler_1.AppError) {
            return res.status(error.statusCode).json({ status: 'error', message: error.message });
        }
        res.status(500).json({ status: 'error', message: 'Failed to delete deal' });
    }
});
exports.deleteDeal = deleteDeal;
const progressDeal = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        if (!((_a = req.user) === null || _a === void 0 ? void 0 : _a.userId))
            throw new errorHandler_1.AppError('Authentication required', 401);
        if (!req.user.companyId)
            throw new errorHandler_1.AppError('Company ID not found', 400);
        const { id } = req.params;
        const { toStage } = req.body;
        if (!toStage)
            throw new errorHandler_1.AppError('toStage is required', 400);
        const deal = yield Deal_1.Deal.findOne({ _id: id, companyId: req.user.companyId });
        if (!deal)
            throw new errorHandler_1.AppError('Deal not found', 404);
        if (!(0, salesDocs_1.isValidTransition)(deal.stage, toStage)) {
            throw new errorHandler_1.AppError(`Invalid transition from ${deal.stage} to ${toStage}`, 400);
        }
        deal.stage = toStage;
        if (toStage === salesDocs_1.STAGES.WON) {
            deal.won = true;
            if (!deal.closeDate) {
                deal.closeDate = new Date();
            }
        }
        yield deal.save();
        // On Won, generate package file
        if (toStage === salesDocs_1.STAGES.WON) {
            const pkg = yield generateWonPackageZip(deal._id.toString(), req.user.userId, req.user.companyId);
            // Store as SalesFile
            yield SalesFile_1.default.create({
                propertyId: deal.propertyId,
                dealId: deal._id,
                companyId: req.user.companyId,
                fileName: `deal-${deal._id}-package.zip`,
                docType: salesDocs_1.SALES_DOC_TYPES.WON_PACKAGE,
                fileUrl: pkg.toString('base64'),
                uploadedBy: req.user.userId,
                stage: salesDocs_1.STAGES.WON
            });
        }
        res.json({ status: 'success', data: deal });
    }
    catch (error) {
        if (error instanceof errorHandler_1.AppError) {
            return res.status(error.statusCode).json({ status: 'error', message: error.message });
        }
        res.status(500).json({ status: 'error', message: 'Failed to progress deal' });
    }
});
exports.progressDeal = progressDeal;
function generateWonPackageZip(dealId, userId, companyId) {
    return __awaiter(this, void 0, void 0, function* () {
        const deal = yield Deal_1.Deal.findOne({ _id: dealId, companyId }).lean();
        if (!deal) {
            throw new errorHandler_1.AppError('Deal not found for packaging', 404);
        }
        const property = yield Property_1.Property.findOne({ _id: deal.propertyId, companyId }).lean();
        const files = yield SalesFile_1.default.find({ dealId, companyId }).lean();
        const archive = (0, archiver_1.default)('zip', { zlib: { level: 9 } });
        const chunks = [];
        archive.on('data', (d) => chunks.push(Buffer.isBuffer(d) ? d : Buffer.from(d)));
        const summary = {
            deal,
            property,
            documents: files.map(f => ({ id: f._id, docType: f.docType, fileName: f.fileName, stage: f.stage, uploadedAt: f.uploadedAt }))
        };
        archive.append(Buffer.from(JSON.stringify(summary, null, 2)), { name: 'summary.json' });
        for (const f of files) {
            try {
                const buf = Buffer.from(f.fileUrl, 'base64');
                const safeName = `${f.docType}/${f.fileName}`;
                archive.append(stream_1.Readable.from(buf), { name: safeName });
            }
            catch (_a) { }
        }
        yield archive.finalize();
        const result = Buffer.concat(chunks);
        return result;
    });
}
const dealsSummary = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        if (!((_a = req.user) === null || _a === void 0 ? void 0 : _a.userId))
            throw new errorHandler_1.AppError('Authentication required', 401);
        if (!req.user.companyId)
            throw new errorHandler_1.AppError('Company ID not found', 400);
        const companyId = new mongoose_1.default.Types.ObjectId(req.user.companyId);
        const pipeline = [
            { $match: { companyId } },
            {
                $group: {
                    _id: { stage: '$stage', ownerId: '$ownerId' },
                    count: { $sum: 1 },
                    totalOffer: { $sum: '$offerPrice' }
                }
            }
        ];
        const agg = yield mongoose_1.default.connection.collection('deals').aggregate(pipeline).toArray();
        res.json({ status: 'success', data: agg });
    }
    catch (error) {
        if (error instanceof errorHandler_1.AppError) {
            return res.status(error.statusCode).json({ status: 'error', message: error.message });
        }
        res.status(500).json({ status: 'error', message: 'Failed to summarize deals' });
    }
});
exports.dealsSummary = dealsSummary;
const createDealFromLead = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        if (!((_a = req.user) === null || _a === void 0 ? void 0 : _a.userId))
            throw new errorHandler_1.AppError('Authentication required', 401);
        if (!req.user.companyId)
            throw new errorHandler_1.AppError('Company ID not found', 400);
        const { leadId, propertyId, offerPrice, notes } = req.body;
        if (!leadId || !propertyId || offerPrice == null) {
            throw new errorHandler_1.AppError('Missing required fields: leadId, propertyId, offerPrice', 400);
        }
        const lead = yield Lead_1.Lead.findOne({ _id: leadId, companyId: req.user.companyId });
        if (!lead)
            throw new errorHandler_1.AppError('Lead not found', 404);
        const deal = yield Deal_1.Deal.create({
            propertyId,
            leadId: lead._id,
            buyerName: lead.name,
            buyerEmail: lead.email,
            buyerPhone: lead.phone,
            stage: salesDocs_1.STAGES.OFFER,
            offerPrice: Number(offerPrice),
            notes: notes || '',
            won: false,
            companyId: req.user.companyId,
            ownerId: req.user.userId
        });
        // Update lead status to Offer
        if (lead.status !== 'Offer') {
            lead.status = 'Offer';
            yield lead.save();
        }
        res.status(201).json({ status: 'success', data: deal });
    }
    catch (error) {
        if (error instanceof errorHandler_1.AppError) {
            return res.status(error.statusCode).json({ status: 'error', message: error.message });
        }
        res.status(500).json({ status: 'error', message: 'Failed to create deal from lead' });
    }
});
exports.createDealFromLead = createDealFromLead;
