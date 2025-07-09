"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const auth_1 = require("../middleware/auth");
const propertyOwnerController_1 = require("../controllers/propertyOwnerController");
const router = express_1.default.Router();
// Public endpoints (must come before protected routes)
router.get('/public', propertyOwnerController_1.getPropertyOwnersPublic);
router.get('/public/:id', propertyOwnerController_1.getPropertyOwnerByIdPublic);
router.post('/public', propertyOwnerController_1.createPropertyOwnerPublic);
router.patch('/public/:id', propertyOwnerController_1.updatePropertyOwnerPublic);
router.delete('/public/:id', propertyOwnerController_1.deletePropertyOwnerPublic);
// CRUD routes for property owners
router.post('/', auth_1.auth, propertyOwnerController_1.createPropertyOwner);
router.get('/', auth_1.auth, propertyOwnerController_1.getPropertyOwners);
router.get('/:id', auth_1.auth, propertyOwnerController_1.getPropertyOwnerById);
router.patch('/:id', auth_1.auth, propertyOwnerController_1.updatePropertyOwner);
router.delete('/:id', auth_1.auth, propertyOwnerController_1.deletePropertyOwner);
exports.default = router;
