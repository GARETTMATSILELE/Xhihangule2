import express from 'express';
import { Request, Response, NextFunction } from 'express';
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

const asyncRoute = (
  handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown> | unknown
) => (req: Request, res: Response, next: NextFunction) => {
  Promise.resolve(handler(req, res, next)).catch(next);
};

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
router.get('/current', auth, asyncRoute(getCurrentCompany));
router.put('/current', authWithCompany, asyncRoute(updateCurrentCompany));
// Admin: change plan directly by company id (can be restricted later)
router.put('/:id/plan', authWithCompany, asyncRoute(updateCompany));

// Public routes
router.get('/', asyncRoute(getCompanies));
router.get('/:id', asyncRoute(getCompany));

// Protected routes
// Allow creating a company even if user has no company yet
router.post('/', auth, asyncRoute(createCompany));
router.put('/:id', authWithCompany, asyncRoute(updateCompany));
router.delete('/:id', authWithCompany, asyncRoute(deleteCompany));

// Logo upload route
router.post('/:id/logo', authWithCompany, upload.single('logo'), asyncRoute(uploadCompanyLogo));

export default router;