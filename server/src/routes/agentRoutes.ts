import express from 'express';
import { auth } from '../middleware/auth';
import { isAgent } from '../middleware/roles';
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
  createAgentPropertyOwner,
  updateAgentPropertyOwner,
  deleteAgentPropertyOwner,
  updateAgentProperty
} from '../controllers/agentController';

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
  console.log('Agent routes middleware - Request path:', req.path);
  next();
});

// Apply auth middleware to all routes
router.use(auth);
router.use(isAgent);

// Agent dashboard routes
router.get('/properties', (req, res) => {
  console.log('Agent properties route hit');
  getAgentProperties(req, res);
});
router.post('/properties', createAgentProperty);
router.put('/properties/:id', updateAgentProperty);
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

// Property owner routes
router.get('/property-owners', getAgentPropertyOwners);
router.post('/property-owners', createAgentPropertyOwner);
router.put('/property-owners/:id', updateAgentPropertyOwner);
router.delete('/property-owners/:id', deleteAgentPropertyOwner);

export default router; 