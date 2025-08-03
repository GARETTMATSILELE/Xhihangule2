"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const auth_1 = require("../middleware/auth");
const roles_1 = require("../middleware/roles");
const agentController_1 = require("../controllers/agentController");
const router = express_1.default.Router();
// Debug middleware
router.use((req, res, next) => {
    console.log('Agent routes middleware - Request path:', req.path);
    next();
});
// Apply auth middleware to all routes
router.use(auth_1.auth);
router.use(roles_1.isAgent);
// Agent dashboard routes
router.get('/properties', (req, res) => {
    console.log('Agent properties route hit');
    (0, agentController_1.getAgentProperties)(req, res);
});
router.post('/properties', agentController_1.createAgentProperty);
router.get('/tenants', agentController_1.getAgentTenants);
router.post('/tenants', agentController_1.createAgentTenant);
router.get('/leases', agentController_1.getAgentLeases);
router.post('/leases', agentController_1.createAgentLease);
router.get('/files', agentController_1.getAgentFiles);
router.post('/files', agentController_1.createAgentFile);
router.post('/payments', agentController_1.createAgentPayment);
router.put('/payments/:id', agentController_1.updateAgentPayment);
router.get('/commission', agentController_1.getAgentCommission);
// Property owner routes
router.get('/property-owners', agentController_1.getAgentPropertyOwners);
router.post('/property-owners', agentController_1.createAgentPropertyOwner);
router.put('/property-owners/:id', agentController_1.updateAgentPropertyOwner);
router.delete('/property-owners/:id', agentController_1.deleteAgentPropertyOwner);
exports.default = router;
