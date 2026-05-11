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
// Legacy public endpoints now require company authentication because property
// owner records contain PII and account-management capabilities.
router.get('/public', auth_1.authWithCompany, propertyOwnerController_1.getPropertyOwnersPublic);
router.get('/public/:id', auth_1.authWithCompany, propertyOwnerController_1.getPropertyOwnerByIdPublic);
// New endpoint: Get property owner by propertyId
router.get('/by-property/:propertyId', auth_1.authWithCompany, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
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
        catch (_b) {
            return res.status(400).json({ message: 'Invalid propertyId format' });
        }
        if (!((_a = req.user) === null || _a === void 0 ? void 0 : _a.companyId)) {
            return res.status(401).json({ message: 'Authentication required' });
        }
        const companyFilter = { companyId: new mongoose.Types.ObjectId(req.user.companyId) };
        // Find owner whose properties array contains this propertyId as ObjectId or string or $oid
        const PropertyOwner = require('../models/PropertyOwner').PropertyOwner;
        // Strategy: fetch owners in company scope and filter in Node to avoid Mongoose cast issues
        const owners = yield PropertyOwner.find(companyFilter);
        const isMatch = (val) => {
            if (!val)
                return false;
            // Direct ObjectId match
            if (val instanceof mongoose.Types.ObjectId) {
                return val.equals(objectId);
            }
            // String match
            if (typeof val === 'string') {
                return val === propertyId || val === String(objectId);
            }
            // Object that may contain $oid or _id
            if (typeof val === 'object') {
                const oid = (val && (val.$oid || val._id || val.id));
                if (oid instanceof mongoose.Types.ObjectId)
                    return oid.equals(objectId);
                if (typeof oid === 'string')
                    return oid === propertyId || oid === String(objectId);
            }
            return false;
        };
        let owner = owners.find((o) => Array.isArray(o === null || o === void 0 ? void 0 : o.properties) && o.properties.some(isMatch)) || null;
        if (!owner) {
            // Fallback: get property and use its ownerId
            const Property = require('../models/Property').Property;
            const User = require('../models/User').User;
            const property = yield Property.findOne({ _id: objectId, companyId: companyFilter.companyId });
            const rawOwnerId = property === null || property === void 0 ? void 0 : property.ownerId;
            if (rawOwnerId) {
                // Try to find a PropertyOwner by this id
                owner = yield PropertyOwner.findOne(Object.assign({ _id: rawOwnerId }, (companyFilter.companyId ? { companyId: companyFilter.companyId } : {})));
                if (owner) {
                    return res.json({
                        _id: owner._id,
                        email: owner.email,
                        firstName: owner.firstName,
                        lastName: owner.lastName,
                        companyId: owner.companyId
                    });
                }
                // Try User collection fallback (owner stored as user)
                const user = yield User.findOne(Object.assign({ _id: rawOwnerId }, (companyFilter.companyId ? { companyId: companyFilter.companyId } : {}))).select('firstName lastName email companyId role');
                if (user) {
                    return res.json({
                        _id: user._id,
                        email: user.email,
                        firstName: user.firstName,
                        lastName: user.lastName,
                        companyId: user.companyId
                    });
                }
            }
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
router.post('/public', auth_1.authWithCompany, propertyOwnerController_1.createPropertyOwnerPublic);
router.patch('/public/:id', auth_1.authWithCompany, propertyOwnerController_1.updatePropertyOwnerPublic);
router.delete('/public/:id', auth_1.authWithCompany, propertyOwnerController_1.deletePropertyOwnerPublic);
// CRUD routes for property owners (company-scoped)
router.post('/', auth_1.authWithCompany, propertyOwnerController_1.createPropertyOwner);
router.get('/', auth_1.authWithCompany, propertyOwnerController_1.getPropertyOwners);
router.get('/:id', auth_1.authWithCompany, propertyOwnerController_1.getPropertyOwnerById);
router.patch('/:id', auth_1.authWithCompany, propertyOwnerController_1.updatePropertyOwner);
// Accept PUT for clients that use PUT semantics for updates
router.put('/:id', auth_1.authWithCompany, propertyOwnerController_1.updatePropertyOwner);
router.delete('/:id', auth_1.authWithCompany, propertyOwnerController_1.deletePropertyOwner);
exports.default = router;
