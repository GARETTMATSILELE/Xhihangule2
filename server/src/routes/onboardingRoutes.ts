import express from 'express';
import { startOnboarding } from '../controllers/onboardingController';

const router = express.Router();

router.post('/start', startOnboarding);

export default router;
