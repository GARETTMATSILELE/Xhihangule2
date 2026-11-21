import express from 'express';
import { authWithCompany } from '../middleware/auth';
import { createCheckout, redeemVoucher, getPaymentStatus, changePlan, listPublicPlans, getCheckoutSession, listPaymentProviders, reconcileDodoCheckout } from '../controllers/billingController';

const router = express.Router();

router.get('/plans', listPublicPlans);
router.get('/providers', listPaymentProviders);
router.get('/sessions/:id', authWithCompany, getCheckoutSession);
router.post('/checkout', authWithCompany, createCheckout);
router.post('/dodo/reconcile', authWithCompany, reconcileDodoCheckout);
router.get('/payments/:id/status', authWithCompany, getPaymentStatus);
router.post('/vouchers/redeem', authWithCompany, redeemVoucher);
router.post('/subscriptions/change-plan', authWithCompany, changePlan);

export default router;



















