import express from 'express';
import { createInvoice, getInvoices } from '../controllers/invoiceController';

const router = express.Router();

router.post('/', createInvoice);
router.get('/', getInvoices);

export default router; 