"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const authController_1 = require("../controllers/authController");
const auth_1 = require("../middleware/auth");
const router = express_1.default.Router();
// Public routes
router.post('/login', authController_1.login);
router.post('/signup', authController_1.signup);
router.post('/refresh-token', authController_1.refreshToken);
router.post('/forgot-password', authController_1.requestPasswordReset);
router.post('/reset-password', authController_1.resetPassword);
// Logout route
router.post('/logout', authController_1.logout);
// Test endpoint to verify authentication
router.get('/test', (req, res) => {
    res.json({
        message: 'Auth routes are working',
        cookies: req.cookies,
        headers: req.headers
    });
});
// Protected routes
router.get('/me', auth_1.auth, authController_1.getCurrentUser);
exports.default = router;
