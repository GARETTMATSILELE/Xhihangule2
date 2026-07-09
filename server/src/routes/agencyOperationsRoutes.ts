import express from 'express';
import { authWithCompany } from '../middleware/auth';
import {
  getExecutiveDashboard,
  listMunicipalBillsOverview,
  listDutyShifts,
  createDutyShift,
  updateDutyShift,
  deleteDutyShift,
  generateDutyRoster,
  listAgentAvailability,
  upsertAgentAvailability,
  listLeaveRequests,
  createLeaveRequest,
  reviewLeaveRequest,
  listPublicHolidays,
  createPublicHoliday,
  getDutyTypes,
} from '../controllers/agencyOperationsController';

const router = express.Router();

router.use(authWithCompany);

router.get('/dashboard', getExecutiveDashboard);
router.get('/municipal-bills', listMunicipalBillsOverview);

router.get('/duty-roster/types', getDutyTypes);
router.get('/duty-roster/shifts', listDutyShifts);
router.post('/duty-roster/shifts', createDutyShift);
router.patch('/duty-roster/shifts/:id', updateDutyShift);
router.delete('/duty-roster/shifts/:id', deleteDutyShift);
router.post('/duty-roster/generate', generateDutyRoster);

router.get('/duty-roster/availability', listAgentAvailability);
router.put('/duty-roster/availability', upsertAgentAvailability);

router.get('/duty-roster/leave', listLeaveRequests);
router.post('/duty-roster/leave', createLeaveRequest);
router.patch('/duty-roster/leave/:id', reviewLeaveRequest);

router.get('/duty-roster/holidays', listPublicHolidays);
router.post('/duty-roster/holidays', createPublicHoliday);

export default router;
