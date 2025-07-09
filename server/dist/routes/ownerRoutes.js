"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const auth_1 = require("../middleware/auth");
const ownerController_1 = require("../controllers/ownerController");
const router = express_1.default.Router();
console.log('OwnerRoutes: Registering owner routes...');
// All routes require PropertyOwner authentication
router.use(auth_1.propertyOwnerAuth);
// Property routes for owners
router.get('/properties', (req, res, next) => {
    console.log('OwnerRoutes: GET /properties route hit');
    next();
}, ownerController_1.getOwnerProperties);
router.get('/properties/:id', (req, res, next) => {
    console.log('OwnerRoutes: GET /properties/:id route hit');
    next();
}, ownerController_1.getOwnerPropertyById);
// Maintenance request routes for owners
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
router.post('/maintenance-requests/:id/messages', (req, res, next) => {
    console.log('OwnerRoutes: POST /maintenance-requests/:id/messages route hit');
    next();
}, ownerController_1.addOwnerMaintenanceMessage);
console.log('OwnerRoutes: All owner routes registered');
exports.default = router;
