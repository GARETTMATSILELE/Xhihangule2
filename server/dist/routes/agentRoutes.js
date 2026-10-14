"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const auth_1 = require("../middleware/auth");
const limits_1 = require("../middleware/limits");
const roles_1 = require("../middleware/roles");
const multer_1 = __importDefault(require("multer"));
const contentDisposition_1 = require("../utils/contentDisposition");
const agentController_1 = require("../controllers/agentController");
const agentPropertyReportController_1 = require("../controllers/agentPropertyReportController");
const ownerCollectionController_1 = require("../controllers/ownerCollectionController");
const lettingController_1 = require("../agency/lettingController");
const ownerManagementController_1 = require("../controllers/ownerManagementController");
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
        const allowedExtensions = ['.pdf', '.doc', '.docx', '.jpg', '.jpeg', '.png', '.txt'];
        if (allowedTypes.includes(file.mimetype) && (0, contentDisposition_1.hasAllowedUploadExtension)(file.originalname, allowedExtensions)) {
            cb(null, true);
        }
        else {
            cb(new Error('Invalid file type. Only PDF, Word, images, and text files are allowed.'));
        }
    }
});
// Debug middleware
router.use((req, res, next) => {
    if (process.env.NODE_ENV !== 'production') {
        console.log('Agent routes middleware - Request path:', req.path);
    }
    next();
});
// Apply auth middleware to all routes
router.use(auth_1.auth);
router.get('/reports/property-details', roles_1.canViewPropertyDetailsReport, agentPropertyReportController_1.getAgentPropertyDetailsReport);
router.use(roles_1.isAgent);
// Agent dashboard routes
router.get('/properties', (req, res) => {
    (0, agentController_1.getAgentProperties)(req, res);
});
router.post('/properties', limits_1.enforcePropertyLimit, agentController_1.createAgentProperty);
router.put('/properties/:id/archive', agentController_1.archiveAgentProperty);
router.put('/properties/:id', agentController_1.updateAgentProperty);
router.delete('/properties/:id', agentController_1.deleteAgentProperty);
router.put('/properties/:id/restore', agentController_1.restoreAgentProperty);
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
// Property owner ORM routes (before /:id)
router.get('/property-owners/dashboard', ownerManagementController_1.ownersDashboard);
router.get('/property-owners/properties/:propertyId/ledger', ownerManagementController_1.propertyLedgerSnapshot);
router.post('/property-owners/documents', ownerManagementController_1.ownerDocumentsUpload);
router.post('/property-owners/ownership-history', ownerManagementController_1.ownershipHistoryCreate);
router.get('/property-owners/:ownerId/portfolio', ownerManagementController_1.ownerPortfolio);
router.get('/property-owners/:ownerId/financials', ownerManagementController_1.ownerFinancials);
router.get('/property-owners/:ownerId/maintenance', ownerManagementController_1.ownerMaintenance);
router.get('/property-owners/:ownerId/documents', ownerManagementController_1.ownerDocumentsList);
router.get('/property-owners/:ownerId/history', ownerManagementController_1.ownerHistoryList);
router.get('/property-owners/:ownerId/profile-extras', ownerManagementController_1.ownerProfileExtras);
router.get('/property-owners/:ownerId/full-profile', ownerManagementController_1.ownerFullProfile);
router.patch('/property-owners/:ownerId/profile', ownerManagementController_1.ownerProfilePatch);
router.post('/property-owners/:ownerId/banking', ownerManagementController_1.ownerBankingUpsert);
router.post('/property-owners/:ownerId/preferences', ownerManagementController_1.ownerPreferencesUpsert);
router.post('/property-owners/:ownerId/documents', ownerManagementController_1.ownerDocumentsUpload);
router.get('/property-owners/:ownerId/documents/:docType', ownerManagementController_1.ownerDocumentPdf);
// Property owner routes
router.get('/property-owners', agentController_1.getAgentPropertyOwners);
router.get('/property-owners/:id', agentController_1.getAgentPropertyOwnerById);
router.post('/property-owners', agentController_1.createAgentPropertyOwner);
router.put('/property-owners/:id', agentController_1.updateAgentPropertyOwner);
router.delete('/property-owners/:id', agentController_1.deleteAgentPropertyOwner);
router.post('/letting/assessments', lettingController_1.saveAssessment);
router.post('/letting/assessments/:id/status', lettingController_1.advanceAssessment);
router.post('/letting/mandates', lettingController_1.saveMandate);
router.post('/letting/mandates/:id/status', lettingController_1.advanceMandate);
router.post('/letting/listings', lettingController_1.saveListing);
router.post('/letting/listings/:id/status', lettingController_1.updateListing);
router.post('/letting/applications/:id/status', lettingController_1.shortlistApplication);
router.post('/letting/applications/:id/owner-decision', lettingController_1.ownerApplicationDecision);
router.post('/letting/leases', lettingController_1.prepareAgencyLease);
router.post('/letting/leases/:id/signature', lettingController_1.signAgencyLease);
router.post('/letting/leases/:id/activate', lettingController_1.activateAgencyLease);
router.get('/letting/rent-board', lettingController_1.rentCollectionBoard);
router.post('/letting/maintenance-payment-requests', lettingController_1.requestMaintenancePayment);
router.post('/letting/levies/:id/receipt', lettingController_1.fileLevyReceipt);
router.get('/letting/properties/:propertyId/workspace', lettingController_1.propertyWorkspace);
router.get('/letting/search', lettingController_1.agencySearch);
router.get('/letting/portfolio', lettingController_1.seniorPortfolio);
router.get('/owner-collections', ownerCollectionController_1.listOwnerCollections);
router.post('/owner-collections', ownerCollectionController_1.createOwnerCollection);
router.post('/owner-collections/:id/advance', ownerCollectionController_1.advanceOwnerCollection);
exports.default = router;
