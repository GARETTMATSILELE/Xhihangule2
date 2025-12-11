"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const paypalController_1 = require("../controllers/paypalController");
const router = (0, express_1.Router)();
router.post('/create-order', paypalController_1.createOrder);
router.post('/capture-order', paypalController_1.captureOrder);
exports.default = router;
