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
const tenantController_1 = require("../controllers/tenantController");
const validation_1 = require("../middleware/validation");
const Tenant_1 = require("../models/Tenant");
const router = express_1.default.Router();
// Public endpoint for admin dashboard
router.get('/public', tenantController_1.getTenantsPublic);
// MVP: Comprehensive public endpoints for all tenant operations (disabled in production)
router.get('/public/all', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    if (process.env.NODE_ENV === 'production') {
        return res.status(404).json({ message: 'Not found' });
    }
    try {
        const tenants = yield Tenant_1.Tenant.find({})
            .select('firstName lastName email phone rentAmount leaseStartDate leaseEndDate status')
            .limit(50);
        res.json(tenants);
    }
    catch (error) {
        console.error('Error fetching all public tenants:', error);
        res.status(500).json({ message: 'Error fetching tenants' });
    }
}));
router.get('/public/:id', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const tenant = yield Tenant_1.Tenant.findById(req.params.id)
            .select('firstName lastName email phone rentAmount leaseStartDate leaseEndDate status propertyId');
        if (!tenant) {
            return res.status(404).json({ message: 'Tenant not found' });
        }
        res.json(tenant);
    }
    catch (error) {
        console.error('Error fetching public tenant:', error);
        res.status(500).json({ message: 'Error fetching tenant' });
    }
}));
// Protected routes
router.use(auth_1.authWithCompany);
// Routes
router.get('/', tenantController_1.getTenants);
router.get('/:id', tenantController_1.getTenant);
router.post('/', (0, validation_1.validateRequest)(validation_1.createTenantSchema), tenantController_1.createTenant);
router.put('/:id', (0, validation_1.validateRequest)(validation_1.updateTenantSchema), tenantController_1.updateTenant);
router.delete('/:id', tenantController_1.deleteTenant);
exports.default = router;
