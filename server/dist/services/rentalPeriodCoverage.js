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
exports.RENTAL_GUARD_DEFAULTS = exports.RENTAL_PERIOD_GUARD_SCOPE = void 0;
exports.isPendingCorrectionDraft = isPendingCorrectionDraft;
exports.countsTowardRentReceipt = countsTowardRentReceipt;
exports.storedRentPortion = storedRentPortion;
exports.paymentCoversRentalMonth = paymentCoversRentalMonth;
exports.reservesRentalPeriod = reservesRentalPeriod;
exports.coverageForMonth = coverageForMonth;
exports.reservationForMonth = reservationForMonth;
exports.sumCoverageForMonth = sumCoverageForMonth;
exports.sumRentCoverageForPeriod = sumRentCoverageForPeriod;
exports.sumRentalPeriodReservation = sumRentalPeriodReservation;
exports.coverageByRentalKeys = coverageByRentalKeys;
exports.enumerateRentalMonths = enumerateRentalMonths;
exports.rentalMonthLockKey = rentalMonthLockKey;
exports.rentalPeriodGuardKeys = rentalPeriodGuardKeys;
exports.rentalPeriodGuardKey = rentalPeriodGuardKey;
exports.findCoveredAdvanceMonth = findCoveredAdvanceMonth;
exports.acquireRentalPeriodGuards = acquireRentalPeriodGuards;
exports.acquireRentalPeriodGuard = acquireRentalPeriodGuard;
exports.acquireRentalPeriodGuardsForPayment = acquireRentalPeriodGuardsForPayment;
exports.withRentalPeriodGuard = withRentalPeriodGuard;
exports.withRentalPeriodGuards = withRentalPeriodGuards;
/**
 * Effective rent already received for a rental period.
 * A reversed original is not an active receipt. A negative REV is not a new receipt.
 * A pending correction draft is not completed rent. An in-progress or incomplete
 * reversal still occupies the period.
 */
const crypto_1 = require("crypto");
const mongoose_1 = __importDefault(require("mongoose"));
const Payment_1 = require("../models/Payment");
const EventDedupRecord_1 = require("../models/EventDedupRecord");
const errorHandler_1 = require("../middleware/errorHandler");
const ACTIVE_STATUSES = new Set(['pending', 'completed', 'paid', 'success']);
exports.RENTAL_PERIOD_GUARD_SCOPE = 'rental-period-guard';
/**
 * The lease is renewed while the holder is alive. A crashed process stops renewing,
 * and another request may take the lock only after this expiry.
 * Sixty seconds is longer than the previous 30-second absolute takeover.
 */
exports.RENTAL_GUARD_DEFAULTS = {
    leaseMs: 60000,
    heartbeatMs: 15000,
    waitMs: 8000,
};
function monthIndex(year, month) {
    const y = Number(year);
    const m = Number(month);
    if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12)
        return null;
    return y * 12 + m;
}
function isPendingCorrectionDraft(payment) {
    if (!payment)
        return false;
    const status = String(payment.status || '').toLowerCase();
    if (status === 'completed' || status === 'paid' || status === 'success')
        return false;
    const ref = String(payment.referenceNumber || '');
    const looksLikeCorrection = payment.isCorrectionEntry === true || ref.startsWith('CORR-');
    if (!looksLikeCorrection)
        return false;
    return status === 'pending' || String(payment.postingStatus || '').toLowerCase() === 'draft';
}
function countsTowardRentReceipt(payment, options = {}) {
    if (!payment)
        return false;
    const status = String(payment.status || '').toLowerCase();
    if (!ACTIVE_STATUSES.has(status))
        return false;
    if (payment.reversalOfPaymentId)
        return false;
    if (Number(payment.amount || 0) < 0)
        return false;
    if (String(payment.reversalState || '') === 'reversed')
        return false;
    if (isPendingCorrectionDraft(payment))
        return false;
    const amount = Number(payment.amount || 0);
    const deposit = Number(payment.depositAmount || 0);
    if (amount <= 0 && deposit > 0)
        return false;
    if (options.leaseId && payment.leaseId && String(options.leaseId) !== String(payment.leaseId))
        return false;
    if (options.currency && payment.currency && String(options.currency).toUpperCase() !== String(payment.currency).toUpperCase()) {
        return false;
    }
    return true;
}
/** Stored rent allocation when present, including an explicit zero. Otherwise the payment amount. */
function storedRentPortion(payment) {
    if (!payment)
        return 0;
    if (payment.rentAllocated != null && payment.rentAllocated !== '') {
        const allocated = Number(payment.rentAllocated);
        return Number.isFinite(allocated) ? allocated : 0;
    }
    const amount = Number(payment.amount || 0);
    return Number.isFinite(amount) ? amount : 0;
}
function paymentCoversRentalMonth(payment, year, month) {
    var _a, _b, _c, _d;
    if (!payment)
        return false;
    const target = monthIndex(year, month);
    if (target == null)
        return false;
    const own = monthIndex(payment.rentalPeriodYear, payment.rentalPeriodMonth);
    if (own != null && own === target)
        return true;
    const months = Number(payment.advanceMonthsPaid || 1);
    if (months <= 1)
        return false;
    const start = monthIndex((_a = payment.advancePeriodStart) === null || _a === void 0 ? void 0 : _a.year, (_b = payment.advancePeriodStart) === null || _b === void 0 ? void 0 : _b.month);
    const end = monthIndex((_c = payment.advancePeriodEnd) === null || _c === void 0 ? void 0 : _c.year, (_d = payment.advancePeriodEnd) === null || _d === void 0 ? void 0 : _d.month);
    if (start == null || end == null)
        return false;
    return target >= Math.min(start, end) && target <= Math.max(start, end);
}
/**
 * Rent this payment contributes to one rental month.
 * Advance payments contribute the monthly rent, not the whole multi-month total, to each covered month.
 */
/**
 * A pending linked correction reserves the rental period so another receipt
 * cannot compete with it. It does not count as rent received.
 * A voided or failed correction releases that reservation.
 */
function reservesRentalPeriod(payment, options = {}) {
    if (countsTowardRentReceipt(payment, options))
        return true;
    if (!isPendingCorrectionDraft(payment) || !payment)
        return false;
    if (payment.reversalOfPaymentId)
        return false;
    if (Number(payment.amount || 0) < 0)
        return false;
    const amount = Number(payment.amount || 0);
    const deposit = Number(payment.depositAmount || 0);
    if (amount <= 0 && deposit > 0)
        return false;
    if (options.leaseId && payment.leaseId && String(options.leaseId) !== String(payment.leaseId))
        return false;
    if (options.currency && payment.currency && String(options.currency).toUpperCase() !== String(payment.currency).toUpperCase()) {
        return false;
    }
    return true;
}
function monthContribution(payment, year, month) {
    if (!paymentCoversRentalMonth(payment, year, month))
        return 0;
    const months = Number((payment === null || payment === void 0 ? void 0 : payment.advanceMonthsPaid) || 1);
    if (months > 1) {
        const monthly = Number((payment === null || payment === void 0 ? void 0 : payment.rentUsed) || 0);
        if (monthly > 0)
            return monthly;
        const portion = storedRentPortion(payment);
        return portion > 0 ? portion / months : 0;
    }
    const portion = storedRentPortion(payment);
    return portion > 0 ? portion : 0;
}
function coverageForMonth(payment, year, month, options = {}) {
    if (!countsTowardRentReceipt(payment, options) || !payment)
        return 0;
    return monthContribution(payment, year, month);
}
/** Rent held against a new receipt: received coverage plus a pending correction reservation. */
function reservationForMonth(payment, year, month, options = {}) {
    if (!reservesRentalPeriod(payment, options) || !payment)
        return 0;
    return monthContribution(payment, year, month);
}
function sumCoverageForMonth(payments, year, month, options = {}) {
    return payments.reduce((sum, payment) => sum + coverageForMonth(payment, year, month, options), 0);
}
const COVERAGE_SELECT = [
    'amount', 'depositAmount', 'rentAllocated', 'rentUsed', 'status', 'postingStatus',
    'reversalState', 'reversalPaymentId', 'reversalOfPaymentId', 'isCorrectionEntry',
    'referenceNumber', 'rentalPeriodMonth', 'rentalPeriodYear', 'advanceMonthsPaid',
    'advancePeriodStart', 'advancePeriodEnd', 'leaseId', 'currency', 'propertyId', 'tenantId', 'paymentType'
].join(' ');
function objectIdOrRaw(value) {
    const text = String(value || '');
    return mongoose_1.default.Types.ObjectId.isValid(text) ? new mongoose_1.default.Types.ObjectId(text) : value;
}
function loadPeriodPayments(params) {
    return __awaiter(this, void 0, void 0, function* () {
        const year = Number(params.rentalPeriodYear);
        const month = Number(params.rentalPeriodMonth);
        const payments = yield Payment_1.Payment.find({
            companyId: objectIdOrRaw(params.companyId),
            propertyId: objectIdOrRaw(params.propertyId),
            tenantId: objectIdOrRaw(params.tenantId),
            paymentType: 'rental',
            status: { $in: ['pending', 'completed', 'paid', 'success'] },
            $or: [
                { rentalPeriodYear: year, rentalPeriodMonth: month },
                {
                    advanceMonthsPaid: { $gt: 1 },
                    'advancePeriodStart.year': { $lte: year },
                    'advancePeriodEnd.year': { $gte: year }
                }
            ]
        }).select(COVERAGE_SELECT).lean();
        return payments;
    });
}
function sumRentCoverageForPeriod(params) {
    return __awaiter(this, void 0, void 0, function* () {
        const payments = yield loadPeriodPayments(params);
        return sumCoverageForMonth(payments, Number(params.rentalPeriodYear), Number(params.rentalPeriodMonth), {
            leaseId: params.leaseId,
            currency: params.currency
        });
    });
}
function sumRentalPeriodReservation(params) {
    return __awaiter(this, void 0, void 0, function* () {
        const year = Number(params.rentalPeriodYear);
        const month = Number(params.rentalPeriodMonth);
        const payments = yield loadPeriodPayments(params);
        return payments.reduce((sum, payment) => sum + reservationForMonth(payment, year, month, {
            leaseId: params.leaseId,
            currency: params.currency
        }), 0);
    });
}
function coverageByRentalKeys(companyId, keys) {
    return __awaiter(this, void 0, void 0, function* () {
        const totals = {};
        if (!keys.length)
            return totals;
        const or = keys.map((key) => ({
            propertyId: objectIdOrRaw(key.propertyId),
            tenantId: objectIdOrRaw(key.tenantId),
            $or: [
                { rentalPeriodYear: Number(key.year), rentalPeriodMonth: Number(key.month) },
                {
                    advanceMonthsPaid: { $gt: 1 },
                    'advancePeriodStart.year': { $lte: Number(key.year) },
                    'advancePeriodEnd.year': { $gte: Number(key.year) }
                }
            ]
        }));
        const payments = yield Payment_1.Payment.find({
            companyId: objectIdOrRaw(companyId),
            paymentType: 'rental',
            status: { $in: ['pending', 'completed', 'paid', 'success'] },
            $or: or
        }).select(COVERAGE_SELECT).lean();
        for (const key of keys) {
            const id = `${String(key.propertyId)}:${String(key.tenantId)}:${Number(key.year)}:${Number(key.month)}`;
            const rows = payments.filter((payment) => String(payment.propertyId) === String(key.propertyId) &&
                String(payment.tenantId) === String(key.tenantId));
            totals[id] = sumCoverageForMonth(rows, Number(key.year), Number(key.month));
        }
        return totals;
    });
}
function fromMonthIndex(index) {
    const month = ((index - 1) % 12) + 1;
    const year = Math.floor((index - 1) / 12);
    return { year, month };
}
/**
 * Months a payment occupies. A missing lease or currency does not change the list.
 * An advance range is the inclusive start through end. The month count must match that span.
 */
function enumerateRentalMonths(input) {
    var _a, _b, _c, _d, _e, _f, _g, _h;
    const count = Number((_a = input.advanceMonthsPaid) !== null && _a !== void 0 ? _a : 1);
    if (!Number.isInteger(count) || count < 1 || count > 36) {
        return { error: 'The rental period range cannot be locked safely.' };
    }
    const startYear = Number((_c = (_b = input.advancePeriodStart) === null || _b === void 0 ? void 0 : _b.year) !== null && _c !== void 0 ? _c : input.rentalPeriodYear);
    const startMonth = Number((_e = (_d = input.advancePeriodStart) === null || _d === void 0 ? void 0 : _d.month) !== null && _e !== void 0 ? _e : input.rentalPeriodMonth);
    const start = monthIndex(startYear, startMonth);
    if (start == null) {
        return { error: 'Rental period month and year are required before this payment can be saved.' };
    }
    let end = start;
    const endWasSupplied = input.advancePeriodEnd != null
        && (input.advancePeriodEnd.year != null || input.advancePeriodEnd.month != null);
    if (endWasSupplied) {
        end = (_h = monthIndex(Number((_f = input.advancePeriodEnd) === null || _f === void 0 ? void 0 : _f.year), Number((_g = input.advancePeriodEnd) === null || _g === void 0 ? void 0 : _g.month))) !== null && _h !== void 0 ? _h : NaN;
        if (!Number.isFinite(end))
            return { error: 'The advance end period is not a valid month.' };
    }
    else if (count > 1) {
        end = start + count - 1;
    }
    if (end < start)
        return { error: 'The advance period ends before it starts.' };
    const span = end - start + 1;
    if (span !== count) {
        return { error: 'The advance period does not match the number of months being paid.' };
    }
    const months = [];
    for (let index = start; index <= end; index += 1)
        months.push(fromMonthIndex(index));
    return { months };
}
/**
 * Lock identity is company, property, tenant, and rental month.
 * Lease and currency stay out of the key so a request that omits either one
 * still shares the lock with a request that includes it.
 * Two known currencies, or two known leases, are not treated as the same receipt.
 * They share this lock and then the coverage query applies the known difference.
 */
function rentalMonthLockKey(companyId, propertyId, tenantId, year, month) {
    return `${companyId}:${propertyId}:${tenantId}:${year}:${String(month).padStart(2, '0')}`;
}
function skipsRentalLock(input) {
    var _a;
    const paymentType = String(input.paymentType || 'rental').toLowerCase();
    if (paymentType === 'sale')
        return true;
    const amount = Number((_a = input.amount) !== null && _a !== void 0 ? _a : NaN);
    const deposit = Number(input.depositAmount || 0);
    if (Number.isFinite(amount) && amount <= 0 && deposit > 0)
        return true;
    const propertyId = String(input.propertyId || '');
    const tenantId = String(input.tenantId || '');
    if (propertyId.startsWith('manual_') || tenantId.startsWith('manual_'))
        return true;
    return false;
}
function rentalPeriodGuardKeys(input) {
    if (skipsRentalLock(input))
        return { keys: [] };
    const listed = enumerateRentalMonths(input);
    if ('error' in listed)
        return listed;
    const companyId = String(input.companyId || '');
    const propertyId = String(input.propertyId || '');
    const tenantId = String(input.tenantId || '');
    if (!companyId || !propertyId || !tenantId) {
        return { error: 'Company, property, and tenant are required before this rental payment can be saved.' };
    }
    return {
        keys: listed.months.map((slot) => rentalMonthLockKey(companyId, propertyId, tenantId, slot.year, slot.month)),
    };
}
/** First month key, or null when this payment does not take a rental lock. */
function rentalPeriodGuardKey(input) {
    const listed = rentalPeriodGuardKeys(input);
    if ('error' in listed || listed.keys.length === 0)
        return null;
    return listed.keys[0];
}
function findCoveredAdvanceMonth(params) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!(Number(params.advanceMonthsPaid || 1) > 1))
            return { covered: null };
        const listed = enumerateRentalMonths(params);
        if ('error' in listed)
            return listed;
        for (const slot of listed.months) {
            const paid = yield sumRentalPeriodReservation({
                companyId: params.companyId,
                propertyId: params.propertyId,
                tenantId: params.tenantId,
                rentalPeriodYear: slot.year,
                rentalPeriodMonth: slot.month,
                leaseId: params.leaseId,
                currency: params.currency,
            });
            if (paid > 0.009)
                return { covered: { year: slot.year, month: slot.month, paid } };
        }
        return { covered: null };
    });
}
function sleep(ms) {
    return __awaiter(this, void 0, void 0, function* () {
        yield new Promise((resolve) => setTimeout(resolve, ms));
    });
}
function resolveTiming(timing) {
    var _a, _b, _c;
    return {
        leaseMs: (_a = timing === null || timing === void 0 ? void 0 : timing.leaseMs) !== null && _a !== void 0 ? _a : exports.RENTAL_GUARD_DEFAULTS.leaseMs,
        heartbeatMs: (_b = timing === null || timing === void 0 ? void 0 : timing.heartbeatMs) !== null && _b !== void 0 ? _b : exports.RENTAL_GUARD_DEFAULTS.heartbeatMs,
        waitMs: (_c = timing === null || timing === void 0 ? void 0 : timing.waitMs) !== null && _c !== void 0 ? _c : exports.RENTAL_GUARD_DEFAULTS.waitMs,
    };
}
function isDuplicateKey(error) {
    return Number(error === null || error === void 0 ? void 0 : error.code) === 11000;
}
function isTransientLockError(error) {
    const code = Number(error === null || error === void 0 ? void 0 : error.code);
    return code === 16500 || code === 429;
}
function leaseExpiry(leaseMs) {
    return new Date(Date.now() + leaseMs);
}
/**
 * Single-document ownership. Release deletes only the caller's token.
 * A stale generation is replaced by findOneAndUpdate filtered on that token and an expired lease.
 * MongoDB applies that update to one document atomically. Cosmos DB behaviour is unverified.
 */
function beginOwnedLease(key, token, timing) {
    var _a;
    let stopped = false;
    let timer;
    const renew = () => __awaiter(this, void 0, void 0, function* () {
        if (stopped)
            return;
        const updated = yield EventDedupRecord_1.EventDedupRecord.updateOne({ scope: exports.RENTAL_PERIOD_GUARD_SCOPE, eventId: key, ownerToken: token }, { $set: { processedAt: leaseExpiry(timing.leaseMs) } });
        if (updated.matchedCount === 0)
            stopped = true;
    });
    if (timing.heartbeatMs > 0) {
        timer = setInterval(() => {
            void renew().catch(() => undefined);
        }, timing.heartbeatMs);
        (_a = timer.unref) === null || _a === void 0 ? void 0 : _a.call(timer);
    }
    return () => __awaiter(this, void 0, void 0, function* () {
        stopped = true;
        if (timer)
            clearInterval(timer);
        yield EventDedupRecord_1.EventDedupRecord.deleteOne({
            scope: exports.RENTAL_PERIOD_GUARD_SCOPE,
            eventId: key,
            ownerToken: token,
        });
    });
}
function acquireOneKey(key, timing, deadline) {
    return __awaiter(this, void 0, void 0, function* () {
        const token = (0, crypto_1.randomBytes)(16).toString('hex');
        while (Date.now() < deadline) {
            try {
                yield EventDedupRecord_1.EventDedupRecord.create({
                    scope: exports.RENTAL_PERIOD_GUARD_SCOPE,
                    eventId: key,
                    status: 'processed',
                    processedAt: leaseExpiry(timing.leaseMs),
                    ownerToken: token,
                });
                return beginOwnedLease(key, token, timing);
            }
            catch (error) {
                if (isTransientLockError(error)) {
                    yield sleep(40);
                    continue;
                }
                if (!isDuplicateKey(error))
                    throw error;
                const existing = yield EventDedupRecord_1.EventDedupRecord.findOne({
                    scope: exports.RENTAL_PERIOD_GUARD_SCOPE,
                    eventId: key,
                }).select('ownerToken processedAt').lean();
                if (!existing)
                    continue;
                const expiresAt = new Date(existing.processedAt || 0).getTime();
                if (expiresAt > Date.now()) {
                    yield sleep(40);
                    continue;
                }
                const observedToken = String(existing.ownerToken || '');
                if (observedToken) {
                    const stolen = yield EventDedupRecord_1.EventDedupRecord.findOneAndUpdate({
                        scope: exports.RENTAL_PERIOD_GUARD_SCOPE,
                        eventId: key,
                        ownerToken: observedToken,
                        processedAt: { $lte: new Date() },
                    }, {
                        $set: {
                            ownerToken: token,
                            processedAt: leaseExpiry(timing.leaseMs),
                            status: 'processed',
                        },
                    }, { new: true }).lean();
                    if (stolen && String(stolen.ownerToken) === token) {
                        return beginOwnedLease(key, token, timing);
                    }
                }
                else {
                    const removed = yield EventDedupRecord_1.EventDedupRecord.deleteOne({
                        scope: exports.RENTAL_PERIOD_GUARD_SCOPE,
                        eventId: key,
                        processedAt: existing.processedAt,
                        $or: [{ ownerToken: { $exists: false } }, { ownerToken: null }, { ownerToken: '' }],
                    });
                    if (removed.deletedCount === 1)
                        continue;
                }
                yield sleep(40);
            }
        }
        throw new errorHandler_1.AppError('This rental period is being updated. Retry the payment.', 409, 'RENTAL_PERIOD_BUSY');
    });
}
function acquireRentalPeriodGuards(keys, timing) {
    return __awaiter(this, void 0, void 0, function* () {
        const resolved = resolveTiming(timing);
        const ordered = [...new Set(keys.filter(Boolean))].sort();
        const releases = [];
        const releaseAll = () => __awaiter(this, void 0, void 0, function* () {
            for (let index = releases.length - 1; index >= 0; index -= 1) {
                yield releases[index]();
            }
            releases.length = 0;
        });
        const deadline = Date.now() + resolved.waitMs;
        try {
            for (const key of ordered) {
                releases.push(yield acquireOneKey(key, resolved, deadline));
            }
        }
        catch (error) {
            yield releaseAll();
            throw error;
        }
        return releaseAll;
    });
}
function acquireRentalPeriodGuard(key, timing) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!key)
            return () => __awaiter(this, void 0, void 0, function* () { });
        return acquireRentalPeriodGuards([key], timing);
    });
}
function acquireRentalPeriodGuardsForPayment(input, timing) {
    return __awaiter(this, void 0, void 0, function* () {
        const listed = rentalPeriodGuardKeys(input);
        if ('error' in listed) {
            throw new errorHandler_1.AppError(listed.error, 400, 'RENTAL_PERIOD_REQUIRED');
        }
        return acquireRentalPeriodGuards(listed.keys, timing);
    });
}
function withRentalPeriodGuard(key, work, timing) {
    return __awaiter(this, void 0, void 0, function* () {
        const release = yield acquireRentalPeriodGuard(key, timing);
        try {
            return yield work();
        }
        finally {
            yield release();
        }
    });
}
function withRentalPeriodGuards(keys, work, timing) {
    return __awaiter(this, void 0, void 0, function* () {
        const release = yield acquireRentalPeriodGuards(keys, timing);
        try {
            return yield work();
        }
        finally {
            yield release();
        }
    });
}
