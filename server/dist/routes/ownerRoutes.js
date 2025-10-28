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
const PropertyAccount_1 = __importDefault(require("../models/PropertyAccount"));
const PropertyOwner_1 = require("../models/PropertyOwner");
const ownerController_1 = require("../controllers/ownerController");
const mongoose_1 = __importDefault(require("mongoose"));
const Tenant_1 = require("../models/Tenant");
const Lease_1 = require("../models/Lease");
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
        // Get property accounts for this owner's properties from the accounting database
        console.log(`[Owner Financial Data] Querying PropertyAccount with propertyIds:`, ownerPropertyIds);
        // First, let's see if there are any PropertyAccount records at all
        const totalPropertyAccounts = yield PropertyAccount_1.default.countDocuments({});
        console.log(`[Owner Financial Data] Total PropertyAccount records in accounting database:`, totalPropertyAccounts);
        // Check all PropertyAccount records to see their structure
        const samplePropertyAccounts = yield PropertyAccount_1.default.find({}).limit(5);
        console.log(`[Owner Financial Data] Sample PropertyAccount records:`, samplePropertyAccounts);
        // Query PropertyAccount by propertyId (this is the correct way since PropertyAccount uses propertyId to link to properties)
        console.log(`[Owner Financial Data] Querying PropertyAccount with propertyIds:`, ownerPropertyIds);
        console.log(`[Owner Financial Data] PropertyAccount query: { propertyId: { $in: [${ownerPropertyIds.map((id) => `"${id}"`).join(', ')}] } }`);
        let propertyAccounts = yield PropertyAccount_1.default.find({
            propertyId: { $in: ownerPropertyIds }
        });
        console.log(`[Owner Financial Data] PropertyAccount query result by propertyId:`, propertyAccounts);
        console.log(`[Owner Financial Data] PropertyAccount records found:`, propertyAccounts.length);
        if (propertyAccounts.length > 0) {
            console.log(`[Owner Financial Data] PropertyAccount details:`, propertyAccounts.map(account => {
                var _a;
                return ({
                    propertyId: account.propertyId,
                    propertyName: account.propertyName,
                    totalIncome: account.totalIncome,
                    totalExpenses: account.totalExpenses,
                    runningBalance: account.runningBalance,
                    transactionsCount: ((_a = account.transactions) === null || _a === void 0 ? void 0 : _a.length) || 0
                });
            }));
        }
        else {
            console.log(`[Owner Financial Data] No PropertyAccount records found for the given property IDs`);
            // Let's also check what PropertyAccount records exist in the database
            const allPropertyAccounts = yield PropertyAccount_1.default.find({}).limit(5);
            console.log(`[Owner Financial Data] Sample PropertyAccount records in database:`, allPropertyAccounts.map(acc => ({
                propertyId: acc.propertyId,
                propertyName: acc.propertyName,
                totalIncome: acc.totalIncome
            })));
        }
        // If no property accounts found, try without the isActive filter
        if (!propertyAccounts || propertyAccounts.length === 0) {
            console.log(`[Owner Financial Data] No property accounts found by propertyId, trying without isActive filter`);
            propertyAccounts = yield PropertyAccount_1.default.find({
                propertyId: { $in: ownerPropertyIds }
            });
            console.log(`[Owner Financial Data] PropertyAccount query without isActive filter:`, propertyAccounts);
        }
        // If still no property accounts found, let's check if there are actual payments for these properties
        if (!propertyAccounts || propertyAccounts.length === 0) {
            console.log(`[Owner Financial Data] No property accounts found in accounting database for owner's properties`);
            // Check if there are actual payments for these properties
            const Payment = require('../models/Payment');
            // First check all payments to see what's in the database
            const allPayments = yield Payment.find({ companyId: req.user.companyId }).limit(10);
            console.log(`[Owner Financial Data] Sample payments in database:`, allPayments);
            const payments = yield Payment.find({
                propertyId: { $in: ownerPropertyIds },
                companyId: req.user.companyId
            }).populate('propertyId', 'name address');
            console.log(`[Owner Financial Data] Found ${payments.length} payments for owner's properties:`, payments);
            console.log(`[Owner Financial Data] Payment details:`, payments.map((p) => {
                var _a, _b, _c;
                return ({
                    id: p._id,
                    propertyId: (_a = p.propertyId) === null || _a === void 0 ? void 0 : _a._id,
                    propertyName: (_b = p.propertyId) === null || _b === void 0 ? void 0 : _b.name,
                    amount: p.amount,
                    paymentType: p.paymentType,
                    status: p.status,
                    ownerAmount: (_c = p.commissionDetails) === null || _c === void 0 ? void 0 : _c.ownerAmount
                });
            }));
            if (payments.length > 0) {
                // Create a temporary data structure from actual payment data
                const tempPropertyAccounts = [];
                const propertyPaymentMap = new Map();
                // Group payments by property
                payments.forEach((payment) => {
                    var _a;
                    const propertyId = payment.propertyId._id.toString();
                    if (!propertyPaymentMap.has(propertyId)) {
                        propertyPaymentMap.set(propertyId, {
                            propertyId: payment.propertyId._id,
                            propertyName: payment.propertyId.name,
                            propertyAddress: payment.propertyId.address,
                            payments: [],
                            totalIncome: 0,
                            totalExpenses: 0,
                            totalOwnerPayouts: 0,
                            runningBalance: 0
                        });
                    }
                    const propertyData = propertyPaymentMap.get(propertyId);
                    propertyData.payments.push(payment);
                    // Calculate totals based on payment data
                    if (payment.paymentType === 'rental' && payment.status === 'completed') {
                        const ownerAmount = ((_a = payment.commissionDetails) === null || _a === void 0 ? void 0 : _a.ownerAmount) || payment.amount || 0;
                        propertyData.totalIncome += ownerAmount;
                        propertyData.runningBalance += ownerAmount;
                    }
                });
                // Convert to the expected format
                propertyAccounts = Array.from(propertyPaymentMap.values()).map(propertyData => (Object.assign(Object.assign({}, propertyData), { transactions: propertyData.payments.map((payment) => {
                        var _a;
                        return ({
                            _id: payment._id,
                            type: payment.paymentType === 'rental' ? 'income' : 'other',
                            amount: ((_a = payment.commissionDetails) === null || _a === void 0 ? void 0 : _a.ownerAmount) || payment.amount || 0,
                            date: payment.paymentDate,
                            description: `Rental payment - ${payment.tenantName || 'Unknown Tenant'}`,
                            category: 'rental',
                            status: payment.status,
                            referenceNumber: payment.referenceNumber || payment._id.toString()
                        });
                    }), ownerPayouts: [] })));
                console.log(`[Owner Financial Data] Created temporary property accounts from payment data:`, propertyAccounts);
            }
        }
        if (!propertyAccounts || propertyAccounts.length === 0) {
            console.log(`[Owner Financial Data] No property accounts or payment data found for owner's properties`);
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
        console.log(`[Owner Financial Data] Found ${propertyAccounts.length} property accounts in accounting database`);
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
        propertyAccounts.forEach(account => {
            // Add to summary
            summary.totalIncome += account.totalIncome || 0;
            summary.totalExpenses += account.totalExpenses || 0;
            summary.totalOwnerPayouts += account.totalOwnerPayouts || 0;
            summary.runningBalance += account.runningBalance || 0;
            // Add property breakdown
            const propertyName = account.propertyName || 'Unknown Property';
            const propertyAddress = account.propertyAddress || 'No Address';
            propertyBreakdown.push({
                propertyId: account.propertyId,
                propertyName: propertyName,
                propertyAddress: propertyAddress,
                totalIncome: account.totalIncome || 0,
                totalExpenses: account.totalExpenses || 0,
                totalOwnerPayouts: account.totalOwnerPayouts || 0,
                runningBalance: account.runningBalance || 0,
                lastIncomeDate: account.lastIncomeDate,
                lastExpenseDate: account.lastExpenseDate,
                lastPayoutDate: account.lastPayoutDate
            });
            console.log(`[Owner Financial Data] Processing property: ${propertyName} (${propertyAddress})`);
            // Process transactions by month
            account.transactions.forEach((transaction) => {
                var _a;
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
                    date: transaction.date,
                    description: transaction.description,
                    category: transaction.category,
                    status: transaction.status,
                    propertyName: account.propertyName || ((_a = account.propertyId) === null || _a === void 0 ? void 0 : _a.name) || 'Unknown Property',
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
                    propertyName: account.propertyName || ((_a = account.propertyId) === null || _a === void 0 ? void 0 : _a.name) || 'Unknown Property',
                    referenceNumber: payout.referenceNumber
                });
            });
        });
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
