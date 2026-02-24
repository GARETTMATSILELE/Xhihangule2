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
const chartController_1 = require("../controllers/chartController");
const ChartData_1 = require("../models/ChartData");
const auth_1 = require("../middleware/auth");
const Property_1 = require("../models/Property");
const MaintenanceRequest_1 = require("../models/MaintenanceRequest");
const PropertyOwner_1 = require("../models/PropertyOwner");
const User_1 = require("../models/User");
const Payment_1 = require("../models/Payment");
const requestSecurity_1 = require("../utils/requestSecurity");
const router = express_1.default.Router();
// Debug middleware to log all requests
router.use((req, res, next) => {
    console.log(`[Chart Routes] ${req.method} ${req.path}`);
    console.log('Request headers:', (0, requestSecurity_1.redactHeaders)(req.headers));
    console.log('Request query:', req.query);
    console.log('Request body:', req.body);
    next();
});
// Health check for chart routes
router.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        service: 'chart-routes',
        timestamp: new Date().toISOString()
    });
});
// Test route
router.get('/test', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        console.log('Test route hit');
        const companyId = 'default-company-id';
        console.log('Fetching chart data for company:', companyId);
        const chartData = yield ChartData_1.ChartData.find({ companyId });
        console.log('Found chart data:', chartData);
        if (!chartData || chartData.length === 0) {
            console.log('No chart data found, initializing...');
            yield (0, chartController_1.updateChartMetrics)(companyId);
            const newChartData = yield ChartData_1.ChartData.find({ companyId });
            return res.json(newChartData);
        }
        res.json(chartData);
    }
    catch (error) {
        console.error('Error in test route:', error);
        res.status(500).json({
            message: 'Error fetching chart data',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
}));
// Get all chart data (for company users)
router.get('/', auth_1.auth, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        if (!((_a = req.user) === null || _a === void 0 ? void 0 : _a.companyId)) {
            return res.status(401).json({ message: 'Company ID not found' });
        }
        console.log('Fetching chart data for company:', req.user.companyId);
        const chartData = yield ChartData_1.ChartData.find({ companyId: req.user.companyId });
        res.json(chartData);
    }
    catch (error) {
        console.error('Error fetching chart data:', error);
        res.status(500).json({ message: 'Error fetching chart data' });
    }
}));
// Initialize chart data - This must come before the /:type route
router.post('/initialize', auth_1.auth, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        if (!((_a = req.user) === null || _a === void 0 ? void 0 : _a.companyId)) {
            return res.status(401).json({ message: 'Company ID not found' });
        }
        yield (0, chartController_1.updateChartMetrics)(req.user.companyId);
        res.json({ message: 'Chart data initialized' });
    }
    catch (error) {
        console.error('Error initializing chart data:', error);
        res.status(500).json({ message: 'Error initializing chart data' });
    }
}));
// Helper function to get property owner context (from either PropertyOwner or User collection)
const getPropertyOwnerContext = (ownerId) => __awaiter(void 0, void 0, void 0, function* () {
    // First, try to find the property owner document (this is the primary source)
    let propertyOwner = yield PropertyOwner_1.PropertyOwner.findById(ownerId);
    if (propertyOwner) {
        console.log(`Found PropertyOwner record: ${propertyOwner.email} with companyId: ${propertyOwner.companyId}`);
        return {
            _id: propertyOwner._id,
            properties: propertyOwner.properties || [],
            companyId: propertyOwner.companyId
        };
    }
    // If not found in PropertyOwner collection, try User collection as fallback
    console.log(`PropertyOwner not found for ID: ${ownerId}, checking User collection...`);
    const user = yield User_1.User.findById(ownerId);
    if (!user || user.role !== 'owner') {
        throw new Error('Property owner not found');
    }
    console.log(`Found owner user in User collection: ${user.email}`);
    // Use the user as the property owner context
    return {
        _id: user._id,
        properties: [], // Will be populated from Property collection
        companyId: user.companyId
    };
});
// Owner-specific chart endpoints (for PropertyOwners)
router.get('/owner/occupancy', auth_1.propertyOwnerAuth, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        if (!((_a = req.user) === null || _a === void 0 ? void 0 : _a.userId)) {
            return res.status(401).json({ message: 'User ID not found' });
        }
        if (req.user.role !== 'owner') {
            return res.status(403).json({ message: 'Owner access required' });
        }
        const ownerId = req.user.userId;
        console.log(`[Owner Occupancy Chart] Processing request for ownerId: ${ownerId}`);
        const propertyOwnerContext = yield getPropertyOwnerContext(ownerId);
        console.log(`[Owner Occupancy Chart] PropertyOwner context:`, {
            _id: propertyOwnerContext._id,
            companyId: propertyOwnerContext.companyId,
            propertiesCount: ((_b = propertyOwnerContext.properties) === null || _b === void 0 ? void 0 : _b.length) || 0
        });
        let propertyIds = [];
        if (propertyOwnerContext.properties && propertyOwnerContext.properties.length > 0) {
            propertyIds = propertyOwnerContext.properties;
        }
        else {
            // Fallback: get properties where ownerId matches - filter by companyId if available
            const query = { ownerId: ownerId };
            if (propertyOwnerContext.companyId) {
                query.companyId = propertyOwnerContext.companyId;
            }
            const properties = yield Property_1.Property.find(query);
            propertyIds = properties.map(p => p._id);
        }
        if (propertyIds.length === 0) {
            return res.json({
                type: 'occupancy',
                data: [
                    { name: 'Occupied', value: 0 },
                    { name: 'Vacant', value: 0 }
                ]
            });
        }
        // Get properties and calculate occupancy - filter by companyId if available
        const query = { _id: { $in: propertyIds } };
        if (propertyOwnerContext.companyId) {
            query.companyId = propertyOwnerContext.companyId;
        }
        const properties = yield Property_1.Property.find(query);
        const totalUnits = properties.reduce((sum, property) => sum + (property.units || 1), 0);
        const occupiedUnits = properties.reduce((sum, property) => sum + (property.occupiedUnits || 0), 0);
        const vacantUnits = totalUnits - occupiedUnits;
        const occupancyData = [
            { name: 'Occupied', value: occupiedUnits },
            { name: 'Vacant', value: vacantUnits }
        ];
        res.json({
            type: 'occupancy',
            data: occupancyData
        });
    }
    catch (error) {
        console.error('Error fetching owner occupancy data:', error);
        res.status(500).json({ message: 'Error fetching occupancy data' });
    }
}));
router.get('/owner/revenue', auth_1.propertyOwnerAuth, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        if (!((_a = req.user) === null || _a === void 0 ? void 0 : _a.userId)) {
            return res.status(401).json({ message: 'User ID not found' });
        }
        if (req.user.role !== 'owner') {
            return res.status(403).json({ message: 'Owner access required' });
        }
        const ownerId = req.user.userId;
        const propertyOwnerContext = yield getPropertyOwnerContext(ownerId);
        let propertyIds = [];
        if (propertyOwnerContext.properties && propertyOwnerContext.properties.length > 0) {
            propertyIds = propertyOwnerContext.properties;
        }
        else {
            // Fallback: get properties where ownerId matches - filter by companyId if available
            const query = { ownerId: ownerId };
            if (propertyOwnerContext.companyId) {
                query.companyId = propertyOwnerContext.companyId;
            }
            const properties = yield Property_1.Property.find(query);
            propertyIds = properties.map(p => p._id);
        }
        if (propertyIds.length === 0) {
            return res.json({
                type: 'revenue',
                data: [
                    { name: 'Income', value: 0 },
                    { name: 'Expenses', value: 0 }
                ]
            });
        }
        // Get properties and calculate revenue - filter by companyId if available
        const query = { _id: { $in: propertyIds } };
        if (propertyOwnerContext.companyId) {
            query.companyId = propertyOwnerContext.companyId;
        }
        const properties = yield Property_1.Property.find(query);
        const totalIncome = properties.reduce((sum, property) => sum + (property.totalRentCollected || 0), 0);
        const totalExpenses = properties.reduce((sum, property) => sum + (property.currentArrears || 0), 0);
        const revenueData = [
            { name: 'Income', value: totalIncome },
            { name: 'Expenses', value: totalExpenses }
        ];
        res.json({
            type: 'revenue',
            data: revenueData
        });
    }
    catch (error) {
        console.error('Error fetching owner revenue data:', error);
        res.status(500).json({ message: 'Error fetching revenue data' });
    }
}));
// New endpoint for owner payment data with actual payment records
router.get('/owner/payments', auth_1.propertyOwnerAuth, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        if (!((_a = req.user) === null || _a === void 0 ? void 0 : _a.userId)) {
            return res.status(401).json({ message: 'User ID not found' });
        }
        if (req.user.role !== 'owner') {
            return res.status(403).json({ message: 'Owner access required' });
        }
        const ownerId = req.user.userId;
        const propertyOwnerContext = yield getPropertyOwnerContext(ownerId);
        let propertyIds = [];
        if (propertyOwnerContext.properties && propertyOwnerContext.properties.length > 0) {
            propertyIds = propertyOwnerContext.properties;
        }
        else {
            // Fallback: get properties where ownerId matches - filter by companyId if available
            const query = { ownerId: ownerId };
            if (propertyOwnerContext.companyId) {
                query.companyId = propertyOwnerContext.companyId;
            }
            const properties = yield Property_1.Property.find(query);
            propertyIds = properties.map(p => p._id);
        }
        if (propertyIds.length === 0) {
            return res.json({
                type: 'payments',
                data: []
            });
        }
        // Get payments for these properties - filter by companyId if available
        const paymentQuery = {
            propertyId: { $in: propertyIds },
            paymentType: 'rental' // Only rental payments
        };
        if (propertyOwnerContext.companyId) {
            paymentQuery.companyId = propertyOwnerContext.companyId;
        }
        const payments = yield Payment_1.Payment.find(paymentQuery)
            .populate('propertyId', 'name')
            .populate('tenantId', 'firstName lastName')
            .sort({ paymentDate: -1 })
            .limit(50); // Limit to recent payments
        // Get maintenance payments for these properties
        const maintenancePaymentQuery = {
            propertyId: { $in: propertyIds }
        };
        if (propertyOwnerContext.companyId) {
            maintenancePaymentQuery.companyId = propertyOwnerContext.companyId;
        }
        // Use MaintenanceRequest instead of non-existent MaintenancePayment
        const { MaintenanceRequest } = require('../models/MaintenanceRequest');
        const maintenanceRequests = yield MaintenanceRequest.find(maintenancePaymentQuery)
            .populate('propertyId', 'name')
            .sort({ createdAt: -1 })
            .limit(50);
        // Group payments by month for chart data using commissionDetails.ownerAmount, totalCommission, and maintenance expenses
        const monthlyData = {};
        const currentYear = new Date().getFullYear();
        // Process rental payments
        payments.forEach((payment) => {
            var _a, _b;
            const paymentDate = new Date(payment.paymentDate);
            const monthKey = `${paymentDate.getFullYear()}-${String(paymentDate.getMonth() + 1).padStart(2, '0')}`;
            if (!monthlyData[monthKey]) {
                monthlyData[monthKey] = { ownerAmount: 0, totalCommission: 0, expenses: 0 };
            }
            // Use commissionDetails.ownerAmount and totalCommission
            const ownerAmount = ((_a = payment.commissionDetails) === null || _a === void 0 ? void 0 : _a.ownerAmount) || 0;
            const totalCommission = ((_b = payment.commissionDetails) === null || _b === void 0 ? void 0 : _b.totalCommission) || 0;
            monthlyData[monthKey].ownerAmount += ownerAmount;
            monthlyData[monthKey].totalCommission += totalCommission;
        });
        // Process maintenance requests (estimated costs as expenses)
        maintenanceRequests.forEach((maintenanceRequest) => {
            const requestDate = new Date(maintenanceRequest.createdAt);
            const monthKey = `${requestDate.getFullYear()}-${String(requestDate.getMonth() + 1).padStart(2, '0')}`;
            if (!monthlyData[monthKey]) {
                monthlyData[monthKey] = { ownerAmount: 0, totalCommission: 0, expenses: 0 };
            }
            // Add maintenance request estimated cost to expenses
            const expenseAmount = maintenanceRequest.estimatedCost || 0;
            monthlyData[monthKey].expenses += expenseAmount;
        });
        // Convert to chart format
        const chartData = Object.entries(monthlyData)
            .map(([month, data]) => ({
            month,
            amount: Math.round(data.ownerAmount * 100) / 100, // Round to 2 decimal places
            totalCommission: Math.round(data.totalCommission * 100) / 100,
            expenses: Math.round(data.expenses * 100) / 100
        }))
            .sort((a, b) => a.month.localeCompare(b.month))
            .slice(-12); // Last 12 months
        // Also provide summary statistics using commissionDetails.ownerAmount, totalCommission, and maintenance expenses
        const totalPayments = payments.length;
        const totalAmount = payments.reduce((sum, payment) => {
            var _a;
            const ownerAmount = ((_a = payment.commissionDetails) === null || _a === void 0 ? void 0 : _a.ownerAmount) || 0;
            return sum + ownerAmount;
        }, 0);
        const totalCommission = payments.reduce((sum, payment) => {
            var _a;
            const commission = ((_a = payment.commissionDetails) === null || _a === void 0 ? void 0 : _a.totalCommission) || 0;
            return sum + commission;
        }, 0);
        const totalExpenses = maintenanceRequests.reduce((sum, maintenanceRequest) => {
            const expenseAmount = maintenanceRequest.estimatedCost || 0;
            return sum + expenseAmount;
        }, 0);
        const averageAmount = totalPayments > 0 ? totalAmount / totalPayments : 0;
        res.json({
            type: 'payments',
            data: chartData,
            summary: {
                totalPayments,
                totalAmount: Math.round(totalAmount * 100) / 100,
                totalCommission: Math.round(totalCommission * 100) / 100,
                totalExpenses: Math.round(totalExpenses * 100) / 100,
                averageAmount: Math.round(averageAmount * 100) / 100
            },
            recentPayments: payments.slice(0, 10).map(payment => {
                var _a, _b, _c, _d;
                return ({
                    id: payment._id,
                    amount: ((_a = payment.commissionDetails) === null || _a === void 0 ? void 0 : _a.ownerAmount) || 0, // Use ownerAmount instead of total amount
                    paymentDate: payment.paymentDate,
                    propertyName: ((_b = payment.propertyId) === null || _b === void 0 ? void 0 : _b.name) || 'Unknown Property',
                    tenantName: `${((_c = payment.tenantId) === null || _c === void 0 ? void 0 : _c.firstName) || ''} ${((_d = payment.tenantId) === null || _d === void 0 ? void 0 : _d.lastName) || ''}`.trim() || 'Unknown Tenant',
                    status: payment.status,
                    commissionDetails: payment.commissionDetails // Include full commission details
                });
            })
        });
    }
    catch (error) {
        console.error('Error fetching owner payment data:', error);
        res.status(500).json({ message: 'Error fetching payment data' });
    }
}));
router.get('/owner/maintenance', auth_1.propertyOwnerAuth, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        if (!((_a = req.user) === null || _a === void 0 ? void 0 : _a.userId)) {
            return res.status(401).json({ message: 'User ID not found' });
        }
        if (req.user.role !== 'owner') {
            return res.status(403).json({ message: 'Owner access required' });
        }
        const ownerId = req.user.userId;
        const propertyOwnerContext = yield getPropertyOwnerContext(ownerId);
        let propertyIds = [];
        if (propertyOwnerContext.properties && propertyOwnerContext.properties.length > 0) {
            propertyIds = propertyOwnerContext.properties;
        }
        else {
            // Fallback: get properties where ownerId matches - filter by companyId if available
            const query = { ownerId: ownerId };
            if (propertyOwnerContext.companyId) {
                query.companyId = propertyOwnerContext.companyId;
            }
            const properties = yield Property_1.Property.find(query);
            propertyIds = properties.map(p => p._id);
        }
        if (propertyIds.length === 0) {
            return res.json({
                type: 'maintenance',
                data: [
                    { name: 'Pending', value: 0 },
                    { name: 'In Progress', value: 0 },
                    { name: 'Completed', value: 0 }
                ]
            });
        }
        // Get maintenance requests for these properties - filter by companyId if available
        const query = { propertyId: { $in: propertyIds } };
        if (propertyOwnerContext.companyId) {
            query.companyId = propertyOwnerContext.companyId;
        }
        const maintenanceRequests = yield MaintenanceRequest_1.MaintenanceRequest.find(query);
        // Count by status
        const statusCounts = {
            pending: maintenanceRequests.filter(req => req.status === 'pending').length,
            'in_progress': maintenanceRequests.filter(req => req.status === 'in_progress').length,
            completed: maintenanceRequests.filter(req => req.status === 'completed').length
        };
        const maintenanceData = [
            { name: 'Pending', value: statusCounts.pending },
            { name: 'In Progress', value: statusCounts['in_progress'] },
            { name: 'Completed', value: statusCounts.completed }
        ];
        res.json({
            type: 'maintenance',
            data: maintenanceData
        });
    }
    catch (error) {
        console.error('Error fetching owner maintenance data:', error);
        res.status(500).json({ message: 'Error fetching maintenance data' });
    }
}));
// Get chart data by type (for company users)
router.get('/:type', auth_1.auth, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        if (!((_a = req.user) === null || _a === void 0 ? void 0 : _a.companyId)) {
            return res.status(401).json({ message: 'Company ID not found' });
        }
        const { type } = req.params;
        const chartData = yield ChartData_1.ChartData.findOne({
            type,
            companyId: req.user.companyId
        });
        if (!chartData) {
            return res.status(404).json({ message: 'Chart data not found' });
        }
        res.json(chartData);
    }
    catch (error) {
        console.error('Error fetching chart data:', error);
        res.status(500).json({ message: 'Error fetching chart data' });
    }
}));
// Update chart data
router.put('/:type', auth_1.auth, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        if (!((_a = req.user) === null || _a === void 0 ? void 0 : _a.companyId)) {
            return res.status(401).json({ message: 'Company ID not found' });
        }
        const { type } = req.params;
        const { data } = req.body;
        const chartData = yield ChartData_1.ChartData.findOneAndUpdate({ type, companyId: req.user.companyId }, { data }, { new: true, upsert: true });
        res.json(chartData);
    }
    catch (error) {
        console.error('Error updating chart data:', error);
        res.status(500).json({ message: 'Error updating chart data' });
    }
}));
// 404 handler for chart routes
router.use((req, res) => {
    console.log('Chart route not found:', req.method, req.path);
    res.status(404).json({
        message: 'Chart route not found',
        path: req.path,
        method: req.method
    });
});
console.log('Chart routes defined');
exports.default = router;
