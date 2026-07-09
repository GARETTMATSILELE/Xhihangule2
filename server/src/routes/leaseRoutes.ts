import express, { RequestHandler } from 'express';
import { LeaseController } from '../controllers/leaseController';
import { authWithCompany, requireActiveSubscription } from '../middleware/auth';

const router = express.Router();
const leaseController = LeaseController.getInstance();

// Legacy public endpoints now require authentication because leases contain
// tenant and financial information.
router.get('/public', authWithCompany, leaseController.getLeasesPublic.bind(leaseController) as RequestHandler);
router.get('/public/:id', authWithCompany, leaseController.getLeaseByIdPublic.bind(leaseController) as RequestHandler);

// Protected routes - require authentication
router.use(authWithCompany, requireActiveSubscription());

router.get('/', leaseController.getLeases.bind(leaseController) as RequestHandler);
router.get('/stats/overview', leaseController.getLeaseStats.bind(leaseController) as RequestHandler);
router.get('/active/list', leaseController.getActiveLeases.bind(leaseController) as RequestHandler);
router.get('/expiring/list', leaseController.getExpiringLeases.bind(leaseController) as RequestHandler);
router.post('/:id/renew', leaseController.renewLease.bind(leaseController) as RequestHandler);
router.post('/:id/terminate', leaseController.terminateLease.bind(leaseController) as RequestHandler);
router.post('/:id/close-settlement', leaseController.closeSettlement.bind(leaseController) as RequestHandler);
router.patch('/:id/status', leaseController.updateLeaseStatus.bind(leaseController) as RequestHandler);
router.post('/:id/extend', leaseController.extendLease.bind(leaseController) as RequestHandler);
router.get('/:id', leaseController.getLeaseById.bind(leaseController) as RequestHandler);
router.post('/', leaseController.createLease.bind(leaseController) as RequestHandler);
router.put('/:id', leaseController.updateLease.bind(leaseController) as RequestHandler);
router.delete('/:id', leaseController.deleteLease.bind(leaseController) as RequestHandler);

export default router; 