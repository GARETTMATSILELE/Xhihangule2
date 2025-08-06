"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const multer_1 = __importDefault(require("multer"));
const companyController_1 = require("../controllers/companyController");
const auth_1 = require("../middleware/auth");
const router = express_1.default.Router();
// Configure multer for file uploads
const upload = (0, multer_1.default)({
    storage: multer_1.default.memoryStorage(),
    limits: {
        fileSize: 5 * 1024 * 1024, // 5MB limit
    },
    fileFilter: (req, file, cb) => {
        // Allow only image files
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        }
        else {
            cb(new Error('Only image files are allowed'));
        }
    },
});
// Protected routes
router.get('/current', auth_1.auth, companyController_1.getCurrentCompany);
router.put('/current', auth_1.auth, companyController_1.updateCurrentCompany);
// Public routes
router.get('/', companyController_1.getCompanies);
router.get('/:id', companyController_1.getCompany);
// Protected routes
router.post('/', auth_1.auth, companyController_1.createCompany);
router.put('/:id', auth_1.auth, companyController_1.updateCompany);
router.delete('/:id', auth_1.auth, companyController_1.deleteCompany);
// Logo upload route
router.post('/:id/logo', auth_1.auth, upload.single('logo'), companyController_1.uploadCompanyLogo);
exports.default = router;
