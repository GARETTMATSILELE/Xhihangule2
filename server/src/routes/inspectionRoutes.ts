import express from 'express';
import multer from 'multer';
import { auth } from '../middleware/auth';
import {
  listInspections,
  createInspection,
  updateInspection,
  deleteInspection,
  updateInspectionReport,
  uploadInspectionAttachment,
  generateLeaseInspections,
  rescheduleInspection,
  createFollowUpInspection,
  escalateInspectionToMaintenance,
  getInspectionOperations,
  dispatchInspectionReminders,
  getInspectionComplianceMetrics,
  getInspectionCalendarEvents,
  getInspectionTemplates,
  startInspectionExecution,
  autosaveInspectionExecution,
  completeInspectionExecution,
  uploadInspectionItemPhoto,
  getInspectionReportHtml
} from '../controllers/inspectionController';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

router.use(auth);

router.get('/operations', getInspectionOperations);
router.get('/compliance', getInspectionComplianceMetrics);
router.get('/calendar-events', getInspectionCalendarEvents);
router.get('/templates', getInspectionTemplates);
router.post('/generate-from-leases', generateLeaseInspections);
router.post('/dispatch-reminders', dispatchInspectionReminders);
router.get('/', listInspections);
router.post('/', createInspection);
router.post('/:id/reschedule', rescheduleInspection);
router.post('/:id/follow-up', createFollowUpInspection);
router.post('/:id/escalate-maintenance', escalateInspectionToMaintenance);
router.post('/:id/start', startInspectionExecution);
router.put('/:id/autosave', autosaveInspectionExecution);
router.post('/:id/complete', completeInspectionExecution);
router.get('/:id/report-html', getInspectionReportHtml);
router.post('/:id/checklist/:itemId/photos', upload.single('file'), uploadInspectionItemPhoto);
router.put('/:id', updateInspection);
router.delete('/:id', deleteInspection);
router.put('/:id/report', updateInspectionReport);

// Attachments
router.post('/:id/attachments', upload.single('file'), uploadInspectionAttachment);

export default router;


