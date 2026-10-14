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
exports.LEGACY_STATUS_FROM_ECOSYSTEM = exports.toPublicListing = exports.computeProfileCompletion = void 0;
exports.registerPortalUser = registerPortalUser;
exports.updateTenantProfile = updateTenantProfile;
exports.searchListings = searchListings;
exports.getPublicListing = getPublicListing;
exports.createViewingRequest = createViewingRequest;
exports.updateViewingStatus = updateViewingStatus;
exports.upsertApplication = upsertApplication;
exports.updateApplicationStatus = updateApplicationStatus;
exports.getTenantLeases = getTenantLeases;
exports.getTenantPayments = getTenantPayments;
exports.getTenantDocuments = getTenantDocuments;
exports.getTenantFile = getTenantFile;
exports.createTenantMaintenance = createTenantMaintenance;
const mongoose_1 = __importDefault(require("mongoose"));
const User_1 = require("../../models/User");
const Tenant_1 = require("../../models/Tenant");
const Property_1 = require("../../models/Property");
const Lease_1 = require("../../models/Lease");
const Payment_1 = require("../../models/Payment");
const File_1 = __importDefault(require("../../models/File"));
const MaintenanceRequest_1 = require("../../models/MaintenanceRequest");
const Company_1 = require("../../models/Company");
const MaintenanceContractor_1 = require("../../models/MaintenanceContractor");
const authService_1 = require("../../services/authService");
const errorHandler_1 = require("../../middleware/errorHandler");
const tenantFacing_1 = require("../models/tenantFacing");
const commsAndPayments_1 = require("../models/commsAndPayments");
const audit_1 = require("../audit");
const notificationService_1 = require("./notificationService");
const workflowMachine_1 = require("../workflowMachine");
const constants_1 = require("../constants");
Object.defineProperty(exports, "LEGACY_STATUS_FROM_ECOSYSTEM", { enumerable: true, get: function () { return constants_1.LEGACY_STATUS_FROM_ECOSYSTEM; } });
const flags_1 = require("../flags");
const listingUtils_1 = require("../listingUtils");
Object.defineProperty(exports, "computeProfileCompletion", { enumerable: true, get: function () { return listingUtils_1.computeProfileCompletion; } });
Object.defineProperty(exports, "toPublicListing", { enumerable: true, get: function () { return listingUtils_1.toPublicListing; } });
const documentAccess_1 = require("../documentAccess");
const engagement_1 = require("../models/engagement");
const Inspection_1 = require("../../models/Inspection");
const workflowNotify_1 = require("../../agency/workflowNotify");
const authService = authService_1.AuthService.getInstance();
function registerPortalUser(params) {
    return __awaiter(this, void 0, void 0, function* () {
        const email = String(params.email || '').trim().toLowerCase();
        const firstName = String(params.firstName || '').trim();
        const lastName = String(params.lastName || '').trim();
        const phone = String(params.phone || '').trim();
        const accountType = params.accountType === 'company' ? 'company' : 'individual';
        const companyName = String(params.companyName || '').trim();
        const companyAddress = String(params.companyAddress || '').trim();
        const homeAddress = String(params.homeAddress || '').trim();
        const trade = String(params.trade || '').trim();
        const fullName = `${firstName} ${lastName}`.trim();
        if (!email || !params.password || !firstName || !lastName) {
            throw new errorHandler_1.AppError('First name, last name, email and password are required', 400, 'VALIDATION_ERROR');
        }
        if (params.password.length < 6) {
            throw new errorHandler_1.AppError('Password must be at least 6 characters', 400, 'VALIDATION_ERROR');
        }
        if (!phone) {
            throw new errorHandler_1.AppError('Phone is required', 400, 'VALIDATION_ERROR');
        }
        if (accountType === 'company') {
            if (!companyName)
                throw new errorHandler_1.AppError('Company name is required', 400, 'VALIDATION_ERROR');
            if (!companyAddress)
                throw new errorHandler_1.AppError('Company address is required', 400, 'VALIDATION_ERROR');
        }
        else if (!homeAddress) {
            throw new errorHandler_1.AppError('Home address is required', 400, 'VALIDATION_ERROR');
        }
        if (params.role === 'contractor' && !MaintenanceContractor_1.CONTRACTOR_TRADES.includes(trade)) {
            throw new errorHandler_1.AppError('Select a valid trade', 400, 'VALIDATION_ERROR');
        }
        const displayName = accountType === 'company' ? companyName : fullName;
        const address = accountType === 'company' ? companyAddress : homeAddress;
        const existing = yield User_1.User.findOne({ email });
        if (existing)
            throw new errorHandler_1.AppError('Email already registered', 400, 'EMAIL_EXISTS');
        const user = yield User_1.User.create({
            email,
            password: params.password,
            firstName,
            lastName,
            role: params.role,
            roles: [params.role],
            isActive: true,
        });
        let company;
        try {
            company = yield Company_1.Company.create({
                name: displayName,
                email,
                address,
                phone,
                ownerId: user._id,
                companyType: 'INDIVIDUAL_LANDLORD',
                workspaceType: 'individual',
                plan: 'INDIVIDUAL',
                tenantStatus: 'active',
                onboardingStatus: 'ACTIVE',
                onboardingCompleted: true,
                isActive: true,
                subscriptionStatus: 'active',
                featureFlags: {
                    tenantPortalEnabled: params.role === 'tenant',
                    contractorPortalEnabled: params.role === 'contractor',
                    maintenanceQuotesEnabled: params.role === 'contractor',
                    propertyMarketplaceEnabled: false,
                },
            });
            user.companyId = company._id;
            yield user.save();
            yield commsAndPayments_1.CommunicationPreference.create({
                userId: user._id,
                emailAvailable: true,
                inAppAvailable: true,
                phone,
            });
            if (params.role === 'tenant') {
                const profile = yield tenantFacing_1.TenantProfile.create({
                    userId: user._id,
                    companyId: company._id,
                    fullName,
                    email,
                    phone,
                    address,
                    profileCompletionPercent: 0,
                });
                profile.profileCompletionPercent = (0, listingUtils_1.computeProfileCompletion)(profile.toObject());
                yield profile.save();
            }
            else {
                yield MaintenanceContractor_1.MaintenanceContractor.create({
                    companyId: company._id,
                    companyName: displayName,
                    contactPerson: fullName,
                    phone,
                    email,
                    trade,
                    address: address === 'N/A' ? undefined : address,
                    userId: user._id,
                    active: true,
                    verificationStatus: 'UNVERIFIED',
                });
            }
        }
        catch (error) {
            yield MaintenanceContractor_1.MaintenanceContractor.deleteMany({ userId: user._id });
            yield tenantFacing_1.TenantProfile.deleteMany({ userId: user._id });
            yield commsAndPayments_1.CommunicationPreference.deleteMany({ userId: user._id });
            if (company === null || company === void 0 ? void 0 : company._id)
                yield Company_1.Company.deleteOne({ _id: company._id });
            yield User_1.User.deleteOne({ _id: user._id });
            throw error;
        }
        yield (0, audit_1.ecosystemAudit)({
            req: params.req,
            actor: String(user._id),
            action: params.role === 'tenant' ? 'TENANT_REGISTERED' : 'CONTRACTOR_REGISTERED',
            entity: 'User',
            entityId: String(user._id),
            newState: { role: params.role, email },
        });
        const tokens = yield authService.login(email, params.password);
        return { user, tokens };
    });
}
function updateTenantProfile(userId, patch) {
    return __awaiter(this, void 0, void 0, function* () {
        const allowed = [
            'fullName', 'phone', 'idNumber', 'passportNumber', 'address', 'employmentStatus',
            'employer', 'emergencyContactName', 'emergencyContactPhone', 'householdSize',
            'pets', 'rentalPreferences', 'preferredLocations', 'previousRentalInfo', 'documents',
        ];
        const update = {};
        for (const key of allowed) {
            if (patch[key] !== undefined)
                update[key] = patch[key];
        }
        const current = yield tenantFacing_1.TenantProfile.findOne({ userId });
        if (!current)
            throw new errorHandler_1.AppError('Profile not found', 404, 'NOT_FOUND');
        Object.assign(current, update);
        current.profileCompletionPercent = (0, listingUtils_1.computeProfileCompletion)(current.toObject());
        yield current.save();
        return current;
    });
}
const LISTING_PUBLIC_PROJECTION = {
    name: 1,
    address: 1,
    type: 1,
    propertyCategory: 1,
    propertySubtype: 1,
    bedrooms: 1,
    bathrooms: 1,
    area: 1,
    description: 1,
    images: 1,
    videos: 1,
    amenities: 1,
    rent: 1,
    deposit: 1,
    availableFrom: 1,
    paymentTerms: 1,
    leaseRequirements: 1,
    status: 1,
    propertyOperationalStatus: 1,
    companyId: 1,
};
function searchListings(query) {
    return __awaiter(this, void 0, void 0, function* () {
        // Every tenant can browse properties any company has published.
        // Agencies still opt in with featureFlags.propertyMarketplaceEnabled before they can publish.
        const filter = {
            publicListingEnabled: true,
            isDeleted: { $ne: true },
            status: { $in: ['available', 'rented'] },
            propertyUse: { $in: ['Rental', 'Both', null, undefined] },
        };
        if (query.companyId && mongoose_1.default.isValidObjectId(query.companyId)) {
            filter.companyId = query.companyId;
        }
        if (query.propertyType)
            filter.type = query.propertyType;
        if (query.bedrooms)
            filter.bedrooms = { $gte: Number(query.bedrooms) };
        if (query.bathrooms)
            filter.bathrooms = { $gte: Number(query.bathrooms) };
        if (query.minRent || query.maxRent) {
            filter.rent = {};
            if (query.minRent)
                filter.rent.$gte = Number(query.minRent);
            if (query.maxRent)
                filter.rent.$lte = Number(query.maxRent);
        }
        if (query.location) {
            filter.$or = [
                { address: { $regex: String(query.location), $options: 'i' } },
                { name: { $regex: String(query.location), $options: 'i' } },
            ];
        }
        if (query.amenities) {
            const list = String(query.amenities).split(',').map((s) => s.trim()).filter(Boolean);
            if (list.length)
                filter.amenities = { $all: list };
        }
        if (query.availability === 'available') {
            filter.status = 'available';
            filter.propertyOperationalStatus = { $in: ['Vacant', 'Reserved', null, undefined] };
        }
        const page = Math.max(1, Number(query.page || 1));
        const limit = Math.min(50, Math.max(1, Number(query.limit || 20)));
        const [items, total] = yield Promise.all([
            Property_1.Property.find(filter).select(LISTING_PUBLIC_PROJECTION).sort({ listingPublishedAt: -1, createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
            Property_1.Property.countDocuments(filter),
        ]);
        return { items: items.map(listingUtils_1.toPublicListing), total, page, limit };
    });
}
function getPublicListing(id) {
    return __awaiter(this, void 0, void 0, function* () {
        const property = yield Property_1.Property.findOne({
            _id: id,
            publicListingEnabled: true,
            isDeleted: { $ne: true },
        }).select(LISTING_PUBLIC_PROJECTION).lean();
        if (!property)
            throw new errorHandler_1.AppError('Listing not found', 404, 'NOT_FOUND');
        return (0, listingUtils_1.toPublicListing)(property);
    });
}
function createViewingRequest(params) {
    return __awaiter(this, void 0, void 0, function* () {
        const property = yield Property_1.Property.findById(params.propertyId).select('companyId publicListingEnabled name').lean();
        if (!property || !property.publicListingEnabled)
            throw new errorHandler_1.AppError('Property is not available for viewing', 404, 'NOT_FOUND');
        const viewing = yield tenantFacing_1.ViewingRequest.create({
            tenantUserId: params.tenantUserId,
            propertyId: params.propertyId,
            companyId: property.companyId,
            requestedDate: params.requestedDate,
            preferredTime: params.preferredTime,
            attendees: params.attendees || 1,
            message: params.message,
            status: 'REQUESTED',
        });
        yield (0, audit_1.ecosystemAudit)({
            req: params.req,
            actor: params.tenantUserId,
            action: 'VIEWING_REQUESTED',
            entity: 'ViewingRequest',
            entityId: String(viewing._id),
            newState: { status: 'REQUESTED' },
        });
        yield (0, notificationService_1.notifyEvent)({
            recipientId: params.tenantUserId,
            companyId: String(property.companyId),
            eventType: 'VIEWING_REQUESTED',
            variables: { tenantName: 'You', propertyName: property.name || 'the property' },
            idempotencyKey: `viewing:${viewing._id}:requested`,
        });
        yield (0, notificationService_1.notifyCompanyStaff)(String(property.companyId), 'VIEWING_REQUESTED', {
            tenantName: 'A tenant',
            propertyName: property.name || 'the property',
        }, `viewing:${viewing._id}:requested:staff`);
        return viewing;
    });
}
function updateViewingStatus(params) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        const viewing = yield tenantFacing_1.ViewingRequest.findOne({ _id: params.viewingId, companyId: params.companyId });
        if (!viewing)
            throw new errorHandler_1.AppError('Viewing not found', 404, 'NOT_FOUND');
        (0, workflowMachine_1.assertViewingTransition)(viewing.status, params.status);
        const previous = viewing.status;
        viewing.status = params.status;
        if (params.notes)
            viewing.agentNotes = params.notes;
        if (params.proposedDate)
            viewing.proposedDate = params.proposedDate;
        yield viewing.save();
        yield (0, audit_1.ecosystemAudit)({
            req: params.req,
            actor: params.actorId,
            action: `VIEWING_${params.status}`,
            entity: 'ViewingRequest',
            entityId: String(viewing._id),
            previousState: { status: previous },
            newState: { status: viewing.status },
        });
        if (params.status === 'CONFIRMED') {
            const property = yield Property_1.Property.findById(viewing.propertyId).select('name').lean();
            yield (0, notificationService_1.notifyEvent)({
                recipientId: String(viewing.tenantUserId),
                companyId: params.companyId,
                eventType: 'VIEWING_CONFIRMED',
                variables: { propertyName: (property === null || property === void 0 ? void 0 : property.name) || 'the property' },
                idempotencyKey: `viewing:${viewing._id}:confirmed`,
            });
        }
        else if (params.status === 'RESCHEDULED') {
            const property = yield Property_1.Property.findById(viewing.propertyId).select('name').lean();
            yield (0, notificationService_1.notifyEvent)({
                recipientId: String(viewing.tenantUserId),
                companyId: params.companyId,
                eventType: 'VIEWING_RESCHEDULED',
                variables: { propertyName: (property === null || property === void 0 ? void 0 : property.name) || 'the property' },
                idempotencyKey: `viewing:${viewing._id}:rescheduled:${((_a = viewing.proposedDate) === null || _a === void 0 ? void 0 : _a.toISOString()) || 'na'}`,
            });
        }
        else if (params.status === 'DECLINED') {
            const property = yield Property_1.Property.findById(viewing.propertyId).select('name').lean();
            yield (0, notificationService_1.notifyEvent)({
                recipientId: String(viewing.tenantUserId),
                companyId: params.companyId,
                eventType: 'VIEWING_DECLINED',
                variables: { propertyName: (property === null || property === void 0 ? void 0 : property.name) || 'the property' },
                idempotencyKey: `viewing:${viewing._id}:declined`,
            });
        }
        return viewing;
    });
}
function upsertApplication(params) {
    return __awaiter(this, void 0, void 0, function* () {
        const property = yield Property_1.Property.findById(params.propertyId).select('companyId publicListingEnabled name propertyOwnerId').lean();
        if (!property || !property.publicListingEnabled)
            throw new errorHandler_1.AppError('Property is not available', 404, 'NOT_FOUND');
        const profile = yield tenantFacing_1.TenantProfile.findOne({ userId: params.tenantUserId }).lean();
        let app = yield tenantFacing_1.RentalApplication.findOne({
            tenantUserId: params.tenantUserId,
            propertyId: params.propertyId,
            status: { $in: ['DRAFT', 'MORE_INFORMATION_REQUIRED'] },
        });
        if (!app) {
            app = yield tenantFacing_1.RentalApplication.create({
                tenantUserId: params.tenantUserId,
                propertyId: params.propertyId,
                companyId: property.companyId,
                ownerId: property.propertyOwnerId,
                status: 'DRAFT',
                notes: params.notes,
                documents: params.documents || [],
                snapshot: {},
                statusHistory: [{ status: 'DRAFT', at: new Date(), by: params.tenantUserId }],
            });
        }
        if (params.notes !== undefined)
            app.notes = params.notes;
        if (params.documents)
            app.documents = params.documents;
        if (params.submit) {
            (0, workflowMachine_1.assertApplicationTransition)(app.status, 'SUBMITTED');
            app.snapshot = {
                profile: profile || {},
                capturedAt: new Date().toISOString(),
                propertyName: property.name,
            };
            app.status = 'SUBMITTED';
            app.submittedAt = new Date();
            app.statusHistory.push({ status: 'SUBMITTED', at: new Date(), by: params.tenantUserId });
            yield (0, audit_1.ecosystemAudit)({
                req: params.req,
                actor: params.tenantUserId,
                action: 'APPLICATION_SUBMITTED',
                entity: 'RentalApplication',
                entityId: String(app._id),
                newState: { status: 'SUBMITTED' },
            });
            yield (0, notificationService_1.notifyEvent)({
                recipientId: params.tenantUserId,
                companyId: String(property.companyId),
                eventType: 'APPLICATION_SUBMITTED',
                variables: { tenantName: (profile === null || profile === void 0 ? void 0 : profile.fullName) || 'Tenant', propertyName: property.name || 'the property' },
                idempotencyKey: `application:${app._id}:submitted`,
            });
            yield (0, notificationService_1.notifyCompanyStaff)(String(property.companyId), 'APPLICATION_SUBMITTED', {
                tenantName: (profile === null || profile === void 0 ? void 0 : profile.fullName) || 'Tenant',
                propertyName: property.name || 'the property',
            }, `application:${app._id}:submitted:staff`);
        }
        yield app.save();
        return app;
    });
}
function updateApplicationStatus(params) {
    return __awaiter(this, void 0, void 0, function* () {
        const app = yield tenantFacing_1.RentalApplication.findOne({ _id: params.applicationId, companyId: params.companyId });
        if (!app)
            throw new errorHandler_1.AppError('Application not found', 404, 'NOT_FOUND');
        (0, workflowMachine_1.assertApplicationTransition)(app.status, params.status);
        const previous = app.status;
        app.status = params.status;
        if (params.note)
            app.agentNotes = params.note;
        app.statusHistory.push({ status: params.status, at: new Date(), by: params.actorId, note: params.note });
        yield app.save();
        yield (0, audit_1.ecosystemAudit)({
            req: params.req,
            actor: params.actorId,
            action: `APPLICATION_${params.status}`,
            entity: 'RentalApplication',
            entityId: String(app._id),
            previousState: { status: previous },
            newState: { status: params.status },
        });
        if (params.status === 'SENT_TO_OWNER') {
            yield (0, workflowNotify_1.notifyLandlord)(params.companyId, String(app.propertyId), `application-shortlist:${app._id}`, 'Shortlist ready for review', 'A rental application is waiting for your decision.');
        }
        if (params.status === 'APPROVED' || params.status === 'DECLINED') {
            const property = yield Property_1.Property.findById(app.propertyId).select('name').lean();
            yield (0, notificationService_1.notifyEvent)({
                recipientId: String(app.tenantUserId),
                companyId: params.companyId,
                eventType: params.status === 'APPROVED' ? 'APPLICATION_APPROVED' : 'APPLICATION_DECLINED',
                variables: { propertyName: (property === null || property === void 0 ? void 0 : property.name) || 'the property' },
                idempotencyKey: `application:${app._id}:${params.status}`,
            });
        }
        return app;
    });
}
function getTenantLeases(userId) {
    return __awaiter(this, void 0, void 0, function* () {
        const tenants = yield Tenant_1.Tenant.find({ userId });
        const tenantIds = tenants.map((t) => t._id);
        if (!tenantIds.length)
            return [];
        return Lease_1.Lease.find({ tenantId: { $in: tenantIds } })
            .populate('propertyId', 'name address images')
            .sort({ startDate: -1 })
            .lean();
    });
}
function getTenantPayments(userId) {
    return __awaiter(this, void 0, void 0, function* () {
        const tenants = yield Tenant_1.Tenant.find({ userId });
        const tenantIds = tenants.map((t) => t._id);
        if (!tenantIds.length)
            return [];
        return Payment_1.Payment.find({ tenantId: { $in: tenantIds } })
            .select('amount paymentDate paymentMethod referenceNumber rentalPeriodMonth rentalPeriodYear propertyId status notes')
            .populate('propertyId', 'name address')
            .sort({ paymentDate: -1 })
            .limit(200)
            .lean();
    });
}
function getTenantDocuments(userId, leaseId) {
    return __awaiter(this, void 0, void 0, function* () {
        const leases = yield getTenantLeases(userId);
        const scoped = leaseId ? leases.filter((l) => String(l._id) === leaseId) : leases;
        const propertyIds = scoped.map((l) => { var _a; return ((_a = l.propertyId) === null || _a === void 0 ? void 0 : _a._id) || l.propertyId; }).filter(Boolean);
        const tenantIds = (yield Tenant_1.Tenant.find({ userId }).select('_id').lean()).map((t) => t._id);
        const rawFiles = propertyIds.length
            ? yield File_1.default.find({ propertyId: { $in: propertyIds } }).select('fileName fileType propertyId uploadedAt').lean()
            : [];
        const files = rawFiles.filter(documentAccess_1.isTenantVisiblePropertyFile).map((file) => (0, documentAccess_1.toTenantFileSummary)(file));
        const ownDocs = yield engagement_1.EcosystemDocument.find({ ownerUserId: userId }).select('documentType fileName entityType entityId createdAt').lean();
        const inspections = tenantIds.length
            ? yield Inspection_1.Inspection.find({ tenantId: { $in: tenantIds } }).select('_id type scheduledDate status propertyId').lean()
            : [];
        const maintenance = yield MaintenanceRequest_1.MaintenanceRequest.find({ requestedBy: userId }).select('_id title attachments propertyId createdAt').lean();
        return {
            leases: scoped.map((l) => ({
                _id: l._id,
                documents: l.documentVersions || [],
                property: l.propertyId,
            })),
            files,
            ownUploads: ownDocs,
            inspections: inspections.map((i) => ({
                _id: i._id,
                type: i.type,
                scheduledDate: i.scheduledDate,
                status: i.status,
                propertyId: i.propertyId,
            })),
            maintenanceAttachments: maintenance.flatMap((m) => (m.attachments || []).map((att) => ({
                requestId: m._id,
                title: m.title,
                name: att.name || att.fileName,
                url: att.url,
            }))),
        };
    });
}
function getTenantFile(userId, fileId) {
    return __awaiter(this, void 0, void 0, function* () {
        const file = yield File_1.default.findById(fileId).select('fileName fileType fileUrl propertyId uploadedAt').lean();
        if (!file)
            throw new errorHandler_1.AppError('Document not found', 404, 'NOT_FOUND');
        const leases = yield getTenantLeases(userId);
        const allowedProperties = new Set(leases.map((l) => { var _a; return String(((_a = l.propertyId) === null || _a === void 0 ? void 0 : _a._id) || l.propertyId); }));
        if (!allowedProperties.has(String(file.propertyId)) || !(0, documentAccess_1.isTenantVisiblePropertyFile)(file)) {
            throw new errorHandler_1.AppError('You cannot access this document', 403, 'FORBIDDEN');
        }
        return (0, documentAccess_1.toTenantFileSummary)(file, true);
    });
}
function createTenantMaintenance(params) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b;
        const tenants = yield Tenant_1.Tenant.find({ userId: params.tenantUserId });
        const allowedPropertyIds = new Set(tenants.flatMap((t) => [String(t.propertyId || ''), ...(t.propertyIds || []).map(String)]));
        const leases = yield Lease_1.Lease.find({ tenantId: { $in: tenants.map((t) => t._id) }, status: { $in: ['active', 'expiring_soon'] } });
        leases.forEach((l) => allowedPropertyIds.add(String(l.propertyId)));
        if (!allowedPropertyIds.has(String(params.propertyId))) {
            throw new errorHandler_1.AppError('You can only report maintenance for your leased properties', 403, 'FORBIDDEN');
        }
        const property = yield Property_1.Property.findById(params.propertyId).select('companyId propertyOwnerId ownerId name').lean();
        if (!property)
            throw new errorHandler_1.AppError('Property not found', 404, 'NOT_FOUND');
        const company = yield Company_1.Company.findById(property.companyId).select('featureFlags').lean();
        const quotesEnabled = (0, flags_1.isFlagEnabledForCompany)(company, 'maintenanceQuotesEnabled');
        const request = yield MaintenanceRequest_1.MaintenanceRequest.create({
            propertyId: params.propertyId,
            requestedBy: params.tenantUserId,
            ownerId: property.propertyOwnerId || property.ownerId,
            title: params.title,
            description: params.description,
            priority: params.urgency === 'EMERGENCY' || params.urgency === 'URGENT' ? 'high' : params.urgency === 'LOW' ? 'low' : 'medium',
            status: quotesEnabled ? 'draft' : 'draft',
            category: params.category,
            attachments: params.attachments || [],
            companyId: property.companyId,
            ecosystemWorkflow: quotesEnabled
                ? {
                    enabled: true,
                    status: 'REPORTED',
                    category: params.category,
                    urgency: params.urgency,
                    preferredAccessTime: params.preferredAccessTime,
                    reportedByTenantId: (_a = tenants[0]) === null || _a === void 0 ? void 0 : _a._id,
                }
                : { enabled: false, category: params.category, urgency: params.urgency },
        });
        yield (0, audit_1.ecosystemAudit)({
            req: params.req,
            actor: params.tenantUserId,
            action: 'MAINTENANCE_REPORTED',
            entity: 'MaintenanceRequest',
            entityId: String(request._id),
            newState: { status: ((_b = request.ecosystemWorkflow) === null || _b === void 0 ? void 0 : _b.status) || request.status },
        });
        yield (0, notificationService_1.notifyEvent)({
            recipientId: params.tenantUserId,
            companyId: String(property.companyId),
            eventType: 'MAINTENANCE_REQUEST_RECEIVED',
            variables: {
                tenantName: 'You',
                maintenanceDescription: params.title,
                propertyName: property.name || 'the property',
            },
            idempotencyKey: `maint:${request._id}:reported`,
        });
        yield (0, notificationService_1.notifyCompanyStaff)(String(property.companyId), 'MAINTENANCE_REQUEST_RECEIVED', {
            tenantName: 'A tenant',
            maintenanceDescription: params.title,
            propertyName: property.name || 'the property',
        }, `maint:${request._id}:reported:staff`);
        return request;
    });
}
