import express from 'express';
import { auth } from '../middleware/auth';
import { enforcePropertyLimit } from '../middleware/limits';
import { canViewPropertyDetailsReport, isAgent } from '../middleware/roles';
import multer from 'multer';
import {
  getAgentProperties,
  getAgentTenants,
  getAgentLeases,
  getAgentFiles,
  getAgentCommission,
  createAgentProperty,
  createAgentTenant,
  createAgentLease,
  createAgentPayment,
  updateAgentPayment,
  getAgentPayments,
  getAgentLevyPayments,
  createAgentFile,
  getAgentPropertyOwners,
  getAgentPropertyOwnerById,
  createAgentPropertyOwner,
  updateAgentPropertyOwner,
  deleteAgentPropertyOwner,
  updateAgentProperty,
  archiveAgentProperty,
  deleteAgentProperty,
  restoreAgentProperty
} from '../controllers/agentController';
import { getAgentPropertyDetailsReport } from '../controllers/agentPropertyReportController';
import {
  ownersDashboard,
  ownerPortfolio,
  ownerFinancials,
  ownerMaintenance,
  ownerDocumentsList,
  ownerDocumentsUpload,
  ownerBankingUpsert,
  ownerPreferencesUpsert,
  ownerProfileExtras,
  ownerHistoryList,
  ownershipHistoryCreate,
  ownerDocumentPdf,
  ownerFullProfile,
  ownerProfilePatch,
  propertyLedgerSnapshot,
} from '../controllers/ownerManagementController';

const router = express.Router();

// Configure multer for memory storage (similar to fileRoutes)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req: Express.Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
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
    } else {
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
router.use(auth);
router.get('/reports/property-details', canViewPropertyDetailsReport, getAgentPropertyDetailsReport);
router.use(isAgent);

// Agent dashboard routes
router.get('/properties', (req, res) => {
  getAgentProperties(req, res);
});
router.post('/properties', enforcePropertyLimit, createAgentProperty);
router.put('/properties/:id/archive', archiveAgentProperty);
router.put('/properties/:id', updateAgentProperty);
router.delete('/properties/:id', deleteAgentProperty);
router.put('/properties/:id/restore', restoreAgentProperty);
router.get('/tenants', getAgentTenants);
router.post('/tenants', createAgentTenant);
router.get('/leases', getAgentLeases);
router.post('/leases', createAgentLease);
router.get('/files', getAgentFiles);
router.post('/files', upload.single('file'), createAgentFile);
router.post('/payments', createAgentPayment);
router.put('/payments/:id', updateAgentPayment);
router.get('/payments', getAgentPayments);
router.get('/levy-payments', getAgentLevyPayments);
router.get('/commission', getAgentCommission);

// Property owner ORM routes (before /:id)
router.get('/property-owners/dashboard', ownersDashboard);
router.get('/property-owners/properties/:propertyId/ledger', propertyLedgerSnapshot);
router.post('/property-owners/documents', ownerDocumentsUpload);
router.post('/property-owners/ownership-history', ownershipHistoryCreate);
router.get('/property-owners/:ownerId/portfolio', ownerPortfolio);
router.get('/property-owners/:ownerId/financials', ownerFinancials);
router.get('/property-owners/:ownerId/maintenance', ownerMaintenance);
router.get('/property-owners/:ownerId/documents', ownerDocumentsList);
router.get('/property-owners/:ownerId/history', ownerHistoryList);
router.get('/property-owners/:ownerId/profile-extras', ownerProfileExtras);
router.get('/property-owners/:ownerId/full-profile', ownerFullProfile);
router.patch('/property-owners/:ownerId/profile', ownerProfilePatch);
router.post('/property-owners/:ownerId/banking', ownerBankingUpsert);
router.post('/property-owners/:ownerId/preferences', ownerPreferencesUpsert);
router.post('/property-owners/:ownerId/documents', ownerDocumentsUpload);
router.get('/property-owners/:ownerId/documents/:docType', ownerDocumentPdf);

// Property owner routes
router.get('/property-owners', getAgentPropertyOwners);
router.get('/property-owners/:id', getAgentPropertyOwnerById);
router.post('/property-owners', createAgentPropertyOwner);
router.put('/property-owners/:id', updateAgentPropertyOwner);
router.delete('/property-owners/:id', deleteAgentPropertyOwner);

export default router; 