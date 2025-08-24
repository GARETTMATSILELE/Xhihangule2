import express from 'express';
import { authWithCompany } from '../middleware/auth';
import { isAccountant } from '../middleware/roles';
import { createInvoice, getInvoices } from '../controllers/invoiceController';

const router = express.Router();

// Apply authentication middleware to all routes
router.use(authWithCompany);

// Invoice routes - require accountant role
router.post('/', isAccountant, createInvoice);
router.get('/', isAccountant, getInvoices);

export default router; 