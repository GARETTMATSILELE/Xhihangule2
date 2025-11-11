"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const maintenanceController_1 = require("../controllers/maintenanceController");
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
// Admin-only reconciliation route (auth + controller checks admin)
router.post('/reconcile-duplicates', auth_1.auth, maintenanceController_1.runReconciliation);
exports.default = router;
