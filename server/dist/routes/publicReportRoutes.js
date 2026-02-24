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
const requestSecurity_1 = require("../utils/requestSecurity");
const router = express_1.default.Router();
// Debug middleware to log all requests
router.use((req, res, next) => {
    console.log(`[Public Report Routes] ${req.method} ${req.path}`);
    console.log('Request headers:', (0, requestSecurity_1.redactHeaders)(req.headers));
    console.log('Request query:', req.query);
    console.log('Request body:', req.body);
    next();
});
// Health check for public report routes
router.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        service: 'public-report-routes',
        timestamp: new Date().toISOString()
    });
});
// Public Owner Statement Report (limited data)
router.get('/owner-statement', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        console.log('Public owner statement report requested');
        // Limited mock data for public access
        const mockData = [
            {
                ownerId: 'public-owner-1',
                ownerName: 'Sample Owner',
                properties: [
                    {
                        propertyId: 'public-prop-1',
                        propertyName: 'Sample Property',
                        address: 'Sample Address',
                        rentCollected: 2000,
                        expenses: 600,
                        netIncome: 1400,
                        period: '2024-01'
                    }
                ],
                totalRentCollected: 2000,
                totalExpenses: 600,
                totalNetIncome: 1400,
                period: '2024-01'
            }
        ];
        res.json(mockData);
    }
    catch (error) {
        console.error('Error fetching public owner statement report:', error);
        res.status(500).json({ message: 'Error fetching owner statement report' });
    }
}));
// Public Income & Expense Report (limited data)
router.get('/income-expense', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        console.log('Public income & expense report requested');
        // Limited mock data for public access
        const mockData = {
            period: '2024-01',
            income: {
                rent: 5000,
                lateFees: 100,
                other: 50,
                total: 5150
            },
            expenses: {
                maintenance: 1000,
                utilities: 500,
                insurance: 300,
                propertyTax: 400,
                other: 200,
                total: 2400
            },
            netIncome: 2750,
            properties: [
                {
                    propertyId: 'public-prop-1',
                    propertyName: 'Sample Property',
                    income: 5150,
                    expenses: 2400,
                    netIncome: 2750
                }
            ]
        };
        res.json(mockData);
    }
    catch (error) {
        console.error('Error fetching public income & expense report:', error);
        res.status(500).json({ message: 'Error fetching income & expense report' });
    }
}));
// Public Rent Roll Report (limited data)
router.get('/rent-roll', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        console.log('Public rent roll report requested');
        // Limited mock data for public access
        const mockData = [
            {
                propertyId: 'public-prop-1',
                propertyName: 'Sample Property',
                address: 'Sample Address',
                unitNumber: '101',
                tenantName: 'Sample Tenant',
                leaseStartDate: '2023-01-01',
                leaseEndDate: '2024-12-31',
                monthlyRent: 2000,
                currentBalance: 0,
                status: 'occupied',
                lastPaymentDate: '2024-01-01'
            }
        ];
        res.json(mockData);
    }
    catch (error) {
        console.error('Error fetching public rent roll report:', error);
        res.status(500).json({ message: 'Error fetching rent roll report' });
    }
}));
// Public Receivables Report (limited data)
router.get('/receivables', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        console.log('Public receivables report requested');
        // Limited mock data for public access
        const mockData = [
            {
                tenantId: 'public-tenant-1',
                tenantName: 'Sample Tenant',
                propertyName: 'Sample Property',
                unitNumber: '101',
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
        console.error('Error fetching public receivables report:', error);
        res.status(500).json({ message: 'Error fetching receivables report' });
    }
}));
// Public Payables Report (limited data)
router.get('/payables', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        console.log('Public payables report requested');
        // Limited mock data for public access
        const mockData = [
            {
                vendorId: 'public-vendor-1',
                vendorName: 'Sample Vendor',
                invoiceNumber: 'PUBLIC-INV-001',
                description: 'Sample service',
                amount: 300,
                dueDate: '2024-02-15',
                daysOverdue: 0,
                status: 'pending'
            }
        ];
        res.json(mockData);
    }
    catch (error) {
        console.error('Error fetching public payables report:', error);
        res.status(500).json({ message: 'Error fetching payables report' });
    }
}));
// Public Maintenance Report (limited data)
router.get('/maintenance', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        console.log('Public maintenance report requested');
        // Limited mock data for public access
        const mockData = [
            {
                requestId: 'public-maint-1',
                propertyName: 'Sample Property',
                unitNumber: '101',
                tenantName: 'Sample Tenant',
                description: 'Sample maintenance request',
                priority: 'low',
                status: 'open',
                createdAt: '2024-01-15',
                cost: 0
            }
        ];
        res.json(mockData);
    }
    catch (error) {
        console.error('Error fetching public maintenance report:', error);
        res.status(500).json({ message: 'Error fetching maintenance report' });
    }
}));
// Public Vacancy Report (limited data)
router.get('/vacancy', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        console.log('Public vacancy report requested');
        // Limited mock data for public access
        const mockData = [
            {
                propertyId: 'public-prop-2',
                propertyName: 'Sample Vacant Property',
                address: 'Sample Vacant Address',
                unitNumber: '102',
                daysVacant: 15,
                lastTenantName: 'Previous Sample Tenant',
                lastRentAmount: 1800,
                estimatedRent: 1800,
                vacancyReason: 'Tenant moved out'
            }
        ];
        res.json(mockData);
    }
    catch (error) {
        console.error('Error fetching public vacancy report:', error);
        res.status(500).json({ message: 'Error fetching vacancy report' });
    }
}));
// Public Tenant Ledger Report (limited data)
router.get('/tenant-ledger', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { tenantId } = req.query;
        console.log('Public tenant ledger report requested for tenant:', tenantId);
        // Limited mock data for public access
        const mockData = {
            tenantId: tenantId || 'public-tenant-1',
            tenantName: 'Sample Tenant',
            propertyName: 'Sample Property',
            unitNumber: '101',
            transactions: [
                {
                    date: '2024-01-01',
                    description: 'Sample rent payment',
                    charges: 0,
                    payments: 2000,
                    balance: 0,
                    type: 'payment'
                }
            ],
            currentBalance: 0
        };
        res.json(mockData);
    }
    catch (error) {
        console.error('Error fetching public tenant ledger report:', error);
        res.status(500).json({ message: 'Error fetching tenant ledger report' });
    }
}));
// Public Delinquency Report (limited data)
router.get('/delinquency', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        console.log('Public delinquency report requested');
        // Limited mock data for public access
        const mockData = [
            {
                tenantId: 'public-tenant-1',
                tenantName: 'Sample Tenant',
                propertyName: 'Sample Property',
                unitNumber: '101',
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
        console.error('Error fetching public delinquency report:', error);
        res.status(500).json({ message: 'Error fetching delinquency report' });
    }
}));
// Public Lease Expiry Report (limited data)
router.get('/lease-expiry', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        console.log('Public lease expiry report requested');
        // Limited mock data for public access
        const mockData = [
            {
                leaseId: 'public-lease-1',
                tenantName: 'Sample Tenant',
                propertyName: 'Sample Property',
                unitNumber: '101',
                leaseStartDate: '2023-01-01',
                leaseEndDate: '2024-12-31',
                daysUntilExpiry: 300,
                monthlyRent: 2000,
                renewalStatus: 'pending'
            }
        ];
        res.json(mockData);
    }
    catch (error) {
        console.error('Error fetching public lease expiry report:', error);
        res.status(500).json({ message: 'Error fetching lease expiry report' });
    }
}));
// Public Portfolio Summary Report (limited data)
router.get('/portfolio-summary', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        console.log('Public portfolio summary report requested');
        // Limited mock data for public access
        const mockData = {
            totalProperties: 1,
            totalUnits: 2,
            occupiedUnits: 1,
            vacantUnits: 1,
            occupancyRate: 50,
            totalMonthlyRent: 3800,
            averageRent: 1900,
            totalValue: 400000,
            properties: [
                {
                    propertyId: 'public-prop-1',
                    propertyName: 'Sample Property',
                    address: 'Sample Address',
                    units: 2,
                    occupiedUnits: 1,
                    monthlyRent: 3800,
                    propertyValue: 400000
                }
            ]
        };
        res.json(mockData);
    }
    catch (error) {
        console.error('Error fetching public portfolio summary report:', error);
        res.status(500).json({ message: 'Error fetching portfolio summary report' });
    }
}));
// Public Capital Expenditure Report (limited data)
router.get('/capital-expenditure', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        console.log('Public capital expenditure report requested');
        // Limited mock data for public access
        const mockData = [
            {
                propertyId: 'public-prop-1',
                propertyName: 'Sample Property',
                description: 'Sample capital improvement',
                amount: 5000,
                date: '2024-01-15',
                category: 'improvement',
                vendor: 'Sample Vendor',
                status: 'completed'
            }
        ];
        res.json(mockData);
    }
    catch (error) {
        console.error('Error fetching public capital expenditure report:', error);
        res.status(500).json({ message: 'Error fetching capital expenditure report' });
    }
}));
// Public Eviction Report (limited data)
router.get('/eviction', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        console.log('Public eviction report requested');
        // Limited mock data for public access
        const mockData = [
            {
                evictionId: 'public-evict-1',
                tenantName: 'Previous Sample Tenant',
                propertyName: 'Sample Property',
                unitNumber: '102',
                filingDate: '2024-01-01',
                courtDate: '2024-02-01',
                status: 'completed',
                reason: 'Sample eviction reason',
                amountOwed: 1800
            }
        ];
        res.json(mockData);
    }
    catch (error) {
        console.error('Error fetching public eviction report:', error);
        res.status(500).json({ message: 'Error fetching eviction report' });
    }
}));
// Public Forecast Report (limited data)
router.get('/forecast', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        console.log('Public forecast report requested');
        // Limited mock data for public access
        const mockData = [
            {
                period: '2024-02',
                projectedIncome: 5150,
                projectedExpenses: 2400,
                projectedNetIncome: 2750,
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
        console.error('Error fetching public forecast report:', error);
        res.status(500).json({ message: 'Error fetching forecast report' });
    }
}));
// 404 handler for public report routes
router.use((req, res) => {
    console.log('Public report route not found:', req.method, req.path);
    res.status(404).json({
        message: 'Public report route not found',
        path: req.path,
        method: req.method
    });
});
console.log('Public report routes defined');
exports.default = router;
