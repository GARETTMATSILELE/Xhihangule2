"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const multer_1 = __importDefault(require("multer"));
const auth_1 = require("../middleware/auth");
const inspectionController_1 = require("../controllers/inspectionController");
const router = express_1.default.Router();
router.use(auth_1.auth);
router.get('/', inspectionController_1.listInspections);
router.post('/', inspectionController_1.createInspection);
router.put('/:id', inspectionController_1.updateInspection);
router.delete('/:id', inspectionController_1.deleteInspection);
router.put('/:id/report', inspectionController_1.updateInspectionReport);
// Attachments
const upload = (0, multer_1.default)({ storage: multer_1.default.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });
router.post('/:id/attachments', upload.single('file'), inspectionController_1.uploadInspectionAttachment);
exports.default = router;
