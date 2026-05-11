"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const multer_1 = __importDefault(require("multer"));
const auth_1 = require("../middleware/auth");
const router = express_1.default.Router();
const upload = (0, multer_1.default)({
    storage: multer_1.default.memoryStorage(),
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
router.post('/', auth_1.auth, upload.fields([
    { name: 'files', maxCount: 10 },
    { name: 'file', maxCount: 10 }
]), (req, res) => {
    const uploadedFiles = (req.files || {});
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
});
exports.default = router;
