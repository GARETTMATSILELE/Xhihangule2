"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const auth_1 = require("../types/auth");
const propertyOwnerController_1 = require("../controllers/propertyOwnerController");
const router = express_1.default.Router();
// Protected routes
router.use(auth_1.isAuthenticated);
router.post('/', propertyOwnerController_1.createPropertyOwner);
router.get('/', propertyOwnerController_1.getPropertyOwners);
router.get('/:id', propertyOwnerController_1.getPropertyOwnerById);
router.patch('/:id', propertyOwnerController_1.updatePropertyOwner);
router.delete('/:id', propertyOwnerController_1.deletePropertyOwner);
exports.default = router;
