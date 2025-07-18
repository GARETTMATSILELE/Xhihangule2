import express from 'express';
import { auth } from '../middleware/auth';
import { isAdmin, isAgent } from '../middleware/roles';
import multer from 'multer';
import { getFiles, uploadFile, downloadFile, deleteFile } from '../controllers/fileController';

const router = express.Router();

// Configure multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (req: Express.Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
    // Accept common document types
    const allowedTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'image/jpeg',
      'image/png',
      'text/plain'
    ];
    
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only PDF, Word, images, and text files are allowed.'));
    }
  }
});

// Get all files
router.get('/', getFiles);

// Upload a file
router.post('/upload', auth, upload.single('file'), uploadFile);

// Download a file
router.get('/download/:id', downloadFile);

// Delete a file
router.delete('/:id', auth, deleteFile);

export default router; 