"use strict";
/**
 * Shared helpers for the agent property details report.
 * Keep occupancy/type/paid-up derivation here so the API and future report types reuse it.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.asId = asId;
exports.personName = personName;
exports.classifyPropertyCategory = classifyPropertyCategory;
exports.matchesPropertyTypeFilter = matchesPropertyTypeFilter;
exports.isOccupyingLease = isOccupyingLease;
exports.deriveOccupancyStatus = deriveOccupancyStatus;
exports.pickCurrentLease = pickCurrentLease;
exports.formatLeaseStatus = formatLeaseStatus;
exports.formatLeasePeriod = formatLeasePeriod;
exports.coveredMonthsFromPayment = coveredMonthsFromPayment;
exports.formatPaidUpTo = formatPaidUpTo;
exports.formatPropertyType = formatPropertyType;
exports.recencyTimestamp = recencyTimestamp;
const OCCUPYING_LEASE_STATUSES = new Set(['active', 'expiring_soon']);
const EXCLUDED_LEASE_STATUSES = new Set(['terminated', 'closed', 'draft', 'pending_approval']);
const COMPLETED_PAYMENT_STATUSES = new Set(['completed', 'paid', 'success']);
function asId(value) {
    var _a;
    if (value == null || value === '')
        return '';
    if (typeof value === 'string')
        return value;
    if (typeof value === 'object') {
        const bsonType = value._bsontype;
        const ctorName = (_a = value.constructor) === null || _a === void 0 ? void 0 : _a.name;
        // Mongoose ObjectId defines `_id` as a getter that returns itself. Never recurse into that.
        if (bsonType === 'ObjectId' || bsonType === 'ObjectID' || ctorName === 'ObjectId' || ctorName === 'ObjectID') {
            return String(value);
        }
        const obj = value;
        if (obj.$oid)
            return String(obj.$oid);
        if (obj._id && obj._id !== value)
            return asId(obj._id);
        if (typeof obj.toString === 'function') {
            const text = String(obj.toString());
            if (text && text !== '[object Object]')
                return text;
        }
    }
    return String(value);
}
function personName(entity) {
    if (!entity || typeof entity === 'string')
        return '';
    const full = [entity.firstName, entity.lastName].filter(Boolean).join(' ').trim();
    if (full)
        return full;
    return String(entity.name || entity.fullName || entity.displayName || '').trim();
}
function classifyPropertyCategory(property) {
    const category = String((property === null || property === void 0 ? void 0 : property.propertyCategory) || '').trim();
    if (category === 'Residential' || category === 'Commercial' || category === 'Land' || category === 'Special Use') {
        return category;
    }
    const type = String((property === null || property === void 0 ? void 0 : property.type) || '').toLowerCase();
    if (type === 'commercial')
        return 'Commercial';
    if (type === 'land')
        return 'Land';
    if (type === 'apartment' || type === 'house')
        return 'Residential';
    return '';
}
function matchesPropertyTypeFilter(category, filter) {
    if (filter === 'all')
        return true;
    if (filter === 'residential')
        return category === 'Residential';
    if (filter === 'commercial')
        return category === 'Commercial';
    return true;
}
function leaseHasTenant(lease) {
    return Boolean(asId(lease === null || lease === void 0 ? void 0 : lease.tenantId));
}
function normalizeLeaseStatus(lease, asOf = new Date()) {
    const status = String((lease === null || lease === void 0 ? void 0 : lease.status) || '').toLowerCase();
    if (status !== 'active')
        return status;
    const end = (lease === null || lease === void 0 ? void 0 : lease.endDate) ? new Date(lease.endDate) : null;
    if (!end || Number.isNaN(end.getTime()))
        return status;
    const today = new Date(asOf);
    today.setHours(0, 0, 0, 0);
    if (end < today)
        return 'expired';
    const soon = new Date(today);
    soon.setDate(soon.getDate() + 60);
    return end <= soon ? 'expiring_soon' : status;
}
function isOccupyingLease(lease, asOf = new Date()) {
    const status = String((lease === null || lease === void 0 ? void 0 : lease.status) || '').toLowerCase();
    if (EXCLUDED_LEASE_STATUSES.has(status))
        return false;
    if (!leaseHasTenant(lease))
        return false;
    const lifecycle = normalizeLeaseStatus(lease, asOf);
    return OCCUPYING_LEASE_STATUSES.has(lifecycle);
}
function deriveOccupancyStatus(property, leasesForProperty, tenantsForProperty, asOf = new Date()) {
    const activeTenants = (tenantsForProperty || []).filter((tenant) => String((tenant === null || tenant === void 0 ? void 0 : tenant.status) || 'Active').toLowerCase() !== 'inactive');
    const occupyingLeases = (leasesForProperty || []).filter((lease) => isOccupyingLease(lease, asOf));
    if (occupyingLeases.length || activeTenants.length)
        return 'Rented';
    const operational = String((property === null || property === void 0 ? void 0 : property.propertyOperationalStatus) || '').trim();
    if (operational === 'Occupied' || operational === 'Reserved')
        return 'Rented';
    if (operational === 'Vacant')
        return 'Vacant';
    const status = String((property === null || property === void 0 ? void 0 : property.status) || '').toLowerCase();
    if (status === 'rented')
        return 'Rented';
    return 'Vacant';
}
function pickCurrentLease(leasesForProperty, asOf = new Date()) {
    var _a;
    const ranked = (leasesForProperty || [])
        .map((lease) => ({ lease, lifecycle: normalizeLeaseStatus(lease, asOf) }))
        .filter(({ lease, lifecycle }) => leaseHasTenant(lease) && !EXCLUDED_LEASE_STATUSES.has(String((lease === null || lease === void 0 ? void 0 : lease.status) || '').toLowerCase()));
    const live = ranked.find(({ lifecycle }) => OCCUPYING_LEASE_STATUSES.has(lifecycle));
    if (live)
        return live.lease;
    const expired = ranked
        .filter(({ lifecycle }) => lifecycle === 'expired')
        .sort((a, b) => new Date(b.lease.endDate || 0).getTime() - new Date(a.lease.endDate || 0).getTime());
    return ((_a = expired[0]) === null || _a === void 0 ? void 0 : _a.lease) || null;
}
function formatLeaseStatus(lease, asOf = new Date()) {
    if (!lease)
        return '';
    const status = normalizeLeaseStatus(lease, asOf);
    const labels = {
        draft: 'Draft',
        pending_approval: 'Pending Approval',
        active: 'Active',
        expiring_soon: 'Expiring Soon',
        expired: 'Expired',
        renewed: 'Renewed',
        terminated: 'Terminated',
        pending_settlement: 'Pending Settlement',
        closed: 'Closed',
    };
    return labels[status] || status;
}
function formatLeasePeriod(startDate, endDate) {
    if (!startDate || !endDate)
        return '';
    const start = new Date(startDate);
    const end = new Date(endDate);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start)
        return '';
    const months = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
    const days = end.getDate() - start.getDate();
    const totalMonths = months + (days >= 0 ? 0 : -1);
    if (totalMonths < 1) {
        const dayCount = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000));
        return `${dayCount} day${dayCount === 1 ? '' : 's'}`;
    }
    if (totalMonths % 12 === 0) {
        const years = totalMonths / 12;
        return `${years} year${years === 1 ? '' : 's'}`;
    }
    return `${totalMonths} month${totalMonths === 1 ? '' : 's'}`;
}
function addMonths(year, month, count) {
    const date = new Date(year, month - 1 + count, 1);
    return { year: date.getFullYear(), month: date.getMonth() + 1 };
}
function coveredMonthsFromPayment(payment) {
    const status = String((payment === null || payment === void 0 ? void 0 : payment.status) || '').toLowerCase();
    if (status && !COMPLETED_PAYMENT_STATUSES.has(status))
        return [];
    const type = String((payment === null || payment === void 0 ? void 0 : payment.paymentType) || 'rental').toLowerCase();
    if (type && type !== 'rental')
        return [];
    const advanceStart = payment === null || payment === void 0 ? void 0 : payment.advancePeriodStart;
    const advanceEnd = payment === null || payment === void 0 ? void 0 : payment.advancePeriodEnd;
    const startMonth = Number((advanceStart === null || advanceStart === void 0 ? void 0 : advanceStart.month) || (payment === null || payment === void 0 ? void 0 : payment.rentalPeriodMonth) || 0);
    const startYear = Number((advanceStart === null || advanceStart === void 0 ? void 0 : advanceStart.year) || (payment === null || payment === void 0 ? void 0 : payment.rentalPeriodYear) || 0);
    const months = [];
    if (startMonth >= 1 && startMonth <= 12 && startYear >= 1900) {
        if ((advanceEnd === null || advanceEnd === void 0 ? void 0 : advanceEnd.month) && (advanceEnd === null || advanceEnd === void 0 ? void 0 : advanceEnd.year)) {
            let cursor = { year: startYear, month: startMonth };
            const end = { year: Number(advanceEnd.year), month: Number(advanceEnd.month) };
            while (cursor.year < end.year || (cursor.year === end.year && cursor.month <= end.month)) {
                months.push(cursor);
                cursor = addMonths(cursor.year, cursor.month, 1);
            }
            return months;
        }
        const count = Math.max(1, Number((payment === null || payment === void 0 ? void 0 : payment.advanceMonthsPaid) || 1));
        for (let i = 0; i < count; i += 1) {
            months.push(addMonths(startYear, startMonth, i));
        }
        return months;
    }
    return [];
}
function formatPaidUpTo(payments) {
    let latest = null;
    for (const payment of payments || []) {
        for (const month of coveredMonthsFromPayment(payment)) {
            if (!latest || month.year > latest.year || (month.year === latest.year && month.month > latest.month)) {
                latest = month;
            }
        }
    }
    if (!latest)
        return '';
    return new Date(latest.year, latest.month - 1, 1).toLocaleString('en-GB', { month: 'long', year: 'numeric' });
}
function formatPropertyType(property) {
    const subtype = String((property === null || property === void 0 ? void 0 : property.propertySubtype) || '').trim();
    if (subtype)
        return subtype;
    const type = String((property === null || property === void 0 ? void 0 : property.type) || '').trim();
    if (!type)
        return '';
    return type.charAt(0).toUpperCase() + type.slice(1);
}
function recencyTimestamp(record) {
    const updated = record.updatedAt ? new Date(record.updatedAt).getTime() : 0;
    const created = record.createdAt ? new Date(record.createdAt).getTime() : 0;
    const value = Math.max(updated || 0, created || 0);
    return Number.isFinite(value) ? value : 0;
}
