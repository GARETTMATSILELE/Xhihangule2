import express from 'express';
import { getFiscalHealth } from '../controllers/fiscalController';

const router = express.Router();

// GET /api/fiscal/health?companyId=...
router.get('/health', getFiscalHealth);

export default router;


