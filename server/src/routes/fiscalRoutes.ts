import express from 'express';
import { getFiscalHealth } from '../controllers/fiscalController';
import { auth } from '../middleware/auth';

const router = express.Router();

// GET /api/fiscal/health
router.get('/health', auth, getFiscalHealth);

export default router;


