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
import { auth } from '../middleware/auth';

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
router.get('/current', auth, getCurrentCompany);
router.put('/current', auth, updateCurrentCompany);

// Public routes
router.get('/', getCompanies);
router.get('/:id', getCompany);

// Protected routes
router.post('/', auth, createCompany);
router.put('/:id', auth, updateCompany);
router.delete('/:id', auth, deleteCompany);

// Logo upload route
router.post('/:id/logo', auth, upload.single('logo'), uploadCompanyLogo);

export default router; 