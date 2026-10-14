import express from 'express';
import { authWithCompany } from '../middleware/auth';
import multer from 'multer';
import { listSalesFiles, uploadSalesFile, downloadSalesFile, deleteSalesFile } from '../controllers/salesFileController';
import { hasAllowedUploadExtension } from '../utils/contentDisposition';

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowedTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'image/jpeg',
      'image/png',
      'text/plain'
    ];
    const allowedExtensions = ['.pdf', '.doc', '.docx', '.jpg', '.jpeg', '.png', '.txt'];
    if (allowedTypes.includes(file.mimetype) && hasAllowedUploadExtension(file.originalname, allowedExtensions)) {
      cb(null, true);
      return;
    }
    cb(new Error('Invalid file type. Only PDF, Word, images, and text files are allowed.'));
  }
});

router.get('/', authWithCompany, listSalesFiles);
router.post('/upload', authWithCompany, upload.single('file'), uploadSalesFile);
router.get('/:id/download', authWithCompany, downloadSalesFile);
router.delete('/:id', authWithCompany, deleteSalesFile);

export default router;


