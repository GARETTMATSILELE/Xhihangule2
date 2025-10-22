import { Router } from 'express';
import { authWithCompany } from '../middleware/auth';
import { 
  getTrialStatus, 
  convertTrialToActive, 
  extendTrial, 
  getSubscription 
} from '../controllers/subscriptionController';

const router = Router();

// All routes require authentication with company
router.use(authWithCompany);

// Get trial status for current user's company
router.get('/trial-status', getTrialStatus);

// Get subscription details
router.get('/subscription', getSubscription);

// Convert trial to active subscription
router.post('/convert-trial', convertTrialToActive);

// Extend trial (admin function)
router.post('/extend-trial', extendTrial);

export default router;
