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
exports.createDefaultReportingReadModels = exports.CompanyReportingReadService = exports.PropertyAccountReportingReadService = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const Company_1 = require("../../models/Company");
const Inspection_1 = require("../../models/Inspection");
const Lease_1 = require("../../models/Lease");
const MaintenanceRequest_1 = require("../../models/MaintenanceRequest");
const PropertyAccount_1 = __importDefault(require("../../models/PropertyAccount"));
const Payment_1 = require("../../models/Payment");
const Property_1 = require("../../models/Property");
const PropertyOwner_1 = require("../../models/PropertyOwner");
const Tenant_1 = require("../../models/Tenant");
const statementRent_1 = require("../statementRent");
const isWithinPeriod = (date, from, to) => {
    if (from && date < from)
        return false;
    if (to && date > to)
        return false;
    return true;
};
const toId = (value) => {
    if (!value)
        return undefined;
    if (typeof value === 'string')
        return value;
    const maybeToString = value.toString;
    return typeof maybeToString === 'function' ? maybeToString.call(value) : undefined;
};
const normalizeDirection = (transaction) => {
    if (transaction.type === 'opening_balance')
        return transaction.direction === 'debit' ? 'debit' : 'credit';
    return ['expense', 'repair', 'maintenance', 'owner_payout'].includes(transaction.type) ? 'debit' : 'credit';
};
const propertyAccountToLedgerEntries = (account, context) => {
    const propertyId = toId(account.propertyId);
    const ownerId = toId(account.ownerId);
    const entries = [];
    for (const transaction of account.transactions || []) {
        const effectiveDate = new Date(transaction.date);
        if (!isWithinPeriod(effectiveDate, context.from, context.to))
            continue;
        if (transaction.status === 'cancelled' || transaction.status === 'failed')
            continue;
        const amount = Number(transaction.amount || 0);
        const direction = normalizeDirection(transaction);
        entries.push({
            entryId: `property:${toId(account._id) || propertyId}:${toId(transaction._id) || transaction.idempotencyKey || effectiveDate.getTime()}`,
            sourceSystem: 'property_account',
            sourceModel: 'PropertyAccount.transactions',
            sourceId: toId(transaction._id) || transaction.idempotencyKey || '',
            companyId: context.companyId,
            propertyId,
            ownerId,
            eventType: transaction.transactionCategory || transaction.type,
            direction,
            debit: direction === 'debit' ? amount : 0,
            credit: direction === 'credit' ? amount : 0,
            amount,
            currency: context.currency,
            effectiveDate,
            postedDate: transaction.createdAt ? new Date(transaction.createdAt) : effectiveDate,
            status: transaction.status,
            runningBalance: typeof transaction.runningBalance === 'number' ? transaction.runningBalance : undefined,
            metadata: {
                description: transaction.description,
                category: transaction.category,
                referenceNumber: transaction.referenceNumber,
                paymentId: toId(transaction.paymentId),
                accountingTreatment: transaction.accountingTreatment,
                passThroughType: transaction.passThroughType,
                recipientName: transaction.recipientName
            }
        });
    }
    for (const payout of account.ownerPayouts || []) {
        const effectiveDate = new Date(payout.date);
        if (!isWithinPeriod(effectiveDate, context.from, context.to))
            continue;
        if (payout.status === 'cancelled' || payout.status === 'failed')
            continue;
        const amount = Number(payout.amount || 0);
        entries.push({
            entryId: `owner-payout:${toId(account._id) || propertyId}:${toId(payout._id) || payout.referenceNumber}`,
            sourceSystem: 'owner_payout',
            sourceModel: 'PropertyAccount.ownerPayouts',
            sourceId: toId(payout._id) || payout.referenceNumber,
            companyId: context.companyId,
            propertyId,
            ownerId: toId(payout.recipientId) || ownerId,
            eventType: 'OWNER_PAYOUT',
            direction: 'debit',
            debit: amount,
            credit: 0,
            amount,
            currency: context.currency,
            effectiveDate,
            postedDate: payout.createdAt ? new Date(payout.createdAt) : effectiveDate,
            status: payout.status,
            metadata: {
                referenceNumber: payout.referenceNumber,
                recipientName: payout.recipientName,
                description: payout.recipientName ? `Owner payout - ${payout.recipientName}` : payout.notes,
                paymentMethod: payout.paymentMethod,
                notes: payout.notes
            }
        });
    }
    for (const passThroughAccount of account.passThroughAccounts || []) {
        for (const transaction of passThroughAccount.transactions || []) {
            const effectiveDate = new Date(transaction.date);
            if (!isWithinPeriod(effectiveDate, context.from, context.to))
                continue;
            if (transaction.status === 'cancelled' || transaction.status === 'failed')
                continue;
            const amount = Number(transaction.amount || 0);
            const direction = transaction.type === 'collection' ? 'credit' : 'debit';
            entries.push({
                entryId: `pass-through:${toId(account._id) || propertyId}:${toId(transaction._id) || transaction.idempotencyKey || effectiveDate.getTime()}`,
                sourceSystem: 'pass_through',
                sourceModel: 'PropertyAccount.passThroughAccounts.transactions',
                sourceId: toId(transaction._id) || transaction.idempotencyKey || '',
                companyId: context.companyId,
                propertyId,
                ownerId,
                eventType: `PASS_THROUGH_${String(passThroughAccount.type || 'OTHER').toUpperCase()}_${transaction.type.toUpperCase()}`,
                direction,
                debit: direction === 'debit' ? amount : 0,
                credit: direction === 'credit' ? amount : 0,
                amount,
                currency: context.currency,
                effectiveDate,
                postedDate: transaction.createdAt ? new Date(transaction.createdAt) : effectiveDate,
                status: transaction.status,
                metadata: {
                    description: transaction.description || passThroughAccount.label || passThroughAccount.type,
                    category: 'PASS_THROUGH',
                    referenceNumber: transaction.referenceNumber,
                    paymentId: toId(transaction.paymentId),
                    passThroughType: passThroughAccount.type
                }
            });
        }
    }
    return entries;
};
class PropertyAccountReportingReadService {
    getOwnerForProperty(companyId, propertyId) {
        return __awaiter(this, void 0, void 0, function* () {
            const [account, property] = yield Promise.all([
                this.getAccount(companyId, propertyId),
                this.getPropertyDocument(companyId, propertyId)
            ]);
            const ownerId = toId(account === null || account === void 0 ? void 0 : account.ownerId) || toId(property === null || property === void 0 ? void 0 : property.ownerId) || toId(property === null || property === void 0 ? void 0 : property.propertyOwnerId);
            const owner = ownerId && mongoose_1.default.isValidObjectId(ownerId)
                ? yield PropertyOwner_1.PropertyOwner.findById(ownerId).select('_id firstName lastName email phone').lean()
                : yield PropertyOwner_1.PropertyOwner.findOne({ companyId, properties: { $in: [propertyId] } }).select('_id firstName lastName email phone').lean();
            return {
                id: owner ? toId(owner._id) : ownerId,
                displayName: (account === null || account === void 0 ? void 0 : account.ownerName)
                    || (owner ? `${owner.firstName || ''} ${owner.lastName || ''}`.trim() : '')
                    || 'Unknown Owner',
                email: owner === null || owner === void 0 ? void 0 : owner.email,
                phone: owner === null || owner === void 0 ? void 0 : owner.phone
            };
        });
    }
    getProperty(companyId, propertyId) {
        return __awaiter(this, void 0, void 0, function* () {
            const [account, property] = yield Promise.all([
                this.getAccount(companyId, propertyId),
                this.getPropertyDocument(companyId, propertyId)
            ]);
            if (!account && !property)
                return undefined;
            return {
                id: propertyId,
                name: (account === null || account === void 0 ? void 0 : account.propertyName) || (property === null || property === void 0 ? void 0 : property.name) || 'Property',
                address: (account === null || account === void 0 ? void 0 : account.propertyAddress) || (property === null || property === void 0 ? void 0 : property.address),
                ledgerType: (account === null || account === void 0 ? void 0 : account.ledgerType) || ((property === null || property === void 0 ? void 0 : property.rentalType) === 'sale' ? 'sale' : 'rental'),
                ownerId: toId(account === null || account === void 0 ? void 0 : account.ownerId) || toId(property === null || property === void 0 ? void 0 : property.ownerId) || toId(property === null || property === void 0 ? void 0 : property.propertyOwnerId),
                ownerName: account === null || account === void 0 ? void 0 : account.ownerName
            };
        });
    }
    getLedgerEntries(query) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            const account = query.propertyId ? yield this.getAccount(query.companyId, query.propertyId) : undefined;
            if (!account)
                return [];
            const companyContext = yield new CompanyReportingReadService().getCompanyContext(query.companyId);
            const entries = propertyAccountToLedgerEntries(account, {
                companyId: query.companyId,
                currency: companyContext.currency || 'USD',
                from: query.from,
                to: query.to
            });
            if (!((_a = query.eventTypes) === null || _a === void 0 ? void 0 : _a.length))
                return entries;
            const allowed = new Set(query.eventTypes.map((type) => type.toUpperCase()));
            return entries.filter((entry) => allowed.has(entry.eventType.toUpperCase()));
        });
    }
    getAccount(companyId, propertyId) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!mongoose_1.default.isValidObjectId(propertyId))
                return undefined;
            const account = yield PropertyAccount_1.default.findOne({
                propertyId: new mongoose_1.default.Types.ObjectId(propertyId),
                isArchived: { $ne: true },
                isActive: { $ne: false }
            }).sort({ updatedAt: -1 });
            return account || undefined;
        });
    }
    getPropertyDocument(companyId, propertyId) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!mongoose_1.default.isValidObjectId(propertyId))
                return undefined;
            return Property_1.Property.findOne(Object.assign(Object.assign({ _id: propertyId }, (companyId ? { companyId } : {})), { isDeleted: { $ne: true } })).select('_id name address ownerId propertyOwnerId rentalType rent occupancyRate currentArrears status propertyOperationalStatus').lean();
        });
    }
}
exports.PropertyAccountReportingReadService = PropertyAccountReportingReadService;
class EmptyReadService {
    getPaymentTraceReferences() {
        return __awaiter(this, void 0, void 0, function* () {
            return {};
        });
    }
    getPropertyCommissionSnapshots() {
        return __awaiter(this, void 0, void 0, function* () {
            return [];
        });
    }
    getTrustContext() {
        return __awaiter(this, void 0, void 0, function* () {
            return undefined;
        });
    }
}
class PaymentReportingReadService {
    getPaymentTraceReferences() {
        return __awaiter(this, void 0, void 0, function* () {
            return {};
        });
    }
    getPropertyCommissionSnapshots(companyId, propertyId, from, to, paymentIds) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!mongoose_1.default.isValidObjectId(propertyId) || !mongoose_1.default.isValidObjectId(companyId))
                return [];
            const filter = {
                companyId: new mongoose_1.default.Types.ObjectId(companyId),
                propertyId: new mongoose_1.default.Types.ObjectId(propertyId),
                status: 'completed',
                paymentType: { $in: ['rental', 'introduction'] }
            };
            const validPaymentIds = (paymentIds || [])
                .filter((id) => mongoose_1.default.isValidObjectId(id))
                .map((id) => new mongoose_1.default.Types.ObjectId(id));
            if (validPaymentIds.length > 0) {
                filter.$or = [
                    { _id: { $in: validPaymentIds } },
                    { paymentDate: { $gte: from, $lte: to } }
                ];
            }
            else {
                filter.paymentDate = { $gte: from, $lte: to };
            }
            const rows = yield Payment_1.Payment.find(filter).select('paymentDate amount rentUsed rentAllocated levyAllocated levyUsed commissionDetails referenceNumber rentalPeriodMonth rentalPeriodYear advanceMonthsPaid advancePeriodStart advancePeriodEnd vatOnCommissionRate vatCommissionTreatment').lean();
            return rows.map((row) => {
                var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l;
                const cd = row.commissionDetails || {};
                const levy = Number((_b = (_a = cd.levy) !== null && _a !== void 0 ? _a : row.levyAllocated) !== null && _b !== void 0 ? _b : 0);
                const rentAmount = (0, statementRent_1.resolveStatementRentAmount)({
                    rentUsed: row.rentUsed,
                    advanceMonthsPaid: row.advanceMonthsPaid,
                    rentAllocated: row.rentAllocated,
                    commissionBase: cd.commissionBase,
                    levy,
                    grossRent: cd.grossRent,
                    amount: row.amount
                });
                const vatRateRaw = (_c = cd.vatRate) !== null && _c !== void 0 ? _c : row.vatOnCommissionRate;
                const vatRate = vatRateRaw == null || vatRateRaw === '' ? undefined : Number(vatRateRaw);
                const vatTreatment = cd.vatTreatment || row.vatCommissionTreatment;
                return {
                    paymentId: String(row._id),
                    paymentDate: row.paymentDate,
                    referenceNumber: row.referenceNumber ? String(row.referenceNumber) : undefined,
                    grossRent: rentAmount !== null && rentAmount !== void 0 ? rentAmount : 0,
                    levy,
                    commission: Number((_e = (_d = cd.commissionNet) !== null && _d !== void 0 ? _d : cd.totalCommission) !== null && _e !== void 0 ? _e : 0),
                    vatOnCommission: Number((_g = (_f = cd.vatOnCommission) !== null && _f !== void 0 ? _f : cd.vatAmount) !== null && _g !== void 0 ? _g : 0),
                    vatRate: Number.isFinite(Number(vatRate)) ? Number(vatRate) : undefined,
                    vatTreatment: vatTreatment === 'inclusive' || vatTreatment === 'exclusive' ? vatTreatment : undefined,
                    ownerPayable: Number(cd.ownerAmount != null ? Number(cd.ownerAmount) - levy : 0),
                    rentalPeriodMonth: Number.isFinite(Number(row.rentalPeriodMonth)) ? Number(row.rentalPeriodMonth) : undefined,
                    rentalPeriodYear: Number.isFinite(Number(row.rentalPeriodYear)) ? Number(row.rentalPeriodYear) : undefined,
                    advanceMonthsPaid: Number.isFinite(Number(row.advanceMonthsPaid)) ? Number(row.advanceMonthsPaid) : undefined,
                    advancePeriodStart: ((_h = row.advancePeriodStart) === null || _h === void 0 ? void 0 : _h.month) && ((_j = row.advancePeriodStart) === null || _j === void 0 ? void 0 : _j.year)
                        ? { month: Number(row.advancePeriodStart.month), year: Number(row.advancePeriodStart.year) }
                        : undefined,
                    advancePeriodEnd: ((_k = row.advancePeriodEnd) === null || _k === void 0 ? void 0 : _k.month) && ((_l = row.advancePeriodEnd) === null || _l === void 0 ? void 0 : _l.year)
                        ? { month: Number(row.advancePeriodEnd.month), year: Number(row.advancePeriodEnd.year) }
                        : undefined
                };
            });
        });
    }
}
class LeaseReportingReadService {
    getLeaseContext(companyId, propertyId) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b, _c, _d;
            if (!mongoose_1.default.isValidObjectId(propertyId))
                return undefined;
            const lease = yield Lease_1.Lease.findOne({
                companyId,
                propertyId,
                status: { $in: ['active', 'expiring_soon', 'pending_settlement'] }
            }).sort({ startDate: -1 }).lean();
            if (!lease)
                return undefined;
            const tenant = yield Tenant_1.Tenant.findById(lease.tenantId).select('_id firstName lastName email phone').lean();
            return {
                tenant: tenant ? {
                    id: toId(tenant._id),
                    displayName: `${tenant.firstName || ''} ${tenant.lastName || ''}`.trim() || 'Tenant',
                    email: tenant.email,
                    phone: tenant.phone,
                    type: 'tenant'
                } : undefined,
                lease: {
                    id: toId(lease._id),
                    status: lease.status,
                    startDate: (_b = (_a = lease.startDate) === null || _a === void 0 ? void 0 : _a.toISOString) === null || _b === void 0 ? void 0 : _b.call(_a),
                    endDate: (_d = (_c = lease.endDate) === null || _c === void 0 ? void 0 : _c.toISOString) === null || _d === void 0 ? void 0 : _d.call(_c)
                },
                monthlyRent: Number(lease.monthlyRent || lease.rentAmount || 0),
                deposit: Number(lease.securityDeposit || lease.depositAmount || 0),
                nextDueDate: (() => {
                    const now = new Date();
                    const dueDay = Number(lease.rentDueDay || 1);
                    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, Math.max(1, Math.min(28, dueDay)))).toISOString();
                })(),
                occupancy: 'occupied'
            };
        });
    }
}
class MaintenanceReportingReadService {
    getMaintenanceContext(companyId, propertyId) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!mongoose_1.default.isValidObjectId(propertyId))
                return { open: 0, closed: 0, notes: [] };
            const rows = yield MaintenanceRequest_1.MaintenanceRequest.find({ companyId, propertyId }).select('status title description updatedAt').sort({ updatedAt: -1 }).limit(50).lean();
            const openStatuses = new Set(['draft', 'pending', 'assigned', 'in_progress', 'awaiting_payment', 'owner_review']);
            const open = rows.filter((row) => openStatuses.has(String(row.status || '').toLowerCase())).length;
            const closed = rows.filter((row) => ['completed', 'closed', 'cancelled'].includes(String(row.status || '').toLowerCase())).length;
            return {
                open,
                closed,
                notes: rows.slice(0, 3).map((row) => row.title || row.description).filter(Boolean)
            };
        });
    }
}
class InspectionReportingReadService {
    getInspectionContext(companyId, propertyId) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b, _c, _d, _e, _f, _g, _h;
            if (!mongoose_1.default.isValidObjectId(propertyId))
                return { notes: [] };
            const rows = yield Inspection_1.Inspection.find({ companyId, propertyId }).select('scheduledDate completedAt nextInspectionDate notes status').sort({ scheduledDate: -1 }).limit(10).lean();
            const completed = rows.find((row) => row.completedAt || row.status === 'completed');
            const upcoming = rows.find((row) => row.nextInspectionDate || new Date(row.scheduledDate || 0) > new Date());
            return {
                lastInspectionDate: ((_b = (_a = completed === null || completed === void 0 ? void 0 : completed.completedAt) === null || _a === void 0 ? void 0 : _a.toISOString) === null || _b === void 0 ? void 0 : _b.call(_a)) || ((_d = (_c = completed === null || completed === void 0 ? void 0 : completed.scheduledDate) === null || _c === void 0 ? void 0 : _c.toISOString) === null || _d === void 0 ? void 0 : _d.call(_c)),
                nextInspectionDate: ((_f = (_e = upcoming === null || upcoming === void 0 ? void 0 : upcoming.nextInspectionDate) === null || _e === void 0 ? void 0 : _e.toISOString) === null || _f === void 0 ? void 0 : _f.call(_e)) || ((_h = (_g = upcoming === null || upcoming === void 0 ? void 0 : upcoming.scheduledDate) === null || _g === void 0 ? void 0 : _g.toISOString) === null || _h === void 0 ? void 0 : _h.call(_g)),
                notes: rows.slice(0, 3).map((row) => row.notes).filter(Boolean)
            };
        });
    }
}
class CompanyReportingReadService {
    getCompanyContext(companyId) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            const company = mongoose_1.default.isValidObjectId(companyId)
                ? yield Company_1.Company.findById(companyId).select('name tradingName defaultCurrency workspacePreferences').lean()
                : undefined;
            return {
                name: (company === null || company === void 0 ? void 0 : company.tradingName) || (company === null || company === void 0 ? void 0 : company.name),
                currency: ((_a = company === null || company === void 0 ? void 0 : company.workspacePreferences) === null || _a === void 0 ? void 0 : _a.currency) || (company === null || company === void 0 ? void 0 : company.defaultCurrency) || 'USD'
            };
        });
    }
}
exports.CompanyReportingReadService = CompanyReportingReadService;
const createDefaultReportingReadModels = () => {
    const propertyAccountReadService = new PropertyAccountReportingReadService();
    const emptyReadService = new EmptyReadService();
    return {
        owner: propertyAccountReadService,
        property: propertyAccountReadService,
        ledger: propertyAccountReadService,
        payment: new PaymentReportingReadService(),
        lease: new LeaseReportingReadService(),
        maintenance: new MaintenanceReportingReadService(),
        inspection: new InspectionReportingReadService(),
        trust: emptyReadService
    };
};
exports.createDefaultReportingReadModels = createDefaultReportingReadModels;
