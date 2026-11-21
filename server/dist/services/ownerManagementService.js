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
exports.resolveOwnerPropertyIds = resolveOwnerPropertyIds;
exports.getOwnersDashboard = getOwnersDashboard;
exports.getOwnerListSummaries = getOwnerListSummaries;
exports.getOwnerPortfolio = getOwnerPortfolio;
exports.getOwnerFinancials = getOwnerFinancials;
exports.getOwnerMaintenance = getOwnerMaintenance;
exports.getOwnerDocuments = getOwnerDocuments;
exports.uploadOwnerDocument = uploadOwnerDocument;
exports.upsertOwnerBanking = upsertOwnerBanking;
exports.upsertOwnerPreferences = upsertOwnerPreferences;
exports.getOwnerProfileExtras = getOwnerProfileExtras;
exports.addOwnershipHistory = addOwnershipHistory;
exports.getOwnershipHistory = getOwnershipHistory;
exports.getPropertyOwnershipHistory = getPropertyOwnershipHistory;
exports.generateOwnerDocument = generateOwnerDocument;
const mongoose_1 = __importDefault(require("mongoose"));
const PropertyOwner_1 = require("../models/PropertyOwner");
const Property_1 = require("../models/Property");
const Lease_1 = require("../models/Lease");
const MaintenanceRequest_1 = require("../models/MaintenanceRequest");
const propertyFinancialSnapshotService_1 = require("./propertyFinancialSnapshotService");
const OwnerDocument_1 = require("../models/OwnerDocument");
const OwnerBankingDetails_1 = require("../models/OwnerBankingDetails");
const OwnerPreferences_1 = require("../models/OwnerPreferences");
const OwnershipHistory_1 = require("../models/OwnershipHistory");
const errorHandler_1 = require("../middleware/errorHandler");
const maintenanceStatus_1 = require("../utils/maintenanceStatus");
const reportGenerator_1 = require("./reportGenerator");
const auditService_1 = require("./auditService");
const APPROVAL_STATUSES = ['awaiting_approval', 'pending_approval'];
function resolveOwnerPropertyIds(ownerId, companyId) {
    return __awaiter(this, void 0, void 0, function* () {
        const owner = yield PropertyOwner_1.PropertyOwner.findOne({ _id: ownerId, companyId });
        if (!owner)
            throw new errorHandler_1.AppError('Property owner not found', 404);
        const cid = new mongoose_1.default.Types.ObjectId(companyId);
        const oid = owner._id;
        const fromOwnerArray = (owner.properties || []).map((p) => new mongoose_1.default.Types.ObjectId(String(p)));
        // Property.ownerId is the managing agent (User), not the landlord.
        // Matching it here would treat an agent id as a PropertyOwner id.
        const fromPropertyOwnerId = yield Property_1.Property.find({
            companyId: cid,
            propertyOwnerId: oid,
            isDeleted: { $ne: true },
        }).select('_id');
        const idSet = new Set();
        fromOwnerArray.forEach((id) => idSet.add(String(id)));
        fromPropertyOwnerId.forEach((p) => idSet.add(String(p._id)));
        return Array.from(idSet).map((id) => new mongoose_1.default.Types.ObjectId(id));
    });
}
function propertiesForOwner(owner, properties) {
    const wanted = new Set((owner.properties || []).map((id) => String(id)));
    const ownerId = String(owner._id);
    return properties.filter((property) => wanted.has(String(property._id))
        || String(property.propertyOwnerId || '') === ownerId);
}
function restrictProperties(properties, visiblePropertyIds) {
    if (!visiblePropertyIds)
        return properties;
    const allowed = new Set(visiblePropertyIds.map(String));
    return properties.filter((property) => allowed.has(String(property._id)));
}
function limitToOwnerIds(owners, ownerIds) {
    if (!ownerIds)
        return owners;
    const allowed = new Set(ownerIds.map(String));
    return owners.filter((owner) => allowed.has(String(owner._id)));
}
function getOwnersDashboard(companyId, ownerIds, visiblePropertyIds) {
    return __awaiter(this, void 0, void 0, function* () {
        const cid = new mongoose_1.default.Types.ObjectId(companyId);
        const owners = limitToOwnerIds(yield PropertyOwner_1.PropertyOwner.find({ companyId: cid }).select('-password -tokens').lean(), ownerIds);
        const properties = yield Property_1.Property.find({ companyId: cid, isDeleted: { $ne: true } })
            .select('_id status occupiedUnits rent currentArrears propertyOwnerId')
            .lean();
        const ownerPropertyIds = new Set();
        for (const owner of owners) {
            restrictProperties(propertiesForOwner(owner, properties), visiblePropertyIds)
                .forEach((property) => ownerPropertyIds.add(String(property._id)));
        }
        const ownerProps = properties.filter((p) => ownerPropertyIds.has(String(p._id)));
        const occupied = ownerProps.filter((p) => p.status === 'rented' || (p.occupiedUnits && p.occupiedUnits > 0)).length;
        const vacant = Math.max(0, ownerProps.length - occupied);
        const propertyIds = ownerProps.map((p) => p._id);
        const approvalRows = propertyIds.length
            ? yield MaintenanceRequest_1.MaintenanceRequest.find({
                companyId: cid,
                propertyId: { $in: propertyIds },
                status: { $in: APPROVAL_STATUSES },
            }).select('propertyId').lean()
            : [];
        const approvalPropertyIds = new Set(approvalRows.map((row) => String(row.propertyId)));
        const ownersAwaitingApproval = owners.filter((owner) => restrictProperties(propertiesForOwner(owner, ownerProps), visiblePropertyIds)
            .some((property) => approvalPropertyIds.has(String(property._id)))).length;
        const outstandingBalance = ownerProps.reduce((s, p) => s + Number(p.currentArrears || 0), 0);
        const ownersWithBalance = owners.filter((owner) => restrictProperties(propertiesForOwner(owner, ownerProps), visiblePropertyIds)
            .some((property) => Number(property.currentArrears || 0) > 0)).length;
        return {
            kpis: {
                totalOwners: owners.length,
                totalProperties: ownerProps.length,
                occupiedProperties: occupied,
                vacantProperties: vacant,
                ownersAwaitingApproval,
                ownersWithOutstandingBalances: ownersWithBalance,
                totalOutstandingBalance: outstandingBalance,
            },
        };
    });
}
function getOwnerListSummaries(companyId, ownerIds, visiblePropertyIds) {
    return __awaiter(this, void 0, void 0, function* () {
        const cid = new mongoose_1.default.Types.ObjectId(companyId);
        const owners = limitToOwnerIds(yield PropertyOwner_1.PropertyOwner.find({ companyId: cid }).select('-password -tokens').lean(), ownerIds);
        const allProperties = yield Property_1.Property.find({ companyId: cid, isDeleted: { $ne: true } })
            .select('_id status occupiedUnits rent currentArrears propertyOwnerId')
            .lean();
        const allMaintenance = yield MaintenanceRequest_1.MaintenanceRequest.find({ companyId: cid }).select('propertyId status lastActivityAt updatedAt createdAt').lean();
        const leaseRows = yield Lease_1.Lease.find({
            companyId: cid,
            status: 'active',
            propertyId: { $in: allProperties.map((property) => property._id) },
        }).select('propertyId rentAmount').lean();
        const leaseRent = new Map(leaseRows.map((lease) => [String(lease.propertyId), Number(lease.rentAmount || 0)]));
        return owners.map((owner) => {
            const props = restrictProperties(propertiesForOwner(owner, allProperties), visiblePropertyIds);
            const propertyIds = props.map((property) => property._id);
            const occupiedCount = props.filter((p) => p.status === 'rented' || (p.occupiedUnits && p.occupiedUnits > 0)).length;
            const vacantCount = Math.max(0, props.length - occupiedCount);
            // List rent and arrears use the same stored property and active-lease fields
            // as the ledger snapshot. Opening this list does not read or create ledgers.
            const monthlyRevenue = props.reduce((sum, property) => sum + Number(property.rent || leaseRent.get(String(property._id)) || 0), 0);
            const outstandingBalance = props.reduce((sum, property) => sum + Number(property.currentArrears || 0), 0);
            const maint = allMaintenance.filter((m) => propertyIds.some((pid) => String(pid) === String(m.propertyId)));
            const pendingMaintenanceCount = maint.filter((m) => maintenanceStatus_1.OPEN_STATUSES.includes((0, maintenanceStatus_1.normalizeMaintenanceStatus)(m.status)) &&
                !['closed', 'rejected', 'verified'].includes((0, maintenanceStatus_1.normalizeMaintenanceStatus)(m.status))).length;
            const lastActivity = maint.reduce((latest, m) => {
                const d = new Date(m.lastActivityAt || m.updatedAt || m.createdAt).getTime();
                return d > latest ? d : latest;
            }, new Date(owner.updatedAt || owner.createdAt).getTime());
            return {
                _id: owner._id,
                ownerName: `${owner.firstName} ${owner.lastName}`.trim(),
                firstName: owner.firstName,
                lastName: owner.lastName,
                email: owner.email,
                phone: owner.phone,
                active: owner.active !== false,
                propertyCount: props.length,
                occupiedCount,
                vacantCount,
                monthlyRevenue,
                outstandingBalance,
                pendingMaintenanceCount,
                lastActivity: new Date(lastActivity).toISOString(),
                createdAt: owner.createdAt ? new Date(owner.createdAt).toISOString() : undefined,
            };
        });
    });
}
function getOwnerPortfolio(ownerId, companyId, visiblePropertyIds) {
    return __awaiter(this, void 0, void 0, function* () {
        const owner = yield PropertyOwner_1.PropertyOwner.findOne({ _id: ownerId, companyId }).select('-password -tokens');
        if (!owner)
            throw new errorHandler_1.AppError('Property owner not found', 404);
        const propertyIds = (yield resolveOwnerPropertyIds(ownerId, companyId))
            .filter((id) => !visiblePropertyIds || visiblePropertyIds.includes(String(id)));
        const properties = yield Property_1.Property.find({ _id: { $in: propertyIds }, companyId }).lean();
        const leases = yield Lease_1.Lease.find({ propertyId: { $in: propertyIds }, companyId, status: 'active' })
            .populate('tenantId', 'firstName lastName email')
            .lean();
        const snapshots = yield (0, propertyFinancialSnapshotService_1.getPropertyFinancialSnapshots)(propertyIds, companyId);
        const portfolio = properties.map((prop) => {
            var _a, _b, _c, _d, _e;
            const lease = leases.find((l) => String(l.propertyId) === String(prop._id));
            const tenant = lease === null || lease === void 0 ? void 0 : lease.tenantId;
            const snap = snapshots.get(String(prop._id));
            const isOccupied = prop.status === 'rented' || !!lease;
            let occupancyStatus = isOccupied ? 'Occupied' : 'Vacant';
            if (prop.status === 'maintenance')
                occupancyStatus = 'Maintenance Required';
            if (lease === null || lease === void 0 ? void 0 : lease.endDate) {
                const days = (new Date(lease.endDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
                if (days > 0 && days <= 60)
                    occupancyStatus = 'Lease Expiring';
            }
            return {
                _id: prop._id,
                propertyName: prop.name,
                address: prop.address,
                tenantName: tenant ? `${tenant.firstName || ''} ${tenant.lastName || ''}`.trim() : null,
                leaseStatus: (lease === null || lease === void 0 ? void 0 : lease.status) || 'none',
                monthlyRent: (_a = snap === null || snap === void 0 ? void 0 : snap.monthlyRent) !== null && _a !== void 0 ? _a : Number(prop.rent || (lease === null || lease === void 0 ? void 0 : lease.rentAmount) || 0),
                outstandingBalance: (_b = snap === null || snap === void 0 ? void 0 : snap.tenantArrears) !== null && _b !== void 0 ? _b : Number(prop.currentArrears || 0),
                trustBalance: (_c = snap === null || snap === void 0 ? void 0 : snap.ledger.runningBalance) !== null && _c !== void 0 ? _c : 0,
                totalIncome: (_d = snap === null || snap === void 0 ? void 0 : snap.ledger.totalIncome) !== null && _d !== void 0 ? _d : 0,
                totalOwnerPayouts: (_e = snap === null || snap === void 0 ? void 0 : snap.ledger.totalOwnerPayouts) !== null && _e !== void 0 ? _e : 0,
                propertyAccountId: snap === null || snap === void 0 ? void 0 : snap.ledger.accountId,
                occupancyStatus,
                leaseId: lease === null || lease === void 0 ? void 0 : lease._id,
                tenantId: tenant === null || tenant === void 0 ? void 0 : tenant._id,
            };
        });
        const occupiedUnits = portfolio.filter((p) => p.occupancyStatus === 'Occupied').length;
        const vacantUnits = portfolio.filter((p) => p.occupancyStatus === 'Vacant').length;
        return {
            owner,
            header: {
                ownerName: `${owner.firstName} ${owner.lastName}`.trim(),
                email: owner.email,
                phone: owner.phone,
                totalProperties: portfolio.length,
                occupiedUnits,
                vacantUnits,
            },
            portfolio,
        };
    });
}
function getOwnerFinancials(ownerId, companyId, visiblePropertyIds) {
    return __awaiter(this, void 0, void 0, function* () {
        const propertyIds = (yield resolveOwnerPropertyIds(ownerId, companyId))
            .filter((id) => !visiblePropertyIds || visiblePropertyIds.includes(String(id)));
        const properties = yield Property_1.Property.find({ _id: { $in: propertyIds }, companyId }).lean();
        const snapshots = yield (0, propertyFinancialSnapshotService_1.getPropertyFinancialSnapshots)(propertyIds, companyId);
        const snapList = Array.from(snapshots.values());
        const totals = (0, propertyFinancialSnapshotService_1.aggregateOwnerLedgerTotals)(snapList);
        const monthlyRentCollection = (0, propertyFinancialSnapshotService_1.mergeMonthlyIncome)(snapList);
        const commissionEarned = snapList.reduce((sum, s) => {
            // Expenses on the property ledger (maintenance, fees, etc.) — same source as accountant view
            return sum + s.ledger.totalExpenses;
        }, 0);
        return {
            summary: {
                rentCollected: totals.rentCollected,
                outstandingRent: totals.tenantArrears,
                ownerPayouts: totals.ownerPayouts,
                commissionEarned,
                netRevenue: totals.rentCollected - totals.totalExpenses - totals.ownerPayouts,
                monthlyRevenue: totals.monthlyRevenue,
                trustBalance: totals.trustBalance,
            },
            charts: {
                monthlyRentCollection,
                ownerRevenueTrend: monthlyRentCollection,
                outstandingBalances: properties
                    .map((p) => {
                    var _a, _b;
                    const snap = snapshots.get(String(p._id));
                    const amount = (_a = snap === null || snap === void 0 ? void 0 : snap.tenantArrears) !== null && _a !== void 0 ? _a : Number(p.currentArrears || 0);
                    return { propertyName: p.name, amount, trustBalance: (_b = snap === null || snap === void 0 ? void 0 : snap.ledger.runningBalance) !== null && _b !== void 0 ? _b : 0 };
                })
                    .filter((b) => b.amount > 0 || b.trustBalance > 0),
            },
            propertyLedgers: snapList.map((s) => (Object.assign({ propertyId: s.propertyId, propertyName: s.propertyName }, s.ledger))),
            dataSource: 'property_account_ledger',
        };
    });
}
function getOwnerMaintenance(ownerId, companyId, visiblePropertyIds) {
    return __awaiter(this, void 0, void 0, function* () {
        const propertyIds = (yield resolveOwnerPropertyIds(ownerId, companyId))
            .filter((id) => !visiblePropertyIds || visiblePropertyIds.includes(String(id)));
        const requests = yield MaintenanceRequest_1.MaintenanceRequest.find({ companyId, propertyId: { $in: propertyIds } })
            .populate('propertyId', 'name address')
            .sort({ updatedAt: -1 })
            .lean();
        const summary = {
            open: requests.filter((r) => maintenanceStatus_1.OPEN_STATUSES.includes((0, maintenanceStatus_1.normalizeMaintenanceStatus)(r.status))).length,
            awaitingApproval: requests.filter((r) => APPROVAL_STATUSES.includes(r.status)).length,
            inProgress: requests.filter((r) => ['in_progress', 'assigned', 'funded'].includes((0, maintenanceStatus_1.normalizeMaintenanceStatus)(r.status))).length,
            completed: requests.filter((r) => ['completed', 'verified', 'closed'].includes((0, maintenanceStatus_1.normalizeMaintenanceStatus)(r.status))).length,
        };
        return {
            summary,
            requests: requests.map((r) => {
                var _a;
                return ({
                    _id: r._id,
                    issue: r.title,
                    propertyName: (_a = r.propertyId) === null || _a === void 0 ? void 0 : _a.name,
                    status: (0, maintenanceStatus_1.normalizeMaintenanceStatus)(r.status),
                    statusRaw: r.status,
                    cost: Number(r.paidAmount || r.estimatedCost || 0),
                    createdAt: r.createdAt,
                });
            }),
        };
    });
}
function getOwnerDocuments(ownerId, companyId) {
    return __awaiter(this, void 0, void 0, function* () {
        return OwnerDocument_1.OwnerDocument.find({ ownerId, companyId }).sort({ uploadedAt: -1 });
    });
}
function uploadOwnerDocument(input) {
    return __awaiter(this, void 0, void 0, function* () {
        const latest = yield OwnerDocument_1.OwnerDocument.findOne({
            ownerId: input.ownerId,
            companyId: input.companyId,
            fileName: input.fileName,
        }).sort({ version: -1 });
        const doc = yield OwnerDocument_1.OwnerDocument.create({
            ownerId: input.ownerId,
            companyId: input.companyId,
            documentType: input.documentType,
            fileName: input.fileName,
            fileUrl: input.fileUrl,
            mimeType: input.mimeType,
            fileSize: input.fileSize,
            version: ((latest === null || latest === void 0 ? void 0 : latest.version) || 0) + 1,
            uploadedBy: input.userId,
            uploadedAt: new Date(),
        });
        yield (0, auditService_1.recordAuditEvent)({
            userId: input.userId,
            companyId: input.companyId,
            action: 'owner.document.upload',
            entityType: 'OwnerDocument',
            entityId: String(doc._id),
        });
        return doc;
    });
}
function upsertOwnerBanking(ownerId, companyId, data) {
    return __awaiter(this, void 0, void 0, function* () {
        return OwnerBankingDetails_1.OwnerBankingDetails.findOneAndUpdate({ ownerId, companyId }, { $set: Object.assign(Object.assign({}, data), { ownerId, companyId }) }, { upsert: true, new: true });
    });
}
function upsertOwnerPreferences(ownerId, companyId, data) {
    return __awaiter(this, void 0, void 0, function* () {
        return OwnerPreferences_1.OwnerPreferences.findOneAndUpdate({ ownerId, companyId }, { $set: Object.assign(Object.assign({}, data), { ownerId, companyId }) }, { upsert: true, new: true });
    });
}
function getOwnerProfileExtras(ownerId, companyId) {
    return __awaiter(this, void 0, void 0, function* () {
        const [banking, preferences] = yield Promise.all([
            OwnerBankingDetails_1.OwnerBankingDetails.findOne({ ownerId, companyId }).lean(),
            OwnerPreferences_1.OwnerPreferences.findOne({ ownerId, companyId }).lean(),
        ]);
        return { banking, preferences };
    });
}
function addOwnershipHistory(input) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        const history = yield OwnershipHistory_1.OwnershipHistory.create({
            propertyId: input.propertyId,
            ownerId: input.ownerId,
            companyId: input.companyId,
            startDate: new Date(input.startDate),
            endDate: input.endDate ? new Date(input.endDate) : undefined,
            ownershipPercentage: (_a = input.ownershipPercentage) !== null && _a !== void 0 ? _a : 100,
            notes: input.notes,
            createdBy: input.userId,
        });
        yield (0, auditService_1.recordAuditEvent)({
            userId: input.userId,
            companyId: input.companyId,
            action: 'ownership.history.create',
            entityType: 'OwnershipHistory',
            entityId: String(history._id),
        });
        return history;
    });
}
function getOwnershipHistory(ownerId, companyId) {
    return __awaiter(this, void 0, void 0, function* () {
        return OwnershipHistory_1.OwnershipHistory.find({ ownerId, companyId })
            .populate('propertyId', 'name address')
            .sort({ startDate: -1 });
    });
}
function getPropertyOwnershipHistory(propertyId, companyId) {
    return __awaiter(this, void 0, void 0, function* () {
        return OwnershipHistory_1.OwnershipHistory.find({ propertyId, companyId })
            .populate('ownerId', 'firstName lastName email')
            .sort({ startDate: -1 });
    });
}
function generateOwnerDocument(input) {
    return __awaiter(this, void 0, void 0, function* () {
        const [portfolio, financials, maintenance, history] = yield Promise.all([
            getOwnerPortfolio(input.ownerId, input.companyId, input.visiblePropertyIds),
            getOwnerFinancials(input.ownerId, input.companyId, input.visiblePropertyIds),
            getOwnerMaintenance(input.ownerId, input.companyId, input.visiblePropertyIds),
            getOwnershipHistory(input.ownerId, input.companyId),
        ]);
        const rows = [];
        if (input.type === 'portfolio-report') {
            portfolio.portfolio.forEach((p) => rows.push({ Property: p.propertyName, Status: p.occupancyStatus, Rent: p.monthlyRent }));
        }
        else if (input.type === 'outstanding-rent') {
            financials.charts.outstandingBalances.forEach((b) => rows.push({ Property: b.propertyName, Outstanding: b.amount }));
        }
        else if (input.type === 'maintenance-summary') {
            maintenance.requests.forEach((r) => rows.push({ Issue: r.issue, Property: r.propertyName, Status: r.status, Cost: r.cost }));
        }
        else if (input.type === 'ownership-history') {
            history.forEach((h) => {
                var _a;
                return rows.push({
                    Property: (_a = h.propertyId) === null || _a === void 0 ? void 0 : _a.name,
                    From: new Date(h.startDate).toLocaleDateString(),
                    To: h.endDate ? new Date(h.endDate).toLocaleDateString() : 'Present',
                    Share: `${h.ownershipPercentage}%`,
                });
            });
        }
        else {
            rows.push({ Metric: 'Monthly Revenue', Value: financials.summary.monthlyRevenue }, { Metric: 'Outstanding Rent', Value: financials.summary.outstandingRent }, { Metric: 'Properties', Value: portfolio.header.totalProperties });
        }
        return (0, reportGenerator_1.generateTrustReportPdf)({
            reportType: input.type,
            companyName: input.companyName,
            propertyLabel: portfolio.header.ownerName,
            auditReference: input.ownerId,
            rows,
            totals: financials.summary,
        });
    });
}
