import express from 'express';
import multer from 'multer';
import {
  getCompanies,
  getCompany,
  createCompany,
  updateCompany,
  deleteCompany,
  getCurrentCompany,
  uploadCompanyLogo,
  updateCurrentCompany
} from '../controllers/companyController';
import { authWithCompany } from '../middleware/auth';

const router = express.Router();

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    // Allow only image files
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  },
});

// Protected routes
router.get('/current', authWithCompany, getCurrentCompany);
router.put('/current', authWithCompany, updateCurrentCompany);

// Public routes
router.get('/', getCompanies);
router.get('/:id', getCompany);

// Protected routes
router.post('/', authWithCompany, createCompany);
router.put('/:id', authWithCompany, updateCompany);
router.delete('/:id', authWithCompany, deleteCompany);

// Logo upload route
router.post('/:id/logo', authWithCompany, upload.single('logo'), uploadCompanyLogo);

export default router; 