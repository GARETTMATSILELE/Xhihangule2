"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const auth_1 = require("../middleware/auth");
const roles_1 = require("../middleware/roles");
const multer_1 = __importDefault(require("multer"));
const agentController_1 = require("../controllers/agentController");
const router = express_1.default.Router();
// Configure multer for memory storage (similar to fileRoutes)
const upload = (0, multer_1.default)({
    storage: multer_1.default.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const allowedTypes = [
            'application/pdf',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'image/jpeg',
            'image/png',
            'text/plain'
        ];
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        }
        else {
            cb(new Error('Invalid file type. Only PDF, Word, images, and text files are allowed.'));
        }
    }
});
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
router.put('/properties/:id', agentController_1.updateAgentProperty);
router.get('/tenants', agentController_1.getAgentTenants);
router.post('/tenants', agentController_1.createAgentTenant);
router.get('/leases', agentController_1.getAgentLeases);
router.post('/leases', agentController_1.createAgentLease);
router.get('/files', agentController_1.getAgentFiles);
router.post('/files', upload.single('file'), agentController_1.createAgentFile);
router.post('/payments', agentController_1.createAgentPayment);
router.put('/payments/:id', agentController_1.updateAgentPayment);
router.get('/payments', agentController_1.getAgentPayments);
router.get('/levy-payments', agentController_1.getAgentLevyPayments);
router.get('/commission', agentController_1.getAgentCommission);
// Property owner routes
router.get('/property-owners', agentController_1.getAgentPropertyOwners);
router.get('/property-owners/:id', agentController_1.getAgentPropertyOwnerById);
router.post('/property-owners', agentController_1.createAgentPropertyOwner);
router.put('/property-owners/:id', agentController_1.updateAgentPropertyOwner);
router.delete('/property-owners/:id', agentController_1.deleteAgentPropertyOwner);
exports.default = router;
