"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const router = express_1.default.Router();
// Test route
router.get('/test', (req, res) => {
    console.log('Test route hit');
    res.json({
        message: 'Test route working',
        timestamp: new Date().toISOString(),
        path: req.path
    });
});
// Health check
router.get('/health', (req, res) => {
    console.log('Health route hit');
    res.json({
        status: 'ok',
        service: 'test-report-routes',
        timestamp: new Date().toISOString()
    });
});
console.log('Test report routes defined');
exports.default = router;
