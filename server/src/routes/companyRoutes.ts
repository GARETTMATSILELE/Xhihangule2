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
import { auth, authWithCompany } from '../middleware/auth';

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
// Allow fetching current company even if none exists (returns 404 inside controller)
router.get('/current', auth, getCurrentCompany);
router.put('/current', authWithCompany, updateCurrentCompany);
// Admin: change plan directly by company id (can be restricted later)
router.put('/:id/plan', authWithCompany, updateCompany);

// Public routes
router.get('/', getCompanies);
router.get('/:id', getCompany);

// Protected routes
// Allow creating a company even if user has no company yet
router.post('/', auth, createCompany);
router.put('/:id', authWithCompany, updateCompany);
router.delete('/:id', authWithCompany, deleteCompany);

// Logo upload route
router.post('/:id/logo', authWithCompany, upload.single('logo'), uploadCompanyLogo);

export default router; 