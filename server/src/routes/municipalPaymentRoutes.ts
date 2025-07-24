import express from 'express';
import { createMunicipalPayment } from '../controllers/municipalPaymentController';
import { auth } from '../middleware/auth';

const router = express.Router();

router.post('/', auth, createMunicipalPayment);

export default router; 