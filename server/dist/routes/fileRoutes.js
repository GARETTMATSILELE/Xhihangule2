"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const auth_1 = require("../middleware/auth");
const multer_1 = __importDefault(require("multer"));
const fileController_1 = require("../controllers/fileController");
const contentDisposition_1 = require("../utils/contentDisposition");
const DOCUMENT_EXTENSIONS = ['.pdf', '.doc', '.docx', '.jpg', '.jpeg', '.png', '.txt'];
const router = express_1.default.Router();
// Configure multer for memory storage
const upload = (0, multer_1.default)({
    storage: multer_1.default.memoryStorage(),
    limits: {
        fileSize: 5 * 1024 * 1024, // 5MB limit
    },
    fileFilter: (req, file, cb) => {
        // Accept common document types
        const allowedTypes = [
            'application/pdf',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'image/jpeg',
            'image/png',
            'text/plain'
        ];
        if (allowedTypes.includes(file.mimetype) && (0, contentDisposition_1.hasAllowedUploadExtension)(file.originalname, DOCUMENT_EXTENSIONS)) {
            cb(null, true);
        }
        else {
            cb(new Error('Invalid file type. Only PDF, Word, images, and text files are allowed.'));
        }
    }
});
// Get all files (company-scoped)
router.get('/', auth_1.authWithCompany, fileController_1.getFiles);
// Upload a file. A rejected type is a client error and must not be stored.
router.post('/upload', auth_1.authWithCompany, (req, res, next) => {
    upload.single('file')(req, res, (err) => {
        if (err) {
            res.status(400).json({ message: 'Invalid file type. Only PDF, Word, images, and text files are allowed.' });
            return;
        }
        next();
    });
}, fileController_1.uploadFile);
// Download a file (company-scoped)
router.get('/download/:id', auth_1.authWithCompany, fileController_1.downloadFile);
// Delete a file
router.delete('/:id', auth_1.authWithCompany, fileController_1.deleteFile);
exports.default = router;
