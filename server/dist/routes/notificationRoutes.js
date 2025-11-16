"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const auth_1 = require("../middleware/auth");
const notificationController_1 = require("../controllers/notificationController");
const router = express_1.default.Router();
router.post('/', auth_1.auth, notificationController_1.createNotification);
router.get('/', auth_1.auth, notificationController_1.listNotifications);
router.post('/read-all', auth_1.auth, notificationController_1.markAllRead);
router.post('/:id/read', auth_1.auth, notificationController_1.markRead);
exports.default = router;
