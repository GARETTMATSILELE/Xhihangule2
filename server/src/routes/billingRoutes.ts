import express from 'express';
import { authWithCompany } from '../middleware/auth';
import { isAdmin } from '../middleware/roles';
import { createCheckout, redeemVoucher, getPaymentStatus, changePlan, listPublicPlans, getCheckoutSession, listPaymentProviders, reconcileDodoCheckout } from '../controllers/billingController';
import { listSubscriptionReconciliation, resolveSubscriptionReconciliation } from '../controllers/subscriptionReconciliationController';

const router = express.Router();

router.get('/plans', listPublicPlans);
router.get('/providers', listPaymentProviders);
router.get('/sessions/:id', authWithCompany, getCheckoutSession);
router.post('/checkout', authWithCompany, createCheckout);
router.post('/dodo/reconcile', authWithCompany, reconcileDodoCheckout);
router.get('/payments/:id/status', authWithCompany, getPaymentStatus);
router.post('/vouchers/redeem', authWithCompany, redeemVoucher);
router.post('/subscriptions/change-plan', authWithCompany, changePlan);
router.get('/reconciliation', authWithCompany, isAdmin, listSubscriptionReconciliation);
router.post('/reconciliation/:id/resolve', authWithCompany, isAdmin, resolveSubscriptionReconciliation);

export default router;



















