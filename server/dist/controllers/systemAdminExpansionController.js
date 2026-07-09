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
exports.getRevenueAnalytics = exports.updateSupportTicket = exports.createSupportTicket = exports.listSupportTickets = exports.listAuditLogs = exports.getVoucherHistory = exports.extendVoucher = exports.revokeVoucher = exports.listEnhancedVouchers = exports.emailPlatformInvoice = exports.downloadPlatformInvoicePdf = exports.updatePlatformInvoice = exports.generatePlatformInvoice = exports.listPlatformInvoices = exports.upsertPlan = exports.listPlans = exports.reviewCashPayment = exports.createCashPayment = exports.listCashPayments = exports.setCompanyStatus = exports.updateCompanyProfile = exports.getCompanyProfile = exports.listCompanies = exports.getSystemAdminDashboard = exports.getEnhancedStatus = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const os_1 = __importDefault(require("os"));
const puppeteer_1 = __importDefault(require("puppeteer"));
const errorHandler_1 = require("../middleware/errorHandler");
const Company_1 = require("../models/Company");
const Subscription_1 = require("../models/Subscription");
const BillingPayment_1 = require("../models/BillingPayment");
const PaymentSession_1 = require("../models/PaymentSession");
const Voucher_1 = require("../models/Voucher");
const AuditLog_1 = require("../models/AuditLog");
const User_1 = require("../models/User");
const Property_1 = require("../models/Property");
const Tenant_1 = require("../models/Tenant");
const Lease_1 = require("../models/Lease");
const MaintenanceRequest_1 = require("../models/MaintenanceRequest");
const Plan_1 = require("../models/Plan");
const PlatformInvoice_1 = require("../models/PlatformInvoice");
const CashPayment_1 = require("../models/CashPayment");
const SupportTicket_1 = require("../models/SupportTicket");
const billingActivationService_1 = require("../services/billingActivationService");
const emailService_1 = require("../services/emailService");
const systemPlanService_1 = require("../services/systemPlanService");
const PLAN_CODES = ['INDIVIDUAL', 'SME', 'ENTERPRISE'];
const CASH_METHODS = ['Cash', 'EcoCash', 'ZIPIT', 'Bank Transfer', 'Innbucks', 'Mukuru'];
function requireSystemAdmin(req) {
    var _a, _b;
    const roles = Array.isArray((_a = req.user) === null || _a === void 0 ? void 0 : _a.roles) ? req.user.roles : (((_b = req.user) === null || _b === void 0 ? void 0 : _b.role) ? [req.user.role] : []);
    if (!roles.includes('system_admin')) {
        throw new errorHandler_1.AppError('System admin required', 403);
    }
}
function actorId(req) {
    var _a;
    const id = (_a = req.user) === null || _a === void 0 ? void 0 : _a.userId;
    return id && mongoose_1.default.Types.ObjectId.isValid(String(id)) ? new mongoose_1.default.Types.ObjectId(String(id)) : undefined;
}
function asObjectId(id, label = 'id') {
    if (!mongoose_1.default.Types.ObjectId.isValid(String(id || ''))) {
        throw new errorHandler_1.AppError(`Invalid ${label}`, 400);
    }
    return new mongoose_1.default.Types.ObjectId(String(id));
}
function pagination(req) {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 25));
    return { page, limit, skip: (page - 1) * limit };
}
function daysFromNow(days) {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return d;
}
function startOfMonth() {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
}
function monthKey(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}
function money(value) {
    return Number(value || 0);
}
function escapeHtml(value) {
    return String(value !== null && value !== void 0 ? value : '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
function audit(req_1, action_1, entityType_1, entityId_1, companyId_1, metadata_1) {
    return __awaiter(this, arguments, void 0, function* (req, action, entityType, entityId, companyId, metadata, status = 'success') {
        try {
            yield AuditLog_1.AuditLog.create({
                userId: actorId(req),
                companyId: companyId && mongoose_1.default.Types.ObjectId.isValid(String(companyId)) ? new mongoose_1.default.Types.ObjectId(String(companyId)) : undefined,
                action,
                entityType,
                entityId: entityId ? String(entityId) : undefined,
                ip: req.ip,
                userAgent: req.get('user-agent'),
                status,
                metadata
            });
        }
        catch (err) {
            console.warn('[system-admin] audit write failed:', (err === null || err === void 0 ? void 0 : err.message) || err);
        }
    });
}
function companyUsage(companyId) {
    return __awaiter(this, void 0, void 0, function* () {
        const [properties, tenants, leases, users, maintenance] = yield Promise.all([
            Property_1.Property.countDocuments({ companyId }),
            Tenant_1.Tenant.countDocuments({ companyId }),
            Lease_1.Lease.countDocuments({ companyId }),
            User_1.User.countDocuments({ companyId }),
            MaintenanceRequest_1.MaintenanceRequest.countDocuments({ companyId })
        ]);
        return { properties, tenants, leases, users, maintenance };
    });
}
function buildInvoicePdfBuffer(invoice, company) {
    return __awaiter(this, void 0, void 0, function* () {
        const html = `<!doctype html>
  <html>
    <head>
      <meta charset="utf-8" />
      <title>${escapeHtml(invoice.invoiceNumber)}</title>
      <style>
        body { font-family: Arial, sans-serif; padding: 28px; color: #0f172a; }
        .brand { font-size: 24px; font-weight: 700; color: #235347; }
        .muted { color: #64748b; font-size: 12px; }
        .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin: 24px 0; }
        table { width: 100%; border-collapse: collapse; margin-top: 24px; }
        th, td { border-bottom: 1px solid #e2e8f0; padding: 10px 6px; text-align: left; }
        .total { text-align: right; margin-top: 20px; font-size: 18px; font-weight: 700; }
      </style>
    </head>
    <body>
      <div class="brand">Mantis Platform Invoice</div>
      <div class="muted">Invoice ${escapeHtml(invoice.invoiceNumber)}</div>
      <div class="grid">
        <div>
          <h3>Bill To</h3>
          <div>${escapeHtml((company === null || company === void 0 ? void 0 : company.name) || 'Company')}</div>
          <div>${escapeHtml((company === null || company === void 0 ? void 0 : company.email) || '')}</div>
          <div>${escapeHtml((company === null || company === void 0 ? void 0 : company.address) || '')}</div>
        </div>
        <div>
          <h3>Invoice Details</h3>
          <div>Status: ${escapeHtml(invoice.status)}</div>
          <div>Issue Date: ${new Date(invoice.issueDate).toLocaleDateString()}</div>
          <div>Due Date: ${new Date(invoice.dueDate).toLocaleDateString()}</div>
        </div>
      </div>
      <table>
        <thead><tr><th>Plan</th><th>Billing Cycle</th><th>Amount</th></tr></thead>
        <tbody>
          <tr>
            <td>${escapeHtml(invoice.plan)}</td>
            <td>${escapeHtml(invoice.billingCycle || '-')}</td>
            <td>${escapeHtml(invoice.currency)} ${Number(invoice.amount || 0).toFixed(2)}</td>
          </tr>
        </tbody>
      </table>
      <div class="total">Total: ${escapeHtml(invoice.currency)} ${Number(invoice.amount || 0).toFixed(2)}</div>
      ${invoice.notes ? `<p>${escapeHtml(invoice.notes)}</p>` : ''}
    </body>
  </html>`;
        const browser = yield puppeteer_1.default.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
        try {
            const page = yield browser.newPage();
            yield page.setContent(html, { waitUntil: 'networkidle0' });
            const pdf = yield page.pdf({ format: 'A4', printBackground: true, margin: { top: '16mm', right: '12mm', bottom: '16mm', left: '12mm' } });
            return Buffer.from(pdf);
        }
        finally {
            yield browser.close();
        }
    });
}
const getEnhancedStatus = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    requireSystemAdmin(req);
    const email = (0, emailService_1.getEmailConfigStatus)();
    const smtp = yield (0, emailService_1.verifySmtpConnection)();
    const dbState = mongoose_1.default.connection.readyState;
    const heap = process.memoryUsage();
    res.json({
        status: dbState === 1 ? 'ok' : 'degraded',
        time: new Date().toISOString(),
        user: ((_a = req.user) === null || _a === void 0 ? void 0 : _a.email) || null,
        version: process.env.npm_package_version || process.env.APP_VERSION || '1.0.0',
        application: {
            frontend: { status: 'ok' },
            backend: { status: 'ok' },
            database: { status: dbState === 1 ? 'ok' : 'degraded', readyState: dbState }
        },
        services: {
            email: { status: email.anyProviderConfigured ? (smtp.verified || !email.smtpConfigured ? 'ok' : 'degraded') : 'degraded', configured: email.anyProviderConfigured },
            storage: { status: process.env.AWS_ACCESS_KEY_ID || process.env.S3_BUCKET ? 'ok' : 'degraded' },
            payment: { status: process.env.PAYNOW_INTEGRATION_ID || process.env.PAYPAL_CLIENT_ID ? 'ok' : 'degraded' },
            backup: { status: 'ok' }
        },
        performance: {
            memoryUsage: heap,
            cpuUsage: process.cpuUsage(),
            databaseConnections: dbState === 1 ? 1 : 0,
            averageResponseTimeMs: null
        },
        uptime: {
            systemUptimeSeconds: os_1.default.uptime(),
            processUptimeSeconds: process.uptime(),
            lastDeployment: process.env.LAST_DEPLOYMENT || null,
            version: process.env.npm_package_version || process.env.APP_VERSION || '1.0.0'
        }
    });
});
exports.getEnhancedStatus = getEnhancedStatus;
const getSystemAdminDashboard = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    requireSystemAdmin(req);
    yield (0, systemPlanService_1.seedDefaultPlans)();
    const now = new Date();
    const monthStart = startOfMonth();
    const in7 = daysFromNow(7);
    const in30 = daysFromNow(30);
    const [totalCompanies, activeCompanies, trialCompanies, suspendedCompanies, totalProperties, totalTenants, totalLeases, totalMaintenance, expiring7, expiring30, overdue, trialEndingSoon, cashRevenue, onlineRevenue, planRows, statusRows, recentCompanies, recentPayments, recentTickets, openTickets, criticalTickets, activeSubscriptions] = yield Promise.all([
        Company_1.Company.countDocuments({}),
        Company_1.Company.countDocuments({ tenantStatus: { $ne: 'suspended' }, subscriptionStatus: { $in: ['active', 'ACTIVE'] } }),
        Company_1.Company.countDocuments({ subscriptionStatus: { $in: ['trial', 'TRIAL'] } }),
        Company_1.Company.countDocuments({ $or: [{ tenantStatus: 'suspended' }, { subscriptionStatus: { $in: ['suspended', 'SUSPENDED'] } }] }),
        Property_1.Property.countDocuments({}),
        Tenant_1.Tenant.countDocuments({}),
        Lease_1.Lease.countDocuments({}),
        MaintenanceRequest_1.MaintenanceRequest.countDocuments({}),
        Subscription_1.Subscription.countDocuments({ status: { $in: ['active', 'ACTIVE'] }, currentPeriodEnd: { $gte: now, $lte: in7 } }),
        Subscription_1.Subscription.countDocuments({ status: { $in: ['active', 'ACTIVE'] }, currentPeriodEnd: { $gte: now, $lte: in30 } }),
        Subscription_1.Subscription.countDocuments({ status: { $in: ['past_due', 'expired', 'PAST_DUE', 'EXPIRED'] } }),
        Subscription_1.Subscription.countDocuments({ status: { $in: ['trial', 'TRIAL'] }, trialEndDate: { $gte: now, $lte: in7 } }),
        BillingPayment_1.BillingPayment.aggregate([{ $match: { provider: 'cash', status: 'paid', createdAt: { $gte: monthStart } } }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
        BillingPayment_1.BillingPayment.aggregate([{ $match: { provider: { $ne: 'cash' }, status: 'paid', createdAt: { $gte: monthStart } } }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
        Company_1.Company.aggregate([{ $group: { _id: '$plan', count: { $sum: 1 } } }]),
        Subscription_1.Subscription.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
        Company_1.Company.find({}).sort({ createdAt: -1 }).limit(5).select('name email plan createdAt').lean(),
        BillingPayment_1.BillingPayment.find({ status: 'paid' }).sort({ createdAt: -1 }).limit(5).select('companyId plan amount currency provider method createdAt').lean(),
        SupportTicket_1.SupportTicket.find({}).sort({ createdAt: -1 }).limit(5).select('companyId subject priority status createdAt').lean(),
        SupportTicket_1.SupportTicket.countDocuments({ status: { $in: ['Open', 'In Progress', 'Waiting'] } }),
        SupportTicket_1.SupportTicket.countDocuments({ priority: 'Critical', status: { $nin: ['Resolved', 'Closed'] } }),
        Subscription_1.Subscription.find({ status: { $in: ['active', 'ACTIVE', 'trial', 'TRIAL'] } }).select('plan cycle status').lean()
    ]);
    let mrr = 0;
    let expectedRevenue = 0;
    for (const sub of activeSubscriptions) {
        const plan = yield (0, systemPlanService_1.getPlanConfig)(sub.plan || 'INDIVIDUAL');
        const monthly = sub.cycle === 'yearly' ? money(plan.annualPrice) / 12 : money(plan.monthlyPrice);
        mrr += monthly;
        expectedRevenue += sub.cycle === 'yearly' ? money(plan.annualPrice) : money(plan.monthlyPrice);
    }
    const monthlyRevenue = yield BillingPayment_1.BillingPayment.aggregate([
        { $match: { status: 'paid', createdAt: { $gte: new Date(now.getFullYear(), now.getMonth() - 11, 1) } } },
        { $group: { _id: { year: { $year: '$createdAt' }, month: { $month: '$createdAt' } }, total: { $sum: '$amount' } } },
        { $sort: { '_id.year': 1, '_id.month': 1 } }
    ]);
    const companiesByMonth = yield Company_1.Company.aggregate([
        { $match: { createdAt: { $gte: new Date(now.getFullYear(), now.getMonth() - 11, 1) } } },
        { $group: { _id: { year: { $year: '$createdAt' }, month: { $month: '$createdAt' } }, count: { $sum: 1 } } },
        { $sort: { '_id.year': 1, '_id.month': 1 } }
    ]);
    res.json({
        data: {
            kpis: {
                companies: { total: totalCompanies, active: activeCompanies, trial: trialCompanies, suspended: suspendedCompanies },
                revenue: {
                    monthlyRecurringRevenue: mrr,
                    expectedRevenue,
                    cashRevenueThisMonth: ((_a = cashRevenue[0]) === null || _a === void 0 ? void 0 : _a.total) || 0,
                    onlineRevenueThisMonth: ((_b = onlineRevenue[0]) === null || _b === void 0 ? void 0 : _b.total) || 0
                },
                usage: { totalProperties, totalTenants, totalLeases, totalMaintenanceRequests: totalMaintenance },
                subscriptions: { expiringIn7Days: expiring7, expiringIn30Days: expiring30, overdue, trialEndingSoon },
                support: { openTickets, criticalTickets }
            },
            charts: {
                monthlyRevenueTrend: monthlyRevenue.map((r) => ({ month: `${r._id.year}-${String(r._id.month).padStart(2, '0')}`, revenue: r.total })),
                newCompaniesPerMonth: companiesByMonth.map((r) => ({ month: `${r._id.year}-${String(r._id.month).padStart(2, '0')}`, companies: r.count })),
                planDistribution: planRows.map((r) => ({ name: r._id || 'Unassigned', value: r.count })),
                subscriptionStatusDistribution: statusRows.map((r) => ({ name: r._id || 'unknown', value: r.count }))
            },
            recentActivity: {
                newCompanyRegistrations: recentCompanies,
                newSubscriptionActivations: recentPayments,
                cashPaymentsApproved: recentPayments.filter((p) => p.provider === 'cash'),
                supportTicketsCreated: recentTickets
            }
        }
    });
});
exports.getSystemAdminDashboard = getSystemAdminDashboard;
const listCompanies = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    requireSystemAdmin(req);
    const { page, limit, skip } = pagination(req);
    const search = String(req.query.search || '').trim();
    const status = String(req.query.status || '').trim();
    const plan = String(req.query.plan || '').trim();
    const q = {};
    if (search)
        q.$or = [{ name: new RegExp(search, 'i') }, { email: new RegExp(search, 'i') }, { tradingName: new RegExp(search, 'i') }];
    if (status)
        q.$or = [...(q.$or || []), { tenantStatus: status }, { subscriptionStatus: status }];
    if (plan && PLAN_CODES.includes(plan))
        q.plan = plan;
    const [items, total] = yield Promise.all([
        Company_1.Company.find(q).sort({ createdAt: -1 }).skip(skip).limit(limit).select('_id name tradingName email plan tenantStatus subscriptionStatus subscriptionEndDate isActive createdAt updatedAt').lean(),
        Company_1.Company.countDocuments(q)
    ]);
    const ids = items.map((c) => c._id);
    const [users, properties, lastLogins] = yield Promise.all([
        User_1.User.aggregate([{ $match: { companyId: { $in: ids } } }, { $group: { _id: '$companyId', count: { $sum: 1 } } }]),
        Property_1.Property.aggregate([{ $match: { companyId: { $in: ids } } }, { $group: { _id: '$companyId', count: { $sum: 1 } } }]),
        User_1.User.aggregate([{ $match: { companyId: { $in: ids }, lastLogin: { $exists: true } } }, { $group: { _id: '$companyId', lastLogin: { $max: '$lastLogin' } } }])
    ]);
    const userMap = new Map(users.map((r) => [String(r._id), r.count]));
    const propMap = new Map(properties.map((r) => [String(r._id), r.count]));
    const loginMap = new Map(lastLogins.map((r) => [String(r._id), r.lastLogin]));
    res.json({
        data: items.map((c) => ({
            companyId: String(c._id),
            name: c.name,
            tradingName: c.tradingName,
            email: c.email,
            plan: c.plan,
            status: c.tenantStatus || c.subscriptionStatus,
            subscriptionStatus: c.subscriptionStatus,
            properties: propMap.get(String(c._id)) || 0,
            users: userMap.get(String(c._id)) || 0,
            lastLogin: loginMap.get(String(c._id)) || null,
            createdAt: c.createdAt
        })),
        pagination: { page, limit, total, pages: Math.ceil(total / limit) }
    });
});
exports.listCompanies = listCompanies;
const getCompanyProfile = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d, _e;
    requireSystemAdmin(req);
    const companyId = asObjectId(req.params.id, 'company id');
    const company = yield Company_1.Company.findById(companyId).lean();
    if (!company)
        throw new errorHandler_1.AppError('Company not found', 404);
    const [subscription, usage, financials, cashPayments, onlinePayments, lastProperty, lastTenant, lastLease, lastLogin] = yield Promise.all([
        Subscription_1.Subscription.findOne({ companyId }).sort({ updatedAt: -1 }).lean(),
        companyUsage(companyId),
        BillingPayment_1.BillingPayment.aggregate([{ $match: { companyId, status: 'paid' } }, { $group: { _id: null, lifetime: { $sum: '$amount' } } }]),
        BillingPayment_1.BillingPayment.aggregate([{ $match: { companyId, provider: 'cash', status: 'paid' } }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
        BillingPayment_1.BillingPayment.aggregate([{ $match: { companyId, provider: { $ne: 'cash' }, status: 'paid' } }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
        Property_1.Property.findOne({ companyId }).sort({ createdAt: -1 }).select('createdAt name').lean(),
        Tenant_1.Tenant.findOne({ companyId }).sort({ createdAt: -1 }).select('createdAt firstName lastName').lean(),
        Lease_1.Lease.findOne({ companyId }).sort({ createdAt: -1 }).select('createdAt').lean(),
        User_1.User.findOne({ companyId, lastLogin: { $exists: true } }).sort({ lastLogin: -1 }).select('lastLogin email').lean()
    ]);
    const outstanding = yield PlatformInvoice_1.PlatformInvoice.aggregate([{ $match: { companyId, status: { $in: ['Issued', 'Overdue'] } } }, { $group: { _id: null, total: { $sum: '$amount' } } }]);
    res.json({
        data: {
            companyDetails: {
                companyId: String(company._id),
                companyName: company.name,
                tradingName: company.tradingName,
                registrationNumber: company.registrationNumber,
                address: company.address,
                phone: company.phone,
                email: company.email,
                country: company.country,
                defaultCurrency: company.defaultCurrency || ((_a = company.workspacePreferences) === null || _a === void 0 ? void 0 : _a.currency) || 'USD'
            },
            subscription: subscription ? {
                plan: subscription.plan,
                billingCycle: subscription.cycle,
                status: subscription.status,
                startDate: subscription.currentPeriodStart || subscription.trialStartDate,
                renewalDate: subscription.nextPaymentAt,
                expiryDate: subscription.currentPeriodEnd || subscription.trialEndDate
            } : null,
            usage: { propertyCount: usage.properties, tenantCount: usage.tenants, leaseCount: usage.leases, userCount: usage.users, storageUsed: company.storageUsedBytes || 0 },
            financials: {
                lifetimeRevenue: ((_b = financials[0]) === null || _b === void 0 ? void 0 : _b.lifetime) || 0,
                outstandingBalance: ((_c = outstanding[0]) === null || _c === void 0 ? void 0 : _c.total) || 0,
                cashPayments: ((_d = cashPayments[0]) === null || _d === void 0 ? void 0 : _d.total) || 0,
                onlinePayments: ((_e = onlinePayments[0]) === null || _e === void 0 ? void 0 : _e.total) || 0
            },
            activity: {
                lastLogin: (lastLogin === null || lastLogin === void 0 ? void 0 : lastLogin.lastLogin) || null,
                lastPropertyAdded: (lastProperty === null || lastProperty === void 0 ? void 0 : lastProperty.createdAt) || null,
                lastTenantAdded: (lastTenant === null || lastTenant === void 0 ? void 0 : lastTenant.createdAt) || null,
                lastLeaseCreated: (lastLease === null || lastLease === void 0 ? void 0 : lastLease.createdAt) || null
            }
        }
    });
});
exports.getCompanyProfile = getCompanyProfile;
const updateCompanyProfile = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    requireSystemAdmin(req);
    const companyId = asObjectId(req.params.id, 'company id');
    const allowed = ['name', 'tradingName', 'registrationNumber', 'address', 'phone', 'email', 'country', 'defaultCurrency', 'plan'];
    const update = {};
    for (const key of allowed)
        if (((_a = req.body) === null || _a === void 0 ? void 0 : _a[key]) !== undefined)
            update[key] = req.body[key];
    const company = yield Company_1.Company.findByIdAndUpdate(companyId, { $set: update }, { new: true });
    if (!company)
        throw new errorHandler_1.AppError('Company not found', 404);
    yield audit(req, 'Company Updated', 'Company', companyId, companyId, { update });
    res.json({ message: 'Company updated', data: company });
});
exports.updateCompanyProfile = updateCompanyProfile;
const setCompanyStatus = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    requireSystemAdmin(req);
    const companyId = asObjectId(req.params.id, 'company id');
    const action = req.params.action;
    if (!['suspend', 'activate'].includes(action))
        throw new errorHandler_1.AppError('Invalid company action', 400);
    const active = action === 'activate';
    const company = yield Company_1.Company.findByIdAndUpdate(companyId, { $set: { tenantStatus: active ? 'active' : 'suspended', onboardingStatus: active ? 'ACTIVE' : 'SUSPENDED', subscriptionStatus: active ? 'active' : 'suspended', isActive: active } }, { new: true });
    if (!company)
        throw new errorHandler_1.AppError('Company not found', 404);
    yield Subscription_1.Subscription.updateMany({ companyId }, active ? { $set: { status: 'active' }, $unset: { suspendedAt: '', suspensionReason: '' } } : { $set: { status: 'suspended', suspendedAt: new Date(), suspensionReason: ((_a = req.body) === null || _a === void 0 ? void 0 : _a.reason) || 'System admin action' } });
    yield audit(req, active ? 'Company Activated' : 'Company Suspended', 'Company', companyId, companyId, { reason: (_b = req.body) === null || _b === void 0 ? void 0 : _b.reason });
    res.json({ message: active ? 'Company activated' : 'Company suspended', data: company });
});
exports.setCompanyStatus = setCompanyStatus;
const listCashPayments = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    requireSystemAdmin(req);
    const { page, limit, skip } = pagination(req);
    const q = {};
    if (req.query.companyId)
        q.companyId = asObjectId(req.query.companyId, 'company id');
    if (req.query.status)
        q.status = String(req.query.status);
    if (req.query.method)
        q.method = String(req.query.method);
    const [items, total] = yield Promise.all([
        CashPayment_1.CashPayment.find(q).sort({ submittedAt: -1 }).skip(skip).limit(limit).populate('companyId', 'name email').lean(),
        CashPayment_1.CashPayment.countDocuments(q)
    ]);
    res.json({ data: items, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
});
exports.listCashPayments = listCashPayments;
const createCashPayment = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    requireSystemAdmin(req);
    const { companyId, amount, currency, method, referenceNumber, proofOfPayment, notes, plan, billingCycle } = req.body || {};
    if (!companyId)
        throw new errorHandler_1.AppError('companyId is required', 400);
    if (!PLAN_CODES.includes(plan))
        throw new errorHandler_1.AppError('Valid plan is required', 400);
    if (!CASH_METHODS.includes(method))
        throw new errorHandler_1.AppError('Valid payment method is required', 400);
    const doc = yield CashPayment_1.CashPayment.create({
        companyId: asObjectId(companyId, 'company id'),
        amount: Number(amount || 0),
        currency: currency || 'USD',
        method,
        referenceNumber,
        proofOfPayment,
        status: 'Pending',
        submittedBy: actorId(req),
        submittedAt: new Date(),
        notes,
        plan,
        billingCycle: billingCycle || 'monthly'
    });
    yield audit(req, 'Cash Payment Created', 'CashPayment', doc._id, companyId, { amount, method });
    res.status(201).json({ message: 'Cash payment submitted', data: doc });
});
exports.createCashPayment = createCashPayment;
const reviewCashPayment = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d, _e;
    requireSystemAdmin(req);
    const id = asObjectId(req.params.id, 'cash payment id');
    const action = req.params.action;
    const cashPayment = yield CashPayment_1.CashPayment.findById(id);
    if (!cashPayment)
        throw new errorHandler_1.AppError('Cash payment not found', 404);
    if (action === 'reject') {
        cashPayment.status = 'Rejected';
        cashPayment.rejectedAt = new Date();
        cashPayment.adminNotes = (_a = req.body) === null || _a === void 0 ? void 0 : _a.notes;
        yield cashPayment.save();
        yield audit(req, 'Payment Rejected', 'CashPayment', id, cashPayment.companyId, { notes: (_b = req.body) === null || _b === void 0 ? void 0 : _b.notes });
        return res.json({ message: 'Cash payment rejected', data: cashPayment });
    }
    if (action === 'request-info') {
        cashPayment.status = 'More Info Requested';
        cashPayment.moreInfoRequestedAt = new Date();
        cashPayment.adminNotes = (_c = req.body) === null || _c === void 0 ? void 0 : _c.notes;
        yield cashPayment.save();
        yield audit(req, 'Payment More Info Requested', 'CashPayment', id, cashPayment.companyId, { notes: (_d = req.body) === null || _d === void 0 ? void 0 : _d.notes });
        return res.json({ message: 'More information requested', data: cashPayment });
    }
    if (action !== 'approve')
        throw new errorHandler_1.AppError('Invalid payment review action', 400);
    const plan = yield (0, systemPlanService_1.getPlanConfig)(cashPayment.plan);
    const providerRef = cashPayment.referenceNumber || `CASH-${cashPayment._id.toString()}`;
    const subscription = yield Subscription_1.Subscription.findOneAndUpdate({ companyId: cashPayment.companyId }, { $setOnInsert: { companyId: cashPayment.companyId, plan: cashPayment.plan, cycle: cashPayment.billingCycle, status: 'past_due' } }, { upsert: true, new: true });
    const billingPayment = yield BillingPayment_1.BillingPayment.findOneAndUpdate({ provider: 'cash', providerRef }, {
        $setOnInsert: {
            companyId: cashPayment.companyId,
            subscriptionId: subscription._id,
            plan: cashPayment.plan,
            cycle: cashPayment.billingCycle,
            amount: cashPayment.amount,
            currency: cashPayment.currency === 'ZWL' ? 'ZWL' : 'USD',
            method: 'voucher',
            provider: 'cash',
            providerRef,
            status: 'pending'
        }
    }, { upsert: true, new: true });
    const paymentSession = yield PaymentSession_1.PaymentSession.findOneAndUpdate({ idempotencyKey: `cash-payment:${cashPayment._id}` }, {
        $setOnInsert: {
            companyId: cashPayment.companyId,
            subscriptionId: subscription._id,
            billingPaymentId: billingPayment._id,
            idempotencyKey: `cash-payment:${cashPayment._id}`,
            provider: 'cash',
            providerRef,
            plan: cashPayment.plan,
            billingCycle: cashPayment.billingCycle,
            amount: cashPayment.amount,
            currency: cashPayment.currency === 'ZWL' ? 'ZWL' : 'USD',
            status: 'pending',
            metadata: { cashPaymentId: cashPayment._id, method: cashPayment.method }
        }
    }, { upsert: true, new: true });
    yield (0, billingActivationService_1.activateSubscriptionFromPayment)({ paymentSessionId: paymentSession._id.toString(), provider: 'cash', providerRef, rawProviderResponse: { cashPaymentId: cashPayment._id }, paidAt: new Date() });
    yield Company_1.Company.findByIdAndUpdate(cashPayment.companyId, {
        $set: {
            plan: cashPayment.plan,
            propertyLimit: plan.propertyLimit,
            featureFlags: plan.featureFlags,
            subscriptionStatus: 'active',
            tenantStatus: 'active',
            isActive: true
        }
    });
    cashPayment.status = 'Approved';
    cashPayment.approvedAt = new Date();
    cashPayment.approvedBy = actorId(req);
    cashPayment.subscriptionId = subscription._id;
    cashPayment.billingPaymentId = billingPayment._id;
    cashPayment.paymentSessionId = paymentSession._id;
    cashPayment.adminNotes = (_e = req.body) === null || _e === void 0 ? void 0 : _e.notes;
    yield cashPayment.save();
    yield audit(req, 'Payment Approved', 'CashPayment', id, cashPayment.companyId, { amount: cashPayment.amount, method: cashPayment.method });
    res.json({ message: 'Cash payment approved and subscription activated', data: cashPayment });
});
exports.reviewCashPayment = reviewCashPayment;
const listPlans = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    requireSystemAdmin(req);
    yield (0, systemPlanService_1.seedDefaultPlans)();
    const data = yield Plan_1.Plan.find({}).sort({ monthlyPrice: 1 }).lean();
    res.json({ data });
});
exports.listPlans = listPlans;
const upsertPlan = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    requireSystemAdmin(req);
    const code = String(req.params.code || ((_a = req.body) === null || _a === void 0 ? void 0 : _a.code) || '').toUpperCase();
    if (!PLAN_CODES.includes(code))
        throw new errorHandler_1.AppError('Invalid plan code', 400);
    const body = req.body || {};
    const data = yield Plan_1.Plan.findOneAndUpdate({ code }, {
        $set: {
            name: body.name || code,
            description: body.description,
            monthlyPrice: Number(body.monthlyPrice || 0),
            annualPrice: Number(body.annualPrice || 0),
            currency: body.currency || 'USD',
            limits: body.limits || {},
            featureFlags: body.featureFlags || {},
            isActive: body.isActive !== false,
            updatedBy: actorId(req)
        },
        $setOnInsert: { code, createdBy: actorId(req) }
    }, { upsert: true, new: true });
    yield audit(req, 'Plan Updated', 'Plan', data._id, undefined, { code });
    res.json({ message: 'Plan saved', data });
});
exports.upsertPlan = upsertPlan;
const listPlatformInvoices = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    requireSystemAdmin(req);
    const { page, limit, skip } = pagination(req);
    const q = {};
    if (req.query.companyId)
        q.companyId = asObjectId(req.query.companyId, 'company id');
    if (req.query.status)
        q.status = String(req.query.status);
    const [items, total] = yield Promise.all([
        PlatformInvoice_1.PlatformInvoice.find(q).sort({ createdAt: -1 }).skip(skip).limit(limit).populate('companyId', 'name email').lean(),
        PlatformInvoice_1.PlatformInvoice.countDocuments(q)
    ]);
    res.json({ data: items, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
});
exports.listPlatformInvoices = listPlatformInvoices;
const generatePlatformInvoice = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    requireSystemAdmin(req);
    const { companyId, plan, billingCycle, amount, currency, dueDate, status, notes } = req.body || {};
    if (!companyId)
        throw new errorHandler_1.AppError('companyId is required', 400);
    if (!PLAN_CODES.includes(plan))
        throw new errorHandler_1.AppError('Valid plan is required', 400);
    const companyObjectId = asObjectId(companyId, 'company id');
    const planConfig = yield (0, systemPlanService_1.getPlanConfig)(plan);
    const issueDate = new Date();
    const invoice = yield PlatformInvoice_1.PlatformInvoice.create({
        invoiceNumber: `INV-${issueDate.getFullYear()}${String(issueDate.getMonth() + 1).padStart(2, '0')}-${Date.now().toString().slice(-6)}`,
        companyId: companyObjectId,
        plan,
        subscriptionId: (_a = (yield Subscription_1.Subscription.findOne({ companyId: companyObjectId }).select('_id').lean())) === null || _a === void 0 ? void 0 : _a._id,
        amount: amount !== undefined ? Number(amount) : (billingCycle === 'yearly' ? planConfig.annualPrice : planConfig.monthlyPrice),
        currency: currency || 'USD',
        issueDate,
        dueDate: dueDate ? new Date(dueDate) : daysFromNow(14),
        status: status || 'Issued',
        billingCycle: billingCycle || 'monthly',
        notes,
        createdBy: actorId(req)
    });
    yield audit(req, 'Invoice Generated', 'PlatformInvoice', invoice._id, companyId, { amount: invoice.amount });
    res.status(201).json({ message: 'Invoice generated', data: invoice });
});
exports.generatePlatformInvoice = generatePlatformInvoice;
const updatePlatformInvoice = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    requireSystemAdmin(req);
    const invoice = yield PlatformInvoice_1.PlatformInvoice.findByIdAndUpdate(asObjectId(req.params.id, 'invoice id'), { $set: Object.assign(Object.assign({}, req.body), { updatedBy: actorId(req) }) }, { new: true });
    if (!invoice)
        throw new errorHandler_1.AppError('Invoice not found', 404);
    yield audit(req, 'Invoice Updated', 'PlatformInvoice', invoice._id, invoice.companyId, { status: invoice.status });
    res.json({ message: 'Invoice updated', data: invoice });
});
exports.updatePlatformInvoice = updatePlatformInvoice;
const downloadPlatformInvoicePdf = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    requireSystemAdmin(req);
    const invoice = yield PlatformInvoice_1.PlatformInvoice.findById(asObjectId(req.params.id, 'invoice id')).lean();
    if (!invoice)
        throw new errorHandler_1.AppError('Invoice not found', 404);
    const company = yield Company_1.Company.findById(invoice.companyId).lean();
    const pdf = yield buildInvoicePdfBuffer(invoice, company);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${invoice.invoiceNumber}.pdf"`);
    res.send(pdf);
});
exports.downloadPlatformInvoicePdf = downloadPlatformInvoicePdf;
const emailPlatformInvoice = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    requireSystemAdmin(req);
    const invoice = yield PlatformInvoice_1.PlatformInvoice.findById(asObjectId(req.params.id, 'invoice id'));
    if (!invoice)
        throw new errorHandler_1.AppError('Invoice not found', 404);
    const company = yield Company_1.Company.findById(invoice.companyId).lean();
    const to = ((_a = req.body) === null || _a === void 0 ? void 0 : _a.to) || (company === null || company === void 0 ? void 0 : company.email);
    if (!to)
        throw new errorHandler_1.AppError('Recipient email is required', 400);
    const pdf = yield buildInvoicePdfBuffer(invoice.toObject(), company);
    yield (0, emailService_1.sendMail)({
        to,
        subject: `Invoice ${invoice.invoiceNumber}`,
        html: `<p>Please find invoice <strong>${escapeHtml(invoice.invoiceNumber)}</strong> for ${escapeHtml(invoice.currency)} ${Number(invoice.amount).toFixed(2)}.</p>`,
        text: `Invoice ${invoice.invoiceNumber} for ${invoice.currency} ${Number(invoice.amount).toFixed(2)}.`,
        attachments: [{ filename: `${invoice.invoiceNumber}.pdf`, content: pdf, contentType: 'application/pdf' }]
    });
    invoice.sentAt = new Date();
    invoice.sentTo = to;
    yield invoice.save();
    yield audit(req, 'Invoice Emailed', 'PlatformInvoice', invoice._id, invoice.companyId, { to });
    res.json({ message: 'Invoice emailed', data: invoice });
});
exports.emailPlatformInvoice = emailPlatformInvoice;
const listEnhancedVouchers = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    requireSystemAdmin(req);
    const { page, limit, skip } = pagination(req);
    const q = {};
    if (req.query.companyId) {
        const companyId = String(req.query.companyId);
        q.$or = [{ 'metadata.intendedCompanyId': companyId }, { redeemedBy: asObjectId(companyId, 'company id') }];
    }
    if (req.query.status)
        q.status = String(req.query.status);
    const [items, total] = yield Promise.all([
        Voucher_1.Voucher.find(q).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
        Voucher_1.Voucher.countDocuments(q)
    ]);
    res.json({ data: items, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
});
exports.listEnhancedVouchers = listEnhancedVouchers;
const revokeVoucher = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    requireSystemAdmin(req);
    const voucher = yield Voucher_1.Voucher.findById(asObjectId(req.params.id, 'voucher id'));
    if (!voucher)
        throw new errorHandler_1.AppError('Voucher not found', 404);
    if (voucher.redeemedAt)
        throw new errorHandler_1.AppError('Redeemed vouchers cannot be revoked', 400);
    voucher.status = 'Cancelled';
    voucher.cancelledAt = new Date();
    voucher.cancelledBy = actorId(req);
    voucher.auditHistory = [...(voucher.auditHistory || []), { action: 'Revoked', userId: actorId(req), details: { reason: (_a = req.body) === null || _a === void 0 ? void 0 : _a.reason }, createdAt: new Date() }];
    yield voucher.save();
    yield audit(req, 'Voucher Revoked', 'Voucher', voucher._id, (_b = voucher.metadata) === null || _b === void 0 ? void 0 : _b.intendedCompanyId, { code: voucher.code });
    res.json({ message: 'Voucher revoked', data: voucher });
});
exports.revokeVoucher = revokeVoucher;
const extendVoucher = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    requireSystemAdmin(req);
    const voucher = yield Voucher_1.Voucher.findById(asObjectId(req.params.id, 'voucher id'));
    if (!voucher)
        throw new errorHandler_1.AppError('Voucher not found', 404);
    if (!((_a = req.body) === null || _a === void 0 ? void 0 : _a.validUntil))
        throw new errorHandler_1.AppError('validUntil is required', 400);
    voucher.validUntil = new Date(req.body.validUntil);
    if (voucher.status === 'Expired')
        voucher.status = 'Unused';
    voucher.auditHistory = [...(voucher.auditHistory || []), { action: 'Expiry Extended', userId: actorId(req), details: { validUntil: voucher.validUntil }, createdAt: new Date() }];
    yield voucher.save();
    yield audit(req, 'Voucher Expiry Extended', 'Voucher', voucher._id, (_b = voucher.metadata) === null || _b === void 0 ? void 0 : _b.intendedCompanyId, { code: voucher.code, validUntil: voucher.validUntil });
    res.json({ message: 'Voucher expiry extended', data: voucher });
});
exports.extendVoucher = extendVoucher;
const getVoucherHistory = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    requireSystemAdmin(req);
    const voucher = yield Voucher_1.Voucher.findById(asObjectId(req.params.id, 'voucher id')).select('code auditHistory createdAt redeemedAt redeemedBy metadata status validUntil').lean();
    if (!voucher)
        throw new errorHandler_1.AppError('Voucher not found', 404);
    res.json({ data: voucher });
});
exports.getVoucherHistory = getVoucherHistory;
const listAuditLogs = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    requireSystemAdmin(req);
    const { page, limit, skip } = pagination(req);
    const q = {};
    if (req.query.companyId)
        q.companyId = asObjectId(req.query.companyId, 'company id');
    if (req.query.userId)
        q.userId = asObjectId(req.query.userId, 'user id');
    if (req.query.action)
        q.action = new RegExp(String(req.query.action), 'i');
    if (req.query.from || req.query.to)
        q.createdAt = {};
    if (req.query.from)
        q.createdAt.$gte = new Date(String(req.query.from));
    if (req.query.to)
        q.createdAt.$lte = new Date(String(req.query.to));
    const [items, total] = yield Promise.all([
        AuditLog_1.AuditLog.find(q).sort({ createdAt: -1 }).skip(skip).limit(limit).populate('userId', 'email firstName lastName').populate('companyId', 'name email').lean(),
        AuditLog_1.AuditLog.countDocuments(q)
    ]);
    res.json({ data: items, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
});
exports.listAuditLogs = listAuditLogs;
const listSupportTickets = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    requireSystemAdmin(req);
    const { page, limit, skip } = pagination(req);
    const q = {};
    if (req.query.companyId)
        q.companyId = asObjectId(req.query.companyId, 'company id');
    if (req.query.status)
        q.status = String(req.query.status);
    if (req.query.priority)
        q.priority = String(req.query.priority);
    const [items, total] = yield Promise.all([
        SupportTicket_1.SupportTicket.find(q).sort({ createdAt: -1 }).skip(skip).limit(limit).populate('companyId', 'name email').lean(),
        SupportTicket_1.SupportTicket.countDocuments(q)
    ]);
    res.json({ data: items, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
});
exports.listSupportTickets = listSupportTickets;
const createSupportTicket = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    requireSystemAdmin(req);
    const { companyId, subject, description, priority } = req.body || {};
    if (!companyId || !subject || !description)
        throw new errorHandler_1.AppError('companyId, subject and description are required', 400);
    const ticket = yield SupportTicket_1.SupportTicket.create({ companyId: asObjectId(companyId, 'company id'), subject, description, priority: priority || 'Medium', status: 'Open', createdBy: actorId(req), lastActivityAt: new Date() });
    yield audit(req, 'Support Ticket Created', 'SupportTicket', ticket._id, companyId, { priority: ticket.priority });
    res.status(201).json({ message: 'Support ticket created', data: ticket });
});
exports.createSupportTicket = createSupportTicket;
const updateSupportTicket = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    requireSystemAdmin(req);
    const update = Object.assign(Object.assign({}, req.body), { lastActivityAt: new Date() });
    if (update.status === 'Resolved')
        update.resolvedAt = new Date();
    if (update.status === 'Closed')
        update.closedAt = new Date();
    const ticket = yield SupportTicket_1.SupportTicket.findByIdAndUpdate(asObjectId(req.params.id, 'ticket id'), { $set: update }, { new: true });
    if (!ticket)
        throw new errorHandler_1.AppError('Support ticket not found', 404);
    yield audit(req, 'Support Ticket Updated', 'SupportTicket', ticket._id, ticket.companyId, { status: ticket.status, priority: ticket.priority });
    res.json({ message: 'Support ticket updated', data: ticket });
});
exports.updateSupportTicket = updateSupportTicket;
const getRevenueAnalytics = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    requireSystemAdmin(req);
    const monthStart = startOfMonth();
    const paid = yield BillingPayment_1.BillingPayment.find({ status: 'paid' }).select('companyId plan amount provider createdAt').lean();
    const invoices = yield PlatformInvoice_1.PlatformInvoice.find({ status: { $in: ['Issued', 'Overdue'] } }).select('amount').lean();
    const activeSubs = yield Subscription_1.Subscription.find({ status: { $in: ['active', 'ACTIVE'] } }).select('plan cycle').lean();
    let mrr = 0;
    for (const sub of activeSubs) {
        const cfg = yield (0, systemPlanService_1.getPlanConfig)(sub.plan || 'INDIVIDUAL');
        mrr += sub.cycle === 'yearly' ? money(cfg.annualPrice) / 12 : money(cfg.monthlyPrice);
    }
    const byMonth = new Map();
    const byPlan = new Map();
    const byCompany = new Map();
    let cashRevenue = 0;
    let onlineRevenue = 0;
    for (const p of paid) {
        const d = new Date(p.createdAt);
        byMonth.set(monthKey(d), (byMonth.get(monthKey(d)) || 0) + money(p.amount));
        byPlan.set(p.plan || 'Unknown', (byPlan.get(p.plan || 'Unknown') || 0) + money(p.amount));
        byCompany.set(String(p.companyId), (byCompany.get(String(p.companyId)) || 0) + money(p.amount));
        if (new Date(p.createdAt) >= monthStart) {
            if (p.provider === 'cash')
                cashRevenue += money(p.amount);
            else
                onlineRevenue += money(p.amount);
        }
    }
    const topCompanies = Array.from(byCompany.entries()).sort((a, b) => b[1] - a[1]).slice(0, 10);
    const companies = yield Company_1.Company.find({ _id: { $in: topCompanies.map(([id]) => asObjectId(id, 'company id')) } }).select('name').lean();
    const companyName = new Map(companies.map((c) => [String(c._id), c.name]));
    res.json({
        data: {
            metrics: {
                mrr,
                arr: mrr * 12,
                cashRevenue,
                onlineRevenue,
                outstandingRevenue: invoices.reduce((sum, i) => sum + money(i.amount), 0)
            },
            charts: {
                revenueByMonth: Array.from(byMonth.entries()).map(([month, revenue]) => ({ month, revenue })).sort((a, b) => a.month.localeCompare(b.month)),
                revenueByPlan: Array.from(byPlan.entries()).map(([plan, revenue]) => ({ plan, revenue })),
                revenueByCompany: topCompanies.map(([companyId, revenue]) => ({ companyId, company: companyName.get(companyId) || companyId, revenue })),
                revenueForecast: [{ month: monthKey(new Date()), revenue: mrr }, { month: monthKey(daysFromNow(30)), revenue: mrr }, { month: monthKey(daysFromNow(60)), revenue: mrr }]
            }
        }
    });
});
exports.getRevenueAnalytics = getRevenueAnalytics;
