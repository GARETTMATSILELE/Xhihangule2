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
const propertyAccountService_1 = __importDefault(require("../services/propertyAccountService"));
const PropertyOwner_1 = require("../models/PropertyOwner");
const SalesOwner_1 = require("../models/SalesOwner");
const router = express_1.default.Router();
// Debug middleware to log all requests
router.use((req, res, next) => {
    console.log(`[Report Routes] ${req.method} ${req.path}`);
    console.log('Request headers:', req.headers);
    console.log('Request query:', req.query);
    console.log('Request body:', req.body);
    next();
});
// Health check for report routes
router.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        service: 'report-routes',
        timestamp: new Date().toISOString()
    });
});
// Owner Statement Report
router.get('/owner-statement', auth_1.auth, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d, _e;
    try {
        const companyId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.companyId;
        if (!companyId) {
            return res.status(400).json({ message: 'Company ID is required' });
        }
        // Optional period filter: 'YYYY-MM'. Defaults to current month.
        const periodParam = req.query.period || '';
        const now = new Date();
        const [yearStr, monthStr] = periodParam.split('-');
        const year = yearStr ? parseInt(yearStr, 10) : now.getUTCFullYear();
        const month = monthStr ? parseInt(monthStr, 10) : (now.getUTCMonth() + 1);
        const period = `${year.toString().padStart(4, '0')}-${month.toString().padStart(2, '0')}`;
        const startDate = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0));
        const endDate = new Date(Date.UTC(year, month, 1, 0, 0, 0)); // exclusive
        console.log('Owner statement report requested', { companyId, period, startDate, endDate });
        const accounts = yield propertyAccountService_1.default.getCompanyPropertyAccounts(companyId);
        // Build propertyId -> owner lookup from owners collections (company-scoped)
        const rentalPropertyIds = accounts
            .filter((a) => !a.ledgerType || a.ledgerType === 'rental')
            .map((a) => { var _a, _b; return (_b = (_a = a.propertyId) === null || _a === void 0 ? void 0 : _a.toString) === null || _b === void 0 ? void 0 : _b.call(_a); })
            .filter(Boolean);
        const salePropertyIds = accounts
            .filter((a) => a.ledgerType === 'sale')
            .map((a) => { var _a, _b; return (_b = (_a = a.propertyId) === null || _a === void 0 ? void 0 : _a.toString) === null || _b === void 0 ? void 0 : _b.call(_a); })
            .filter(Boolean);
        const uniqueRentalIds = Array.from(new Set(rentalPropertyIds));
        const uniqueSaleIds = Array.from(new Set(salePropertyIds));
        const [rentalOwners, salesOwners] = yield Promise.all([
            PropertyOwner_1.PropertyOwner.find(Object.assign({ companyId }, (uniqueRentalIds.length > 0 ? { properties: { $in: uniqueRentalIds } } : {}))).select('_id email firstName lastName phone properties companyId'),
            SalesOwner_1.SalesOwner.find(Object.assign({ companyId }, (uniqueSaleIds.length > 0 ? { properties: { $in: uniqueSaleIds } } : {}))).select('_id email firstName lastName phone properties companyId')
        ]);
        const propertyIdToOwner = {};
        for (const o of rentalOwners) {
            const props = Array.isArray(o === null || o === void 0 ? void 0 : o.properties) ? o.properties : [];
            for (const p of props) {
                const key = typeof p === 'string' ? p : (((_b = p === null || p === void 0 ? void 0 : p.toString) === null || _b === void 0 ? void 0 : _b.call(p)) || (p === null || p === void 0 ? void 0 : p.$oid) || (p === null || p === void 0 ? void 0 : p._id) || (p === null || p === void 0 ? void 0 : p.id) || '');
                if (key) {
                    propertyIdToOwner[String(key)] = {
                        _id: o._id.toString(),
                        email: o.email,
                        firstName: o.firstName,
                        lastName: o.lastName,
                        phone: o.phone,
                        ownerType: 'rental'
                    };
                }
            }
        }
        for (const o of salesOwners) {
            const props = Array.isArray(o === null || o === void 0 ? void 0 : o.properties) ? o.properties : [];
            for (const p of props) {
                const key = typeof p === 'string' ? p : (((_c = p === null || p === void 0 ? void 0 : p.toString) === null || _c === void 0 ? void 0 : _c.call(p)) || (p === null || p === void 0 ? void 0 : p.$oid) || (p === null || p === void 0 ? void 0 : p._id) || (p === null || p === void 0 ? void 0 : p.id) || '');
                if (key) {
                    propertyIdToOwner[String(key)] = {
                        _id: o._id.toString(),
                        email: o.email,
                        firstName: o.firstName,
                        lastName: o.lastName,
                        phone: o.phone,
                        ownerType: 'sale'
                    };
                }
            }
        }
        const owners = {};
        for (const acc of accounts) {
            const propertyIdStr = ((_e = (_d = acc.propertyId) === null || _d === void 0 ? void 0 : _d.toString) === null || _e === void 0 ? void 0 : _e.call(_d)) || '';
            const refOwner = propertyIdStr ? propertyIdToOwner[propertyIdStr] : undefined;
            // Use cross-referenced owner if available, else fall back to account's stored owner fields
            const ownerId = (refOwner === null || refOwner === void 0 ? void 0 : refOwner._id) || (acc.ownerId ? acc.ownerId.toString() : 'unknown-owner');
            const ownerName = refOwner ? `${refOwner.firstName || ''} ${refOwner.lastName || ''}`.trim() || acc.ownerName || 'Unknown Owner' : (acc.ownerName || 'Unknown Owner');
            // Sum transactions for the requested month
            const tx = Array.isArray(acc.transactions) ? acc.transactions : [];
            const inPeriod = tx.filter((t) => {
                try {
                    const d = new Date(t.date);
                    return d >= startDate && d < endDate && t.status !== 'cancelled';
                }
                catch (_a) {
                    return false;
                }
            });
            const income = inPeriod
                .filter((t) => t.type === 'income')
                .reduce((sum, t) => sum + Number(t.amount || 0), 0);
            const expenseTypes = new Set(['expense', 'repair', 'maintenance']);
            const expenses = inPeriod
                .filter((t) => expenseTypes.has(t.type))
                .reduce((sum, t) => sum + Number(t.amount || 0), 0);
            const netIncome = income - expenses;
            const propertyItem = {
                propertyId: propertyIdStr,
                propertyName: acc.propertyName || '',
                address: acc.propertyAddress || '',
                rentCollected: income,
                expenses,
                netIncome,
                period
            };
            if (!owners[ownerId]) {
                owners[ownerId] = {
                    ownerId,
                    ownerName,
                    properties: [],
                    totalRentCollected: 0,
                    totalExpenses: 0,
                    totalNetIncome: 0,
                    period
                };
            }
            owners[ownerId].properties.push(propertyItem);
            owners[ownerId].totalRentCollected += income;
            owners[ownerId].totalExpenses += expenses;
            owners[ownerId].totalNetIncome += netIncome;
            // Attach enriched owner details (non-breaking additional field)
            if (refOwner) {
                owners[ownerId].ownerDetails = owners[ownerId].ownerDetails || {
                    id: refOwner._id,
                    email: refOwner.email,
                    firstName: refOwner.firstName,
                    lastName: refOwner.lastName,
                    phone: refOwner.phone
                };
            }
        }
        const payload = Object.values(owners);
        return res.json(payload);
    }
    catch (error) {
        console.error('Error fetching owner statement report:', error);
        res.status(500).json({ message: 'Error fetching owner statement report' });
    }
}));
// Income & Expense Report
router.get('/income-expense', auth_1.auth, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        console.log('Income & expense report requested for company:', (_a = req.user) === null || _a === void 0 ? void 0 : _a.companyId);
        // Mock data for now - replace with actual database queries
        const mockData = {
            period: '2024-01',
            income: {
                rent: 15000,
                lateFees: 500,
                other: 200,
                total: 15700
            },
            expenses: {
                maintenance: 3000,
                utilities: 1500,
                insurance: 800,
                propertyTax: 1200,
                other: 500,
                total: 7000
            },
            netIncome: 8700,
            properties: [
                {
                    propertyId: 'prop-1',
                    propertyName: 'Sunset Apartments',
                    income: 8000,
                    expenses: 3500,
                    netIncome: 4500
                },
                {
                    propertyId: 'prop-2',
                    propertyName: 'Ocean View Condos',
                    income: 7700,
                    expenses: 3500,
                    netIncome: 4200
                }
            ]
        };
        res.json(mockData);
    }
    catch (error) {
        console.error('Error fetching income & expense report:', error);
        res.status(500).json({ message: 'Error fetching income & expense report' });
    }
}));
// Rent Roll Report
router.get('/rent-roll', auth_1.auth, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        console.log('Rent roll report requested for company:', (_a = req.user) === null || _a === void 0 ? void 0 : _a.companyId);
        // Mock data for now - replace with actual database queries
        const mockData = [
            {
                propertyId: 'prop-1',
                propertyName: 'Sunset Apartments',
                address: '123 Main St, City, State',
                unitNumber: 'A101',
                tenantName: 'Alice Johnson',
                leaseStartDate: '2023-01-01',
                leaseEndDate: '2024-12-31',
                monthlyRent: 1200,
                currentBalance: 0,
                status: 'occupied',
                lastPaymentDate: '2024-01-01'
            },
            {
                propertyId: 'prop-1',
                propertyName: 'Sunset Apartments',
                address: '123 Main St, City, State',
                unitNumber: 'A102',
                tenantName: 'Bob Wilson',
                leaseStartDate: '2023-02-01',
                leaseEndDate: '2024-01-31',
                monthlyRent: 1300,
                currentBalance: 0,
                status: 'occupied',
                lastPaymentDate: '2024-01-01'
            },
            {
                propertyId: 'prop-2',
                propertyName: 'Ocean View Condos',
                address: '456 Beach Blvd, City, State',
                unitNumber: 'B201',
                tenantName: 'Carol Davis',
                leaseStartDate: '2023-03-01',
                leaseEndDate: '2024-02-29',
                monthlyRent: 1800,
                currentBalance: 0,
                status: 'occupied',
                lastPaymentDate: '2024-01-01'
            },
            {
                propertyId: 'prop-2',
                propertyName: 'Ocean View Condos',
                address: '456 Beach Blvd, City, State',
                unitNumber: 'B202',
                tenantName: '',
                leaseStartDate: '',
                leaseEndDate: '',
                monthlyRent: 1800,
                currentBalance: 0,
                status: 'vacant',
                lastPaymentDate: ''
            }
        ];
        res.json(mockData);
    }
    catch (error) {
        console.error('Error fetching rent roll report:', error);
        res.status(500).json({ message: 'Error fetching rent roll report' });
    }
}));
// Receivables Report
router.get('/receivables', auth_1.auth, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        console.log('Receivables report requested for company:', (_a = req.user) === null || _a === void 0 ? void 0 : _a.companyId);
        // Mock data for now
        const mockData = [
            {
                tenantId: 'tenant-1',
                tenantName: 'Alice Johnson',
                propertyName: 'Sunset Apartments',
                unitNumber: 'A101',
                currentBalance: 0,
                daysOverdue: 0,
                lastPaymentDate: '2024-01-01',
                nextPaymentDue: '2024-02-01',
                status: 'current'
            }
        ];
        res.json(mockData);
    }
    catch (error) {
        console.error('Error fetching receivables report:', error);
        res.status(500).json({ message: 'Error fetching receivables report' });
    }
}));
// Payables Report
router.get('/payables', auth_1.auth, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        console.log('Payables report requested for company:', (_a = req.user) === null || _a === void 0 ? void 0 : _a.companyId);
        // Mock data for now
        const mockData = [
            {
                vendorId: 'vendor-1',
                vendorName: 'Maintenance Pro',
                invoiceNumber: 'INV-001',
                description: 'Plumbing repair',
                amount: 500,
                dueDate: '2024-02-15',
                daysOverdue: 0,
                status: 'pending'
            }
        ];
        res.json(mockData);
    }
    catch (error) {
        console.error('Error fetching payables report:', error);
        res.status(500).json({ message: 'Error fetching payables report' });
    }
}));
// Maintenance Report
router.get('/maintenance', auth_1.auth, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        console.log('Maintenance report requested for company:', (_a = req.user) === null || _a === void 0 ? void 0 : _a.companyId);
        // Mock data for now
        const mockData = [
            {
                requestId: 'maint-1',
                propertyName: 'Sunset Apartments',
                unitNumber: 'A101',
                tenantName: 'Alice Johnson',
                description: 'Leaky faucet in kitchen',
                priority: 'medium',
                status: 'open',
                createdAt: '2024-01-15',
                cost: 0
            }
        ];
        res.json(mockData);
    }
    catch (error) {
        console.error('Error fetching maintenance report:', error);
        res.status(500).json({ message: 'Error fetching maintenance report' });
    }
}));
// Vacancy Report
router.get('/vacancy', auth_1.auth, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        console.log('Vacancy report requested for company:', (_a = req.user) === null || _a === void 0 ? void 0 : _a.companyId);
        // Mock data for now
        const mockData = [
            {
                propertyId: 'prop-2',
                propertyName: 'Ocean View Condos',
                address: '456 Beach Blvd, City, State',
                unitNumber: 'B202',
                daysVacant: 30,
                lastTenantName: 'Previous Tenant',
                lastRentAmount: 1800,
                estimatedRent: 1800,
                vacancyReason: 'Tenant moved out'
            }
        ];
        res.json(mockData);
    }
    catch (error) {
        console.error('Error fetching vacancy report:', error);
        res.status(500).json({ message: 'Error fetching vacancy report' });
    }
}));
// Tenant Ledger Report
router.get('/tenant-ledger', auth_1.auth, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { tenantId } = req.query;
        console.log('Tenant ledger report requested for tenant:', tenantId);
        // Mock data for now
        const mockData = {
            tenantId: tenantId,
            tenantName: 'Alice Johnson',
            propertyName: 'Sunset Apartments',
            unitNumber: 'A101',
            transactions: [
                {
                    date: '2024-01-01',
                    description: 'Rent payment',
                    charges: 0,
                    payments: 1200,
                    balance: 0,
                    type: 'payment'
                }
            ],
            currentBalance: 0
        };
        res.json(mockData);
    }
    catch (error) {
        console.error('Error fetching tenant ledger report:', error);
        res.status(500).json({ message: 'Error fetching tenant ledger report' });
    }
}));
// Delinquency Report
router.get('/delinquency', auth_1.auth, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        console.log('Delinquency report requested for company:', (_a = req.user) === null || _a === void 0 ? void 0 : _a.companyId);
        // Mock data for now
        const mockData = [
            {
                tenantId: 'tenant-1',
                tenantName: 'Alice Johnson',
                propertyName: 'Sunset Apartments',
                unitNumber: 'A101',
                currentBalance: 0,
                daysOverdue: 0,
                lastPaymentDate: '2024-01-01',
                nextPaymentDue: '2024-02-01',
                evictionStatus: 'none'
            }
        ];
        res.json(mockData);
    }
    catch (error) {
        console.error('Error fetching delinquency report:', error);
        res.status(500).json({ message: 'Error fetching delinquency report' });
    }
}));
// Lease Expiry Report
router.get('/lease-expiry', auth_1.auth, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        console.log('Lease expiry report requested for company:', (_a = req.user) === null || _a === void 0 ? void 0 : _a.companyId);
        // Mock data for now
        const mockData = [
            {
                leaseId: 'lease-1',
                tenantName: 'Alice Johnson',
                propertyName: 'Sunset Apartments',
                unitNumber: 'A101',
                leaseStartDate: '2023-01-01',
                leaseEndDate: '2024-12-31',
                daysUntilExpiry: 300,
                monthlyRent: 1200,
                renewalStatus: 'pending'
            }
        ];
        res.json(mockData);
    }
    catch (error) {
        console.error('Error fetching lease expiry report:', error);
        res.status(500).json({ message: 'Error fetching lease expiry report' });
    }
}));
// Portfolio Summary Report
router.get('/portfolio-summary', auth_1.auth, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        console.log('Portfolio summary report requested for company:', (_a = req.user) === null || _a === void 0 ? void 0 : _a.companyId);
        // Mock data for now
        const mockData = {
            totalProperties: 2,
            totalUnits: 4,
            occupiedUnits: 3,
            vacantUnits: 1,
            occupancyRate: 75,
            totalMonthlyRent: 6100,
            averageRent: 1525,
            totalValue: 800000,
            properties: [
                {
                    propertyId: 'prop-1',
                    propertyName: 'Sunset Apartments',
                    address: '123 Main St, City, State',
                    units: 2,
                    occupiedUnits: 2,
                    monthlyRent: 2500,
                    propertyValue: 400000
                },
                {
                    propertyId: 'prop-2',
                    propertyName: 'Ocean View Condos',
                    address: '456 Beach Blvd, City, State',
                    units: 2,
                    occupiedUnits: 1,
                    monthlyRent: 3600,
                    propertyValue: 400000
                }
            ]
        };
        res.json(mockData);
    }
    catch (error) {
        console.error('Error fetching portfolio summary report:', error);
        res.status(500).json({ message: 'Error fetching portfolio summary report' });
    }
}));
// Capital Expenditure Report
router.get('/capital-expenditure', auth_1.auth, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        console.log('Capital expenditure report requested for company:', (_a = req.user) === null || _a === void 0 ? void 0 : _a.companyId);
        // Mock data for now
        const mockData = [
            {
                propertyId: 'prop-1',
                propertyName: 'Sunset Apartments',
                description: 'New HVAC system',
                amount: 15000,
                date: '2024-01-15',
                category: 'replacement',
                vendor: 'HVAC Pro',
                status: 'completed'
            }
        ];
        res.json(mockData);
    }
    catch (error) {
        console.error('Error fetching capital expenditure report:', error);
        res.status(500).json({ message: 'Error fetching capital expenditure report' });
    }
}));
// Eviction Report
router.get('/eviction', auth_1.auth, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        console.log('Eviction report requested for company:', (_a = req.user) === null || _a === void 0 ? void 0 : _a.companyId);
        // Mock data for now
        const mockData = [
            {
                evictionId: 'evict-1',
                tenantName: 'Previous Tenant',
                propertyName: 'Ocean View Condos',
                unitNumber: 'B202',
                filingDate: '2024-01-01',
                courtDate: '2024-02-01',
                status: 'completed',
                reason: 'Non-payment of rent',
                amountOwed: 1800
            }
        ];
        res.json(mockData);
    }
    catch (error) {
        console.error('Error fetching eviction report:', error);
        res.status(500).json({ message: 'Error fetching eviction report' });
    }
}));
// Forecast Report
router.get('/forecast', auth_1.auth, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        console.log('Forecast report requested for company:', (_a = req.user) === null || _a === void 0 ? void 0 : _a.companyId);
        // Mock data for now
        const mockData = [
            {
                period: '2024-02',
                projectedIncome: 15700,
                projectedExpenses: 7000,
                projectedNetIncome: 8700,
                assumptions: [
                    {
                        category: 'Rent',
                        assumption: 'No rent increases',
                        impact: 0
                    },
                    {
                        category: 'Expenses',
                        assumption: 'Maintenance costs remain stable',
                        impact: 0
                    }
                ]
            }
        ];
        res.json(mockData);
    }
    catch (error) {
        console.error('Error fetching forecast report:', error);
        res.status(500).json({ message: 'Error fetching forecast report' });
    }
}));
// 404 handler for report routes
router.use((req, res) => {
    console.log('Report route not found:', req.method, req.path);
    res.status(404).json({
        message: 'Report route not found',
        path: req.path,
        method: req.method
    });
});
console.log('Report routes defined');
exports.default = router;
