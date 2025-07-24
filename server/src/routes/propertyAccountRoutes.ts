import express from 'express';
import { syncPaymentsToPropertyAccounts } from '../services/propertyAccountService';
import { addExpense, getPropertyAccount } from '../controllers/propertyAccountController';

const router = express.Router();

router.post('/sync-payments', async (req, res) => {
  await syncPaymentsToPropertyAccounts();
  res.json({ success: true });
});

router.get('/:propertyId', getPropertyAccount);
router.post('/:propertyId/expense', addExpense);

export default router; 