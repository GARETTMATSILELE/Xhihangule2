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
        const fromPropertyOwnerId = yield Property_1.Property.find({
            companyId: cid,
            $or: [{ ownerId: oid }, { propertyOwnerId: oid }],
            isDeleted: { $ne: true },
        }).select('_id');
        const idSet = new Set();
        fromOwnerArray.forEach((id) => idSet.add(String(id)));
        fromPropertyOwnerId.forEach((p) => idSet.add(String(p._id)));
        return Array.from(idSet).map((id) => new mongoose_1.default.Types.ObjectId(id));
    });
}
function getOwnersDashboard(companyId) {
    return __awaiter(this, void 0, void 0, function* () {
        const cid = new mongoose_1.default.Types.ObjectId(companyId);
        const owners = yield PropertyOwner_1.PropertyOwner.find({ companyId: cid }).select('-password').lean();
        const properties = yield Property_1.Property.find({ companyId: cid, isDeleted: { $ne: true } }).lean();
        const ownerPropertyIds = new Set();
        for (const owner of owners) {
            const ids = yield resolveOwnerPropertyIds(String(owner._id), companyId);
            ids.forEach((id) => ownerPropertyIds.add(String(id)));
        }
        const ownerProps = properties.filter((p) => ownerPropertyIds.has(String(p._id)));
        const occupied = ownerProps.filter((p) => p.status === 'rented' || (p.occupiedUnits && p.occupiedUnits > 0)).length;
        const vacant = Math.max(0, ownerProps.length - occupied);
        const propertyIds = ownerProps.map((p) => p._id);
        const maintenancePending = yield MaintenanceRequest_1.MaintenanceRequest.countDocuments({
            companyId: cid,
            propertyId: { $in: propertyIds },
            status: { $in: APPROVAL_STATUSES },
        });
        const outstandingBalance = ownerProps.reduce((s, p) => s + Number(p.currentArrears || 0), 0);
        const ownersWithBalance = owners.filter((o) => {
            const props = ownerProps.filter((p) => String(p.ownerId) === String(o._id) || (o.properties || []).some((pid) => String(pid) === String(p._id)));
            return props.some((p) => Number(p.currentArrears || 0) > 0);
        }).length;
        return {
            kpis: {
                totalOwners: owners.length,
                totalProperties: ownerProps.length,
                occupiedProperties: occupied,
                vacantProperties: vacant,
                ownersAwaitingApproval: maintenancePending,
                ownersWithOutstandingBalances: ownersWithBalance,
                totalOutstandingBalance: outstandingBalance,
            },
        };
    });
}
function getOwnerListSummaries(companyId) {
    return __awaiter(this, void 0, void 0, function* () {
        const cid = new mongoose_1.default.Types.ObjectId(companyId);
        const owners = yield PropertyOwner_1.PropertyOwner.find({ companyId: cid }).select('-password').lean();
        const allProperties = yield Property_1.Property.find({ companyId: cid, isDeleted: { $ne: true } }).lean();
        const allMaintenance = yield MaintenanceRequest_1.MaintenanceRequest.find({ companyId: cid }).lean();
        return Promise.all(owners.map((owner) => __awaiter(this, void 0, void 0, function* () {
            const propertyIds = yield resolveOwnerPropertyIds(String(owner._id), companyId);
            const props = allProperties.filter((p) => propertyIds.some((id) => String(id) === String(p._id)));
            const occupiedCount = props.filter((p) => p.status === 'rented').length;
            const vacantCount = Math.max(0, props.length - occupiedCount);
            const snapshots = yield (0, propertyFinancialSnapshotService_1.getPropertyFinancialSnapshots)(propertyIds, companyId);
            const snapList = props
                .map((p) => snapshots.get(String(p._id)))
                .filter((s) => !!s);
            const totals = snapList.length
                ? (0, propertyFinancialSnapshotService_1.aggregateOwnerLedgerTotals)(snapList)
                : {
                    monthlyRevenue: props.reduce((s, p) => s + Number(p.rent || 0), 0),
                    tenantArrears: props.reduce((s, p) => s + Number(p.currentArrears || 0), 0),
                };
            const monthlyRevenue = totals.monthlyRevenue;
            const outstandingBalance = totals.tenantArrears;
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
            };
        })));
    });
}
function getOwnerPortfolio(ownerId, companyId) {
    return __awaiter(this, void 0, void 0, function* () {
        const owner = yield PropertyOwner_1.PropertyOwner.findOne({ _id: ownerId, companyId }).select('-password');
        if (!owner)
            throw new errorHandler_1.AppError('Property owner not found', 404);
        const propertyIds = yield resolveOwnerPropertyIds(ownerId, companyId);
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
function getOwnerFinancials(ownerId, companyId) {
    return __awaiter(this, void 0, void 0, function* () {
        const propertyIds = yield resolveOwnerPropertyIds(ownerId, companyId);
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
function getOwnerMaintenance(ownerId, companyId) {
    return __awaiter(this, void 0, void 0, function* () {
        const propertyIds = yield resolveOwnerPropertyIds(ownerId, companyId);
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
            getOwnerPortfolio(input.ownerId, input.companyId),
            getOwnerFinancials(input.ownerId, input.companyId),
            getOwnerMaintenance(input.ownerId, input.companyId),
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
