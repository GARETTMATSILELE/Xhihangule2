"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const auth_1 = require("../middleware/auth");
const multer_1 = __importDefault(require("multer"));
const fileController_1 = require("../controllers/fileController");
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
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        }
        else {
            cb(new Error('Invalid file type. Only PDF, Word, images, and text files are allowed.'));
        }
    }
});
// Get all files
router.get('/', fileController_1.getFiles);
// Upload a file
router.post('/upload', auth_1.auth, upload.single('file'), fileController_1.uploadFile);
// Download a file
router.get('/download/:id', fileController_1.downloadFile);
// Delete a file
router.delete('/:id', auth_1.auth, fileController_1.deleteFile);
exports.default = router;
