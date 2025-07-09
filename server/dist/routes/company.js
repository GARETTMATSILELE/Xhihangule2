"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const Company_1 = require("../models/Company");
const errorHandler_1 = require("../middleware/errorHandler");
const router = express_1.default.Router();
// Debug middleware
router.use((req, res, next) => {
    console.log('Company route accessed:', {
        method: req.method,
        path: req.path,
        body: req.body,
        headers: req.headers,
        cookies: req.cookies
    });
    next();
});
// Get current company
router.get('/current', (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        console.log('GET /current route hit');
        // For testing, use a default company ID
        const companyId = 'default-company-id';
        console.log('Looking up company with ID:', companyId);
        const company = yield Company_1.Company.findOne({ _id: companyId });
        if (!company) {
            console.log('Company not found in database');
            throw new errorHandler_1.AppError('Company not found', 404);
        }
        console.log('Company found:', company);
        res.json({
            status: 'success',
            data: company
        });
    }
    catch (error) {
        console.error('Error in GET /current:', error);
        next(error);
    }
}));
exports.default = router;
