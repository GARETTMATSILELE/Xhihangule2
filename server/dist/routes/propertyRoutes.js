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
const propertyController_1 = require("../controllers/propertyController");
const auth_1 = require("../middleware/auth");
const roles_1 = require("../middleware/roles");
const logger_1 = require("../utils/logger");
const Property_1 = require("../models/Property");
const router = express_1.default.Router();
// Debug middleware
router.use((req, res, next) => {
    var _a, _b;
    logger_1.logger.debug('Property route accessed:', {
        method: req.method,
        path: req.path,
        userId: (_a = req.user) === null || _a === void 0 ? void 0 : _a.userId,
        role: (_b = req.user) === null || _b === void 0 ? void 0 : _b.role
    });
    next();
});
// Debug route to list all properties (disabled in production)
router.get('/debug/all', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    if (process.env.NODE_ENV === 'production') {
        return res.status(404).json({ message: 'Not found' });
    }
    try {
        const properties = yield Property_1.Property.find({}).populate('ownerId', 'firstName lastName email');
        console.log('All properties in database:', {
            count: properties.length,
            properties: properties.map((p) => ({
                id: p._id,
                name: p.name,
                address: p.address,
                type: p.type,
                ownerId: p.ownerId,
                companyId: p.companyId
            }))
        });
        res.json(properties);
    }
    catch (error) {
        console.error('Error fetching all properties:', error);
        res.status(500).json({ message: 'Error fetching properties' });
    }
}));
// Public routes (no auth required)
router.get('/public', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const properties = yield Property_1.Property.find({ status: 'available' })
            .select('name address type status')
            .limit(10);
        res.json(properties);
    }
    catch (error) {
        console.error('Error fetching public properties:', error);
        res.status(500).json({ message: 'Error fetching properties' });
    }
}));
// Public property creation endpoint (no auth required)
router.post('/public', propertyController_1.createPropertyPublic);
// New public endpoint with user-based filtering (no auth required)
router.get('/public-filtered', propertyController_1.getPublicProperties);
// MVP: Comprehensive public endpoints for all property operations (disabled in production)
router.get('/public/all', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    if (process.env.NODE_ENV === 'production') {
        return res.status(404).json({ message: 'Not found' });
    }
    try {
        const properties = yield Property_1.Property.find({})
            .select('name address type status rentAmount bedrooms bathrooms amenities')
            .limit(50);
        res.json(properties);
    }
    catch (error) {
        console.error('Error fetching all public properties:', error);
        res.status(500).json({ message: 'Error fetching properties' });
    }
}));
router.get('/public/:id', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const property = yield Property_1.Property.findById(req.params.id)
            .select('name address type status rentAmount bedrooms bathrooms amenities description');
        if (!property) {
            return res.status(404).json({ message: 'Property not found' });
        }
        res.json(property);
    }
    catch (error) {
        console.error('Error fetching public property:', error);
        res.status(500).json({ message: 'Error fetching property' });
    }
}));
// Admin dashboard route (disabled in production)
router.get('/admin-dashboard', (req, res, next) => {
    if (process.env.NODE_ENV === 'production') {
        return res.status(404).json({ message: 'Not found' });
    }
    return (0, propertyController_1.getAdminDashboardProperties)(req, res);
});
// Protected routes (auth required)
router.get('/', auth_1.authWithCompany, propertyController_1.getProperties);
router.get('/vacant', auth_1.authWithCompany, propertyController_1.getVacantProperties);
router.get('/:id', auth_1.authWithCompany, propertyController_1.getProperty);
router.post('/', auth_1.authWithCompany, roles_1.canCreateProperty, propertyController_1.createProperty);
// Sales route for creating property with sales fields
router.post('/sales', auth_1.authWithCompany, propertyController_1.createSalesProperty);
// Allow sales/agents to update their own sales properties (controller enforces ownership)
router.put('/sales/:id', auth_1.authWithCompany, propertyController_1.updateProperty);
router.put('/:id', auth_1.authWithCompany, roles_1.isAdmin, propertyController_1.updateProperty);
router.delete('/:id', auth_1.authWithCompany, roles_1.isAdmin, propertyController_1.deleteProperty);
exports.default = router;
