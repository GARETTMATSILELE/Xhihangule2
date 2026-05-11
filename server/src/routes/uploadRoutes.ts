import express from 'express';
import multer from 'multer';
import { auth } from '../middleware/auth';

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB per file
  },
  fileFilter: (_req, file, cb) => {
    const allowed = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
      return;
    }
    cb(new Error('Invalid file type. Only PDF and image files are allowed.'));
  }
});

router.post(
  '/',
  auth,
  upload.fields([
    { name: 'files', maxCount: 10 },
    { name: 'file', maxCount: 10 }
  ]),
  (req, res) => {
    const uploadedFiles = (req.files || {}) as Record<string, Express.Multer.File[]>;
    const files = [...(uploadedFiles.files || []), ...(uploadedFiles.file || [])];

    if (!files.length) {
      return res.status(400).json({ message: 'No files uploaded' });
    }

    const payload = files.map((f) => ({
      name: f.originalname,
      type: f.mimetype,
      size: f.size,
      // Store as data URL so it can be persisted in maintenance attachments and downloaded/viewed directly.
      url: `data:${f.mimetype};base64,${f.buffer.toString('base64')}`
    }));

    return res.json(payload);
  }
);

export default router;
