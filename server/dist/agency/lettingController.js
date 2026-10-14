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
exports.buildRentBoardRows = buildRentBoardRows;
exports.saveAssessment = saveAssessment;
exports.advanceAssessment = advanceAssessment;
exports.saveMandate = saveMandate;
exports.advanceMandate = advanceMandate;
exports.saveListing = saveListing;
exports.updateListing = updateListing;
exports.shortlistApplication = shortlistApplication;
exports.ownerApplicationDecision = ownerApplicationDecision;
exports.ownerLettingWorkspace = ownerLettingWorkspace;
exports.prepareAgencyLease = prepareAgencyLease;
exports.signAgencyLease = signAgencyLease;
exports.activateAgencyLease = activateAgencyLease;
exports.rentCollectionBoard = rentCollectionBoard;
exports.requestMaintenancePayment = requestMaintenancePayment;
exports.fileLevyReceipt = fileLevyReceipt;
exports.propertyWorkspace = propertyWorkspace;
exports.agencySearch = agencySearch;
exports.seniorPortfolio = seniorPortfolio;
exports.accountantWorkQueue = accountantWorkQueue;
const mongoose_1 = __importDefault(require("mongoose"));
const Property_1 = require("../models/Property");
const PropertyOwner_1 = require("../models/PropertyOwner");
const User_1 = require("../models/User");
const Tenant_1 = require("../models/Tenant");
const Lease_1 = require("../models/Lease");
const Payment_1 = require("../models/Payment");
const PaymentRequest_1 = require("../models/PaymentRequest");
const MaintenanceQuote_1 = require("../models/MaintenanceQuote");
const LevyPayment_1 = require("../models/LevyPayment");
const tenantFacing_1 = require("../ecosystem/models/tenantFacing");
const tenantFacing_2 = require("../ecosystem/models/tenantFacing");
const maintenanceWorkflow_1 = require("../ecosystem/models/maintenanceWorkflow");
const workflowMachine_1 = require("../ecosystem/workflowMachine");
const lettingModels_1 = require("./lettingModels");
const propertyAccess_1 = require("../utils/propertyAccess");
const workflowNotify_1 = require("./workflowNotify");
const lettingWorkflow_1 = require("./lettingWorkflow");
function companyId(req) {
    var _a, _b;
    const id = ((_a = req.user) === null || _a === void 0 ? void 0 : _a.companyId) || ((_b = req.user) === null || _b === void 0 ? void 0 : _b.company);
    return id ? String(id) : null;
}
function actorId(req) {
    var _a, _b;
    return ((_a = req.user) === null || _a === void 0 ? void 0 : _a.userId) || ((_b = req.user) === null || _b === void 0 ? void 0 : _b._id);
}
function roles(req) {
    const user = req.user;
    const listed = Array.isArray(user === null || user === void 0 ? void 0 : user.roles) ? user.roles.filter(Boolean).map(String) : [];
    const primary = (user === null || user === void 0 ? void 0 : user.role) ? [String(user.role)] : [];
    return Array.from(new Set([...listed, ...primary]));
}
function isSenior(req) {
    return roles(req).some((role) => role === 'admin' || role === 'principal' || role === 'prea' || role === 'accountant');
}
function isOwnerRole(req) {
    var _a;
    return ((_a = req.user) === null || _a === void 0 ? void 0 : _a.role) === 'owner';
}
function audit(company, req, action, entityType, entityId, previousState, newState, reason, propertyId) {
    return __awaiter(this, void 0, void 0, function* () {
        yield lettingModels_1.AgencyWorkflowEvent.create({
            companyId: company,
            propertyId,
            actorId: actorId(req),
            action,
            entityType,
            entityId,
            previousState,
            newState,
            reason,
        });
    });
}
function propertyInCompany(req, propertyId, company) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!mongoose_1.default.Types.ObjectId.isValid(propertyId))
            return null;
        if (!(yield (0, propertyAccess_1.callerCanAccessProperty)(req, propertyId)))
            return null;
        return Property_1.Property.findOne({ _id: propertyId, companyId: company }).select('name ownerId propertyOwnerId agentId rent status companyId').lean();
    });
}
function landlordMayDecide(req, propertyId, company) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!isOwnerRole(req))
            return false;
        if (!(yield (0, propertyAccess_1.callerCanAccessProperty)(req, propertyId)))
            return false;
        const user = yield User_1.User.findById(actorId(req)).select('email companyId role').lean();
        if (!user || String(user.companyId) !== String(company) || user.role !== 'owner' || !user.email)
            return false;
        const property = yield Property_1.Property.findOne({ _id: propertyId, companyId: company }).select('propertyOwnerId').lean();
        if (!property)
            return false;
        const owner = property.propertyOwnerId
            ? yield PropertyOwner_1.PropertyOwner.findOne({ _id: property.propertyOwnerId, companyId: company }).select('email').lean()
            : yield PropertyOwner_1.PropertyOwner.findOne({ companyId: company, properties: propertyId }).select('email').lean();
        if (!(owner === null || owner === void 0 ? void 0 : owner.email))
            return false;
        return String(owner.email).toLowerCase() === String(user.email).toLowerCase();
    });
}
function landlordIdForProperty(company, property) {
    return __awaiter(this, void 0, void 0, function* () {
        if (property.propertyOwnerId)
            return property.propertyOwnerId;
        const owner = yield PropertyOwner_1.PropertyOwner.findOne({ companyId: company, properties: property._id }).select('_id').lean();
        return owner === null || owner === void 0 ? void 0 : owner._id;
    });
}
function gateAssessment(company, propertyId) {
    return __awaiter(this, void 0, void 0, function* () {
        const approved = yield lettingModels_1.PropertyAssessment.findOne({ companyId: company, propertyId, status: 'OWNER_APPROVED' }).sort({ updatedAt: -1 }).lean();
        if (approved)
            return approved;
        return lettingModels_1.PropertyAssessment.findOne({ companyId: company, propertyId }).sort({ updatedAt: -1 }).lean();
    });
}
function gateMandate(company, propertyId) {
    return __awaiter(this, void 0, void 0, function* () {
        const signed = yield lettingModels_1.RentalMandate.findOne({ companyId: company, propertyId, status: 'SIGNED' }).sort({ updatedAt: -1 }).lean();
        if (signed)
            return signed;
        return lettingModels_1.RentalMandate.findOne({ companyId: company, propertyId }).sort({ updatedAt: -1 }).lean();
    });
}
function completedDepositReceived(company, leaseId) {
    return __awaiter(this, void 0, void 0, function* () {
        const payments = yield Payment_1.Payment.find({
            companyId: company,
            leaseId,
            status: 'completed',
            depositAmount: { $gt: 0 },
        }).select('_id depositAmount reversalOfPaymentId').lean();
        const ids = payments.map((row) => row._id);
        const reversals = ids.length
            ? yield Payment_1.Payment.find({ companyId: company, reversalOfPaymentId: { $in: ids } }).select('reversalOfPaymentId').lean()
            : [];
        const reversed = new Set(reversals.map((row) => String(row.reversalOfPaymentId)));
        return payments
            .filter((row) => !row.reversalOfPaymentId && !reversed.has(String(row._id)))
            .reduce((sum, row) => sum + Number(row.depositAmount || 0), 0);
    });
}
function paymentMatchesLease(payment, lease) {
    if (payment.leaseId)
        return String(payment.leaseId) === String(lease._id);
    return Boolean(payment.tenantId)
        && String(payment.propertyId) === String(lease.propertyId)
        && String(payment.tenantId) === String(lease.tenantId);
}
function buildRentBoardRows(req, company) {
    return __awaiter(this, void 0, void 0, function* () {
        const now = new Date();
        const month = now.getMonth() + 1;
        const year = now.getFullYear();
        const visibleIds = yield (0, propertyAccess_1.propertyIdsForCaller)(req);
        const leaseQuery = { companyId: company, status: 'active' };
        if (visibleIds !== 'company')
            leaseQuery.propertyId = { $in: visibleIds };
        const leases = yield Lease_1.Lease.find(leaseQuery).select('propertyId tenantId rentAmount depositAmount rentDueDay').limit(200).lean();
        const propertyIds = leases.map((lease) => lease.propertyId);
        const payments = yield Payment_1.Payment.find({
            companyId: company,
            propertyId: { $in: propertyIds },
            status: 'completed',
            rentalPeriodMonth: month,
            rentalPeriodYear: year,
            paymentType: { $in: ['rental', 'introduction'] },
        }).select('propertyId tenantId leaseId amount currency paymentDate reversalOfPaymentId').lean();
        const paymentIds = payments.map((row) => row._id);
        const reversalRows = paymentIds.length
            ? yield Payment_1.Payment.find({ companyId: company, reversalOfPaymentId: { $in: paymentIds } }).select('reversalOfPaymentId').lean()
            : [];
        const reversed = new Set(reversalRows.map((row) => String(row.reversalOfPaymentId)));
        const counted = payments.filter((row) => !row.reversalOfPaymentId && !reversed.has(String(row._id)));
        const properties = yield Property_1.Property.find({ _id: { $in: propertyIds }, companyId: company }).select('name').lean();
        const tenants = yield Tenant_1.Tenant.find({ _id: { $in: leases.map((lease) => lease.tenantId) }, companyId: company }).select('firstName lastName').lean();
        const propertyName = new Map(properties.map((row) => [String(row._id), row.name]));
        const tenantName = new Map(tenants.map((row) => [String(row._id), [row.firstName, row.lastName].filter(Boolean).join(' ')]));
        return leases.map((lease) => {
            const matches = counted.filter((payment) => paymentMatchesLease(payment, lease));
            const currencies = Array.from(new Set(matches.map((payment) => String(payment.currency || '')).filter(Boolean)));
            const mixedCurrency = currencies.length > 1;
            const received = mixedCurrency ? null : matches.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
            const dueDay = Number(lease.rentDueDay || 1);
            const dueDate = new Date(year, month - 1, Math.min(dueDay, 28));
            const rent = Number(lease.rentAmount || 0);
            const lastPayment = matches.reduce((latest, payment) => {
                const paidAt = payment.paymentDate ? new Date(payment.paymentDate) : null;
                if (!paidAt)
                    return latest;
                if (!latest || paidAt > latest)
                    return paidAt;
                return latest;
            }, null);
            return {
                leaseId: lease._id,
                propertyId: lease.propertyId,
                propertyName: propertyName.get(String(lease.propertyId)) || '',
                tenantId: lease.tenantId,
                tenantName: tenantName.get(String(lease.tenantId)) || '',
                rent,
                received,
                outstanding: mixedCurrency || received === null ? null : Math.max(0, rent - received),
                dueDate,
                currency: mixedCurrency ? null : (currencies[0] || null),
                mixedCurrency,
                lastPaymentDate: lastPayment,
                status: mixedCurrency || received === null ? null : (0, lettingWorkflow_1.classifyRentCollection)({ dueDate, rent, received, now }),
            };
        });
    });
}
function saveAssessment(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        const company = companyId(req);
        if (!company)
            return res.status(403).json({ message: 'Company scope required' });
        const property = yield propertyInCompany(req, (_a = req.body) === null || _a === void 0 ? void 0 : _a.propertyId, company);
        if (!property)
            return res.status(404).json({ message: 'Property was not found in this company' });
        const row = yield lettingModels_1.PropertyAssessment.create({
            companyId: company,
            propertyId: property._id,
            agentId: actorId(req),
            assessmentDate: req.body.assessmentDate || new Date(),
            recommendedRent: Number(req.body.recommendedRent || 0),
            condition: req.body.condition,
            marketObservations: req.body.marketObservations,
            ownerRecommendation: req.body.ownerRecommendation,
            notes: req.body.notes,
            status: 'ASSESSMENT_DRAFT',
        });
        yield audit(company, req, 'ASSESSMENT_RECORDED', 'PropertyAssessment', String(row._id), undefined, 'ASSESSMENT_DRAFT', undefined, String(row.propertyId));
        return res.status(201).json({ status: 'success', data: row });
    });
}
function advanceAssessment(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c, _d, _e;
        const company = companyId(req);
        if (!company)
            return res.status(403).json({ message: 'Company scope required' });
        const row = yield lettingModels_1.PropertyAssessment.findOne({ _id: req.params.id, companyId: company });
        if (!row || !(yield (0, propertyAccess_1.callerCanAccessProperty)(req, String(row.propertyId))))
            return res.status(404).json({ message: 'Assessment was not found in this company' });
        const next = String(((_a = req.body) === null || _a === void 0 ? void 0 : _a.status) || '');
        if (next === 'OWNER_APPROVED' || next === 'OWNER_REJECTED') {
            if (!isOwnerRole(req))
                return res.status(403).json({ message: 'Owner approval is a separate gate' });
            if (!(yield landlordMayDecide(req, String(row.propertyId), company))) {
                return res.status(404).json({ message: 'Assessment was not found in this company' });
            }
        }
        try {
            (0, lettingWorkflow_1.assertAssessmentTransition)(row.status, next);
        }
        catch (error) {
            return res.status(error.status || 409).json({ message: error.message });
        }
        const previous = row.status;
        row.status = next;
        if ((_b = req.body) === null || _b === void 0 ? void 0 : _b.reason)
            row.decisionComment = String(req.body.reason);
        if (next === 'OWNER_APPROVED') {
            const approvedRent = Number((_d = (_c = req.body) === null || _c === void 0 ? void 0 : _c.approvedRent) !== null && _d !== void 0 ? _d : row.recommendedRent);
            if (approvedRent < 0)
                return res.status(400).json({ message: 'Approved rent cannot be negative' });
            row.approvedRent = approvedRent;
            row.decidedAt = new Date();
            row.decidedBy = actorId(req);
        }
        if (next === 'OWNER_REJECTED') {
            row.decidedAt = new Date();
            row.decidedBy = actorId(req);
        }
        yield row.save();
        yield audit(company, req, 'ASSESSMENT_STATUS', 'PropertyAssessment', String(row._id), previous, next, (_e = req.body) === null || _e === void 0 ? void 0 : _e.reason, String(row.propertyId));
        if (next === 'ASSESSMENT_SUBMITTED') {
            yield (0, workflowNotify_1.notifyLandlord)(company, String(row.propertyId), `assessment-submitted:${row._id}`, 'Assessment ready for review', 'A property assessment is waiting for your price decision.');
        }
        if (next === 'OWNER_APPROVED' || next === 'OWNER_REJECTED') {
            yield (0, workflowNotify_1.notifyOnce)(company, row.agentId ? String(row.agentId) : undefined, `assessment-decision:${row._id}:${next}`, 'Assessment decision recorded', next === 'OWNER_APPROVED' ? 'The landlord approved the proposed rent.' : 'The landlord requested changes to the assessment.');
        }
        return res.json({ status: 'success', data: row });
    });
}
function saveMandate(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c, _d, _e, _f;
        const company = companyId(req);
        if (!company)
            return res.status(403).json({ message: 'Company scope required' });
        const property = yield propertyInCompany(req, (_a = req.body) === null || _a === void 0 ? void 0 : _a.propertyId, company);
        if (!property)
            return res.status(404).json({ message: 'Property was not found in this company' });
        const approved = yield lettingModels_1.PropertyAssessment.findOne({ propertyId: property._id, companyId: company, status: 'OWNER_APPROVED' }).lean();
        if (!approved)
            return res.status(409).json({ message: 'Owner approval of the assessment is required before a mandate' });
        const landlordId = yield landlordIdForProperty(company, property);
        if (!landlordId)
            return res.status(409).json({ message: 'A landlord must be linked before a mandate is recorded' });
        const row = yield lettingModels_1.RentalMandate.create({
            companyId: company,
            propertyId: property._id,
            ownerId: landlordId,
            agreedRent: Number((_d = (_c = (_b = req.body) === null || _b === void 0 ? void 0 : _b.agreedRent) !== null && _c !== void 0 ? _c : approved.approvedRent) !== null && _d !== void 0 ? _d : approved.recommendedRent),
            documentUrl: (_e = req.body) === null || _e === void 0 ? void 0 : _e.documentUrl,
            notes: (_f = req.body) === null || _f === void 0 ? void 0 : _f.notes,
            status: 'DRAFT',
        });
        yield audit(company, req, 'MANDATE_RECORDED', 'RentalMandate', String(row._id), undefined, 'DRAFT', undefined, String(row.propertyId));
        return res.status(201).json({ status: 'success', data: row });
    });
}
function advanceMandate(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b;
        const company = companyId(req);
        if (!company)
            return res.status(403).json({ message: 'Company scope required' });
        const row = yield lettingModels_1.RentalMandate.findOne({ _id: req.params.id, companyId: company });
        if (!row || !(yield (0, propertyAccess_1.callerCanAccessProperty)(req, String(row.propertyId))))
            return res.status(404).json({ message: 'Mandate was not found in this company' });
        const next = String(((_a = req.body) === null || _a === void 0 ? void 0 : _a.status) || '');
        if (next === 'SIGNED') {
            const documentUrl = String(((_b = req.body) === null || _b === void 0 ? void 0 : _b.documentUrl) || row.documentUrl || '').trim();
            if (!documentUrl)
                return res.status(409).json({ message: 'A signed mandate document is required' });
            row.documentUrl = documentUrl;
        }
        try {
            (0, lettingWorkflow_1.assertMandateTransition)(row.status, next);
        }
        catch (error) {
            return res.status(error.status || 409).json({ message: error.message });
        }
        const previous = row.status;
        row.status = next;
        if (next === 'SIGNED')
            row.signedAt = new Date();
        yield row.save();
        yield audit(company, req, 'MANDATE_STATUS', 'RentalMandate', String(row._id), previous, next, undefined, String(row.propertyId));
        if (next === 'SIGNED') {
            yield (0, workflowNotify_1.notifyPropertyAgent)(company, String(row.propertyId), `mandate-signed:${row._id}`, 'Mandate recorded', 'A signed mandate document has been recorded. This is a document reference, not an electronic-signature check.');
        }
        return res.json({ status: 'success', data: row });
    });
}
function saveListing(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c, _d, _e, _f, _g;
        const company = companyId(req);
        if (!company)
            return res.status(403).json({ message: 'Company scope required' });
        const property = yield propertyInCompany(req, (_a = req.body) === null || _a === void 0 ? void 0 : _a.propertyId, company);
        if (!property)
            return res.status(404).json({ message: 'Property was not found in this company' });
        const [assessment, mandate] = yield Promise.all([
            gateAssessment(company, property._id),
            gateMandate(company, property._id),
        ]);
        const requested = ((_b = req.body) === null || _b === void 0 ? void 0 : _b.status) === 'ACTIVE' ? 'ACTIVE' : 'PRE_LISTING';
        if (requested === 'ACTIVE') {
            const blockers = (0, lettingWorkflow_1.listingBlockers)({ assessmentStatus: assessment === null || assessment === void 0 ? void 0 : assessment.status, mandateStatus: mandate === null || mandate === void 0 ? void 0 : mandate.status });
            if (blockers.length)
                return res.status(409).json({ message: blockers[0], blockers });
        }
        const row = yield lettingModels_1.ListingReference.create({
            companyId: company,
            propertyId: property._id,
            platform: String(((_c = req.body) === null || _c === void 0 ? void 0 : _c.platform) || 'Other'),
            reference: (_d = req.body) === null || _d === void 0 ? void 0 : _d.reference,
            url: (_e = req.body) === null || _e === void 0 ? void 0 : _e.url,
            status: requested,
            listedAt: requested === 'ACTIVE' ? new Date() : undefined,
            lastVerifiedAt: ((_f = req.body) === null || _f === void 0 ? void 0 : _f.lastVerifiedAt) ? new Date(req.body.lastVerifiedAt) : undefined,
            listedBy: actorId(req),
            notes: (_g = req.body) === null || _g === void 0 ? void 0 : _g.notes,
        });
        yield audit(company, req, 'LISTING_RECORDED', 'ListingReference', String(row._id), undefined, requested, undefined, String(row.propertyId));
        return res.status(201).json({ status: 'success', data: row, publishedExternally: false });
    });
}
function updateListing(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c, _d, _e, _f;
        const company = companyId(req);
        if (!company)
            return res.status(403).json({ message: 'Company scope required' });
        const row = yield lettingModels_1.ListingReference.findOne({ _id: req.params.id, companyId: company });
        if (!row || !(yield (0, propertyAccess_1.callerCanAccessProperty)(req, String(row.propertyId))))
            return res.status(404).json({ message: 'Listing reference was not found in this company' });
        const next = ((_a = req.body) === null || _a === void 0 ? void 0 : _a.status) ? String(req.body.status) : row.status;
        if (!['PRE_LISTING', 'ACTIVE', 'REMOVED'].includes(next))
            return res.status(400).json({ message: 'Listing status is not supported' });
        if (next === 'ACTIVE') {
            const [assessment, mandate] = yield Promise.all([
                gateAssessment(company, row.propertyId),
                gateMandate(company, row.propertyId),
            ]);
            const blockers = (0, lettingWorkflow_1.listingBlockers)({ assessmentStatus: assessment === null || assessment === void 0 ? void 0 : assessment.status, mandateStatus: mandate === null || mandate === void 0 ? void 0 : mandate.status });
            if (blockers.length)
                return res.status(409).json({ message: blockers[0], blockers });
        }
        const previous = row.status;
        row.status = next;
        if ((_b = req.body) === null || _b === void 0 ? void 0 : _b.platform)
            row.platform = String(req.body.platform);
        if (((_c = req.body) === null || _c === void 0 ? void 0 : _c.reference) !== undefined)
            row.reference = req.body.reference;
        if (((_d = req.body) === null || _d === void 0 ? void 0 : _d.url) !== undefined)
            row.url = req.body.url;
        if (((_e = req.body) === null || _e === void 0 ? void 0 : _e.notes) !== undefined)
            row.notes = req.body.notes;
        if ((_f = req.body) === null || _f === void 0 ? void 0 : _f.lastVerifiedAt) {
            const verified = new Date(req.body.lastVerifiedAt);
            if (Number.isNaN(verified.getTime()))
                return res.status(400).json({ message: 'Last verified date is not valid' });
            row.lastVerifiedAt = verified;
        }
        if (next === 'ACTIVE' && !row.listedAt)
            row.listedAt = new Date();
        if (next === 'REMOVED')
            row.removedAt = new Date();
        yield row.save();
        yield audit(company, req, 'LISTING_STATUS', 'ListingReference', String(row._id), previous, next, undefined, String(row.propertyId));
        return res.json({ status: 'success', data: row, publishedExternally: false });
    });
}
function shortlistApplication(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c;
        const company = companyId(req);
        if (!company)
            return res.status(403).json({ message: 'Company scope required' });
        const app = yield tenantFacing_1.RentalApplication.findOne({ _id: req.params.id, companyId: company });
        if (!app || !(yield (0, propertyAccess_1.callerCanAccessProperty)(req, String(app.propertyId))))
            return res.status(404).json({ message: 'Application was not found in this company' });
        const next = String(((_a = req.body) === null || _a === void 0 ? void 0 : _a.status) || 'SHORTLISTED');
        if (next === 'OWNER_APPROVED' || next === 'OWNER_DECLINED') {
            return res.status(403).json({ message: 'Owner approval is a separate gate' });
        }
        try {
            (0, workflowMachine_1.assertApplicationTransition)(app.status, next);
        }
        catch (error) {
            return res.status(error.statusCode || 400).json({ message: error.message });
        }
        const previous = app.status;
        app.status = next;
        if ((_b = req.body) === null || _b === void 0 ? void 0 : _b.recommendation)
            app.agentNotes = String(req.body.recommendation);
        app.statusHistory.push({ status: next, at: new Date(), by: actorId(req), note: (_c = req.body) === null || _c === void 0 ? void 0 : _c.recommendation });
        yield app.save();
        yield audit(company, req, 'APPLICATION_STATUS', 'RentalApplication', String(app._id), previous, next, undefined, String(app.propertyId));
        if (next === 'SENT_TO_OWNER') {
            yield (0, workflowNotify_1.notifyLandlord)(company, String(app.propertyId), `application-shortlist:${app._id}`, 'Shortlist ready for review', 'A rental application is waiting for your decision.');
        }
        return res.json({ status: 'success', data: app });
    });
}
function ownerApplicationDecision(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c, _d, _e;
        const company = companyId(req);
        if (!company)
            return res.status(403).json({ message: 'Company scope required' });
        if (!isOwnerRole(req))
            return res.status(403).json({ message: 'Owner approval is a separate gate' });
        const app = yield tenantFacing_1.RentalApplication.findOne({ _id: req.params.id, companyId: company });
        if (!app || !(yield (0, propertyAccess_1.callerCanAccessProperty)(req, String(app.propertyId))))
            return res.status(404).json({ message: 'Application was not found in this company' });
        if (!(yield landlordMayDecide(req, String(app.propertyId), company))) {
            return res.status(404).json({ message: 'Application was not found in this company' });
        }
        const next = ((_a = req.body) === null || _a === void 0 ? void 0 : _a.decision) === 'DECLINED'
            ? 'OWNER_DECLINED'
            : ((_b = req.body) === null || _b === void 0 ? void 0 : _b.decision) === 'APPROVED'
                ? 'OWNER_APPROVED'
                : ((_c = req.body) === null || _c === void 0 ? void 0 : _c.decision) === 'FURTHER'
                    ? 'UNDER_REVIEW'
                    : '';
        if (!next)
            return res.status(400).json({ message: 'Decision must be APPROVED, DECLINED, or FURTHER' });
        try {
            (0, workflowMachine_1.assertApplicationTransition)(app.status, next);
        }
        catch (error) {
            return res.status(error.statusCode || 400).json({ message: error.message });
        }
        const previous = app.status;
        app.status = next;
        app.statusHistory.push({ status: next, at: new Date(), by: actorId(req), note: (_d = req.body) === null || _d === void 0 ? void 0 : _d.reason });
        yield app.save();
        yield audit(company, req, 'OWNER_APPLICANT_DECISION', 'RentalApplication', String(app._id), previous, next, (_e = req.body) === null || _e === void 0 ? void 0 : _e.reason, String(app.propertyId));
        yield (0, workflowNotify_1.notifyPropertyAgent)(company, String(app.propertyId), `application-decision:${app._id}:${next}`, 'Applicant decision recorded', next === 'OWNER_APPROVED' ? 'The landlord selected an applicant.' : 'The landlord recorded an applicant decision.');
        return res.json({ status: 'success', data: app });
    });
}
function ownerLettingWorkspace(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        const company = companyId(req);
        if (!company)
            return res.status(403).json({ message: 'Company scope required' });
        const property = yield propertyInCompany(req, req.params.propertyId, company);
        if (!property || !(yield landlordMayDecide(req, String(property._id), company))) {
            return res.status(404).json({ message: 'Property was not found in this company' });
        }
        const [assessment, mandate, applications] = yield Promise.all([
            gateAssessment(company, property._id),
            gateMandate(company, property._id),
            tenantFacing_1.RentalApplication.find({
                propertyId: property._id,
                companyId: company,
                status: { $in: ['SENT_TO_OWNER', 'OWNER_APPROVED', 'OWNER_DECLINED'] },
            }).select('status submittedAt snapshot documents statusHistory createdAt').sort({ createdAt: -1 }).limit(20).lean(),
        ]);
        return res.json({
            status: 'success',
            data: {
                property: { _id: property._id, name: property.name },
                assessment,
                mandate: mandate ? { _id: mandate._id, status: mandate.status, agreedRent: mandate.agreedRent, signedAt: mandate.signedAt } : null,
                shortlist: applications,
            },
        });
    });
}
function prepareAgencyLease(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b;
        const company = companyId(req);
        if (!company)
            return res.status(403).json({ message: 'Company scope required' });
        const app = yield tenantFacing_1.RentalApplication.findOne({ _id: (_a = req.body) === null || _a === void 0 ? void 0 : _a.applicationId, companyId: company });
        if (!app || app.status !== 'OWNER_APPROVED') {
            return res.status(409).json({ message: 'Owner approval required before a lease draft' });
        }
        const property = yield propertyInCompany(req, String(app.propertyId), company);
        if (!property)
            return res.status(404).json({ message: 'Property was not found in this company' });
        const existing = yield Lease_1.Lease.findOne({ companyId: company, applicationId: app._id });
        if (existing)
            return res.json({ status: 'success', data: existing, duplicate: true });
        if (!((_b = req.body) === null || _b === void 0 ? void 0 : _b.tenantId) || !mongoose_1.default.Types.ObjectId.isValid(String(req.body.tenantId))) {
            return res.status(400).json({ message: 'A tenant in this company is required' });
        }
        const tenant = yield Tenant_1.Tenant.findOne({ _id: req.body.tenantId, companyId: company }).select('_id propertyId companyId');
        if (!tenant)
            return res.status(404).json({ message: 'Tenant was not found in this company' });
        if (tenant.propertyId && String(tenant.propertyId) !== String(app.propertyId)) {
            return res.status(409).json({ message: 'Tenant is linked to a different property' });
        }
        const lease = yield Lease_1.Lease.create({
            propertyId: app.propertyId,
            tenantId: tenant._id,
            startDate: req.body.startDate,
            endDate: req.body.endDate,
            rentAmount: Number(req.body.rentAmount || 0),
            depositAmount: Number(req.body.depositAmount || 0),
            monthlyRent: Number(req.body.rentAmount || 0),
            status: 'draft',
            companyId: company,
            ownerId: actorId(req),
            agencyWorkflow: true,
            applicationId: app._id,
        });
        yield audit(company, req, 'LEASE_DRAFT', 'Lease', String(lease._id), undefined, 'draft', undefined, String(lease.propertyId));
        return res.status(201).json({ status: 'success', data: lease });
    });
}
function signAgencyLease(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        const company = companyId(req);
        if (!company)
            return res.status(403).json({ message: 'Company scope required' });
        const lease = yield Lease_1.Lease.findOne({ _id: req.params.id, companyId: company });
        if (!lease || !(yield (0, propertyAccess_1.callerCanAccessProperty)(req, String(lease.propertyId))))
            return res.status(404).json({ message: 'Lease was not found in this company' });
        const party = (_a = req.body) === null || _a === void 0 ? void 0 : _a.party;
        if (party === 'owner') {
            if (!(yield landlordMayDecide(req, String(lease.propertyId), company))) {
                return res.status(403).json({ message: 'Owner signature is a separate gate' });
            }
            if (lease.ownerSignedAt)
                return res.json({ status: 'success', data: lease, financialPosting: false });
            lease.ownerSignedAt = new Date();
        }
        else if (party === 'tenant') {
            if (isOwnerRole(req))
                return res.status(403).json({ message: 'Tenant signature is recorded by the agency' });
            if (lease.tenantSignedAt)
                return res.json({ status: 'success', data: lease, financialPosting: false });
            lease.tenantSignedAt = new Date();
        }
        else {
            return res.status(400).json({ message: 'Party must be tenant or owner' });
        }
        yield lease.save();
        yield audit(company, req, 'LEASE_SIGNATURE', 'Lease', String(lease._id), undefined, party, undefined, String(lease.propertyId));
        return res.json({ status: 'success', data: lease, financialPosting: false });
    });
}
function activateAgencyLease(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        const company = companyId(req);
        if (!company)
            return res.status(403).json({ message: 'Company scope required' });
        const lease = yield Lease_1.Lease.findOne({ _id: req.params.id, companyId: company });
        if (!lease || !(yield (0, propertyAccess_1.callerCanAccessProperty)(req, String(lease.propertyId))))
            return res.status(404).json({ message: 'Lease was not found in this company' });
        if (lease.status === 'active')
            return res.json({ status: 'success', data: lease, duplicate: true });
        const application = lease.applicationId
            ? yield tenantFacing_1.RentalApplication.findOne({ _id: lease.applicationId, companyId: company }).lean()
            : null;
        const tenant = yield Tenant_1.Tenant.findOne({ _id: lease.tenantId, companyId: company }).select('_id').lean();
        const property = yield Property_1.Property.findOne({ _id: lease.propertyId, companyId: company }).select('_id').lean();
        if (!tenant || !property)
            return res.status(404).json({ message: 'Lease relationships were not found in this company' });
        const depositReceived = yield completedDepositReceived(company, lease._id);
        const blockers = (0, lettingWorkflow_1.leaseActivationBlockers)({
            applicationStatus: application === null || application === void 0 ? void 0 : application.status,
            tenantSignedAt: lease.tenantSignedAt,
            ownerSignedAt: lease.ownerSignedAt,
            depositRequired: Number(lease.depositAmount || 0),
            depositReceived,
        });
        if (blockers.length)
            return res.status(403).json({ message: blockers[0], blockers });
        const previous = lease.status;
        lease.status = 'active';
        yield lease.save();
        yield audit(company, req, 'LEASE_ACTIVATED', 'Lease', String(lease._id), previous, 'active', undefined, String(lease.propertyId));
        yield (0, workflowNotify_1.notifyLandlord)(company, String(lease.propertyId), `lease-activated:${lease._id}`, 'Lease activated', 'A lease for your property is now active.');
        return res.json({ status: 'success', data: lease });
    });
}
function rentCollectionBoard(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        const company = companyId(req);
        if (!company)
            return res.status(403).json({ message: 'Company scope required' });
        const rows = yield buildRentBoardRows(req, company);
        return res.json({ status: 'success', data: rows });
    });
}
function requestMaintenancePayment(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c;
        const company = companyId(req);
        if (!company)
            return res.status(403).json({ message: 'Company scope required' });
        const quote = yield MaintenanceQuote_1.MaintenanceQuote.findOne({ _id: (_a = req.body) === null || _a === void 0 ? void 0 : _a.quoteId, companyId: company }).lean();
        if (!quote || !(yield (0, propertyAccess_1.callerCanAccessProperty)(req, String(quote.propertyId))))
            return res.status(404).json({ message: 'Quote was not found in this company' });
        const requestedAmount = Number(((_b = req.body) === null || _b === void 0 ? void 0 : _b.amount) || 0);
        if (!(requestedAmount > 0))
            return res.status(400).json({ message: 'Requested amount must be greater than zero', financialPosting: false });
        const currency = String(quote.currency || 'USD');
        if (currency !== 'USD' && currency !== 'ZWL') {
            return res.status(409).json({ message: 'This quote currency cannot be recorded on a payment request', financialPosting: false });
        }
        const job = yield maintenanceWorkflow_1.ContractorJobRecord.findOne({ quoteId: quote._id, companyId: company, status: { $in: ['AUTHORISED', 'ACCEPTED', 'SCHEDULED', 'WORK_IN_PROGRESS', 'COMPLETED', 'CLOSED'] } }).lean();
        const changeOrders = yield maintenanceWorkflow_1.MaintenanceChangeOrder.find({
            companyId: company,
            originalQuoteId: quote._id,
            status: 'OWNER_APPROVED',
        }).select('requestedAmount').lean();
        const approvedAmount = Number(quote.total || quote.amount || 0) + changeOrders.reduce((sum, row) => sum + Number(row.requestedAmount || 0), 0);
        const blockers = (0, lettingWorkflow_1.maintenanceRequestBlockers)({
            quoteStatus: quote.status,
            quotePropertyId: quote.propertyId ? String(quote.propertyId) : undefined,
            requestPropertyId: ((_c = req.body) === null || _c === void 0 ? void 0 : _c.propertyId) ? String(req.body.propertyId) : (quote.propertyId ? String(quote.propertyId) : undefined),
            quoteCompanyId: String(quote.companyId),
            requestCompanyId: company,
            approvedAmount,
            requestedAmount,
            changeOrderApproved: false,
            agentAuthorised: Boolean(job),
        });
        if (blockers.length)
            return res.status(409).json({ message: blockers[0], blockers, financialPosting: false });
        const reason = `Maintenance quote ${quote._id}`;
        const existing = yield PaymentRequest_1.PaymentRequest.findOne({ companyId: company, reason, status: 'pending' }).lean();
        if (existing)
            return res.status(409).json({ message: 'A payment request for this quote is already pending', financialPosting: false });
        const request = yield PaymentRequest_1.PaymentRequest.create({
            companyId: company,
            propertyId: quote.propertyId || req.body.propertyId,
            amount: requestedAmount,
            currency,
            reason,
            requestDate: new Date(),
            dueDate: req.body.dueDate || new Date(),
            status: 'pending',
            requestedBy: String(actorId(req) || ''),
            requestedByUser: actorId(req),
            payTo: req.body.payTo || { name: 'Contractor', surname: 'Payee' },
            readyForAccounting: true,
            maintenanceRequestId: quote.requestId,
            approval: { status: 'pending' },
        });
        yield audit(company, req, 'MAINTENANCE_PAYMENT_REQUESTED', 'PaymentRequest', String(request._id), undefined, 'pending', undefined, quote.propertyId ? String(quote.propertyId) : undefined);
        const accountants = yield User_1.User.find({ companyId: company, role: 'accountant', isActive: { $ne: false } }).select('_id').limit(20).lean();
        for (const accountant of accountants) {
            yield (0, workflowNotify_1.notifyOnce)(company, String(accountant._id), `maintenance-payment-request:${request._id}:${accountant._id}`, 'Maintenance payment request', 'A maintenance payment request is waiting for accounting review. The request is not a payment.');
        }
        return res.status(201).json({ status: 'success', data: request, financialPosting: false });
    });
}
function fileLevyReceipt(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c, _d;
        const company = companyId(req);
        if (!company)
            return res.status(403).json({ message: 'Company scope required' });
        const levy = yield LevyPayment_1.LevyPayment.findOne({ _id: req.params.id, companyId: company });
        if (!levy || !(yield (0, propertyAccess_1.callerCanAccessProperty)(req, String(levy.propertyId))))
            return res.status(404).json({ message: 'Levy was not found in this company' });
        const receiptNumber = ((_a = req.body) === null || _a === void 0 ? void 0 : _a.receiptNumber) ? String(req.body.receiptNumber) : '';
        const receiptFileUrl = ((_b = req.body) === null || _b === void 0 ? void 0 : _b.receiptFileUrl) ? String(req.body.receiptFileUrl) : '';
        const sameReceipt = Boolean(receiptNumber)
            && levy.receiptNumber === receiptNumber
            && (!receiptFileUrl || levy.receiptFileUrl === receiptFileUrl);
        if (sameReceipt)
            return res.json({ status: 'success', data: levy, financialPosting: false, duplicate: true });
        levy.receiptNumber = receiptNumber || levy.receiptNumber;
        if (receiptFileUrl)
            levy.receiptFileUrl = receiptFileUrl;
        if ((_c = req.body) === null || _c === void 0 ? void 0 : _c.levyAuthority)
            levy.levyAuthority = req.body.levyAuthority;
        levy.receiptUploadedBy = actorId(req);
        levy.receiptUploadedAt = new Date();
        if ((_d = req.body) === null || _d === void 0 ? void 0 : _d.notes)
            levy.notes = req.body.notes;
        yield levy.save();
        yield audit(company, req, 'LEVY_RECEIPT_FILED', 'LevyPayment', String(levy._id), undefined, undefined, undefined, String(levy.propertyId));
        return res.json({ status: 'success', data: levy, financialPosting: false });
    });
}
function propertyWorkspace(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        const company = companyId(req);
        if (!company)
            return res.status(403).json({ message: 'Company scope required' });
        const property = yield propertyInCompany(req, req.params.propertyId, company);
        if (!property)
            return res.status(404).json({ message: 'Property was not found in this company' });
        const [assessment, mandate, listings, applications, viewings, lease, events] = yield Promise.all([
            gateAssessment(company, property._id),
            gateMandate(company, property._id),
            lettingModels_1.ListingReference.find({ propertyId: property._id, companyId: company }).sort({ createdAt: -1 }).limit(10).lean(),
            tenantFacing_1.RentalApplication.find({ propertyId: property._id, companyId: company }).sort({ createdAt: -1 }).limit(20).lean(),
            tenantFacing_2.ViewingRequest.find({ propertyId: property._id, companyId: company }).sort({ createdAt: -1 }).limit(20).lean(),
            Lease_1.Lease.findOne({ propertyId: property._id, companyId: company }).sort({ createdAt: -1 }).lean(),
            lettingModels_1.AgencyWorkflowEvent.find({ companyId: company, propertyId: property._id }).sort({ createdAt: -1 }).limit(30).lean(),
        ]);
        const review = applications.filter((row) => ['SUBMITTED', 'UNDER_REVIEW'].includes(row.status)).length;
        const shortlisted = applications.filter((row) => row.status === 'SHORTLISTED').length;
        const awaitingOwner = applications.filter((row) => row.status === 'SENT_TO_OWNER').length;
        const activeListing = listings.find((row) => row.status === 'ACTIVE');
        const depositReceived = lease ? yield completedDepositReceived(company, lease._id) : 0;
        const nextAction = (0, lettingWorkflow_1.nextAgencyAction)({
            assessmentStatus: assessment === null || assessment === void 0 ? void 0 : assessment.status,
            mandateStatus: mandate === null || mandate === void 0 ? void 0 : mandate.status,
            listingStatus: activeListing ? 'ACTIVE' : (_a = listings[0]) === null || _a === void 0 ? void 0 : _a.status,
            applicationsAwaitingReview: review,
            shortlisted,
            awaitingOwner,
            lease: lease ? {
                status: lease.status,
                tenantSignedAt: lease.tenantSignedAt,
                ownerSignedAt: lease.ownerSignedAt,
                depositOutstanding: Number(lease.depositAmount || 0) > depositReceived + 0.001,
            } : null,
        });
        return res.json({
            status: 'success',
            data: { property, assessment, mandate, listings, applications, viewings, lease, events, nextAction },
        });
    });
}
function agencySearch(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        const company = companyId(req);
        if (!company)
            return res.status(403).json({ message: 'Company scope required' });
        const q = String(req.query.q || '').trim().slice(0, 80);
        if (q.length < 2)
            return res.json({ status: 'success', data: [] });
        const safe = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(safe, 'i');
        const visibleIds = yield (0, propertyAccess_1.propertyIdsForCaller)(req);
        const propertyQuery = { companyId: company, name: regex };
        if (visibleIds !== 'company')
            propertyQuery._id = { $in: visibleIds };
        const [properties, leases] = yield Promise.all([
            Property_1.Property.find(propertyQuery).select('name rent status').limit(8).lean(),
            Lease_1.Lease.find(Object.assign({ companyId: company }, (visibleIds === 'company' ? {} : { propertyId: { $in: visibleIds } }))).select('propertyId status rentAmount').limit(8).lean(),
        ]);
        return res.json({
            status: 'success',
            data: [
                ...properties.map((row) => ({ type: 'property', id: row._id, label: row.name, path: `/agent-dashboard/properties/${row._id}` })),
                ...leases.map((row) => ({ type: 'lease', id: row._id, label: `Lease ${row.status}`, path: `/agent-dashboard/leases` })),
            ],
        });
    });
}
function scopedPropertyFilter(company, visibleIds) {
    return visibleIds === 'company'
        ? { companyId: company }
        : { companyId: company, _id: { $in: visibleIds } };
}
function scopedChildFilter(company, visibleIds) {
    return visibleIds === 'company'
        ? { companyId: company }
        : { companyId: company, propertyId: { $in: visibleIds } };
}
function seniorPortfolio(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        const company = companyId(req);
        if (!company)
            return res.status(403).json({ message: 'Company scope required' });
        if (!isSenior(req))
            return res.status(403).json({ message: 'Portfolio oversight is limited to senior agency roles' });
        const visibleIds = yield (0, propertyAccess_1.propertyIdsForCaller)(req);
        const properties = scopedPropertyFilter(company, visibleIds);
        const children = scopedChildFilter(company, visibleIds);
        const assessedIds = yield lettingModels_1.PropertyAssessment.distinct('propertyId', children);
        const [propertyCount, assessments, mandates, listings, review, shortlist, leases, requests, levies, board] = yield Promise.all([
            Property_1.Property.countDocuments(properties),
            lettingModels_1.PropertyAssessment.countDocuments(Object.assign(Object.assign({}, children), { status: 'ASSESSMENT_SUBMITTED' })),
            lettingModels_1.RentalMandate.countDocuments(Object.assign(Object.assign({}, children), { status: { $in: ['DRAFT', 'SENT'] } })),
            lettingModels_1.ListingReference.countDocuments(Object.assign(Object.assign({}, children), { status: 'PRE_LISTING' })),
            tenantFacing_1.RentalApplication.countDocuments(Object.assign(Object.assign({}, children), { status: { $in: ['SUBMITTED', 'UNDER_REVIEW'] } })),
            tenantFacing_1.RentalApplication.countDocuments(Object.assign(Object.assign({}, children), { status: 'SENT_TO_OWNER' })),
            Lease_1.Lease.countDocuments(Object.assign(Object.assign({}, children), { status: 'draft', $or: [
                    { tenantSignedAt: null },
                    { tenantSignedAt: { $exists: false } },
                    { ownerSignedAt: null },
                    { ownerSignedAt: { $exists: false } },
                ] })),
            PaymentRequest_1.PaymentRequest.countDocuments(Object.assign(Object.assign({}, children), { readyForAccounting: true, status: 'pending' })),
            LevyPayment_1.LevyPayment.countDocuments(Object.assign(Object.assign({}, children), { receiptNumber: { $in: [null, ''] } })),
            buildRentBoardRows(req, company),
        ]);
        const awaitingAssessment = yield Property_1.Property.countDocuments(Object.assign(Object.assign({}, properties), (assessedIds.length ? { _id: { $nin: assessedIds } } : {})));
        return res.json({
            status: 'success',
            data: {
                properties: propertyCount,
                propertiesAwaitingAssessment: awaitingAssessment,
                assessmentsAwaitingOwner: assessments,
                mandatesAwaitingSignature: mandates,
                listingsAwaitingCompletion: listings,
                applicationsAwaitingReview: review,
                shortlistsAwaitingOwner: shortlist,
                leasesAwaitingSignature: leases,
                rentRequiringCollection: board.filter((row) => row.status === 'DUE' || row.status === 'OVERDUE' || row.status === 'PARTIALLY_PAID').length,
                maintenancePaymentsAwaitingAccounting: requests,
                leviesAwaitingReceipt: levies,
            },
        });
    });
}
function accountantWorkQueue(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        const company = companyId(req);
        if (!company)
            return res.status(403).json({ message: 'Company scope required' });
        const requests = yield PaymentRequest_1.PaymentRequest.find({ companyId: company, readyForAccounting: true, status: 'pending' }).select('propertyId amount currency reason status createdAt').limit(50).lean();
        return res.json({
            status: 'success',
            data: { maintenancePaymentRequests: requests },
            note: 'A request is not a financial posting.',
        });
    });
}
