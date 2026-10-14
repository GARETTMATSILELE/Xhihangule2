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
exports.listOwnerCollections = listOwnerCollections;
exports.createOwnerCollection = createOwnerCollection;
exports.advanceOwnerCollection = advanceOwnerCollection;
const mongoose_1 = __importDefault(require("mongoose"));
const OwnerCollection_1 = require("../models/OwnerCollection");
const Property_1 = require("../models/Property");
const Payment_1 = require("../models/Payment");
const ownerWaterfall_1 = require("../reporting/ownerWaterfall");
const ownerCollectionService_1 = require("../services/ownerCollectionService");
function companyId(req) {
    var _a, _b;
    const id = ((_a = req.user) === null || _a === void 0 ? void 0 : _a.companyId) || ((_b = req.user) === null || _b === void 0 ? void 0 : _b.company);
    return id ? String(id) : null;
}
function listOwnerCollections(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        const company = companyId(req);
        if (!company)
            return res.status(403).json({ message: 'Company scope required' });
        const rows = yield OwnerCollection_1.OwnerCollection.find({ companyId: company })
            .sort({ updatedAt: -1 })
            .limit(100)
            .populate('propertyId', 'name address')
            .lean();
        return res.json({
            status: 'success',
            data: rows,
            note: 'Operational collection status is not a financial posting.',
        });
    });
}
function createOwnerCollection(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j;
        const company = companyId(req);
        if (!company)
            return res.status(403).json({ message: 'Company scope required' });
        const { propertyId, operationalAmount, notes, currency, overrideReason } = req.body || {};
        if (!mongoose_1.default.Types.ObjectId.isValid(propertyId))
            return res.status(400).json({ message: 'Property is required' });
        const property = yield Property_1.Property.findOne({ _id: propertyId, companyId: company }).select('ownerId').lean();
        if (!(property === null || property === void 0 ? void 0 : property.ownerId))
            return res.status(404).json({ message: 'Property owner was not found in this company' });
        const payment = yield Payment_1.Payment.findOne({
            companyId: company,
            propertyId,
            status: 'completed',
            paymentType: { $in: ['rental', 'introduction'] },
        }).sort({ paymentDate: -1 }).select('amount commissionDetails paymentAllocation').lean();
        const snapshot = (payment === null || payment === void 0 ? void 0 : payment.commissionDetails) || {};
        const waterfall = payment ? (0, ownerWaterfall_1.explainOwnerWaterfall)({
            grossAmount: Number((_b = (_a = snapshot.grossRent) !== null && _a !== void 0 ? _a : payment.amount) !== null && _b !== void 0 ? _b : 0),
            commissionAmount: Number((_d = (_c = snapshot.commissionNet) !== null && _c !== void 0 ? _c : snapshot.totalCommission) !== null && _d !== void 0 ? _d : 0),
            levyAmount: Number((_e = snapshot.levy) !== null && _e !== void 0 ? _e : 0),
            vatOnCommission: Number((_g = (_f = snapshot.vatOnCommission) !== null && _f !== void 0 ? _f : snapshot.vatAmount) !== null && _g !== void 0 ? _g : 0),
            recordedOwnerAmount: (_h = payment.paymentAllocation) === null || _h === void 0 ? void 0 : _h.ownerPayable,
        }) : null;
        const authoritative = waterfall ? waterfall.netOwnerAmount : undefined;
        const requested = operationalAmount === undefined || operationalAmount === null || operationalAmount === ''
            ? authoritative
            : Number(operationalAmount);
        if (requested === undefined || Number.isNaN(requested)) {
            return res.status(400).json({ message: 'An authoritative owner amount was not found. Record the rental payment before requesting collection.' });
        }
        const overridden = authoritative !== undefined && Math.abs(Number(requested) - authoritative) > 0.009;
        if (overridden && !overrideReason) {
            return res.status(400).json({ message: 'An amount that differs from the owner waterfall requires an override reason. Accounting is not changed.' });
        }
        const row = yield OwnerCollection_1.OwnerCollection.create({
            companyId: company,
            propertyId,
            ownerId: property.ownerId,
            operationalAmount: Number(requested),
            authoritativeAmount: authoritative,
            amountSource: overridden ? 'OPERATIONAL_OVERRIDE' : 'OWNER_WATERFALL',
            overrideReason: overridden ? String(overrideReason) : undefined,
            currency: currency || 'USD',
            status: 'OWNER_REQUESTED',
            notes,
            requestedBy: (_j = req.user) === null || _j === void 0 ? void 0 : _j.userId,
        });
        return res.status(201).json({ status: 'success', data: row, financialPosting: false });
    });
}
function advanceOwnerCollection(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c, _d;
        const company = companyId(req);
        if (!company)
            return res.status(403).json({ message: 'Company scope required' });
        const row = yield OwnerCollection_1.OwnerCollection.findOne({ _id: req.params.id, companyId: company });
        if (!row)
            return res.status(404).json({ message: 'Collection was not found in this company' });
        const requested = String(((_a = req.body) === null || _a === void 0 ? void 0 : _a.status) || '');
        try {
            (0, ownerCollectionService_1.assertOwnerCollectionTransition)(row.status, requested);
        }
        catch (error) {
            return res.status(error.status || 409).json({ message: error.message });
        }
        row.status = requested;
        if (requested === 'READY_FOR_COLLECTION')
            row.preparedBy = (_b = req.user) === null || _b === void 0 ? void 0 : _b.userId;
        if (requested === 'COLLECTED')
            row.collectedBy = (_c = req.user) === null || _c === void 0 ? void 0 : _c.userId;
        if (requested === 'ACKNOWLEDGED' && ((_d = req.body) === null || _d === void 0 ? void 0 : _d.acknowledgementReference)) {
            row.acknowledgementReference = String(req.body.acknowledgementReference);
        }
        yield row.save();
        return res.json({ status: 'success', data: row, financialPosting: false });
    });
}
