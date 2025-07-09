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
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPropertyMetrics = exports.updateChartData = exports.getChartData = exports.initializeChartData = exports.updateChartMetrics = void 0;
const Property_1 = require("../models/Property");
const errorHandler_1 = require("../middleware/errorHandler");
const ChartData_1 = require("../models/ChartData");
// Function to update chart metrics
const updateChartMetrics = (companyId) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const properties = yield Property_1.Property.find({ companyId });
        // Calculate occupancy metrics
        const totalUnits = properties.reduce((sum, property) => sum + (property.units || 0), 0);
        const occupiedUnits = properties.reduce((sum, property) => sum + (property.occupiedUnits || 0), 0);
        const occupancyRate = totalUnits > 0 ? (occupiedUnits / totalUnits) * 100 : 0;
        // Calculate financial metrics
        const totalRent = properties.reduce((sum, property) => sum + (property.rent || 0), 0);
        const totalCollected = properties.reduce((sum, property) => sum + (property.totalRentCollected || 0), 0);
        const totalArrears = properties.reduce((sum, property) => sum + (property.currentArrears || 0), 0);
        // Initialize revenue chart data
        const revenueData = {
            type: 'revenue',
            data: [
                { month: 'Jan', USD: 0, ZWL: 0 },
                { month: 'Feb', USD: 0, ZWL: 0 },
                { month: 'Mar', USD: 0, ZWL: 0 },
                { month: 'Apr', USD: 0, ZWL: 0 },
                { month: 'May', USD: 0, ZWL: 0 },
                { month: 'Jun', USD: 0, ZWL: 0 },
                { month: 'Jul', USD: 0, ZWL: 0 },
                { month: 'Aug', USD: 0, ZWL: 0 },
                { month: 'Sep', USD: 0, ZWL: 0 },
                { month: 'Oct', USD: 0, ZWL: 0 },
                { month: 'Nov', USD: 0, ZWL: 0 },
                { month: 'Dec', USD: 0, ZWL: 0 }
            ],
            companyId,
            lastUpdated: new Date()
        };
        // Initialize commission chart data
        const commissionData = {
            type: 'commission',
            data: [
                { name: 'Agent 1', commission: 0 },
                { name: 'Agent 2', commission: 0 },
                { name: 'Agent 3', commission: 0 }
            ],
            companyId,
            lastUpdated: new Date()
        };
        // Update or create chart data
        yield Promise.all([
            ChartData_1.ChartData.findOneAndUpdate({ type: 'revenue', companyId }, revenueData, { upsert: true, new: true }),
            ChartData_1.ChartData.findOneAndUpdate({ type: 'commission', companyId }, commissionData, { upsert: true, new: true }),
            ChartData_1.ChartData.findOneAndUpdate({ type: 'metrics', companyId }, {
                type: 'metrics',
                companyId,
                occupancyRate,
                totalUnits,
                occupiedUnits,
                totalRent,
                totalCollected,
                totalArrears,
                lastUpdated: new Date()
            }, { upsert: true, new: true })
        ]);
    }
    catch (error) {
        console.error('Error updating chart metrics:', error);
        throw error;
    }
});
exports.updateChartMetrics = updateChartMetrics;
// Initialize chart data
const initializeChartData = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        if (!((_a = req.user) === null || _a === void 0 ? void 0 : _a.companyId)) {
            console.log('No company ID found in request');
            return res.status(401).json({ message: 'Company ID not found' });
        }
        console.log('Initializing chart data for company:', req.user.companyId);
        console.log('User data:', req.user);
        yield (0, exports.updateChartMetrics)(req.user.companyId);
        console.log('Chart metrics updated successfully');
        // Fetch the initialized data
        const [revenueData, commissionData] = yield Promise.all([
            ChartData_1.ChartData.findOne({ type: 'revenue', companyId: req.user.companyId }),
            ChartData_1.ChartData.findOne({ type: 'commission', companyId: req.user.companyId })
        ]);
        console.log('Fetched initialized data:', { revenueData, commissionData });
        if (!revenueData || !commissionData) {
            console.log('Failed to fetch initialized data');
            return res.status(500).json({ message: 'Failed to initialize chart data' });
        }
        console.log('Sending successful response');
        res.json({
            message: 'Chart data initialized successfully',
            revenue: revenueData,
            commission: commissionData
        });
    }
    catch (error) {
        console.error('Error initializing chart data:', error);
        res.status(500).json({ message: 'Error initializing chart data' });
    }
});
exports.initializeChartData = initializeChartData;
// Get chart data by type
const getChartData = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        if (!((_a = req.user) === null || _a === void 0 ? void 0 : _a.companyId)) {
            return res.status(401).json({ message: 'Company ID not found' });
        }
        const { type } = req.params;
        console.log('Fetching chart data for type:', type, 'companyId:', req.user.companyId);
        const chartData = yield ChartData_1.ChartData.findOne({
            type,
            companyId: req.user.companyId
        });
        if (!chartData) {
            console.log('No chart data found, initializing...');
            // If no chart data exists, initialize it
            yield (0, exports.updateChartMetrics)(req.user.companyId);
            const newChartData = yield ChartData_1.ChartData.findOne({
                type,
                companyId: req.user.companyId
            });
            if (!newChartData) {
                return res.status(404).json({
                    message: 'Failed to initialize chart data',
                    type,
                    companyId: req.user.companyId
                });
            }
            return res.json(newChartData);
        }
        res.json(chartData);
    }
    catch (error) {
        console.error('Error fetching chart data:', error);
        res.status(500).json({ message: 'Error fetching chart data' });
    }
});
exports.getChartData = getChartData;
// Update chart data
const updateChartData = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
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
});
exports.updateChartData = updateChartData;
const getPropertyMetrics = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.userId;
        const properties = yield Property_1.Property.find({ ownerId: userId });
        const totalUnits = properties.reduce((sum, property) => sum + (property.units || 0), 0);
        const occupiedUnits = properties.reduce((sum, property) => sum + (property.occupiedUnits || 0), 0);
        const occupancyRate = totalUnits > 0 ? (occupiedUnits / totalUnits) * 100 : 0;
        const totalRent = properties.reduce((sum, property) => sum + (property.rent || 0), 0);
        const totalCollected = properties.reduce((sum, property) => sum + (property.totalRentCollected || 0), 0);
        const totalArrears = properties.reduce((sum, property) => sum + (property.currentArrears || 0), 0);
        res.json({
            occupancyRate,
            totalRent,
            totalCollected,
            totalArrears
        });
    }
    catch (error) {
        if (error instanceof errorHandler_1.AppError) {
            throw error;
        }
        throw new errorHandler_1.AppError('Error fetching property metrics', 500);
    }
});
exports.getPropertyMetrics = getPropertyMetrics;
