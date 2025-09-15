import express from 'express';
import { authWithCompany } from '../middleware/auth';
import multer from 'multer';
import { listSalesFiles, uploadSalesFile, downloadSalesFile, deleteSalesFile } from '../controllers/salesFileController';

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

router.get('/', authWithCompany, listSalesFiles);
router.post('/upload', authWithCompany, upload.single('file'), uploadSalesFile);
router.get('/:id/download', authWithCompany, downloadSalesFile);
router.delete('/:id', authWithCompany, deleteSalesFile);

export default router;


