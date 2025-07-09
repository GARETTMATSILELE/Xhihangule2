import express, { RequestHandler } from 'express';
import { LeaseController } from '../controllers/leaseController';
import { auth } from '../middleware/auth';

const router = express.Router();
const leaseController = LeaseController.getInstance();

// Public endpoints (must come before protected routes)
router.get('/public', leaseController.getLeasesPublic.bind(leaseController) as RequestHandler);
router.get('/public/:id', leaseController.getLeaseByIdPublic.bind(leaseController) as RequestHandler);

// Protected routes - require authentication
router.use(auth);

router.get('/', leaseController.getLeases.bind(leaseController) as RequestHandler);
router.get('/:id', leaseController.getLeaseById.bind(leaseController) as RequestHandler);
router.post('/', leaseController.createLease.bind(leaseController) as RequestHandler);
router.put('/:id', leaseController.updateLease.bind(leaseController) as RequestHandler);
router.delete('/:id', leaseController.deleteLease.bind(leaseController) as RequestHandler);
router.get('/stats/overview', leaseController.getLeaseStats.bind(leaseController) as RequestHandler);
router.get('/active/list', leaseController.getActiveLeases.bind(leaseController) as RequestHandler);
router.get('/expiring/list', leaseController.getExpiringLeases.bind(leaseController) as RequestHandler);

export default router; 