import express from 'express';
import { auth } from '../middleware/auth';
import { canViewCommissions, isAccountant } from '../middleware/roles';
import {
  applyTaxDeductions,
  calculateSettlement,
  closeTrustAccount,
  createTrustAccount,
  generateTrustReport,
  getTrustAccount,
  getTrustAccountByProperty,
  getTrustAccountByPropertyFull,
  getTrustAccountFull,
  getTrustAuditLogs,
  getTrustLedger,
  getTrustReconciliation,
  getTrustTaxSummary,
  listTrustAccounts,
  recordBuyerPayment,
  transferToSeller,
  transitionTrustWorkflow,
  runTrustReconciliation
} from '../controllers/trustAccountController';

const router = express.Router();

router.use(auth);

router.get('/', canViewCommissions, listTrustAccounts);
router.post('/', isAccountant, createTrustAccount);
router.get('/property/:propertyId', canViewCommissions, getTrustAccountByProperty);
router.get('/property/:propertyId/full', canViewCommissions, getTrustAccountByPropertyFull);
router.get('/:id', canViewCommissions, getTrustAccount);
router.get('/:id/full', canViewCommissions, getTrustAccountFull);
router.get('/:id/ledger', canViewCommissions, getTrustLedger);
router.get('/:id/tax-summary', canViewCommissions, getTrustTaxSummary);
router.get('/:id/audit-logs', canViewCommissions, getTrustAuditLogs);
router.get('/:id/reconciliation', canViewCommissions, getTrustReconciliation);

router.post('/:id/buyer-payments', isAccountant, recordBuyerPayment);
router.post('/:id/calculate-settlement', isAccountant, calculateSettlement);
router.post('/:id/apply-tax-deductions', isAccountant, applyTaxDeductions);
router.post('/:id/transfer-to-seller', isAccountant, transferToSeller);
router.post('/:id/close', isAccountant, closeTrustAccount);
router.post('/:id/workflow-transition', isAccountant, transitionTrustWorkflow);
router.get('/:id/reports/:reportType', canViewCommissions, generateTrustReport);
router.post('/reconciliation/run', isAccountant, runTrustReconciliation);

export default router;
