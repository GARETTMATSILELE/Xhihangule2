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
exports.getCompanyPropertyDetailsReport = exports.getAgentPropertyDetailsReport = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const Property_1 = require("../models/Property");
const Tenant_1 = require("../models/Tenant");
const Lease_1 = require("../models/Lease");
const Payment_1 = require("../models/Payment");
const Company_1 = require("../models/Company");
const PropertyOwner_1 = require("../models/PropertyOwner");
const User_1 = require("../models/User");
const errorHandler_1 = require("../middleware/errorHandler");
const propertyAccess_1 = require("../utils/propertyAccess");
const propertyReportDataset_1 = require("../services/propertyReportDataset");
const activePropertyVisibilityFilter = {
    isDeleted: { $ne: true },
    propertyOperationalStatus: { $ne: 'Archived' },
};
const COMPANY_WIDE_REPORT_ROLES = ['admin', 'accountant', 'principal', 'prea'];
function userRoles(req) {
    var _a, _b;
    const roles = ((_a = req.user) === null || _a === void 0 ? void 0 : _a.roles) || [(_b = req.user) === null || _b === void 0 ? void 0 : _b.role];
    return (roles || []).filter(Boolean).map(String);
}
function reportScopeForUser(req, explicit) {
    const wide = userRoles(req).some((role) => COMPANY_WIDE_REPORT_ROLES.includes(role));
    if (!wide)
        return 'agent';
    if (explicit === 'company')
        return 'company';
    return 'company';
}
function parseIdList(value) {
    const raw = Array.isArray(value) ? value.join(',') : String(value || '');
    return raw
        .split(',')
        .map((id) => id.trim())
        .filter((id) => mongoose_1.default.Types.ObjectId.isValid(id));
}
function sendPropertyDetailsReport(req, res, scope) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c;
        try {
            if (!((_a = req.user) === null || _a === void 0 ? void 0 : _a.userId)) {
                throw new errorHandler_1.AppError('Authentication required', 401);
            }
            if (!((_b = req.user) === null || _b === void 0 ? void 0 : _b.companyId)) {
                throw new errorHandler_1.AppError('Company ID not found. Please ensure you are associated with a company.', 400);
            }
            const companyId = new mongoose_1.default.Types.ObjectId(req.user.companyId);
            const occupancyFilter = String(req.query.occupancy || 'all').toLowerCase();
            const typeFilter = String(req.query.propertyType || 'all').toLowerCase();
            const requestedIds = parseIdList(req.query.propertyIds);
            const query = Object.assign({ companyId }, activePropertyVisibilityFilter);
            if (scope === 'agent') {
                const visible = yield (0, propertyAccess_1.propertyIdsForCaller)(req);
                const allowed = visible === 'company' ? null : visible.map((id) => String(id));
                const chosen = requestedIds.length
                    ? requestedIds.filter((id) => !allowed || allowed.includes(id))
                    : allowed;
                query._id = { $in: (chosen || []).map((id) => new mongoose_1.default.Types.ObjectId(id)) };
            }
            else if (requestedIds.length) {
                query._id = { $in: requestedIds.map((id) => new mongoose_1.default.Types.ObjectId(id)) };
            }
            const [properties, company] = yield Promise.all([
                Property_1.Property.find(query)
                    .populate('propertyOwnerId', 'firstName lastName email phone')
                    .select('name address type propertyCategory propertySubtype status propertyOperationalStatus rent commission levyOrMunicipalAmount createdAt updatedAt propertyOwnerId ownerId agentId')
                    .lean(),
                Company_1.Company.findById(companyId).select('name tradingName logo workspacePreferences defaultCurrency').lean(),
            ]);
            const propertyIds = properties.map((property) => property._id);
            const ownerIds = properties
                .map((property) => (0, propertyReportDataset_1.asId)(property.propertyOwnerId))
                .filter((id) => mongoose_1.default.Types.ObjectId.isValid(id));
            const agentIds = [...new Set(properties
                    .map((property) => (0, propertyReportDataset_1.asId)(property.agentId) || (0, propertyReportDataset_1.asId)(property.ownerId))
                    .filter((id) => mongoose_1.default.Types.ObjectId.isValid(id)))];
            const [leases, tenants, payments, linkedOwners, agents] = propertyIds.length
                ? yield Promise.all([
                    Lease_1.Lease.find({ companyId, propertyId: { $in: propertyIds } }).lean(),
                    Tenant_1.Tenant.find({
                        companyId,
                        $or: [
                            { propertyId: { $in: propertyIds } },
                            { propertyIds: { $in: propertyIds } },
                        ],
                    }).lean(),
                    Payment_1.Payment.find({
                        companyId,
                        propertyId: { $in: propertyIds },
                        paymentType: 'rental',
                        status: { $in: ['completed', 'paid', 'success'] },
                    })
                        .select('propertyId leaseId tenantId rentalPeriodMonth rentalPeriodYear advancePeriodStart advancePeriodEnd advanceMonthsPaid paymentDate status paymentType')
                        .lean(),
                    PropertyOwner_1.PropertyOwner.find({
                        companyId,
                        $or: [
                            { properties: { $in: propertyIds } },
                            ...(ownerIds.length ? [{ _id: { $in: ownerIds.map((id) => new mongoose_1.default.Types.ObjectId(id)) } }] : []),
                        ],
                    })
                        .select('firstName lastName email phone properties')
                        .lean(),
                    agentIds.length
                        ? User_1.User.find({ _id: { $in: agentIds.map((id) => new mongoose_1.default.Types.ObjectId(id)) } })
                            .select('firstName lastName email')
                            .lean()
                        : Promise.resolve([]),
                ])
                : [[], [], [], [], []];
            const leasesByProperty = new Map();
            for (const lease of leases) {
                const propertyId = (0, propertyReportDataset_1.asId)(lease.propertyId);
                if (!propertyId)
                    continue;
                const rows = leasesByProperty.get(propertyId) || [];
                rows.push(lease);
                leasesByProperty.set(propertyId, rows);
            }
            const tenantsByProperty = new Map();
            for (const tenant of tenants) {
                const ids = [(0, propertyReportDataset_1.asId)(tenant.propertyId), ...(Array.isArray(tenant.propertyIds) ? tenant.propertyIds.map(propertyReportDataset_1.asId) : [])].filter(Boolean);
                for (const propertyId of ids) {
                    const rows = tenantsByProperty.get(propertyId) || [];
                    rows.push(tenant);
                    tenantsByProperty.set(propertyId, rows);
                }
            }
            const paymentsByProperty = new Map();
            for (const payment of payments) {
                const propertyId = (0, propertyReportDataset_1.asId)(payment.propertyId);
                if (!propertyId)
                    continue;
                const rows = paymentsByProperty.get(propertyId) || [];
                rows.push(payment);
                paymentsByProperty.set(propertyId, rows);
            }
            const ownersById = new Map();
            const ownersByProperty = new Map();
            for (const owner of linkedOwners) {
                ownersById.set((0, propertyReportDataset_1.asId)(owner._id), owner);
                for (const propertyId of (owner.properties || []).map(propertyReportDataset_1.asId).filter(Boolean)) {
                    if (!ownersByProperty.has(propertyId))
                        ownersByProperty.set(propertyId, owner);
                }
            }
            const agentsById = new Map();
            for (const agent of agents) {
                agentsById.set((0, propertyReportDataset_1.asId)(agent._id), agent);
            }
            const currency = ((_c = company === null || company === void 0 ? void 0 : company.workspacePreferences) === null || _c === void 0 ? void 0 : _c.currency) ||
                (company === null || company === void 0 ? void 0 : company.defaultCurrency) ||
                'USD';
            const rows = properties.map((property) => {
                var _a, _b;
                const propertyId = (0, propertyReportDataset_1.asId)(property._id);
                const propertyLeases = leasesByProperty.get(propertyId) || [];
                const propertyTenants = tenantsByProperty.get(propertyId) || [];
                const occupancyStatus = (0, propertyReportDataset_1.deriveOccupancyStatus)(property, propertyLeases, propertyTenants);
                const currentLease = occupancyStatus === 'Rented' ? (0, propertyReportDataset_1.pickCurrentLease)(propertyLeases) : null;
                const tenantFromLease = currentLease
                    ? propertyTenants.find((tenant) => (0, propertyReportDataset_1.asId)(tenant._id) === (0, propertyReportDataset_1.asId)(currentLease.tenantId))
                    : null;
                const tenant = tenantFromLease || propertyTenants.find((item) => String((item === null || item === void 0 ? void 0 : item.status) || 'Active').toLowerCase() !== 'inactive') || null;
                const populatedOwner = property.propertyOwnerId && typeof property.propertyOwnerId === 'object' && (0, propertyReportDataset_1.personName)(property.propertyOwnerId)
                    ? property.propertyOwnerId
                    : null;
                const owner = populatedOwner ||
                    ownersById.get((0, propertyReportDataset_1.asId)(property.propertyOwnerId)) ||
                    ownersByProperty.get(propertyId) ||
                    null;
                const rentAmount = Number((_b = (_a = currentLease === null || currentLease === void 0 ? void 0 : currentLease.rentAmount) !== null && _a !== void 0 ? _a : currentLease === null || currentLease === void 0 ? void 0 : currentLease.monthlyRent) !== null && _b !== void 0 ? _b : property.rent);
                const commissionPercent = property.commission == null ? null : Number(property.commission);
                const commissionAmount = Number.isFinite(rentAmount) && rentAmount >= 0 && commissionPercent != null && Number.isFinite(commissionPercent)
                    ? Math.round(((rentAmount * commissionPercent) / 100) * 100) / 100
                    : null;
                const levyAmount = property.levyOrMunicipalAmount == null ? null : Number(property.levyOrMunicipalAmount);
                const ownerName = (0, propertyReportDataset_1.personName)(owner);
                const associatedAgentId = (0, propertyReportDataset_1.asId)(property.agentId) || (0, propertyReportDataset_1.asId)(property.ownerId);
                const agent = associatedAgentId ? agentsById.get(associatedAgentId) : null;
                const agentName = (0, propertyReportDataset_1.personName)(agent);
                const tenantName = (0, propertyReportDataset_1.personName)(tenant);
                const propertyCategory = (0, propertyReportDataset_1.classifyPropertyCategory)(property);
                const leasePayments = currentLease
                    ? (paymentsByProperty.get(propertyId) || []).filter((payment) => {
                        const paymentLeaseId = (0, propertyReportDataset_1.asId)(payment.leaseId);
                        return !paymentLeaseId || paymentLeaseId === (0, propertyReportDataset_1.asId)(currentLease._id);
                    })
                    : [];
                return {
                    id: propertyId,
                    address: property.address || '',
                    name: property.name || '',
                    propertyType: (0, propertyReportDataset_1.formatPropertyType)(property),
                    propertyCategory: propertyCategory || '',
                    occupancyStatus,
                    ownerName,
                    agentId: associatedAgentId,
                    agentName,
                    tenantName,
                    tenantPhone: (tenant === null || tenant === void 0 ? void 0 : tenant.phone) || '',
                    tenantEmail: (tenant === null || tenant === void 0 ? void 0 : tenant.email) || '',
                    rentAmount: Number.isFinite(rentAmount) ? rentAmount : null,
                    commissionPercent,
                    commissionAmount,
                    levyAmount: levyAmount != null && Number.isFinite(levyAmount) ? levyAmount : null,
                    currency,
                    leaseStartDate: (currentLease === null || currentLease === void 0 ? void 0 : currentLease.startDate) || null,
                    leaseEndDate: (currentLease === null || currentLease === void 0 ? void 0 : currentLease.endDate) || null,
                    leasePeriod: (0, propertyReportDataset_1.formatLeasePeriod)(currentLease === null || currentLease === void 0 ? void 0 : currentLease.startDate, currentLease === null || currentLease === void 0 ? void 0 : currentLease.endDate),
                    paidUpTo: (0, propertyReportDataset_1.formatPaidUpTo)(leasePayments),
                    leaseStatus: (0, propertyReportDataset_1.formatLeaseStatus)(currentLease),
                    createdAt: property.createdAt || null,
                    updatedAt: property.updatedAt || null,
                    recency: (0, propertyReportDataset_1.recencyTimestamp)(property),
                };
            }).filter((row) => {
                if (occupancyFilter === 'rented' && row.occupancyStatus !== 'Rented')
                    return false;
                if (occupancyFilter === 'vacant' && row.occupancyStatus !== 'Vacant')
                    return false;
                if (!(0, propertyReportDataset_1.matchesPropertyTypeFilter)(row.propertyCategory, typeFilter))
                    return false;
                return true;
            });
            res.json({
                reportType: 'property-details',
                company: {
                    name: (company === null || company === void 0 ? void 0 : company.tradingName) || (company === null || company === void 0 ? void 0 : company.name) || '',
                    logo: (company === null || company === void 0 ? void 0 : company.logo) || '',
                },
                generatedAt: new Date().toISOString(),
                properties: rows,
            });
        }
        catch (error) {
            if (error instanceof errorHandler_1.AppError) {
                return res.status(error.statusCode).json({ message: error.message });
            }
            console.error('Error fetching property details report:', error);
            res.status(500).json({ message: 'Error fetching property details report' });
        }
    });
}
const getAgentPropertyDetailsReport = (req, res) => sendPropertyDetailsReport(req, res, reportScopeForUser(req, 'agent'));
exports.getAgentPropertyDetailsReport = getAgentPropertyDetailsReport;
const getCompanyPropertyDetailsReport = (req, res) => sendPropertyDetailsReport(req, res, reportScopeForUser(req, 'company'));
exports.getCompanyPropertyDetailsReport = getCompanyPropertyDetailsReport;
