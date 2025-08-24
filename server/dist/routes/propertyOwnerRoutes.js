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
const auth_1 = require("../middleware/auth");
const propertyOwnerController_1 = require("../controllers/propertyOwnerController");
const router = express_1.default.Router();
// Public endpoints (must come before protected routes)
router.get('/public', propertyOwnerController_1.getPropertyOwnersPublic);
router.get('/public/:id', propertyOwnerController_1.getPropertyOwnerByIdPublic);
// New endpoint: Get property owner by propertyId
router.get('/by-property/:propertyId', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const propertyId = req.params.propertyId;
        if (!propertyId) {
            return res.status(400).json({ message: 'PropertyId is required' });
        }
        const mongoose = require('mongoose');
        let objectId;
        try {
            objectId = new mongoose.Types.ObjectId(propertyId);
        }
        catch (_a) {
            return res.status(400).json({ message: 'Invalid propertyId format' });
        }
        // Find owner whose properties array contains this propertyId as ObjectId or string or $oid
        const PropertyOwner = require('../models/PropertyOwner').PropertyOwner;
        const owner = yield PropertyOwner.findOne({
            $or: [
                { properties: objectId },
                { properties: propertyId },
                { properties: { $elemMatch: { $oid: propertyId } } }
            ]
        });
        if (!owner) {
            return res.status(404).json({ message: 'Owner not found for this property' });
        }
        res.json({
            _id: owner._id,
            email: owner.email,
            firstName: owner.firstName,
            lastName: owner.lastName,
            companyId: owner.companyId
        });
    }
    catch (error) {
        console.error('Error fetching owner by propertyId:', error);
        res.status(500).json({ message: 'Error fetching owner by propertyId' });
    }
}));
router.post('/public', propertyOwnerController_1.createPropertyOwnerPublic);
router.patch('/public/:id', propertyOwnerController_1.updatePropertyOwnerPublic);
router.delete('/public/:id', propertyOwnerController_1.deletePropertyOwnerPublic);
// CRUD routes for property owners (company-scoped)
router.post('/', auth_1.authWithCompany, propertyOwnerController_1.createPropertyOwner);
router.get('/', auth_1.authWithCompany, propertyOwnerController_1.getPropertyOwners);
router.get('/:id', auth_1.authWithCompany, propertyOwnerController_1.getPropertyOwnerById);
router.patch('/:id', auth_1.authWithCompany, propertyOwnerController_1.updatePropertyOwner);
router.delete('/:id', auth_1.authWithCompany, propertyOwnerController_1.deletePropertyOwner);
exports.default = router;
