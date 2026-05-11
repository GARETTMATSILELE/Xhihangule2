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
const express_1 = __importDefault(require("express"));
const auth_1 = require("../middleware/auth");
const Property_1 = require("../models/Property");
const User_1 = require("../models/User");
const PropertyOwner_1 = require("../models/PropertyOwner");
const propertyAccountService_1 = __importDefault(require("../services/propertyAccountService"));
const ownerController_1 = require("../controllers/ownerController");
const mongoose_1 = __importDefault(require("mongoose"));
const Tenant_1 = require("../models/Tenant");
const Lease_1 = require("../models/Lease");
const Payment_1 = require("../models/Payment");
const router = express_1.default.Router();
console.log('OwnerRoutes: Registering owner routes...');
// Only protect property routes, not maintenance-requests
router.use('/properties', auth_1.propertyOwnerAuth);
router.use('/properties/:id', auth_1.propertyOwnerAuth);
// Property routes for owners
router.get('/properties', (req, res, next) => {
    console.log('OwnerRoutes: GET /properties route hit');
    next();
}, ownerController_1.getOwnerProperties);
router.get('/properties/:id', (req, res, next) => {
    console.log('OwnerRoutes: GET /properties/:id route hit');
    next();
}, ownerController_1.getOwnerPropertyById);
// Tenants for a property (owner only)
router.get('/properties/:id/tenants', auth_1.propertyOwnerAuth, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const { id } = req.params;
        if (!id || !mongoose_1.default.isValidObjectId(id)) {
            return res.status(400).json({ message: 'Invalid property ID' });
        }
        if (!((_a = req.user) === null || _a === void 0 ? void 0 : _a.userId)) {
            return res.status(401).json({ message: 'Authentication required' });
        }
        // Filter by company if present on token
        const tenantQuery = { propertyId: id };
        if (req.user.companyId) {
            tenantQuery.companyId = req.user.companyId;
        }
        const tenants = yield Tenant_1.Tenant.find(tenantQuery).select('firstName lastName email phone status propertyId companyId');
        if (!tenants || tenants.length === 0) {
            return res.json([]);
        }
        // Fetch leases for these tenants on this property, prefer active; otherwise latest by endDate
        const tenantIds = tenants.map(t => t._id);
        const leaseQuery = { propertyId: id, tenantId: { $in: tenantIds } };
        if (req.user.companyId) {
            leaseQuery.companyId = req.user.companyId;
        }
        const leases = yield Lease_1.Lease.find(leaseQuery)
            .select('startDate endDate status tenantId propertyId')
            .lean();
        const tenantIdToBestLease = new Map();
        for (const lease of leases) {
            const key = lease.tenantId.toString();
            const existing = tenantIdToBestLease.get(key);
            if (!existing) {
                tenantIdToBestLease.set(key, lease);
                continue;
            }
            const existingIsActive = existing.status === 'active';
            const leaseIsActive = lease.status === 'active';
            if (leaseIsActive && !existingIsActive) {
                tenantIdToBestLease.set(key, lease);
                continue;
            }
            if (leaseIsActive === existingIsActive) {
                const existingEnd = existing.endDate ? new Date(existing.endDate).getTime() : 0;
                const currentEnd = lease.endDate ? new Date(lease.endDate).getTime() : 0;
                if (currentEnd > existingEnd) {
                    tenantIdToBestLease.set(key, lease);
                }
            }
        }
        const response = tenants.map(t => {
            const tenantObj = t.toObject();
            const lease = tenantIdToBestLease.get(t._id.toString());
            return Object.assign(Object.assign({}, tenantObj), { leaseStartDate: (lease === null || lease === void 0 ? void 0 : lease.startDate) || null, leaseEndDate: (lease === null || lease === void 0 ? void 0 : lease.endDate) || null, leaseStatus: (lease === null || lease === void 0 ? void 0 : lease.status) || null, leaseId: (lease === null || lease === void 0 ? void 0 : lease._id) || null });
        });
        return res.json(response);
    }
    catch (err) {
        console.error('OwnerRoutes: Error fetching tenants for property', err);
        return res.status(500).json({ message: 'Error fetching tenants for property' });
    }
}));
// Net income route for owners (public)
router.get('/net-income', (req, res, next) => {
    console.log('OwnerRoutes: GET /net-income route hit');
    next();
}, ownerController_1.getOwnerNetIncome);
// Maintenance request routes for owners (public)
router.get('/maintenance-requests', (req, res, next) => {
    console.log('OwnerRoutes: GET /maintenance-requests route hit');
    next();
}, ownerController_1.getOwnerMaintenanceRequests);
router.get('/maintenance-requests/:id', (req, res, next) => {
    console.log('OwnerRoutes: GET /maintenance-requests/:id route hit');
    next();
}, ownerController_1.getOwnerMaintenanceRequestById);
router.patch('/maintenance-requests/:id', (req, res, next) => {
    console.log('OwnerRoutes: PATCH /maintenance-requests/:id route hit');
    next();
}, ownerController_1.updateOwnerMaintenanceRequest);
router.patch('/maintenance-requests/:id/approve', (req, res, next) => {
    console.log('OwnerRoutes: PATCH /maintenance-requests/:id/approve route hit');
    next();
}, ownerController_1.approveOwnerMaintenanceRequest);
router.patch('/maintenance-requests/:id/reject', (req, res, next) => {
    console.log('OwnerRoutes: PATCH /maintenance-requests/:id/reject route hit');
    next();
}, ownerController_1.rejectOwnerMaintenanceRequest);
router.post('/maintenance-requests/:id/messages', (req, res, next) => {
    console.log('OwnerRoutes: POST /maintenance-requests/:id/messages route hit');
    next();
}, ownerController_1.addOwnerMaintenanceMessage);
const resolveOwnerIncomeType = (rentalType) => {
    const normalized = String(rentalType || '').trim().toLowerCase();
    if (normalized === 'sale' || normalized === 'sales') {
        return { ledgerType: 'sale', incomeType: 'Sales Income' };
    }
    return { ledgerType: 'rental', incomeType: 'Rental Income' };
};
const normalizeNumericAmount = (value) => {
    if (typeof value === 'number') {
        return Number.isFinite(value) ? value : 0;
    }
    if (typeof value === 'string') {
        const cleaned = value.replace(/[^0-9.-]/g, '');
        const parsed = Number(cleaned);
        return Number.isFinite(parsed) ? parsed : 0;
    }
    if (value && typeof value === 'object' && typeof value.toString === 'function') {
        const parsed = Number(String(value.toString()).replace(/[^0-9.-]/g, ''));
        return Number.isFinite(parsed) ? parsed : 0;
    }
    return 0;
};
const getSortTimestamp = (value) => {
    const ts = new Date(value).getTime();
    return Number.isFinite(ts) ? ts : 0;
};
// Get owner financial data from accounting database
router.get('/financial-data', auth_1.propertyOwnerAuth, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        if (!((_a = req.user) === null || _a === void 0 ? void 0 : _a.userId)) {
            return res.status(401).json({ message: 'User ID not found' });
        }
        if (req.user.role !== 'owner') {
            return res.status(403).json({ message: 'Owner access required' });
        }
        const ownerId = req.user.userId;
        console.log(`[Owner Financial Data] Processing request for ownerId: ${ownerId}`);
        console.log(`[Owner Financial Data] Company ID: ${req.user.companyId}`);
        // Build owner context with robust fallbacks
        let propertyOwnerContext = yield PropertyOwner_1.PropertyOwner.findById(ownerId);
        if (!propertyOwnerContext) {
            // Fallback: try to match PropertyOwner by the user's email
            try {
                const ownerUser = yield User_1.User.findById(ownerId);
                if (ownerUser === null || ownerUser === void 0 ? void 0 : ownerUser.email) {
                    propertyOwnerContext = yield PropertyOwner_1.PropertyOwner.findOne({ email: ownerUser.email });
                    if (propertyOwnerContext) {
                        console.log('[Owner Financial Data] Matched PropertyOwner by email:', ownerUser.email);
                    }
                }
            }
            catch (lookupErr) {
                console.warn('[Owner Financial Data] PropertyOwner email lookup failed (non-fatal):', lookupErr);
            }
        }
        if (propertyOwnerContext) {
            console.log(`[Owner Financial Data] PropertyOwner context:`, {
                _id: propertyOwnerContext._id,
                companyId: propertyOwnerContext.companyId,
                propertiesCount: ((_b = propertyOwnerContext.properties) === null || _b === void 0 ? void 0 : _b.length) || 0,
                properties: propertyOwnerContext.properties
            });
        }
        else {
            console.log('[Owner Financial Data] PropertyOwner context not found after fallbacks. Using Property collection fallback.');
        }
        // Get the property IDs for this owner
        let ownerPropertyIds = [];
        if (propertyOwnerContext && propertyOwnerContext.properties && propertyOwnerContext.properties.length > 0) {
            ownerPropertyIds = propertyOwnerContext.properties;
            console.log(`[Owner Financial Data] Using properties from PropertyOwner context:`, ownerPropertyIds.length);
            console.log(`[Owner Financial Data] Property IDs:`, ownerPropertyIds);
        }
        else {
            console.log(`[Owner Financial Data] No properties in PropertyOwner context. Falling back to Property collection by ownerId: ${ownerId}`);
            const propQuery = { ownerId: ownerId };
            if (req.user.companyId) {
                propQuery.companyId = req.user.companyId;
            }
            const fallbackProps = yield Property_1.Property.find(propQuery).select('_id');
            ownerPropertyIds = fallbackProps.map((p) => p._id);
            console.log('[Owner Financial Data] Fallback properties found:', ownerPropertyIds.length);
        }
        if (!ownerPropertyIds || ownerPropertyIds.length === 0) {
            console.log(`[Owner Financial Data] No properties found for ownerId: ${ownerId}`);
            return res.json({
                success: true,
                data: {
                    properties: [],
                    summary: {
                        totalIncome: 0,
                        totalExpenses: 0,
                        totalOwnerPayouts: 0,
                        runningBalance: 0,
                        totalProperties: 0
                    },
                    recentTransactions: [],
                    monthlyData: [],
                    propertyBreakdown: []
                }
            });
        }
        if (ownerPropertyIds.length === 0) {
            console.log(`[Owner Financial Data] No properties found for ownerId: ${ownerId}`);
            return res.json({
                success: true,
                data: {
                    properties: [],
                    summary: {
                        totalIncome: 0,
                        totalExpenses: 0,
                        totalOwnerPayouts: 0,
                        runningBalance: 0,
                        totalProperties: 0
                    },
                    recentTransactions: [],
                    monthlyData: [],
                    propertyBreakdown: []
                }
            });
        }
        console.log(`[Owner Financial Data] Final property IDs to query:`, ownerPropertyIds);
        const ownerProperties = yield Property_1.Property.find(Object.assign({ _id: { $in: ownerPropertyIds } }, (req.user.companyId ? { companyId: req.user.companyId } : {}))).select('_id name address rentalType');
        if (!ownerProperties || ownerProperties.length === 0) {
            return res.json({
                success: true,
                data: {
                    properties: [],
                    summary: {
                        totalIncome: 0,
                        totalExpenses: 0,
                        totalOwnerPayouts: 0,
                        runningBalance: 0,
                        totalProperties: 0
                    },
                    recentTransactions: [],
                    monthlyData: [],
                    propertyBreakdown: []
                }
            });
        }
        const propertyAccounts = yield Promise.all(ownerProperties.map((property) => __awaiter(void 0, void 0, void 0, function* () {
            const propertyId = String(property._id);
            const { ledgerType, incomeType } = resolveOwnerIncomeType(property.rentalType);
            try {
                const account = yield propertyAccountService_1.default.getPropertyAccount(propertyId, ledgerType);
                return Object.assign(Object.assign({}, (typeof (account === null || account === void 0 ? void 0 : account.toObject) === 'function' ? account.toObject() : account)), { propertyId: (account === null || account === void 0 ? void 0 : account.propertyId) || property._id, propertyName: (account === null || account === void 0 ? void 0 : account.propertyName) || property.name || 'Unknown Property', propertyAddress: (account === null || account === void 0 ? void 0 : account.propertyAddress) || property.address || 'No Address', ledgerType,
                    incomeType });
            }
            catch (accountErr) {
                console.warn(`[Owner Financial Data] Could not load account for property ${propertyId} (${ledgerType})`, (accountErr === null || accountErr === void 0 ? void 0 : accountErr.message) || accountErr);
                return {
                    propertyId: property._id,
                    propertyName: property.name || 'Unknown Property',
                    propertyAddress: property.address || 'No Address',
                    totalIncome: 0,
                    totalExpenses: 0,
                    totalOwnerPayouts: 0,
                    runningBalance: 0,
                    lastIncomeDate: null,
                    lastExpenseDate: null,
                    lastPayoutDate: null,
                    transactions: [],
                    ownerPayouts: [],
                    ledgerType,
                    incomeType
                };
            }
        })));
        // Calculate summary statistics
        const summary = {
            totalIncome: 0,
            totalExpenses: 0,
            totalOwnerPayouts: 0,
            runningBalance: 0,
            totalProperties: propertyAccounts.length
        };
        // Collect all transactions and organize by month
        const monthlyData = {};
        const allTransactions = [];
        const propertyBreakdown = [];
        for (const account of propertyAccounts) {
            // Add to summary
            summary.totalIncome += account.totalIncome || 0;
            summary.totalExpenses += account.totalExpenses || 0;
            summary.totalOwnerPayouts += account.totalOwnerPayouts || 0;
            summary.runningBalance += account.runningBalance || 0;
            const incomeTransactions = Array.isArray(account.transactions)
                ? account.transactions.filter((transaction) => String((transaction === null || transaction === void 0 ? void 0 : transaction.type) || '').toLowerCase() === 'income')
                : [];
            const paymentIds = Array.isArray(incomeTransactions)
                ? incomeTransactions
                    .map((transaction) => String((transaction === null || transaction === void 0 ? void 0 : transaction.paymentId) || '').trim())
                    .filter((id) => Boolean(id && mongoose_1.default.isValidObjectId(id)))
                : [];
            const paymentRefs = Array.isArray(incomeTransactions)
                ? incomeTransactions
                    .map((transaction) => String((transaction === null || transaction === void 0 ? void 0 : transaction.referenceNumber) || '').trim())
                    .filter((ref) => Boolean(ref))
                : [];
            const uniquePaymentIds = Array.from(new Set(paymentIds));
            const uniquePaymentRefs = Array.from(new Set(paymentRefs));
            let paymentById = new Map();
            let paymentByReference = new Map();
            if (uniquePaymentIds.length > 0 || uniquePaymentRefs.length > 0) {
                try {
                    const paymentQuery = Object.assign({ $or: [
                            ...(uniquePaymentIds.length > 0 ? [{ _id: { $in: uniquePaymentIds } }] : []),
                            ...(uniquePaymentRefs.length > 0 ? [{ referenceNumber: { $in: uniquePaymentRefs } }] : [])
                        ] }, (req.user.companyId ? { companyId: req.user.companyId } : {}));
                    const payments = yield Payment_1.Payment.find(paymentQuery)
                        .select('_id amount commissionDetails.totalCommission')
                        .lean();
                    paymentById = new Map();
                    paymentByReference = new Map();
                    payments.forEach((payment) => {
                        var _a;
                        const normalized = {
                            receiptAmount: normalizeNumericAmount(payment === null || payment === void 0 ? void 0 : payment.amount),
                            commissionAmount: normalizeNumericAmount((_a = payment === null || payment === void 0 ? void 0 : payment.commissionDetails) === null || _a === void 0 ? void 0 : _a.totalCommission)
                        };
                        paymentById.set(String(payment._id), normalized);
                        if (payment === null || payment === void 0 ? void 0 : payment.referenceNumber) {
                            paymentByReference.set(String(payment.referenceNumber), normalized);
                        }
                    });
                }
                catch (paymentLookupError) {
                    console.warn('[Owner Financial Data] Failed to resolve receipt totals for account transactions:', (paymentLookupError === null || paymentLookupError === void 0 ? void 0 : paymentLookupError.message) || paymentLookupError);
                }
            }
            const resolvePaymentInfo = (transaction) => paymentById.get(String((transaction === null || transaction === void 0 ? void 0 : transaction.paymentId) || '')) ||
                paymentByReference.get(String((transaction === null || transaction === void 0 ? void 0 : transaction.referenceNumber) || ''));
            const propertyTransactionsRaw = [
                ...(Array.isArray(account.transactions) ? account.transactions.map((transaction) => {
                    var _a;
                    return (Object.assign(Object.assign({}, (() => {
                        var _a, _b;
                        const paymentInfo = resolvePaymentInfo(transaction);
                        const normalizedType = String((transaction === null || transaction === void 0 ? void 0 : transaction.type) || '').toLowerCase();
                        const isIncome = normalizedType === 'income';
                        return {
                            // Rent must come from Payment.amount in property management DB.
                            // For non-income entries, keep amount-aligned fallback for completeness.
                            receiptAmount: (_a = paymentInfo === null || paymentInfo === void 0 ? void 0 : paymentInfo.receiptAmount) !== null && _a !== void 0 ? _a : (isIncome ? 0 : normalizeNumericAmount(transaction === null || transaction === void 0 ? void 0 : transaction.amount)),
                            commissionAmount: (_b = paymentInfo === null || paymentInfo === void 0 ? void 0 : paymentInfo.commissionAmount) !== null && _b !== void 0 ? _b : 0
                        };
                    })()), { id: transaction._id, type: transaction.type, amount: transaction.amount, date: transaction.date, createdAt: transaction.createdAt, updatedAt: transaction.updatedAt, description: transaction.description, category: transaction.category, status: transaction.status, ledgerType: account.ledgerType, incomeType: account.incomeType, propertyName: account.propertyName || ((_a = account.propertyId) === null || _a === void 0 ? void 0 : _a.name) || 'Unknown Property', referenceNumber: transaction.referenceNumber }));
                }) : []),
                ...(Array.isArray(account.ownerPayouts) ? account.ownerPayouts.map((payout) => {
                    var _a;
                    return ({
                        id: payout._id,
                        type: 'owner_payout',
                        amount: payout.amount,
                        date: payout.date,
                        createdAt: payout.createdAt,
                        updatedAt: payout.updatedAt,
                        description: payout.notes || 'Owner payout',
                        category: 'owner_payout',
                        status: payout.status,
                        ledgerType: account.ledgerType,
                        incomeType: account.incomeType,
                        propertyName: account.propertyName || ((_a = account.propertyId) === null || _a === void 0 ? void 0 : _a.name) || 'Unknown Property',
                        referenceNumber: payout.referenceNumber
                    });
                }) : [])
            ];
            const propertyTransactions = propertyTransactionsRaw
                .sort((a, b) => {
                const byDate = getSortTimestamp(a.date) - getSortTimestamp(b.date);
                if (byDate !== 0)
                    return byDate;
                const byCreated = getSortTimestamp(a.createdAt || a.updatedAt) - getSortTimestamp(b.createdAt || b.updatedAt);
                if (byCreated !== 0)
                    return byCreated;
                return String(a.id || '').localeCompare(String(b.id || ''));
            })
                .reduce((accum, transaction) => {
                const prev = accum.length > 0 ? Number(accum[accum.length - 1].runningBalance || 0) : 0;
                const amount = normalizeNumericAmount(transaction.amount);
                const normalizedStatus = String(transaction.status || '').trim().toLowerCase();
                const normalizedType = String(transaction.type || '').trim().toLowerCase();
                const affectsBalance = normalizedStatus === 'completed';
                const delta = affectsBalance ? (normalizedType === 'income' ? amount : -amount) : 0;
                const runningBalance = Math.round((prev + delta) * 100) / 100;
                accum.push(Object.assign(Object.assign({}, transaction), { amount, receiptAmount: normalizeNumericAmount(transaction.receiptAmount), commissionAmount: normalizeNumericAmount(transaction.commissionAmount), runningBalance }));
                return accum;
            }, [])
                .sort((a, b) => {
                const byDate = getSortTimestamp(b.date) - getSortTimestamp(a.date);
                if (byDate !== 0)
                    return byDate;
                const byCreated = getSortTimestamp(b.createdAt || b.updatedAt) - getSortTimestamp(a.createdAt || a.updatedAt);
                if (byCreated !== 0)
                    return byCreated;
                return String(b.id || '').localeCompare(String(a.id || ''));
            });
            // Add property breakdown
            const propertyName = account.propertyName || 'Unknown Property';
            const propertyAddress = account.propertyAddress || 'No Address';
            propertyBreakdown.push({
                propertyId: account.propertyId,
                propertyName: propertyName,
                propertyAddress: propertyAddress,
                ledgerType: account.ledgerType,
                incomeType: account.incomeType,
                totalIncome: account.totalIncome || 0,
                totalRentPaid: propertyTransactions
                    .filter((transaction) => String((transaction === null || transaction === void 0 ? void 0 : transaction.type) || '').toLowerCase() === 'income')
                    .reduce((sum, transaction) => sum + normalizeNumericAmount(transaction === null || transaction === void 0 ? void 0 : transaction.receiptAmount), 0),
                totalCommission: propertyTransactions
                    .filter((transaction) => String((transaction === null || transaction === void 0 ? void 0 : transaction.type) || '').toLowerCase() === 'income')
                    .reduce((sum, transaction) => sum + normalizeNumericAmount(transaction === null || transaction === void 0 ? void 0 : transaction.commissionAmount), 0),
                totalExpenses: account.totalExpenses || 0,
                totalOwnerPayouts: account.totalOwnerPayouts || 0,
                runningBalance: account.runningBalance || 0,
                netIncome: (account.totalIncome || 0) - (account.totalExpenses || 0) - (account.totalOwnerPayouts || 0),
                lastIncomeDate: account.lastIncomeDate,
                lastExpenseDate: account.lastExpenseDate,
                lastPayoutDate: account.lastPayoutDate,
                transactions: propertyTransactions,
                recentTransactions: propertyTransactions.slice(0, 20)
            });
            console.log(`[Owner Financial Data] Processing property: ${propertyName} (${propertyAddress})`);
            // Process transactions by month
            account.transactions.forEach((transaction) => {
                var _a, _b, _c;
                const transactionDate = new Date(transaction.date);
                const monthKey = `${transactionDate.getFullYear()}-${String(transactionDate.getMonth() + 1).padStart(2, '0')}`;
                if (!monthlyData[monthKey]) {
                    monthlyData[monthKey] = { income: 0, expenses: 0, payouts: 0 };
                }
                if (transaction.type === 'income') {
                    monthlyData[monthKey].income += transaction.amount || 0;
                }
                else if (transaction.type === 'owner_payout') {
                    monthlyData[monthKey].payouts += transaction.amount || 0;
                }
                else {
                    monthlyData[monthKey].expenses += transaction.amount || 0;
                }
                // Add to all transactions for recent transactions list
                allTransactions.push({
                    id: transaction._id,
                    type: transaction.type,
                    amount: transaction.amount,
                    receiptAmount: normalizeNumericAmount((_a = resolvePaymentInfo(transaction)) === null || _a === void 0 ? void 0 : _a.receiptAmount),
                    commissionAmount: normalizeNumericAmount((_b = resolvePaymentInfo(transaction)) === null || _b === void 0 ? void 0 : _b.commissionAmount),
                    date: transaction.date,
                    description: transaction.description,
                    category: transaction.category,
                    status: transaction.status,
                    ledgerType: account.ledgerType,
                    incomeType: account.incomeType,
                    propertyName: account.propertyName || ((_c = account.propertyId) === null || _c === void 0 ? void 0 : _c.name) || 'Unknown Property',
                    referenceNumber: transaction.referenceNumber
                });
            });
            // Process owner payouts by month and include in recent transactions
            account.ownerPayouts.forEach((payout) => {
                var _a;
                const payoutDate = new Date(payout.date);
                const monthKey = `${payoutDate.getFullYear()}-${String(payoutDate.getMonth() + 1).padStart(2, '0')}`;
                if (!monthlyData[monthKey]) {
                    monthlyData[monthKey] = { income: 0, expenses: 0, payouts: 0 };
                }
                monthlyData[monthKey].payouts += payout.amount || 0;
                // Add owner payout to recent transactions so frontend filters can include them
                allTransactions.push({
                    id: payout._id,
                    type: 'owner_payout',
                    amount: payout.amount,
                    date: payout.date,
                    description: payout.notes || 'Owner payout',
                    category: 'owner_payout',
                    status: payout.status,
                    ledgerType: account.ledgerType,
                    incomeType: account.incomeType,
                    propertyName: account.propertyName || ((_a = account.propertyId) === null || _a === void 0 ? void 0 : _a.name) || 'Unknown Property',
                    referenceNumber: payout.referenceNumber
                });
            });
        }
        // Convert monthly data to chart format and sort by date
        const monthlyChartData = Object.entries(monthlyData)
            .map(([month, data]) => ({
            month,
            income: Math.round(data.income * 100) / 100,
            expenses: Math.round(data.expenses * 100) / 100,
            payouts: Math.round(data.payouts * 100) / 100,
            netIncome: Math.round((data.income - data.expenses - data.payouts) * 100) / 100
        }))
            .sort((a, b) => a.month.localeCompare(b.month))
            .slice(-12); // Last 12 months
        // Sort transactions by date (most recent first) and limit to 20
        const recentTransactions = allTransactions
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
            .slice(0, 20);
        const responseData = {
            success: true,
            data: {
                properties: propertyBreakdown,
                summary: {
                    totalIncome: Math.round(summary.totalIncome * 100) / 100,
                    totalExpenses: Math.round(summary.totalExpenses * 100) / 100,
                    totalOwnerPayouts: Math.round(summary.totalOwnerPayouts * 100) / 100,
                    runningBalance: Math.round(summary.runningBalance * 100) / 100,
                    totalProperties: summary.totalProperties
                },
                recentTransactions,
                monthlyData: monthlyChartData,
                propertyBreakdown
            }
        };
        console.log(`[Owner Financial Data] Response summary:`, {
            totalProperties: summary.totalProperties,
            totalIncome: responseData.data.summary.totalIncome,
            totalExpenses: responseData.data.summary.totalExpenses,
            totalOwnerPayouts: responseData.data.summary.totalOwnerPayouts,
            runningBalance: responseData.data.summary.runningBalance,
            transactionsCount: recentTransactions.length,
            monthlyDataPoints: monthlyChartData.length
        });
        res.json(responseData);
    }
    catch (error) {
        console.error('Error fetching owner financial data:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching financial data',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
}));
console.log('OwnerRoutes: All owner routes registered');
exports.default = router;
