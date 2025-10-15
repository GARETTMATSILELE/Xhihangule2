import express from 'express';
import multer from 'multer';
import { auth } from '../middleware/auth';
import { listInspections, createInspection, updateInspection, deleteInspection, updateInspectionReport, uploadInspectionAttachment } from '../controllers/inspectionController';

const router = express.Router();

router.use(auth);

router.get('/', listInspections);
router.post('/', createInspection);
router.put('/:id', updateInspection);
router.delete('/:id', deleteInspection);
router.put('/:id/report', updateInspectionReport);

// Attachments
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });
router.post('/:id/attachments', upload.single('file'), uploadInspectionAttachment);

export default router;


