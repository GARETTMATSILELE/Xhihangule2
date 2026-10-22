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
/**
 * Rental-period lock ownership, stable keys, and controller concurrency.
 * Disposable local MongoDB only. Email uses an in-memory sender.
 */
const mongoose_1 = __importDefault(require("mongoose"));
const Company_1 = require("../models/Company");
const User_1 = require("../models/User");
const Property_1 = require("../models/Property");
const Tenant_1 = require("../models/Tenant");
const Lease_1 = require("../models/Lease");
const Payment_1 = require("../models/Payment");
const PropertyOwner_1 = require("../models/PropertyOwner");
const OwnerRentNotice_1 = require("../models/OwnerRentNotice");
const EventDedupRecord_1 = require("../models/EventDedupRecord");
const JournalEntry_1 = require("../models/JournalEntry");
const database_1 = require("../config/database");
const paymentController_1 = require("../controllers/paymentController");
const agentController_1 = require("../controllers/agentController");
const errorHandler_1 = require("../middleware/errorHandler");
const rentalPeriodCoverage_1 = require("../services/rentalPeriodCoverage");
const ownerRentNotificationService_1 = require("../services/ownerRentNotificationService");
const DB = process.env.RENTAL_LOCK_DB || 'mongodb://127.0.0.1:27017/mantis_rental_lock_test';
const ACCOUNTING_DB = process.env.RENTAL_LOCK_ACCOUNTING_DB || 'mongodb://127.0.0.1:27017/mantis_rental_lock_accounting';
const failures = [];
function assert(condition, message) {
    if (!condition)
        failures.push(message);
}
function stage(message) {
    console.error(`[lock] ${message}`);
}
function assertDisposable(uri) {
    const parsed = new URL(uri);
    const host = parsed.hostname.toLowerCase();
    const name = parsed.pathname.replace(/^\//, '').toLowerCase();
    if (host !== '127.0.0.1' && host !== 'localhost')
        throw new Error(`Refusing lock tests: host is not local (${host})`);
    if (!name || /prod|cosmos|azure|live/.test(name))
        throw new Error('Refusing lock tests: database name is not disposable');
}
function blankEmailProviders() {
    for (const key of [
        'SMTP_HOST', 'SMTP_HOST_MANTIS', 'SMTP_USER', 'SMTP_USER_MANTIS', 'SMTP_PASS', 'SMTP_PASS_MANTIS',
        'RESEND_API_KEY', 'RESEND_API_KEY_MANTIS', 'SENDGRID_API_KEY', 'SENDGRID_API_KEY_MANTIS',
        'MAILGUN_API_KEY', 'MAILGUN_API_KEY_MANTIS', 'MAILGUN_DOMAIN', 'MAILGUN_DOMAIN_MANTIS',
        'MAILTRAP_API_TOKEN', 'MAILTRAP_API_TOKEN_MANTIS', 'EMAIL_STRICT', 'EMAIL_REQUIRE_PROVIDER',
    ])
        delete process.env[key];
}
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
function invoke(handler, req) {
    return __awaiter(this, void 0, void 0, function* () {
        const res = {
            statusCode: 200,
            body: undefined,
            status(code) { this.statusCode = code; return this; },
            json(body) { this.body = body; return this; },
        };
        yield handler(req, res);
        return res;
    });
}
function runPureKeys() {
    assert(rentalPeriodCoverage_1.RENTAL_GUARD_DEFAULTS.leaseMs > 30000, 'lease outlives the old 30 second takeover');
    assert(rentalPeriodCoverage_1.RENTAL_GUARD_DEFAULTS.heartbeatMs * 3 < rentalPeriodCoverage_1.RENTAL_GUARD_DEFAULTS.leaseMs, 'an active holder survives missed heartbeats inside the lease');
    const base = {
        companyId: 'c1',
        propertyId: 'p1',
        tenantId: 't1',
        rentalPeriodYear: 2031,
        rentalPeriodMonth: 5,
        paymentType: 'rental',
        amount: 1800,
    };
    const withLease = (0, rentalPeriodCoverage_1.rentalPeriodGuardKeys)(Object.assign(Object.assign({}, base), { leaseId: 'lease-a', currency: 'USD' }));
    const omitted = (0, rentalPeriodCoverage_1.rentalPeriodGuardKeys)(base);
    const otherCurrency = (0, rentalPeriodCoverage_1.rentalPeriodGuardKeys)(Object.assign(Object.assign({}, base), { currency: 'ZWL', leaseId: 'lease-b' }));
    assert(!('error' in withLease) && !('error' in omitted) && !('error' in otherCurrency), 'known and omitted lease or currency still produce a key');
    if (!('error' in withLease) && !('error' in omitted) && !('error' in otherCurrency)) {
        assert(withLease.keys.length === 1 && withLease.keys[0] === omitted.keys[0], 'omitted lease and currency share the month lock');
        assert(withLease.keys[0] === otherCurrency.keys[0], 'a known different currency uses the same month lock and is not given a second key');
        assert(!withLease.keys[0].includes('lease-a') && !withLease.keys[0].includes('USD'), 'the lock key does not embed lease or currency');
    }
    const otherProperty = (0, rentalPeriodCoverage_1.rentalPeriodGuardKeys)(Object.assign(Object.assign({}, base), { propertyId: 'p2' }));
    if (!('error' in withLease) && !('error' in otherProperty)) {
        assert(withLease.keys[0] !== otherProperty.keys[0], 'a different property has its own lock');
    }
    const advance = (0, rentalPeriodCoverage_1.enumerateRentalMonths)({
        rentalPeriodYear: 2032,
        rentalPeriodMonth: 5,
        advanceMonthsPaid: 2,
        advancePeriodStart: { month: 5, year: 2032 },
        advancePeriodEnd: { month: 6, year: 2032 },
    });
    const overlap = (0, rentalPeriodCoverage_1.enumerateRentalMonths)({
        rentalPeriodYear: 2032,
        rentalPeriodMonth: 6,
        advanceMonthsPaid: 2,
        advancePeriodStart: { month: 6, year: 2032 },
        advancePeriodEnd: { month: 7, year: 2032 },
    });
    assert(!('error' in advance) && !('error' in overlap), 'advance ranges enumerate');
    if (!('error' in advance) && !('error' in overlap)) {
        const left = (0, rentalPeriodCoverage_1.rentalPeriodGuardKeys)(Object.assign(Object.assign({}, base), { rentalPeriodYear: 2032, rentalPeriodMonth: 5, advanceMonthsPaid: 2, advancePeriodStart: { month: 5, year: 2032 }, advancePeriodEnd: { month: 6, year: 2032 } }));
        const right = (0, rentalPeriodCoverage_1.rentalPeriodGuardKeys)(Object.assign(Object.assign({}, base), { rentalPeriodYear: 2032, rentalPeriodMonth: 6, advanceMonthsPaid: 2, advancePeriodStart: { month: 6, year: 2032 }, advancePeriodEnd: { month: 7, year: 2032 } }));
        if (!('error' in left) && !('error' in right)) {
            assert(left.keys.length === 2 && right.keys.length === 2, 'each advance locks every month in its range');
            assert(left.keys[0] < left.keys[1], 'months are acquired in sorted order');
            assert(left.keys.some((key) => right.keys.includes(key)), 'overlapping advances share a month lock');
        }
    }
    const sale = (0, rentalPeriodCoverage_1.rentalPeriodGuardKeys)(Object.assign(Object.assign({}, base), { paymentType: 'sale' }));
    const deposit = (0, rentalPeriodCoverage_1.rentalPeriodGuardKeys)(Object.assign(Object.assign({}, base), { amount: 0, depositAmount: 500 }));
    assert(!('error' in sale) && sale.keys.length === 0, 'a sale does not take a rental lock');
    assert(!('error' in deposit) && deposit.keys.length === 0, 'a deposit-only payment does not take a rental lock');
    const missing = (0, rentalPeriodCoverage_1.rentalPeriodGuardKeys)(Object.assign(Object.assign({}, base), { rentalPeriodMonth: undefined, rentalPeriodYear: undefined }));
    assert('error' in missing, 'a rental payment without a period is rejected instead of left unlocked');
}
function ownerToken(key) {
    return __awaiter(this, void 0, void 0, function* () {
        const row = yield EventDedupRecord_1.EventDedupRecord.findOne({ scope: rentalPeriodCoverage_1.RENTAL_PERIOD_GUARD_SCOPE, eventId: key }).select('ownerToken').lean();
        return String((row === null || row === void 0 ? void 0 : row.ownerToken) || '');
    });
}
function runLockOwnership() {
    return __awaiter(this, void 0, void 0, function* () {
        const key = 'lock-ownership:month';
        const held = yield (0, rentalPeriodCoverage_1.acquireRentalPeriodGuard)(key, { leaseMs: 60000, heartbeatMs: 0, waitMs: 500 });
        const firstToken = yield ownerToken(key);
        let busy = false;
        try {
            yield (0, rentalPeriodCoverage_1.acquireRentalPeriodGuard)(key, { leaseMs: 60000, heartbeatMs: 0, waitMs: 120 });
        }
        catch (error) {
            busy = error instanceof errorHandler_1.AppError && error.code === 'RENTAL_PERIOD_BUSY';
        }
        assert(busy, 'a live lock returns RENTAL_PERIOD_BUSY');
        assert((yield ownerToken(key)) === firstToken, 'a rejected acquire does not replace the owner');
        yield held();
        assert((yield ownerToken(key)) === '', 'the owner release removes only its lock');
        const expiring = yield (0, rentalPeriodCoverage_1.acquireRentalPeriodGuard)(key, { leaseMs: 50, heartbeatMs: 0, waitMs: 500 });
        const expiredToken = yield ownerToken(key);
        yield EventDedupRecord_1.EventDedupRecord.updateOne({ scope: rentalPeriodCoverage_1.RENTAL_PERIOD_GUARD_SCOPE, eventId: key, ownerToken: expiredToken }, { $set: { processedAt: new Date(Date.now() - 1000) } });
        const recovered = yield (0, rentalPeriodCoverage_1.acquireRentalPeriodGuard)(key, { leaseMs: 60000, heartbeatMs: 0, waitMs: 1000 });
        const recoveredToken = yield ownerToken(key);
        assert(recoveredToken !== '' && recoveredToken !== expiredToken, 'an expired lock can be recovered by a new owner');
        yield expiring();
        assert((yield ownerToken(key)) === recoveredToken, 'the previous owner cannot delete the new owner lock');
        yield recovered();
        assert((yield ownerToken(key)) === '', 'the current owner can release after the stale release');
        const active = yield (0, rentalPeriodCoverage_1.acquireRentalPeriodGuard)(key, { leaseMs: 80, heartbeatMs: 25, waitMs: 500 });
        const activeToken = yield ownerToken(key);
        yield sleep(190);
        let displaced = false;
        try {
            const intruder = yield (0, rentalPeriodCoverage_1.acquireRentalPeriodGuard)(key, { leaseMs: 60000, heartbeatMs: 0, waitMs: 100 });
            displaced = true;
            yield intruder();
        }
        catch (error) {
            displaced = !(error instanceof errorHandler_1.AppError && error.code === 'RENTAL_PERIOD_BUSY');
        }
        assert(!displaced && (yield ownerToken(key)) === activeToken, 'heartbeat keeps an active holder past the lease, including past the old 30 second window');
        yield active();
        yield EventDedupRecord_1.EventDedupRecord.create({
            scope: rentalPeriodCoverage_1.RENTAL_PERIOD_GUARD_SCOPE,
            eventId: `${key}:legacy`,
            status: 'processed',
            processedAt: new Date(Date.now() - 1000),
        });
        const legacyRelease = yield (0, rentalPeriodCoverage_1.acquireRentalPeriodGuard)(`${key}:legacy`, { leaseMs: 60000, heartbeatMs: 0, waitMs: 1000 });
        assert((yield ownerToken(`${key}:legacy`)) !== '', 'a crashed legacy row without a token can be recovered');
        yield legacyRelease();
        const june = `${key}:june`;
        const juneHold = yield (0, rentalPeriodCoverage_1.acquireRentalPeriodGuard)(june, { leaseMs: 60000, heartbeatMs: 0, waitMs: 500 });
        let partial = false;
        try {
            yield (0, rentalPeriodCoverage_1.acquireRentalPeriodGuards)([`${key}:may`, june], { leaseMs: 60000, heartbeatMs: 0, waitMs: 150 });
        }
        catch (error) {
            partial = error instanceof errorHandler_1.AppError && error.code === 'RENTAL_PERIOD_BUSY';
        }
        const mayLeft = yield EventDedupRecord_1.EventDedupRecord.countDocuments({ scope: rentalPeriodCoverage_1.RENTAL_PERIOD_GUARD_SCOPE, eventId: `${key}:may` });
        assert(partial && mayLeft === 0, 'a failed multi-month acquire releases the months it already took');
        assert((yield ownerToken(june)) !== '', 'the existing June owner is kept when the overlapping acquire fails');
        yield juneHold();
    });
}
function main() {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o;
        stage('pure keys');
        if (process.env.MONGODB_URI)
            assertDisposable(process.env.MONGODB_URI);
        if (process.env.ACCOUNTING_DB_URI)
            assertDisposable(process.env.ACCOUNTING_DB_URI);
        runPureKeys();
        assertDisposable(DB);
        assertDisposable(ACCOUNTING_DB);
        blankEmailProviders();
        stage('connecting');
        yield mongoose_1.default.connect(DB, { serverSelectionTimeoutMS: 8000, autoIndex: false });
        yield database_1.accountingConnection.openUri(ACCOUNTING_DB, { serverSelectionTimeoutMS: 8000 });
        stage('dropping disposable database');
        yield mongoose_1.default.connection.dropDatabase();
        yield database_1.accountingConnection.dropDatabase();
        yield Promise.all([Payment_1.Payment.init(), EventDedupRecord_1.EventDedupRecord.init(), OwnerRentNotice_1.OwnerRentNotice.init()]);
        yield EventDedupRecord_1.EventDedupRecord.collection.createIndex({ scope: 1, eventId: 1 }, { unique: true });
        yield Payment_1.Payment.collection.createIndex({ companyId: 1, idempotencyKey: 1 }, { unique: true, partialFilterExpression: { idempotencyKey: { $exists: true, $type: 'string' } } });
        stage('lock ownership');
        yield runLockOwnership();
        const admin = yield User_1.User.create({
            email: 'lock-admin@example.test',
            password: 'test-pass-1',
            firstName: 'Lock',
            lastName: 'Admin',
            role: 'admin',
            roles: ['admin', 'accountant'],
            isActive: true,
            sessionVersion: 1,
        });
        const agent = yield User_1.User.create({
            email: 'lock-agent@example.test',
            password: 'test-pass-1',
            firstName: 'Lock',
            lastName: 'Agent',
            role: 'agent',
            roles: ['agent'],
            isActive: true,
            sessionVersion: 1,
        });
        const company = yield Company_1.Company.create({
            name: 'Lock Agency',
            address: '1 Lock Street',
            phone: '0770000094',
            email: 'lock@example.test',
            registrationNumber: 'LOCK-REV-1',
            tinNumber: 'LOCK-REV-TIN',
            country: 'Zimbabwe',
            ownerId: admin._id,
            workspaceType: 'agency',
        });
        const property = yield Property_1.Property.create({
            companyId: company._id,
            ownerId: admin._id,
            agentId: agent._id,
            name: 'Lock House',
            address: '1 Lock Road',
            rentalType: 'management',
            rent: 1800,
            commission: 0,
            vatOnCommission: false,
        });
        const tenant = yield Tenant_1.Tenant.create({
            firstName: 'Lock',
            lastName: 'Tenant',
            email: 'lock-tenant@example.test',
            phone: '0771111194',
            companyId: company._id,
            ownerId: admin._id,
            status: 'Active',
        });
        const lease = yield Lease_1.Lease.create({
            propertyId: property._id,
            tenantId: tenant._id,
            companyId: company._id,
            ownerId: admin._id,
            startDate: new Date('2031-01-01T00:00:00.000Z'),
            endDate: new Date('2034-12-31T00:00:00.000Z'),
            rentAmount: 1800,
            depositAmount: 0,
            status: 'active',
        });
        const owner = yield PropertyOwner_1.PropertyOwner.create({
            email: 'lock-owner@example.test',
            password: 'test-pass-1',
            firstName: 'Lock',
            lastName: 'Owner',
            phone: '0772222294',
            companyId: company._id,
            properties: [property._id],
            active: true,
        });
        const adminUser = { userId: String(admin._id), companyId: String(company._id), role: 'admin', roles: ['admin', 'accountant'] };
        const agentUser = { userId: String(agent._id), companyId: String(company._id), role: 'agent', roles: ['agent'] };
        const leaseReq = (month, year, extra = {}) => ({
            user: adminUser,
            body: Object.assign({ leaseId: String(lease._id), amount: 1800, paymentDate: '2031-05-20', paymentMethod: 'cash', status: 'completed', rentalPeriodMonth: month, rentalPeriodYear: year, currency: 'USD', idempotencyKey: `lock:${year}:${month}:${new mongoose_1.default.Types.ObjectId().toString()}` }, extra),
        });
        const accountantReq = (month, year, extra = {}) => ({
            user: adminUser,
            body: Object.assign({ propertyId: String(property._id), tenantId: String(tenant._id), agentId: String(agent._id), amount: 1800, paymentDate: '2031-05-20', paymentMethod: 'cash', paymentType: 'rental', rentalPeriodMonth: month, rentalPeriodYear: year, currency: 'USD', idempotencyKey: `lock-acc:${year}:${month}:${new mongoose_1.default.Types.ObjectId().toString()}` }, extra),
        });
        const agentReq = (month, year, extra = {}) => ({
            user: agentUser,
            headers: {},
            body: Object.assign({ propertyId: String(property._id), tenantId: String(tenant._id), amount: 1800, paymentDate: '2031-05-20', paymentMethod: 'cash', paymentType: 'rental', status: 'completed', rentalPeriodMonth: month, rentalPeriodYear: year, currency: 'USD', idempotencyKey: `lock-agent:${year}:${month}:${new mongoose_1.default.Types.ObjectId().toString()}` }, extra),
        });
        function coveringCount(month, year) {
            return __awaiter(this, void 0, void 0, function* () {
                return Payment_1.Payment.countDocuments({
                    companyId: company._id,
                    propertyId: property._id,
                    tenantId: tenant._id,
                    rentalPeriodYear: year,
                    rentalPeriodMonth: month,
                    amount: { $gt: 0 },
                    reversalOfPaymentId: { $exists: false },
                    isCorrectionEntry: { $ne: true },
                });
            });
        }
        function oneWinner(label, month, year, left, right) {
            return __awaiter(this, void 0, void 0, function* () {
                var _a, _b;
                const [a, b] = yield Promise.all([left, right]);
                const count = yield coveringCount(month, year);
                const covered = yield (0, rentalPeriodCoverage_1.sumRentCoverageForPeriod)({
                    companyId: company._id,
                    propertyId: property._id,
                    tenantId: tenant._id,
                    rentalPeriodMonth: month,
                    rentalPeriodYear: year,
                });
                assert(count === 1, `${label} stored one covering payment, got ${count}; statuses ${a.statusCode}/${b.statusCode} ${((_a = a.body) === null || _a === void 0 ? void 0 : _a.message) || ''} | ${((_b = b.body) === null || _b === void 0 ? void 0 : _b.message) || ''}`);
                assert(covered === 1800, `${label} coverage is 1800, got ${covered}`);
                const created = [a, b].filter((row) => row.statusCode === 201 || row.statusCode === 200).length;
                assert(created === 1, `${label} one response accepted the payment, got ${a.statusCode} and ${b.statusCode}`);
            });
        }
        stage('concurrent controllers');
        yield oneWinner('lease', 1, 2031, invoke(paymentController_1.createPayment, leaseReq(1, 2031)), invoke(paymentController_1.createPayment, leaseReq(1, 2031)));
        yield oneWinner('public', 2, 2031, invoke(paymentController_1.createPaymentPublic, leaseReq(2, 2031)), invoke(paymentController_1.createPaymentPublic, leaseReq(2, 2031)));
        yield oneWinner('accountant', 3, 2031, invoke(paymentController_1.createPaymentAccountant, accountantReq(3, 2031)), invoke(paymentController_1.createPaymentAccountant, accountantReq(3, 2031)));
        yield oneWinner('agent', 4, 2031, invoke(agentController_1.createAgentPayment, agentReq(4, 2031)), invoke(agentController_1.createAgentPayment, agentReq(4, 2031)));
        stage('omitted lease and currency');
        yield oneWinner('omitted lease', 5, 2031, invoke(paymentController_1.createPayment, leaseReq(5, 2031)), invoke(paymentController_1.createPaymentAccountant, accountantReq(5, 2031, { leaseId: undefined })));
        yield oneWinner('omitted currency', 6, 2031, invoke(paymentController_1.createPayment, leaseReq(6, 2031, { currency: 'USD' })), invoke(paymentController_1.createPayment, leaseReq(6, 2031, { currency: undefined })));
        const usd = yield invoke(paymentController_1.createPayment, leaseReq(7, 2031, { currency: 'USD', amount: 1800 }));
        const zwl = yield invoke(paymentController_1.createPayment, leaseReq(7, 2031, { currency: 'ZWL', amount: 1800 }));
        const usdCovered = yield (0, rentalPeriodCoverage_1.sumRentCoverageForPeriod)({
            companyId: company._id, propertyId: property._id, tenantId: tenant._id,
            rentalPeriodMonth: 7, rentalPeriodYear: 2031, currency: 'USD',
        });
        const zwlCovered = yield (0, rentalPeriodCoverage_1.sumRentCoverageForPeriod)({
            companyId: company._id, propertyId: property._id, tenantId: tenant._id,
            rentalPeriodMonth: 7, rentalPeriodYear: 2031, currency: 'ZWL',
        });
        assert(usd.statusCode === 201 && zwl.statusCode === 201, `known USD and ZWL are both accepted, got ${usd.statusCode}/${zwl.statusCode} ${((_a = usd.body) === null || _a === void 0 ? void 0 : _a.message) || ''} ${((_b = zwl.body) === null || _b === void 0 ? void 0 : _b.message) || ''}`);
        assert(usdCovered === 1800 && zwlCovered === 1800, `currency isolation keeps USD ${usdCovered} and ZWL ${zwlCovered}`);
        stage('overlapping advances');
        const advanceA = leaseReq(5, 2032, {
            amount: 3600,
            advanceMonthsPaid: 2,
            advancePeriodStart: { month: 5, year: 2032 },
            advancePeriodEnd: { month: 6, year: 2032 },
        });
        const advanceB = leaseReq(6, 2032, {
            amount: 3600,
            advanceMonthsPaid: 2,
            advancePeriodStart: { month: 6, year: 2032 },
            advancePeriodEnd: { month: 7, year: 2032 },
        });
        const [firstAdvance, secondAdvance] = yield Promise.all([
            invoke(paymentController_1.createPayment, advanceA),
            invoke(paymentController_1.createPayment, advanceB),
        ]);
        const advanceCount = yield Payment_1.Payment.countDocuments({
            companyId: company._id,
            rentalPeriodYear: 2032,
            advanceMonthsPaid: { $gt: 1 },
            amount: { $gt: 0 },
        });
        const juneCovered = yield (0, rentalPeriodCoverage_1.sumRentCoverageForPeriod)({
            companyId: company._id, propertyId: property._id, tenantId: tenant._id,
            rentalPeriodMonth: 6, rentalPeriodYear: 2032,
        });
        assert(advanceCount === 1, `overlapping advances stored one payment, got ${advanceCount}; ${firstAdvance.statusCode}/${secondAdvance.statusCode} ${((_c = firstAdvance.body) === null || _c === void 0 ? void 0 : _c.message) || ''} | ${((_d = secondAdvance.body) === null || _d === void 0 ? void 0 : _d.message) || ''}`);
        assert(juneCovered === 1800, `June advance coverage is one month of rent, got ${juneCovered}`);
        stage('retry after persistence');
        const retryReq = leaseReq(8, 2031);
        const retryKey = retryReq.body.idempotencyKey;
        const firstSave = yield invoke(paymentController_1.createPayment, retryReq);
        const afterFirst = yield Payment_1.Payment.countDocuments({ companyId: company._id, idempotencyKey: retryKey });
        const journalsAfterFirst = yield JournalEntry_1.JournalEntry.countDocuments({ companyId: company._id });
        const secondSave = yield invoke(paymentController_1.createPayment, Object.assign(Object.assign({}, retryReq), { body: Object.assign({}, retryReq.body) }));
        const afterSecond = yield Payment_1.Payment.countDocuments({ companyId: company._id, idempotencyKey: retryKey });
        const journalsAfterSecond = yield JournalEntry_1.JournalEntry.countDocuments({ companyId: company._id });
        assert(firstSave.statusCode === 201 && afterFirst === 1, `first save persists one payment, got ${firstSave.statusCode} count ${afterFirst} ${((_e = firstSave.body) === null || _e === void 0 ? void 0 : _e.message) || ''}`);
        assert(secondSave.statusCode === 200 && afterSecond === 1, `retry returns the existing payment, got ${secondSave.statusCode} count ${afterSecond}`);
        assert(journalsAfterSecond === journalsAfterFirst, `retry added a journal, before ${journalsAfterFirst} after ${journalsAfterSecond}`);
        assert(afterSecond === 1, 'retry did not create another payment');
        const savedId = String(((_g = (_f = firstSave.body) === null || _f === void 0 ? void 0 : _f.payment) === null || _g === void 0 ? void 0 : _g._id) || '');
        const replayId = String(((_j = (_h = secondSave.body) === null || _h === void 0 ? void 0 : _h.payment) === null || _j === void 0 ? void 0 : _j._id) || '');
        assert(savedId !== '' && savedId === replayId, 'retry returns the same payment id');
        stage('reversal and correction coverage');
        const period = {
            companyId: company._id,
            propertyId: property._id,
            tenantId: tenant._id,
            rentalPeriodMonth: 9,
            rentalPeriodYear: 2031,
            leaseId: lease._id,
            currency: 'USD',
        };
        const ordinary = yield Payment_1.Payment.create({
            companyId: company._id,
            propertyId: property._id,
            tenantId: tenant._id,
            agentId: agent._id,
            processedBy: admin._id,
            leaseId: lease._id,
            propertyType: 'residential',
            amount: 1800,
            depositAmount: 0,
            paymentType: 'rental',
            paymentMethod: 'bank_transfer',
            status: 'completed',
            paymentDate: new Date('2031-09-13T10:00:00.000Z'),
            rentalPeriodMonth: 9,
            rentalPeriodYear: 2031,
            currency: 'USD',
            transactionDomain: 'RENTAL',
            commissionDetails: { totalCommission: 0, preaFee: 0, agentShare: 0, agencyShare: 0, ownerAmount: 1800 },
            referenceNumber: 'RCPT-LOCK-SEP',
        });
        ordinary.reversalState = 'reversal_in_progress';
        yield ordinary.save();
        const blockedProgress = yield invoke(paymentController_1.createPayment, leaseReq(9, 2031));
        assert(blockedProgress.statusCode === 409, `reversal in progress still blocks, got ${blockedProgress.statusCode}`);
        ordinary.reversalState = 'reversal_incomplete';
        yield ordinary.save();
        const blockedIncomplete = yield invoke(paymentController_1.createPayment, leaseReq(9, 2031));
        assert(blockedIncomplete.statusCode === 409, `reversal incomplete still blocks, got ${blockedIncomplete.statusCode}`);
        assert((yield (0, rentalPeriodCoverage_1.sumRentCoverageForPeriod)(period)) === 1800, 'in-progress and incomplete reversals still cover the month');
        const reversal = yield Payment_1.Payment.create({
            companyId: company._id,
            propertyId: property._id,
            tenantId: tenant._id,
            agentId: agent._id,
            processedBy: admin._id,
            leaseId: lease._id,
            propertyType: 'residential',
            amount: -1800,
            depositAmount: 0,
            paymentType: 'rental',
            paymentMethod: 'bank_transfer',
            status: 'completed',
            paymentDate: new Date('2031-09-20T10:00:00.000Z'),
            rentalPeriodMonth: 9,
            rentalPeriodYear: 2031,
            currency: 'USD',
            transactionDomain: 'RENTAL',
            commissionDetails: { totalCommission: 0, preaFee: 0, agentShare: 0, agencyShare: 0, ownerAmount: -1800 },
            referenceNumber: 'REV-LOCK-SEP',
            reversalOfPaymentId: ordinary._id,
        });
        ordinary.reversalState = 'reversed';
        ordinary.reversalPaymentId = reversal._id;
        yield ordinary.save();
        assert((yield (0, rentalPeriodCoverage_1.sumRentCoverageForPeriod)(period)) === 0, 'a completed reversal leaves the month open');
        const draft = yield Payment_1.Payment.create({
            companyId: company._id,
            propertyId: property._id,
            tenantId: tenant._id,
            agentId: agent._id,
            processedBy: admin._id,
            leaseId: lease._id,
            propertyType: 'residential',
            amount: 1800,
            depositAmount: 0,
            paymentType: 'rental',
            paymentMethod: 'bank_transfer',
            status: 'pending',
            postingStatus: 'draft',
            isCorrectionEntry: true,
            paymentDate: new Date('2031-09-21T10:00:00.000Z'),
            rentalPeriodMonth: 9,
            rentalPeriodYear: 2031,
            currency: 'USD',
            transactionDomain: 'RENTAL',
            commissionDetails: { totalCommission: 0, preaFee: 0, agentShare: 0, agencyShare: 0, ownerAmount: 1800 },
            referenceNumber: 'CORR-LOCK-SEP',
        });
        assert((yield (0, rentalPeriodCoverage_1.sumRentCoverageForPeriod)(period)) === 0, 'a pending correction does not cover the month');
        const advanceDuringDraft = yield invoke(paymentController_1.createPayment, leaseReq(9, 2031, {
            amount: 3600,
            advanceMonthsPaid: 2,
            advancePeriodStart: { month: 9, year: 2031 },
            advancePeriodEnd: { month: 10, year: 2031 },
        }));
        assert(advanceDuringDraft.statusCode === 400 || advanceDuringDraft.statusCode === 409, `pending correction reserves the period and blocks an overlapping advance, got ${advanceDuringDraft.statusCode} ${((_k = advanceDuringDraft.body) === null || _k === void 0 ? void 0 : _k.message) || ''}`);
        yield Payment_1.Payment.deleteMany({
            companyId: company._id,
            rentalPeriodYear: 2031,
            advanceMonthsPaid: { $gt: 1 },
            amount: { $gt: 0 },
        });
        draft.status = 'completed';
        draft.postingStatus = 'posted';
        yield draft.save();
        assert((yield (0, rentalPeriodCoverage_1.sumRentCoverageForPeriod)(period)) === 1800, 'a completed correction covers the month');
        const blockedCorrection = yield invoke(paymentController_1.createPayment, leaseReq(9, 2031));
        assert(blockedCorrection.statusCode === 409, `completed correction blocks a new receipt, got ${blockedCorrection.statusCode}`);
        const advanceOverCorrection = yield invoke(paymentController_1.createPayment, leaseReq(9, 2031, {
            amount: 3600,
            advanceMonthsPaid: 2,
            advancePeriodStart: { month: 9, year: 2031 },
            advancePeriodEnd: { month: 10, year: 2031 },
        }));
        assert(advanceOverCorrection.statusCode === 400, `completed correction blocks an overlapping advance, got ${advanceOverCorrection.statusCode} ${((_l = advanceOverCorrection.body) === null || _l === void 0 ? void 0 : _l.message) || ''}`);
        stage('levy does not satisfy rent');
        yield Property_1.Property.updateOne({ _id: property._id }, { $set: { levyOrMunicipalType: 'levy', levyOrMunicipalAmount: 200 } });
        const levyOnly = yield invoke(agentController_1.createAgentPayment, agentReq(11, 2031, { amount: 200, rentUsed: 1800, levyUsed: 200 }));
        const levyCoverage = yield (0, rentalPeriodCoverage_1.sumRentCoverageForPeriod)({
            companyId: company._id, propertyId: property._id, tenantId: tenant._id,
            rentalPeriodMonth: 11, rentalPeriodYear: 2031,
        });
        assert(levyOnly.statusCode === 201, `levy-only payment is accepted, got ${levyOnly.statusCode} ${((_m = levyOnly.body) === null || _m === void 0 ? void 0 : _m.message) || ''}`);
        assert(levyCoverage === 0, `levy-only payment does not cover rent, got ${levyCoverage}`);
        const rentAfterLevy = yield invoke(paymentController_1.createPayment, leaseReq(11, 2031));
        assert(rentAfterLevy.statusCode === 201, `rent can still be collected after a levy-only payment, got ${rentAfterLevy.statusCode} ${((_o = rentAfterLevy.body) === null || _o === void 0 ? void 0 : _o.message) || ''}`);
        yield Property_1.Property.updateOne({ _id: property._id }, { $set: { levyOrMunicipalType: '', levyOrMunicipalAmount: 0 } });
        stage('reversal notice retry');
        const amountBefore = Number(ordinary.amount);
        const stateBefore = String(ordinary.reversalState);
        const journalsBeforeNotice = yield JournalEntry_1.JournalEntry.countDocuments({ companyId: company._id });
        const sent = [];
        const noticePayment = {
            _id: ordinary._id,
            companyId: company._id,
            propertyId: property._id,
            tenantId: tenant._id,
            referenceNumber: ordinary.referenceNumber,
            amount: ordinary.amount,
            currency: 'USD',
            reversalPaymentId: reversal._id,
            reversalState: 'reversed',
            rentalPeriodMonth: 9,
            rentalPeriodYear: 2031,
        };
        yield (0, ownerRentNotificationService_1.notifyOwnerOfRentReversal)(noticePayment, 'duplicate receipt', {
            settled: true,
            send: (message) => __awaiter(this, void 0, void 0, function* () { sent.push(message); }),
        });
        yield (0, ownerRentNotificationService_1.notifyOwnerOfRentReversal)(noticePayment, 'duplicate receipt', {
            settled: true,
            send: (message) => __awaiter(this, void 0, void 0, function* () { sent.push(message); }),
        });
        const noticeCount = yield OwnerRentNotice_1.OwnerRentNotice.countDocuments({
            idempotencyKey: `owner-rent-reversal:${String(ordinary._id)}:${String(reversal._id)}`,
        });
        const reloaded = yield Payment_1.Payment.findById(ordinary._id).select('amount reversalState commissionDetails').lean();
        assert(sent.length === 1 && noticeCount === 1, `reversal notice retry sends once and stores one row, sent ${sent.length} rows ${noticeCount}`);
        assert(Number(reloaded === null || reloaded === void 0 ? void 0 : reloaded.amount) === amountBefore && String(reloaded === null || reloaded === void 0 ? void 0 : reloaded.reversalState) === stateBefore, 'reversal notice retry does not change the payment');
        assert((yield JournalEntry_1.JournalEntry.countDocuments({ companyId: company._id })) === journalsBeforeNotice, 'reversal notice retry does not add a journal');
        assert(owner.email === 'lock-owner@example.test', 'notice fixture stayed on the disposable owner');
        stage('guard still serializes a direct write');
        let raced = 0;
        yield Promise.all([0, 1].map(() => (0, rentalPeriodCoverage_1.withRentalPeriodGuards)([
            `direct:${company._id}:2031:12`,
        ], () => __awaiter(this, void 0, void 0, function* () {
            const covered = yield (0, rentalPeriodCoverage_1.sumRentCoverageForPeriod)({
                companyId: company._id, propertyId: property._id, tenantId: tenant._id,
                rentalPeriodMonth: 12, rentalPeriodYear: 2031,
            });
            if (covered >= 1800)
                return;
            yield Payment_1.Payment.create({
                companyId: company._id,
                propertyId: property._id,
                tenantId: tenant._id,
                agentId: agent._id,
                processedBy: admin._id,
                leaseId: lease._id,
                propertyType: 'residential',
                amount: 1800,
                depositAmount: 0,
                paymentType: 'rental',
                paymentMethod: 'cash',
                status: 'completed',
                paymentDate: new Date('2031-12-01T00:00:00.000Z'),
                rentalPeriodMonth: 12,
                rentalPeriodYear: 2031,
                currency: 'USD',
                transactionDomain: 'RENTAL',
                commissionDetails: { totalCommission: 0, preaFee: 0, agentShare: 0, agencyShare: 0, ownerAmount: 1800 },
                referenceNumber: `RCPT-DIRECT-${new mongoose_1.default.Types.ObjectId().toString()}`,
                idempotencyKey: `direct:${new mongoose_1.default.Types.ObjectId().toString()}`,
            });
            raced += 1;
            yield sleep(40);
        }), { leaseMs: 60000, heartbeatMs: 0, waitMs: 2000 })));
        assert(raced === 1, `direct locked writers stored one receipt, got ${raced}`);
    });
}
main()
    .then(() => __awaiter(void 0, void 0, void 0, function* () {
    if (database_1.accountingConnection.readyState !== 0)
        yield database_1.accountingConnection.close();
    if (mongoose_1.default.connection.readyState !== 0)
        yield mongoose_1.default.disconnect();
    if (failures.length) {
        console.error(failures.map((failure) => `- ${failure}`).join('\n'));
        console.error(`rental-lock failures: ${failures.length}`);
        process.exit(1);
    }
    console.log('rental-lock tests passed');
    process.exit(0);
}))
    .catch((error) => __awaiter(void 0, void 0, void 0, function* () {
    console.error(error);
    if (database_1.accountingConnection.readyState !== 0)
        yield database_1.accountingConnection.close().catch(() => undefined);
    if (mongoose_1.default.connection.readyState !== 0)
        yield mongoose_1.default.disconnect().catch(() => undefined);
    process.exit(1);
}));
