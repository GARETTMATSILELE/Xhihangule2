"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const subscriptionController_1 = require("../controllers/subscriptionController");
const router = (0, express_1.Router)();
// All routes require authentication with company
router.use(auth_1.authWithCompany);
// Get trial status for current user's company
router.get('/trial-status', subscriptionController_1.getTrialStatus);
// Get subscription details
router.get('/subscription', subscriptionController_1.getSubscription);
// Convert trial to active subscription
router.post('/convert-trial', subscriptionController_1.convertTrialToActive);
// Extend trial (admin function)
router.post('/extend-trial', subscriptionController_1.extendTrial);
exports.default = router;
