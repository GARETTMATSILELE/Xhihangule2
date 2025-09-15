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
    limits: { fileSize: 10 * 1024 * 1024 },
});
router.get('/', auth_1.authWithCompany, salesFileController_1.listSalesFiles);
router.post('/upload', auth_1.authWithCompany, upload.single('file'), salesFileController_1.uploadSalesFile);
router.get('/:id/download', auth_1.authWithCompany, salesFileController_1.downloadSalesFile);
router.delete('/:id', auth_1.authWithCompany, salesFileController_1.deleteSalesFile);
exports.default = router;
