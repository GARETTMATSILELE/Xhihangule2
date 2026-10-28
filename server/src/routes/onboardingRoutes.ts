import express from 'express';
import { getSignupAvailability, startOnboarding } from '../controllers/onboardingController';

const router = express.Router();

router.get('/availability', getSignupAvailability);
router.post('/start', startOnboarding);

export default router;
