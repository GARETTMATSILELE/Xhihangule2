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
exports.syncOwnerPortalProfile = syncOwnerPortalProfile;
exports.retirePropertyOwner = retirePropertyOwner;
exports.setOwnerActiveState = setOwnerActiveState;
const mongoose_1 = __importDefault(require("mongoose"));
const PropertyOwner_1 = require("../models/PropertyOwner");
const Property_1 = require("../models/Property");
const Lease_1 = require("../models/Lease");
const Payment_1 = require("../models/Payment");
const OwnershipHistory_1 = require("../models/OwnershipHistory");
const OwnerDocument_1 = require("../models/OwnerDocument");
const User_1 = require("../models/User");
const PropertyAccount_1 = __importDefault(require("../models/PropertyAccount"));
const errorHandler_1 = require("../middleware/errorHandler");
const propertyOwnerGuards_1 = require("./propertyOwnerGuards");
const ownerManagementService_1 = require("./ownerManagementService");
function setOwnerPortalActive(email, companyId, active) {
    return __awaiter(this, void 0, void 0, function* () {
        const user = yield User_1.User.findOne({
            email: String(email || '').toLowerCase(),
            companyId,
            role: 'owner',
        });
        if (!user)
            return;
        const roles = Array.isArray(user.roles) && user.roles.length
            ? user.roles
            : [user.role];
        if (!roles.every((role) => role === 'owner'))
            return;
        user.isActive = active;
        yield user.save();
    });
}
function syncOwnerPortalProfile(input) {
    return __awaiter(this, void 0, void 0, function* () {
        const user = yield User_1.User.findOne({
            email: String(input.previousEmail || '').toLowerCase(),
            companyId: input.companyId,
            role: 'owner',
        });
        if (!user)
            return;
        if (input.firstName)
            user.firstName = input.firstName;
        if (input.lastName)
            user.lastName = input.lastName;
        if (input.email) {
            const nextEmail = String(input.email).trim().toLowerCase();
            if (nextEmail && nextEmail !== user.email) {
                const clash = yield User_1.User.findOne({
                    email: nextEmail,
                    companyId: input.companyId,
                    _id: { $ne: user._id },
                }).select('_id');
                if (clash)
                    throw new errorHandler_1.AppError('Email already in use by another user', 400);
                user.email = nextEmail;
            }
        }
        yield user.save();
    });
}
/**
 * Deactivate owners that still anchor properties or financial history.
 * Hard-delete is limited to records with no linked history. Properties, leases,
 * payments and ledgers are never removed by this function.
 */
function retirePropertyOwner(ownerId, companyId) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!mongoose_1.default.Types.ObjectId.isValid(ownerId)) {
            throw new errorHandler_1.AppError('Invalid owner ID', 400);
        }
        const owner = yield PropertyOwner_1.PropertyOwner.findOne({ _id: ownerId, companyId });
        if (!owner)
            throw new errorHandler_1.AppError('Property owner not found', 404);
        const propertyIds = yield (0, ownerManagementService_1.resolveOwnerPropertyIds)(ownerId, companyId);
        const cid = new mongoose_1.default.Types.ObjectId(companyId);
        const [leaseCount, paymentCount, accountCount, historyCount, documentCount] = yield Promise.all([
            propertyIds.length
                ? Lease_1.Lease.countDocuments({ companyId: cid, propertyId: { $in: propertyIds } })
                : Promise.resolve(0),
            propertyIds.length
                ? Payment_1.Payment.countDocuments({ companyId: cid, propertyId: { $in: propertyIds } })
                : Promise.resolve(0),
            propertyIds.length
                ? PropertyAccount_1.default.countDocuments({ propertyId: { $in: propertyIds } })
                : Promise.resolve(0),
            OwnershipHistory_1.OwnershipHistory.countDocuments({ ownerId: owner._id, companyId: cid }),
            OwnerDocument_1.OwnerDocument.countDocuments({ ownerId: owner._id, companyId: cid }),
        ]);
        const mode = (0, propertyOwnerGuards_1.ownerRetirementMode)({
            linkedPropertyCount: propertyIds.length,
            leaseCount,
            paymentCount,
            accountCount,
            historyCount,
            documentCount,
        });
        if (mode === 'deactivate') {
            owner.active = false;
            yield owner.save();
            yield setOwnerPortalActive(owner.email, companyId, false);
            return {
                mode: 'deactivated',
                message: 'This owner has properties or financial history, so the record was deactivated. Properties, leases and financial records were kept.',
            };
        }
        yield setOwnerPortalActive(owner.email, companyId, false);
        yield PropertyOwner_1.PropertyOwner.findOneAndDelete({ _id: owner._id, companyId: cid });
        yield Property_1.Property.updateMany({ companyId: cid, propertyOwnerId: owner._id }, { $unset: { propertyOwnerId: 1 } });
        return {
            mode: 'deleted',
            message: 'Property owner deleted. No properties or financial history were attached.',
        };
    });
}
function setOwnerActiveState(ownerId, companyId, active) {
    return __awaiter(this, void 0, void 0, function* () {
        const owner = yield PropertyOwner_1.PropertyOwner.findOne({ _id: ownerId, companyId }).select('email');
        if (!owner)
            return;
        yield setOwnerPortalActive(owner.email, companyId, active);
    });
}
