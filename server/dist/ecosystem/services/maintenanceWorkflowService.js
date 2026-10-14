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
exports.assertOwnerCanActOnProperty = assertOwnerCanActOnProperty;
exports.agentReviewRequest = agentReviewRequest;
exports.inviteContractors = inviteContractors;
exports.submitQuote = submitQuote;
exports.listQuotesForAgent = listQuotesForAgent;
exports.listQuotesForContractor = listQuotesForContractor;
exports.selectQuote = selectQuote;
exports.sendQuoteToOwner = sendQuoteToOwner;
exports.ownerDecideQuote = ownerDecideQuote;
exports.authoriseWork = authoriseWork;
exports.contractorUpdateJob = contractorUpdateJob;
exports.tenantConfirmMaintenance = tenantConfirmMaintenance;
exports.submitRating = submitRating;
exports.createTenantReference = createTenantReference;
exports.requestChangeOrder = requestChangeOrder;
exports.agentReviewChangeOrder = agentReviewChangeOrder;
exports.ownerDecideChangeOrder = ownerDecideChangeOrder;
exports.createMaintenanceInspection = createMaintenanceInspection;
exports.acknowledgeInspection = acknowledgeInspection;
const MaintenanceRequest_1 = require("../../models/MaintenanceRequest");
const MaintenanceQuote_1 = require("../../models/MaintenanceQuote");
const MaintenanceContractor_1 = require("../../models/MaintenanceContractor");
const Property_1 = require("../../models/Property");
const PropertyOwner_1 = require("../../models/PropertyOwner");
const User_1 = require("../../models/User");
const Inspection_1 = require("../../models/Inspection");
const errorHandler_1 = require("../../middleware/errorHandler");
const maintenanceWorkflow_1 = require("../models/maintenanceWorkflow");
const engagement_1 = require("../models/engagement");
const audit_1 = require("../audit");
const commsAndPayments_1 = require("../models/commsAndPayments");
const notificationService_1 = require("./notificationService");
const logger_1 = require("../../utils/logger");
const workflowMachine_1 = require("../workflowMachine");
const constants_1 = require("../constants");
const flags_1 = require("../flags");
const Company_1 = require("../../models/Company");
const Lease_1 = require("../../models/Lease");
const Tenant_1 = require("../../models/Tenant");
function loadRequest(requestId, companyId) {
    return __awaiter(this, void 0, void 0, function* () {
        const query = { _id: requestId };
        if (companyId)
            query.companyId = companyId;
        const request = yield MaintenanceRequest_1.MaintenanceRequest.findOne(query);
        if (!request)
            throw new errorHandler_1.AppError('Maintenance request not found', 404, 'NOT_FOUND');
        return request;
    });
}
function userRoles(user) {
    return [user === null || user === void 0 ? void 0 : user.role, ...((user === null || user === void 0 ? void 0 : user.roles) || [])].filter(Boolean);
}
/** Owner must own the property. Agency staff must belong to the request company. Never trust body IDs. */
function assertOwnerCanActOnProperty(params) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b;
        const actor = yield User_1.User.findById(params.actorUserId).select('email role roles companyId').lean();
        if (!actor)
            throw new errorHandler_1.AppError('Authentication required', 401, 'AUTH_REQUIRED');
        const roles = userRoles(actor);
        const isAgency = ['admin', 'agent', 'principal', 'prea'].some((role) => roles.includes(role));
        if (isAgency) {
            if (String(actor.companyId || '') !== String(params.requestCompanyId)) {
                throw new errorHandler_1.AppError('You cannot access another company\'s maintenance', 403, 'FORBIDDEN');
            }
            return;
        }
        if (!roles.includes('owner')) {
            throw new errorHandler_1.AppError('You cannot approve quotes for another owner\'s property', 403, 'FORBIDDEN');
        }
        const ownerRecord = actor.email
            ? yield PropertyOwner_1.PropertyOwner.findOne({ email: actor.email }).select('_id').lean()
            : null;
        const owns = Boolean(ownerRecord && String(ownerRecord._id) === String(((_a = params.property) === null || _a === void 0 ? void 0 : _a.propertyOwnerId) || '')) ||
            String(((_b = params.property) === null || _b === void 0 ? void 0 : _b.ownerId) || '') === params.actorUserId;
        if (!owns) {
            throw new errorHandler_1.AppError('You cannot approve quotes for another owner\'s property', 403, 'FORBIDDEN');
        }
    });
}
function workflowStatus(request) {
    var _a;
    return (((_a = request.ecosystemWorkflow) === null || _a === void 0 ? void 0 : _a.status) || 'REPORTED');
}
function setWorkflowStatus(request, next, extra) {
    return __awaiter(this, void 0, void 0, function* () {
        const current = workflowStatus(request);
        if (current !== next)
            (0, workflowMachine_1.assertMaintenanceTransition)(current, next);
        request.ecosystemWorkflow = Object.assign(Object.assign(Object.assign({}, (request.ecosystemWorkflow || {})), { enabled: true, status: next }), (extra || {}));
        const legacy = constants_1.LEGACY_STATUS_FROM_ECOSYSTEM[next];
        if (legacy)
            request.status = legacy;
        yield request.save();
        return request;
    });
}
function agentReviewRequest(params) {
    return __awaiter(this, void 0, void 0, function* () {
        const request = yield loadRequest(params.requestId, params.companyId);
        yield setWorkflowStatus(request, 'UNDER_REVIEW');
        yield (0, audit_1.ecosystemAudit)({
            req: params.req,
            actor: params.actorId,
            action: 'MAINTENANCE_REVIEWED',
            entity: 'MaintenanceRequest',
            entityId: params.requestId,
            newState: { status: 'UNDER_REVIEW' },
        });
        return request;
    });
}
function rememberContractorPhone(userId, phone) {
    return __awaiter(this, void 0, void 0, function* () {
        const trimmed = phone === null || phone === void 0 ? void 0 : phone.trim();
        if (!trimmed)
            return;
        const existing = yield commsAndPayments_1.CommunicationPreference.findOne({ userId });
        if (!existing) {
            yield commsAndPayments_1.CommunicationPreference.create({ userId, phone: trimmed });
            return;
        }
        if (!existing.phone) {
            existing.phone = trimmed;
            yield existing.save();
        }
    });
}
function inviteContractors(params) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c;
        const request = yield loadRequest(params.requestId, params.companyId);
        if (!((_a = params.contractorIds) === null || _a === void 0 ? void 0 : _a.length))
            throw new errorHandler_1.AppError('At least one contractor is required', 400, 'VALIDATION_ERROR');
        const property = yield Property_1.Property.findById(request.propertyId).select('name address').lean();
        const scopeSnapshot = {
            title: request.title,
            description: request.description,
            category: ((_b = request.ecosystemWorkflow) === null || _b === void 0 ? void 0 : _b.category) || request.category,
            urgency: (_c = request.ecosystemWorkflow) === null || _c === void 0 ? void 0 : _c.urgency,
            propertyName: (property === null || property === void 0 ? void 0 : property.name) || '',
            propertyLocation: (property === null || property === void 0 ? void 0 : property.address) || '',
            attachments: (request.attachments || []).map((file) => ({
                name: file === null || file === void 0 ? void 0 : file.name,
                type: file === null || file === void 0 ? void 0 : file.type,
                size: file === null || file === void 0 ? void 0 : file.size,
            })),
        };
        const portalLink = `${process.env.CLIENT_URL || process.env.APP_BASE_URL || 'http://localhost:3000'}/contractor-dashboard/jobs`;
        const submittedAt = new Date().toISOString();
        const notificationWarnings = [];
        const created = [];
        for (const contractorId of params.contractorIds) {
            const contractor = yield MaintenanceContractor_1.MaintenanceContractor.findOne(Object.assign(Object.assign({ _id: contractorId }, (0, MaintenanceContractor_1.contractorDirectoryFilter)(params.companyId)), { active: { $ne: false } }));
            if (!contractor)
                throw new errorHandler_1.AppError('Contractor not found', 404, 'NOT_FOUND');
            const invitation = yield maintenanceWorkflow_1.QuoteInvitation.findOneAndUpdate({ requestId: request._id, contractorId }, {
                $setOnInsert: {
                    companyId: params.companyId,
                    propertyId: request.propertyId,
                    invitedBy: params.actorId,
                    scopeSnapshot,
                    status: 'INVITED',
                },
            }, { upsert: true, new: true });
            const job = yield maintenanceWorkflow_1.ContractorJobRecord.findOneAndUpdate({ requestId: request._id, contractorId }, {
                $setOnInsert: {
                    companyId: params.companyId,
                    propertyId: request.propertyId,
                    status: 'QUOTE_REQUESTED',
                },
            }, { upsert: true, new: true });
            if (job && job.status === 'INVITED') {
                (0, workflowMachine_1.assertJobTransition)(job.status, 'QUOTE_REQUESTED');
                job.status = 'QUOTE_REQUESTED';
                yield job.save();
            }
            created.push(invitation);
            let recipientId = contractor.userId ? String(contractor.userId) : '';
            if (!recipientId && (0, notificationService_1.isDeliverableEmail)(contractor.email)) {
                const matched = yield User_1.User.findOne({ email: contractor.email.toLowerCase() }).select('_id').lean();
                if (matched)
                    recipientId = String(matched._id);
            }
            if (!recipientId) {
                notificationWarnings.push(`${contractor.companyName} has no contractor portal account, so the request was saved without an in-portal notification.`);
                logger_1.logger.warn('Job request saved without a portal recipient', { contractorId: String(contractor._id), requestId: params.requestId });
                continue;
            }
            try {
                yield rememberContractorPhone(recipientId, contractor.phone);
                yield (0, notificationService_1.notifyEvent)({
                    recipientId,
                    companyId: params.companyId,
                    eventType: 'QUOTE_REQUESTED',
                    email: contractor.email,
                    link: portalLink,
                    variables: {
                        maintenanceDescription: request.title || 'Maintenance request',
                        propertyName: (property === null || property === void 0 ? void 0 : property.name) || 'the property',
                        propertyReference: (property === null || property === void 0 ? void 0 : property.name) || String(request._id),
                        propertyLocation: (property === null || property === void 0 ? void 0 : property.address) || 'Available in the portal after sign-in',
                        submittedAt,
                        portalLink,
                    },
                    idempotencyKey: `quote-invite:${invitation === null || invitation === void 0 ? void 0 : invitation._id}`,
                });
            }
            catch (error) {
                notificationWarnings.push(`The job request for ${contractor.companyName} was saved, but the notification could not be sent.`);
                logger_1.logger.warn('Job request notification failed', { contractorId: String(contractor._id), message: error === null || error === void 0 ? void 0 : error.message });
            }
        }
        yield setWorkflowStatus(request, 'QUOTE_REQUESTED');
        yield (0, audit_1.ecosystemAudit)({
            req: params.req,
            actor: params.actorId,
            action: 'CONTRACTOR_INVITED',
            entity: 'MaintenanceRequest',
            entityId: params.requestId,
            metadata: { contractorIds: params.contractorIds },
        });
        return { request, invitations: created, notificationWarnings };
    });
}
function submitQuote(params) {
    return __awaiter(this, void 0, void 0, function* () {
        const contractor = yield MaintenanceContractor_1.MaintenanceContractor.findOne({ userId: params.contractorUserId });
        if (!contractor)
            throw new errorHandler_1.AppError('Contractor profile not found', 404, 'NOT_FOUND');
        const invitation = yield maintenanceWorkflow_1.QuoteInvitation.findOne({ requestId: params.requestId, contractorId: contractor._id });
        if (!invitation)
            throw new errorHandler_1.AppError('You were not invited to quote for this job', 403, 'FORBIDDEN');
        const existing = yield MaintenanceQuote_1.MaintenanceQuote.findOne({
            requestId: params.requestId,
            contractorId: contractor._id,
            status: { $in: ['OWNER_APPROVED'] },
        });
        if (existing)
            (0, workflowMachine_1.assertQuoteNotLocked)(existing.status);
        const lineItems = (params.lineItems || []).map((item) => ({
            description: item.description,
            quantity: Number(item.quantity),
            unitCost: Number(item.unitCost),
            total: Number(item.quantity) * Number(item.unitCost),
        }));
        const subtotal = lineItems.reduce((s, i) => s + i.total, 0);
        const previous = yield MaintenanceQuote_1.MaintenanceQuote.findOne({ requestId: params.requestId, contractorId: contractor._id }).sort({ version: -1 });
        if (previous)
            (0, workflowMachine_1.assertQuoteNotLocked)(previous.status);
        const version = previous ? (previous.version || 1) + 1 : 1;
        const quote = yield MaintenanceQuote_1.MaintenanceQuote.create({
            requestId: params.requestId,
            companyId: invitation.companyId,
            contractorId: contractor._id,
            propertyId: invitation.propertyId,
            amount: subtotal,
            description: params.description,
            submittedDate: new Date(),
            submittedBy: params.contractorUserId,
            createdBy: params.contractorUserId,
            lineItems,
            subtotal,
            tax: 0,
            total: subtotal,
            currency: 'USD',
            estimatedDuration: params.estimatedDuration,
            estimatedStartDate: params.estimatedStartDate,
            validUntil: params.validUntil,
            attachments: params.attachments,
            notes: params.notes,
            status: 'SUBMITTED',
            version,
            parentQuoteId: previous === null || previous === void 0 ? void 0 : previous._id,
            submittedAt: new Date(),
        });
        invitation.status = 'SUBMITTED';
        yield invitation.save();
        const job = yield maintenanceWorkflow_1.ContractorJobRecord.findOne({ requestId: params.requestId, contractorId: contractor._id });
        if (job) {
            (0, workflowMachine_1.assertJobTransition)(job.status, 'QUOTE_SUBMITTED');
            job.status = 'QUOTE_SUBMITTED';
            job.quoteId = quote._id;
            yield job.save();
        }
        const request = yield loadRequest(params.requestId);
        yield setWorkflowStatus(request, 'QUOTE_RECEIVED');
        yield (0, audit_1.ecosystemAudit)({
            req: params.req,
            actor: params.contractorUserId,
            action: 'QUOTE_SUBMITTED',
            entity: 'MaintenanceQuote',
            entityId: String(quote._id),
            newState: { version, total: subtotal },
        });
        const property = yield Property_1.Property.findById(invitation.propertyId).select('name').lean();
        yield (0, notificationService_1.notifyCompanyStaff)(String(invitation.companyId), 'QUOTE_RECEIVED', {
            contractorName: contractor.companyName || 'Contractor',
            quoteAmount: String(subtotal),
            propertyName: (property === null || property === void 0 ? void 0 : property.name) || 'the property',
        }, `quote-received:${quote._id}`);
        return quote;
    });
}
function listQuotesForAgent(requestId, companyId) {
    return __awaiter(this, void 0, void 0, function* () {
        const quotes = yield MaintenanceQuote_1.MaintenanceQuote.find({ requestId, companyId })
            .populate('contractorId', 'companyName trade rating verificationStatus')
            .sort({ total: 1, amount: 1 })
            .lean();
        return quotes.map((q) => {
            var _a, _b;
            return (Object.assign(Object.assign({}, q), { amount: (_a = q.total) !== null && _a !== void 0 ? _a : q.amount, duration: q.estimatedDuration, rating: (_b = q.contractorId) === null || _b === void 0 ? void 0 : _b.rating }));
        });
    });
}
function listQuotesForContractor(requestId, contractorUserId) {
    return __awaiter(this, void 0, void 0, function* () {
        const contractor = yield MaintenanceContractor_1.MaintenanceContractor.findOne({ userId: contractorUserId });
        if (!contractor)
            throw new errorHandler_1.AppError('Contractor profile not found', 404, 'NOT_FOUND');
        return MaintenanceQuote_1.MaintenanceQuote.find({ requestId, contractorId: contractor._id }).lean();
    });
}
function selectQuote(params) {
    return __awaiter(this, void 0, void 0, function* () {
        const request = yield loadRequest(params.requestId, params.companyId);
        const current = workflowStatus(request);
        if (!['QUOTE_RECEIVED', 'QUOTE_REQUESTED', 'UNDER_REVIEW'].includes(current)) {
            throw new errorHandler_1.AppError('Quotes can only be selected while they are under review', 409, 'INVALID_STATE_TRANSITION');
        }
        const quote = yield MaintenanceQuote_1.MaintenanceQuote.findOneAndUpdate({
            _id: params.quoteId,
            requestId: params.requestId,
            companyId: params.companyId,
            status: { $in: ['SUBMITTED', 'UNDER_REVIEW', 'SHORTLISTED'] },
        }, { $set: { status: 'SELECTED', reviewedAt: new Date() } }, { new: true });
        if (!quote)
            throw new errorHandler_1.AppError('Quote not found or already selected', 409, 'INVALID_STATE_TRANSITION');
        if (params.reason) {
            quote.notes = [quote.notes, params.reason].filter(Boolean).join('\n');
            yield quote.save();
        }
        yield MaintenanceQuote_1.MaintenanceQuote.updateMany({ requestId: params.requestId, companyId: params.companyId, _id: { $ne: quote._id }, status: 'SELECTED' }, { $set: { status: 'SUBMITTED' } });
        request.ecosystemWorkflow = Object.assign(Object.assign({}, (request.ecosystemWorkflow || {})), { selectedQuoteId: quote._id });
        yield request.save();
        const job = yield maintenanceWorkflow_1.ContractorJobRecord.findOne({ requestId: params.requestId, contractorId: quote.contractorId });
        if (job) {
            job.status = 'SELECTED';
            job.quoteId = quote._id;
            yield job.save();
        }
        yield (0, audit_1.ecosystemAudit)({
            req: params.req,
            actor: params.actorId,
            action: 'QUOTE_SELECTED',
            entity: 'MaintenanceQuote',
            entityId: String(quote._id),
            metadata: { reason: params.reason },
        });
        return quote;
    });
}
function sendQuoteToOwner(params) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b;
        const request = yield loadRequest(params.requestId, params.companyId);
        const quoteId = (_a = request.ecosystemWorkflow) === null || _a === void 0 ? void 0 : _a.selectedQuoteId;
        if (!quoteId)
            throw new errorHandler_1.AppError('Select a quote before sending it to the owner', 400, 'QUOTE_NOT_SELECTED');
        const quote = yield MaintenanceQuote_1.MaintenanceQuote.findOneAndUpdate({ _id: quoteId, status: 'SELECTED' }, { $set: { status: 'SENT_TO_OWNER' } }, { new: true });
        if (!quote)
            throw new errorHandler_1.AppError('Selected quote is not ready to send to the owner', 409, 'INVALID_STATE_TRANSITION');
        yield setWorkflowStatus(request, 'OWNER_APPROVAL');
        const property = yield Property_1.Property.findById(request.propertyId).select('name propertyOwnerId').lean();
        const owner = (property === null || property === void 0 ? void 0 : property.propertyOwnerId)
            ? yield PropertyOwner_1.PropertyOwner.findById(property.propertyOwnerId).select('email').lean()
            : null;
        const ownerUser = (owner === null || owner === void 0 ? void 0 : owner.email) ? yield User_1.User.findOne({ email: owner.email, role: { $in: ['owner'] } }).select('_id').lean() : null;
        if (ownerUser) {
            yield (0, notificationService_1.notifyEvent)({
                recipientId: String(ownerUser._id),
                companyId: params.companyId,
                eventType: 'QUOTE_SENT_TO_OWNER',
                variables: {
                    quoteAmount: String((_b = quote.total) !== null && _b !== void 0 ? _b : quote.amount),
                    propertyName: (property === null || property === void 0 ? void 0 : property.name) || 'the property',
                },
                idempotencyKey: `quote-owner:${quote._id}:${quote.version}`,
            });
        }
        yield (0, audit_1.ecosystemAudit)({
            req: params.req,
            actor: params.actorId,
            action: 'QUOTE_SENT_TO_OWNER',
            entity: 'MaintenanceQuote',
            entityId: String(quote._id),
            metadata: { version: quote.version },
        });
        return { request, quote };
    });
}
function ownerDecideQuote(params) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        const request = yield loadRequest(params.requestId);
        const property = yield Property_1.Property.findById(request.propertyId).select('propertyOwnerId companyId name ownerId').lean();
        if (!property)
            throw new errorHandler_1.AppError('Property not found', 404, 'NOT_FOUND');
        yield assertOwnerCanActOnProperty({
            actorUserId: params.ownerUserId,
            property,
            requestCompanyId: request.companyId,
        });
        const quoteId = (_a = request.ecosystemWorkflow) === null || _a === void 0 ? void 0 : _a.selectedQuoteId;
        if (!quoteId)
            throw new errorHandler_1.AppError('No quote has been sent for approval', 400, 'QUOTE_NOT_SELECTED');
        const quote = yield MaintenanceQuote_1.MaintenanceQuote.findById(quoteId);
        if (!quote)
            throw new errorHandler_1.AppError('Quote not found', 404, 'NOT_FOUND');
        if (quote.status !== 'SENT_TO_OWNER') {
            throw new errorHandler_1.AppError('This quote is not awaiting owner approval', 409, 'INVALID_STATE_TRANSITION');
        }
        const existing = yield maintenanceWorkflow_1.OwnerQuoteDecision.findOne({ quoteId: quote._id, quoteVersion: quote.version || 1, ownerUserId: params.ownerUserId });
        if (existing)
            return { decision: existing, quote, request };
        let decision;
        try {
            decision = yield maintenanceWorkflow_1.OwnerQuoteDecision.create({
                requestId: request._id,
                companyId: request.companyId,
                quoteId: quote._id,
                quoteVersion: quote.version || 1,
                ownerUserId: params.ownerUserId,
                decision: params.decision,
                comment: params.comment,
                decidedAt: new Date(),
            });
        }
        catch (error) {
            if ((error === null || error === void 0 ? void 0 : error.code) === 11000) {
                const dup = yield maintenanceWorkflow_1.OwnerQuoteDecision.findOne({ quoteId: quote._id, quoteVersion: quote.version || 1, ownerUserId: params.ownerUserId });
                if (dup)
                    return { decision: dup, quote, request };
            }
            throw error;
        }
        const ownerUserDoc = yield User_1.User.findById(params.ownerUserId).select('firstName lastName').lean();
        const ownerName = `${(ownerUserDoc === null || ownerUserDoc === void 0 ? void 0 : ownerUserDoc.firstName) || ''} ${(ownerUserDoc === null || ownerUserDoc === void 0 ? void 0 : ownerUserDoc.lastName) || ''}`.trim() || 'Owner';
        if (params.decision === 'APPROVE') {
            const updatedQuote = yield MaintenanceQuote_1.MaintenanceQuote.findOneAndUpdate({ _id: quote._id, status: 'SENT_TO_OWNER' }, { $set: { status: 'OWNER_APPROVED', approvedAt: new Date() } }, { new: true });
            if (!updatedQuote)
                throw new errorHandler_1.AppError('This quote is no longer awaiting owner approval', 409, 'INVALID_STATE_TRANSITION');
            quote.status = 'OWNER_APPROVED';
            yield setWorkflowStatus(request, 'APPROVED', {
                approvedQuoteId: quote._id,
                ownerApprovalId: decision._id,
            });
        }
        else {
            const nextQuoteStatus = params.decision === 'DECLINE' ? 'OWNER_DECLINED' : 'UNDER_REVIEW';
            const updatedQuote = yield MaintenanceQuote_1.MaintenanceQuote.findOneAndUpdate({ _id: quote._id, status: 'SENT_TO_OWNER' }, { $set: { status: nextQuoteStatus, declinedAt: new Date() } }, { new: true });
            if (!updatedQuote)
                throw new errorHandler_1.AppError('This quote is no longer awaiting owner approval', 409, 'INVALID_STATE_TRANSITION');
            quote.status = nextQuoteStatus;
            yield setWorkflowStatus(request, params.decision === 'DECLINE' ? 'DECLINED' : 'QUOTE_REQUESTED');
        }
        yield (0, audit_1.ecosystemAudit)({
            req: params.req,
            actor: params.ownerUserId,
            action: params.decision === 'APPROVE' ? 'OWNER_APPROVED_QUOTE' : params.decision === 'DECLINE' ? 'OWNER_DECLINED_QUOTE' : 'OWNER_REQUESTED_CHANGES',
            entity: 'OwnerQuoteDecision',
            entityId: String(decision._id),
            previousState: { quoteStatus: 'SENT_TO_OWNER', quoteVersion: quote.version },
            newState: { quoteStatus: quote.status, decision: params.decision },
            metadata: { quoteId: String(quote._id), quoteVersion: quote.version, decision: params.decision, comment: params.comment },
        });
        yield (0, notificationService_1.notifyCompanyStaff)(String(request.companyId), params.decision === 'APPROVE' ? 'OWNER_QUOTE_APPROVED' : 'OWNER_QUOTE_DECLINED', { ownerName, propertyName: property.name || 'the property' }, `owner-decision:${decision._id}`);
        return { decision, quote, request };
    });
}
function authoriseWork(params) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c;
        const request = yield loadRequest(params.requestId, params.companyId);
        const company = yield Company_1.Company.findById(params.companyId).select('featureFlags').lean();
        const needsOwner = (0, flags_1.ownerApprovalRequired)(company);
        const approvedQuoteId = (_a = request.ecosystemWorkflow) === null || _a === void 0 ? void 0 : _a.approvedQuoteId;
        const ownerApprovalId = (_b = request.ecosystemWorkflow) === null || _b === void 0 ? void 0 : _b.ownerApprovalId;
        if (needsOwner && (!approvedQuoteId || !ownerApprovalId)) {
            throw new errorHandler_1.AppError('Owner approval is required before authorising work', 403, 'WORK_NOT_AUTHORISED');
        }
        const quote = yield MaintenanceQuote_1.MaintenanceQuote.findById(approvedQuoteId || ((_c = request.ecosystemWorkflow) === null || _c === void 0 ? void 0 : _c.selectedQuoteId));
        if (!quote)
            throw new errorHandler_1.AppError('Approved quote not found', 404, 'NOT_FOUND');
        if (needsOwner && quote.status !== 'OWNER_APPROVED') {
            throw new errorHandler_1.AppError('Cannot authorise work without an owner-approved quote', 403, 'WORK_NOT_AUTHORISED');
        }
        let job = yield maintenanceWorkflow_1.ContractorJobRecord.findOne({ requestId: request._id, contractorId: quote.contractorId });
        if (!job) {
            job = yield maintenanceWorkflow_1.ContractorJobRecord.create({
                requestId: request._id,
                companyId: params.companyId,
                propertyId: request.propertyId,
                contractorId: quote.contractorId,
                quoteId: quote._id,
                status: 'SELECTED',
            });
        }
        (0, workflowMachine_1.assertJobTransition)(job.status, 'AUTHORISED');
        job.status = 'AUTHORISED';
        job.authorisedBy = params.actorId;
        job.authorisedAt = new Date();
        job.ownerApprovalId = ownerApprovalId;
        job.quoteId = quote._id;
        yield job.save();
        yield setWorkflowStatus(request, 'AUTHORISED', {
            authorisedBy: params.actorId,
            authorisedAt: new Date(),
            contractorJobId: job._id,
        });
        request.contractorId = quote.contractorId;
        yield request.save();
        const contractor = yield MaintenanceContractor_1.MaintenanceContractor.findById(quote.contractorId);
        if (contractor === null || contractor === void 0 ? void 0 : contractor.userId) {
            const property = yield Property_1.Property.findById(request.propertyId).select('name').lean();
            yield (0, notificationService_1.notifyEvent)({
                recipientId: String(contractor.userId),
                companyId: params.companyId,
                eventType: 'CONTRACTOR_AUTHORISED',
                variables: { propertyName: (property === null || property === void 0 ? void 0 : property.name) || 'the property', contractorName: contractor.companyName },
                idempotencyKey: `job-auth:${job._id}`,
            });
        }
        yield (0, audit_1.ecosystemAudit)({
            req: params.req,
            actor: params.actorId,
            action: 'AGENT_AUTHORISED_WORK',
            entity: 'ContractorJobRecord',
            entityId: String(job._id),
            metadata: { approvedQuoteId: String(quote._id), ownerApprovalId: String(ownerApprovalId || '') },
        });
        return { request, job };
    });
}
function contractorUpdateJob(params) {
    return __awaiter(this, void 0, void 0, function* () {
        const contractor = yield MaintenanceContractor_1.MaintenanceContractor.findOne({ userId: params.contractorUserId });
        if (!contractor)
            throw new errorHandler_1.AppError('Contractor profile not found', 404, 'NOT_FOUND');
        const job = yield maintenanceWorkflow_1.ContractorJobRecord.findOne({ _id: params.jobId, contractorId: contractor._id });
        if (!job)
            throw new errorHandler_1.AppError('Job not found', 404, 'NOT_FOUND');
        const previous = job.status;
        const next = params.status;
        const company = yield Company_1.Company.findById(job.companyId).select('featureFlags').lean();
        const needsOwner = (0, flags_1.ownerApprovalRequired)(company);
        if (['ACCEPTED', 'SCHEDULED', 'WORK_IN_PROGRESS', 'COMPLETED'].includes(next)) {
            (0, workflowMachine_1.assertWorkMayStart)({
                ownerApproved: needsOwner ? Boolean(job.ownerApprovalId) : true,
                agentAuthorised: Boolean(job.authorisedBy && job.authorisedAt),
                status: next,
            });
        }
        (0, workflowMachine_1.assertJobTransition)(job.status, next);
        job.status = next;
        if (params.scheduledAt)
            job.scheduledAt = params.scheduledAt;
        if (params.completion) {
            if ((params.completion.additionalCosts || 0) > 0) {
                yield maintenanceWorkflow_1.MaintenanceChangeOrder.create({
                    requestId: job.requestId,
                    jobId: job._id,
                    companyId: job.companyId,
                    originalQuoteId: job.quoteId,
                    requestedAmount: params.completion.additionalCosts,
                    description: params.completion.notes || 'Additional costs requested',
                    status: 'REQUESTED',
                });
                // Additional cost is a change order. It does not mutate the original approved quote.
            }
            job.completionNotes = params.completion.notes;
            job.completionPhotos = params.completion.photos;
            job.actualCompletionDate = params.completion.actualCompletionDate;
            job.materialsUsed = params.completion.materialsUsed;
            job.invoiceUrl = params.completion.invoiceUrl;
        }
        yield job.save();
        if (next === 'CANCELLED' && (previous === 'INVITED' || previous === 'QUOTE_REQUESTED')) {
            yield maintenanceWorkflow_1.QuoteInvitation.updateOne({ requestId: job.requestId, contractorId: contractor._id, status: 'INVITED' }, { $set: { status: 'WITHDRAWN' } });
        }
        const request = yield loadRequest(String(job.requestId));
        const map = {
            ACCEPTED: 'AUTHORISED',
            SCHEDULED: 'SCHEDULED',
            WORK_IN_PROGRESS: 'WORK_IN_PROGRESS',
            COMPLETED: 'COMPLETED',
        };
        if (map[next])
            yield setWorkflowStatus(request, map[next]);
        if (next === 'COMPLETED') {
            const tenantUserId = request.requestedBy;
            const property = yield Property_1.Property.findById(request.propertyId).select('name').lean();
            yield (0, notificationService_1.notifyEvent)({
                recipientId: String(tenantUserId),
                companyId: String(job.companyId),
                eventType: 'WORK_COMPLETED',
                variables: { propertyName: (property === null || property === void 0 ? void 0 : property.name) || 'the property' },
                idempotencyKey: `work-complete:${job._id}`,
            });
            yield (0, notificationService_1.notifyCompanyStaff)(String(job.companyId), 'WORK_COMPLETED', { propertyName: (property === null || property === void 0 ? void 0 : property.name) || 'the property' }, `work-complete:${job._id}:staff`);
            yield (0, audit_1.ecosystemAudit)({
                req: params.req,
                actor: params.contractorUserId,
                action: 'WORK_COMPLETED',
                entity: 'ContractorJobRecord',
                entityId: String(job._id),
            });
        }
        return job;
    });
}
function tenantConfirmMaintenance(params) {
    return __awaiter(this, void 0, void 0, function* () {
        const request = yield loadRequest(params.requestId);
        if (String(request.requestedBy) !== params.tenantUserId) {
            throw new errorHandler_1.AppError('You can only confirm your own maintenance request', 403, 'FORBIDDEN');
        }
        if (params.confirm) {
            yield setWorkflowStatus(request, 'TENANT_CONFIRMATION', { tenantConfirmedAt: new Date() });
            yield setWorkflowStatus(request, 'CLOSED');
            yield (0, audit_1.ecosystemAudit)({
                req: params.req,
                actor: params.tenantUserId,
                action: 'TENANT_CONFIRMED',
                entity: 'MaintenanceRequest',
                entityId: params.requestId,
            });
        }
        else {
            yield setWorkflowStatus(request, 'REOPENED');
            yield (0, audit_1.ecosystemAudit)({
                req: params.req,
                actor: params.tenantUserId,
                action: 'MAINTENANCE_REOPENED',
                entity: 'MaintenanceRequest',
                entityId: params.requestId,
                metadata: { comment: params.comment },
            });
            const property = yield Property_1.Property.findById(request.propertyId).select('name').lean();
            yield (0, notificationService_1.notifyEvent)({
                recipientId: String(request.requestedBy),
                companyId: String(request.companyId),
                eventType: 'MAINTENANCE_REOPENED',
                variables: { propertyName: (property === null || property === void 0 ? void 0 : property.name) || 'the property' },
                idempotencyKey: `maint-reopen:${request._id}:${Date.now()}`,
            });
        }
        return request;
    });
}
function submitRating(params) {
    return __awaiter(this, void 0, void 0, function* () {
        const job = yield maintenanceWorkflow_1.ContractorJobRecord.findById(params.jobId);
        if (!job)
            throw new errorHandler_1.AppError('Job not found', 404, 'NOT_FOUND');
        if (!['COMPLETED', 'CLOSED'].includes(job.status)) {
            throw new errorHandler_1.AppError('Ratings are only allowed after the job is completed', 400, 'JOB_NOT_COMPLETED');
        }
        if (String(job.contractorId) === params.raterUserId) {
            throw new errorHandler_1.AppError('You cannot rate your own account', 403, 'FORBIDDEN');
        }
        const contractor = yield MaintenanceContractor_1.MaintenanceContractor.findById(job.contractorId);
        if ((contractor === null || contractor === void 0 ? void 0 : contractor.userId) && String(contractor.userId) === params.raterUserId) {
            throw new errorHandler_1.AppError('You cannot rate your own account', 403, 'FORBIDDEN');
        }
        const request = yield loadRequest(String(job.requestId));
        const property = yield Property_1.Property.findById(request.propertyId).select('propertyOwnerId ownerId companyId').lean();
        const raterUser = yield User_1.User.findById(params.raterUserId).select('email role roles companyId').lean();
        let permitted = false;
        if (params.raterRole === 'tenant') {
            permitted = String(request.requestedBy) === params.raterUserId;
        }
        else if (params.raterRole === 'agent' || params.raterRole === 'admin') {
            permitted = String((raterUser === null || raterUser === void 0 ? void 0 : raterUser.companyId) || '') === String(job.companyId);
        }
        else if (params.raterRole === 'owner') {
            const ownerRecord = (raterUser === null || raterUser === void 0 ? void 0 : raterUser.email)
                ? yield PropertyOwner_1.PropertyOwner.findOne({ email: raterUser.email }).select('_id').lean()
                : null;
            permitted =
                String((property === null || property === void 0 ? void 0 : property.ownerId) || '') === params.raterUserId ||
                    Boolean(ownerRecord && String(ownerRecord._id) === String(property === null || property === void 0 ? void 0 : property.propertyOwnerId));
        }
        if (!permitted) {
            throw new errorHandler_1.AppError('You can only rate contractors for jobs you participated in', 403, 'FORBIDDEN');
        }
        try {
            const rating = yield engagement_1.Rating.create(Object.assign(Object.assign({ companyId: job.companyId, raterUserId: params.raterUserId, rateeUserId: contractor === null || contractor === void 0 ? void 0 : contractor.userId, contractorId: job.contractorId, jobId: job._id, raterRole: params.raterRole }, params.scores), { comment: params.comment }));
            if (contractor) {
                const all = yield engagement_1.Rating.find({ contractorId: contractor._id }).select('overall').lean();
                const avg = all.reduce((s, r) => s + r.overall, 0) / all.length;
                contractor.rating = Math.round(avg * 10) / 10;
                yield contractor.save();
            }
            return rating;
        }
        catch (error) {
            if ((error === null || error === void 0 ? void 0 : error.code) === 11000)
                throw new errorHandler_1.AppError('You have already rated this job', 409, 'DUPLICATE_RATING');
            throw error;
        }
    });
}
function createTenantReference(params) {
    return __awaiter(this, void 0, void 0, function* () {
        const lease = yield Lease_1.Lease.findOne({ _id: params.leaseId, companyId: params.companyId });
        if (!lease)
            throw new errorHandler_1.AppError('Lease not found', 404, 'NOT_FOUND');
        if (!['expired', 'terminated', 'closed', 'pending_settlement'].includes(lease.status)) {
            throw new errorHandler_1.AppError('References can be created after the tenancy has ended', 400, 'LEASE_ACTIVE');
        }
        try {
            return yield engagement_1.TenantReference.create(Object.assign({ companyId: params.companyId, tenantId: lease.tenantId, leaseId: lease._id, propertyId: lease.propertyId, createdBy: params.actorId }, params.payload));
        }
        catch (error) {
            if ((error === null || error === void 0 ? void 0 : error.code) === 11000)
                throw new errorHandler_1.AppError('A reference already exists for this lease', 409, 'DUPLICATE_REFERENCE');
            throw error;
        }
    });
}
function requestChangeOrder(params) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b;
        const contractor = yield MaintenanceContractor_1.MaintenanceContractor.findOne({ userId: params.contractorUserId });
        if (!contractor)
            throw new errorHandler_1.AppError('Contractor profile not found', 404, 'NOT_FOUND');
        const job = yield maintenanceWorkflow_1.ContractorJobRecord.findOne({ _id: params.jobId, contractorId: contractor._id });
        if (!job)
            throw new errorHandler_1.AppError('Job not found', 404, 'NOT_FOUND');
        if (!job.quoteId)
            throw new errorHandler_1.AppError('No original quote to attach a change order to', 400, 'VALIDATION_ERROR');
        const original = yield MaintenanceQuote_1.MaintenanceQuote.findById(job.quoteId).select('amount total status').lean();
        if (!original || original.status !== 'OWNER_APPROVED') {
            throw new errorHandler_1.AppError('Change orders require an owner-approved original quote', 400, 'QUOTE_NOT_APPROVED');
        }
        const changeOrder = yield maintenanceWorkflow_1.MaintenanceChangeOrder.create({
            requestId: job.requestId,
            jobId: job._id,
            companyId: job.companyId,
            originalQuoteId: job.quoteId,
            requestedAmount: Number(params.requestedAmount),
            description: params.description,
            status: 'REQUESTED',
        });
        yield (0, audit_1.ecosystemAudit)({
            req: params.req,
            actor: params.contractorUserId,
            action: 'CHANGE_ORDER_REQUESTED',
            entity: 'MaintenanceChangeOrder',
            entityId: String(changeOrder._id),
            metadata: { originalAmount: (_a = original.total) !== null && _a !== void 0 ? _a : original.amount, requestedAmount: params.requestedAmount },
        });
        yield (0, notificationService_1.notifyCompanyStaff)(String(job.companyId), 'QUOTE_RECEIVED', { contractorName: contractor.companyName, quoteAmount: String(params.requestedAmount), propertyName: 'maintenance change order' }, `change-order:${changeOrder._id}:requested`);
        return { changeOrder, originalQuoteAmount: (_b = original.total) !== null && _b !== void 0 ? _b : original.amount };
    });
}
function agentReviewChangeOrder(params) {
    return __awaiter(this, void 0, void 0, function* () {
        const changeOrder = yield maintenanceWorkflow_1.MaintenanceChangeOrder.findOne({ _id: params.changeOrderId, companyId: params.companyId });
        if (!changeOrder)
            throw new errorHandler_1.AppError('Change order not found', 404, 'NOT_FOUND');
        if (changeOrder.status !== 'REQUESTED') {
            throw new errorHandler_1.AppError('Change order is not awaiting agent review', 409, 'INVALID_STATE_TRANSITION');
        }
        changeOrder.status = 'AGENT_REVIEW';
        changeOrder.agentReviewedBy = params.actorId;
        yield changeOrder.save();
        yield (0, audit_1.ecosystemAudit)({
            req: params.req,
            actor: params.actorId,
            action: 'CHANGE_ORDER_AGENT_REVIEW',
            entity: 'MaintenanceChangeOrder',
            entityId: String(changeOrder._id),
            previousState: { status: 'REQUESTED' },
            newState: { status: 'AGENT_REVIEW' },
        });
        return changeOrder;
    });
}
function ownerDecideChangeOrder(params) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b;
        const changeOrder = yield maintenanceWorkflow_1.MaintenanceChangeOrder.findById(params.changeOrderId);
        if (!changeOrder)
            throw new errorHandler_1.AppError('Change order not found', 404, 'NOT_FOUND');
        if (changeOrder.status !== 'AGENT_REVIEW') {
            throw new errorHandler_1.AppError('Owner can only decide after agent review', 409, 'INVALID_STATE_TRANSITION');
        }
        const request = yield loadRequest(String(changeOrder.requestId));
        const property = yield Property_1.Property.findById(request.propertyId).select('propertyOwnerId ownerId name companyId').lean();
        yield assertOwnerCanActOnProperty({
            actorUserId: params.ownerUserId,
            property,
            requestCompanyId: request.companyId,
        });
        const previous = changeOrder.status;
        changeOrder.status = params.decision === 'APPROVE' ? 'OWNER_APPROVED' : 'OWNER_DECLINED';
        changeOrder.ownerDecision = params.decision;
        changeOrder.ownerDecidedBy = params.ownerUserId;
        yield changeOrder.save();
        const original = yield MaintenanceQuote_1.MaintenanceQuote.findById(changeOrder.originalQuoteId).select('amount total').lean();
        yield (0, audit_1.ecosystemAudit)({
            req: params.req,
            actor: params.ownerUserId,
            action: params.decision === 'APPROVE' ? 'CHANGE_ORDER_APPROVED' : 'CHANGE_ORDER_DECLINED',
            entity: 'MaintenanceChangeOrder',
            entityId: String(changeOrder._id),
            previousState: { status: previous, originalAmount: (_a = original === null || original === void 0 ? void 0 : original.total) !== null && _a !== void 0 ? _a : original === null || original === void 0 ? void 0 : original.amount },
            newState: { status: changeOrder.status, additionalAmount: changeOrder.requestedAmount, comment: params.comment },
        });
        yield (0, notificationService_1.notifyCompanyStaff)(String(changeOrder.companyId), params.decision === 'APPROVE' ? 'OWNER_QUOTE_APPROVED' : 'OWNER_QUOTE_DECLINED', { ownerName: 'Owner', propertyName: (property === null || property === void 0 ? void 0 : property.name) || 'the property' }, `change-order:${changeOrder._id}:${params.decision}`);
        return { changeOrder, originalQuoteAmount: (_b = original === null || original === void 0 ? void 0 : original.total) !== null && _b !== void 0 ? _b : original === null || original === void 0 ? void 0 : original.amount, additionalApproved: params.decision === 'APPROVE' ? changeOrder.requestedAmount : 0 };
    });
}
function createMaintenanceInspection(params) {
    return __awaiter(this, void 0, void 0, function* () {
        const request = yield loadRequest(params.requestId, params.companyId);
        return Inspection_1.Inspection.create({
            propertyId: request.propertyId,
            companyId: params.companyId,
            ownerId: params.actorId,
            scheduledDate: new Date(),
            type: 'maintenance',
            status: 'completed',
            notes: params.notes,
            checklist: params.checklist || [],
            sourceMaintenanceRequestId: request._id,
            generatedBy: 'manual',
            frequency: 'ad_hoc',
        });
    });
}
function acknowledgeInspection(params) {
    return __awaiter(this, void 0, void 0, function* () {
        const inspection = yield Inspection_1.Inspection.findById(params.inspectionId);
        if (!inspection)
            throw new errorHandler_1.AppError('Inspection not found', 404, 'NOT_FOUND');
        inspection.report = inspection.report || {};
        if (inspection.report.acknowledgedLocked) {
            throw new errorHandler_1.AppError('This inspection acknowledgement is locked', 409, 'INSPECTION_LOCKED');
        }
        if (params.role === 'tenant') {
            if (inspection.report.tenantSignature) {
                throw new errorHandler_1.AppError('Tenant has already acknowledged this inspection', 409, 'ALREADY_ACKNOWLEDGED');
            }
            const tenants = yield Tenant_1.Tenant.find({ userId: params.userId }).select('_id').lean();
            const tenantIds = tenants.map((t) => String(t._id));
            if (inspection.tenantId && !tenantIds.includes(String(inspection.tenantId))) {
                throw new errorHandler_1.AppError('You can only acknowledge your own inspection', 403, 'FORBIDDEN');
            }
            inspection.report.tenantSignature = params.signature;
            inspection.report.tenantAcknowledgedAt = new Date();
        }
        else {
            if (inspection.report.agentSignature) {
                throw new errorHandler_1.AppError('This inspection has already been acknowledged', 409, 'ALREADY_ACKNOWLEDGED');
            }
            inspection.report.agentSignature = params.signature;
            inspection.report.agentAcknowledgedAt = new Date();
        }
        if (inspection.report.tenantSignature && inspection.report.agentSignature) {
            inspection.report.acknowledgedLocked = true;
            inspection.report.lockedAt = new Date();
        }
        inspection.markModified('report');
        yield inspection.save();
        return inspection;
    });
}
