import express from 'express';
import { authWithCompany } from '../middleware/auth';
import { createCheckout, redeemVoucher, getPaymentStatus, changePlan } from '../controllers/billingController';

const router = express.Router();

router.post('/checkout', authWithCompany, createCheckout);
router.get('/payments/:id/status', authWithCompany, getPaymentStatus);
router.post('/vouchers/redeem', authWithCompany, redeemVoucher);
router.post('/subscriptions/change-plan', authWithCompany, changePlan);

export default router;









