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
exports.SIGN_IN_REQUIRED_MESSAGE = void 0;
exports.abandonedRegistrationRetentionMs = abandonedRegistrationRetentionMs;
exports.releaseAbandonedRegistration = releaseAbandonedRegistration;
exports.expireAbandonedRegistrations = expireAbandonedRegistrations;
const crypto_1 = __importDefault(require("crypto"));
const mongoose_1 = __importDefault(require("mongoose"));
const Company_1 = require("../models/Company");
const User_1 = require("../models/User");
const Subscription_1 = require("../models/Subscription");
const OnboardingSession_1 = require("../models/OnboardingSession");
const PaymentSession_1 = require("../models/PaymentSession");
const BillingPayment_1 = require("../models/BillingPayment");
const auditService_1 = require("./auditService");
const auditPolicy_1 = require("./auditPolicy");
const logger_1 = require("../utils/logger");
exports.SIGN_IN_REQUIRED_MESSAGE = 'We could not continue with these details. Sign in if you already have an account, or use password recovery.';
const RELEASABLE_ONBOARDING = ['PENDING_PAYMENT', 'PENDING_SETUP', 'FAILED_SETUP'];
const ACTIVE_SUBSCRIPTION = new Set(['trial', 'active']);
function abandonedRegistrationRetentionMs(env = process.env) {
    var _a;
    const parsed = Number((_a = env.ABANDONED_REGISTRATION_RETENTION_DAYS) !== null && _a !== void 0 ? _a : 7);
    const days = Number.isFinite(parsed) && parsed > 0 ? parsed : 7;
    return days * 24 * 60 * 60 * 1000;
}
function latestActivity(dates) {
    const times = dates.filter(Boolean).map((value) => new Date(value).getTime()).filter((value) => Number.isFinite(value));
    return times.length ? Math.max(...times) : Date.now();
}
function sessionAwaitingProvider(session) {
    const status = String(session.status || '');
    if (status === 'provider_created')
        return true;
    return status === 'pending' && Boolean(String(session.pollUrl || '').trim());
}
function companyHasOperationalRecords(companyId) {
    return __awaiter(this, void 0, void 0, function* () {
        const clauses = [{ companyId }, { companyId: String(companyId) }];
        const [properties, payments] = yield Promise.all([
            mongoose_1.default.connection.collection('properties').countDocuments({ $or: clauses }),
            mongoose_1.default.connection.collection('payments').countDocuments({ $or: clauses })
        ]);
        return properties > 0 || payments > 0;
    });
}
/**
 * Archives one abandoned paid registration when every payment-safety check passes.
 * Active trials, active companies, verified payments, and unresolved provider sessions are left unchanged.
 * A second call for an already archived registration does not rewrite it.
 */
function releaseAbandonedRegistration(companyId_1) {
    return __awaiter(this, arguments, void 0, function* (companyId, now = new Date()) {
        const company = yield Company_1.Company.findById(companyId);
        if (!company)
            return 'skipped';
        const users = yield User_1.User.find({ companyId: company._id });
        if (company.ownerId && !users.some((user) => String(user._id) === String(company.ownerId))) {
            const owner = yield User_1.User.findById(company.ownerId);
            if (owner)
                users.push(owner);
        }
        const alreadyArchived = company.onboardingStatus === 'EXPIRED' && company.tenantStatus === 'archived';
        if (alreadyArchived && users.every((user) => user.isArchived && String(user.email || '').startsWith('archived.'))) {
            return 'released';
        }
        if (users.some((user) => user.role === 'system_admin' || (user.roles || []).includes('system_admin'))) {
            return 'skipped';
        }
        const [subscriptions, sessions, billingPayments, onboardingSessions, hasRecords] = yield Promise.all([
            Subscription_1.Subscription.find({ companyId: company._id }),
            PaymentSession_1.PaymentSession.find({ companyId: company._id }),
            BillingPayment_1.BillingPayment.find({ companyId: company._id }),
            OnboardingSession_1.OnboardingSession.find({ companyId: company._id }),
            companyHasOperationalRecords(company._id)
        ]);
        if (!alreadyArchived) {
            const subscriptionStatuses = subscriptions.map((subscription) => String(subscription.status || '').toLowerCase());
            const companySubscription = String(company.subscriptionStatus || '').toLowerCase();
            const protectedAccount = company.tenantStatus === 'active'
                || company.isActive === true
                || company.onboardingCompleted === true
                || ['ACTIVE', 'PAYMENT_RECEIVED', 'INITIALIZING_WORKSPACE', 'SUSPENDED'].includes(String(company.onboardingStatus || ''))
                || ACTIVE_SUBSCRIPTION.has(companySubscription)
                || subscriptionStatuses.some((status) => ACTIVE_SUBSCRIPTION.has(status))
                || hasRecords;
            if (protectedAccount)
                return 'skipped';
            if (!RELEASABLE_ONBOARDING.includes(String(company.onboardingStatus || '')) || company.tenantStatus !== 'pending') {
                return 'skipped';
            }
            const verifiedPayment = sessions.some((session) => session.status === 'paid' || session.status === 'reconciled')
                || billingPayments.some((payment) => payment.status === 'paid');
            if (verifiedPayment)
                return 'skipped';
            const activity = latestActivity([
                company.createdAt,
                company.updatedAt,
                ...users.flatMap((user) => [user.createdAt, user.updatedAt]),
                ...sessions.flatMap((session) => [session.createdAt, session.updatedAt]),
                ...onboardingSessions.map((session) => session.updatedAt)
            ]);
            if (now.getTime() - activity < abandonedRegistrationRetentionMs())
                return 'skipped';
            if (sessions.some((session) => sessionAwaitingProvider(session))) {
                logger_1.logger.warn('Abandoned registration cleanup deferred', {
                    companyId: String(company._id),
                    reason: 'unresolved_payment_status'
                });
                yield (0, auditService_1.recordAuditEvent)({
                    companyId: String(company._id),
                    action: 'registration.cleanup_deferred',
                    entityType: 'Company',
                    entityId: String(company._id),
                    status: 'failure',
                    metadata: { reason: 'unresolved_payment_status' }
                });
                return 'deferred';
            }
        }
        const archivedAt = now;
        for (const user of users) {
            if (user.isArchived && String(user.email || '').startsWith('archived.'))
                continue;
            const originalEmail = String(user.email || '');
            const archivedEmail = `archived.${user._id.toString()}@example.invalid`;
            user.email = archivedEmail;
            user.normalizedEmail = archivedEmail;
            user.password = crypto_1.default.randomBytes(24).toString('hex');
            user.isActive = false;
            user.isArchived = true;
            user.archivedAt = archivedAt;
            user.resetPasswordToken = undefined;
            user.resetPasswordExpires = undefined;
            user.firstName = 'Archived';
            user.lastName = 'Registration';
            user.archivedDetails = {
                email: crypto_1.default.createHash('sha256').update(originalEmail).digest('hex'),
                firstName: 'Archived',
                lastName: 'Registration'
            };
            yield user.save();
        }
        company.name = 'Archived registration';
        company.email = `archived.company.${company._id.toString()}@example.invalid`;
        company.normalizedEmail = company.email;
        company.phone = '0000000000';
        company.address = 'Archived';
        company.website = undefined;
        company.registrationNumber = `ARCHIVED-${company._id.toString()}`;
        company.tinNumber = `ARCHIVED-${company._id.toString()}`;
        company.vatNumber = undefined;
        company.tenantStatus = 'archived';
        company.onboardingStatus = 'EXPIRED';
        company.onboardingCompleted = false;
        company.isActive = false;
        yield company.save();
        for (const session of onboardingSessions) {
            session.status = 'EXPIRED';
            session.idempotencyKey = `archived:${session._id.toString()}`;
            session.metadata = Object.assign(Object.assign({}, (session.metadata || {})), { emailReleased: true, archivedAt: archivedAt.toISOString() });
            yield session.save();
        }
        for (const session of sessions) {
            if (session.status === 'pending' && !session.pollUrl) {
                session.status = 'expired';
                yield session.save();
            }
            if (session.idempotencyKey && !session.idempotencyKey.startsWith('archived:')) {
                session.idempotencyKey = `archived:${session._id.toString()}`;
                yield session.save();
            }
        }
        for (const payment of billingPayments) {
            if (payment.status === 'pending') {
                payment.status = 'cancelled';
                yield payment.save();
            }
        }
        if (!alreadyArchived) {
            const archiveAudits = [
                ['registration.expired', { retentionDays: abandonedRegistrationRetentionMs() / 86400000 }],
                ['registration.archived', {}],
                ['registration.email_released', {}]
            ];
            for (const [action, metadata] of archiveAudits) {
                const persisted = yield (0, auditService_1.recordAuditEvent)({
                    companyId: String(company._id),
                    action,
                    entityType: 'Company',
                    entityId: String(company._id),
                    metadata
                });
                if (!persisted) {
                    yield (0, auditPolicy_1.noteMissingAudit)({
                        action,
                        companyId: String(company._id),
                        entityId: String(company._id),
                        operationId: String(company._id)
                    });
                }
            }
        }
        return 'released';
    });
}
function expireAbandonedRegistrations() {
    return __awaiter(this, arguments, void 0, function* (now = new Date()) {
        const cutoff = new Date(now.getTime() - abandonedRegistrationRetentionMs());
        const candidates = yield Company_1.Company.find({
            onboardingStatus: { $in: RELEASABLE_ONBOARDING },
            tenantStatus: 'pending',
            isActive: { $ne: true },
            createdAt: { $lte: cutoff }
        }).select('_id').limit(200);
        const totals = { released: 0, deferred: 0, skipped: 0 };
        for (const candidate of candidates) {
            const outcome = yield releaseAbandonedRegistration(candidate._id, now);
            totals[outcome] += 1;
        }
        return totals;
    });
}
