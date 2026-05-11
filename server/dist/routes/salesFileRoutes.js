"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const auth_1 = require("../middleware/auth");
const multer_1 = __importDefault(require("multer"));
const salesFileController_1 = require("../controllers/salesFileController");
const router = express_1.default.Router();
const upload = (0, multer_1.default)({
    storage: multer_1.default.memoryStorage(),
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
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
            return;
        }
        cb(new Error('Invalid file type. Only PDF, Word, images, and text files are allowed.'));
    }
});
router.get('/', auth_1.authWithCompany, salesFileController_1.listSalesFiles);
router.post('/upload', auth_1.authWithCompany, upload.single('file'), salesFileController_1.uploadSalesFile);
router.get('/:id/download', auth_1.authWithCompany, salesFileController_1.downloadSalesFile);
router.delete('/:id', auth_1.authWithCompany, salesFileController_1.deleteSalesFile);
exports.default = router;
