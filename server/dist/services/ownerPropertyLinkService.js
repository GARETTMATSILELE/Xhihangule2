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
exports.validateOwnerPropertyAssignment = validateOwnerPropertyAssignment;
exports.commitOwnerPropertyLinks = commitOwnerPropertyLinks;
const mongoose_1 = __importDefault(require("mongoose"));
const Property_1 = require("../models/Property");
const errorHandler_1 = require("../middleware/errorHandler");
const propertyAccess_1 = require("../utils/propertyAccess");
function validateOwnerPropertyAssignment(req, ownerId, existingPropertyIds, requestedPropertyIds) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        if (!Array.isArray(requestedPropertyIds)) {
            throw new errorHandler_1.AppError('propertyIds must be an array', 400);
        }
        if (!((_a = req.user) === null || _a === void 0 ? void 0 : _a.companyId)) {
            throw new errorHandler_1.AppError('Company ID not found', 400);
        }
        const requestedIds = requestedPropertyIds.map((propertyId) => String(propertyId));
        if (requestedIds.some((propertyId) => !mongoose_1.default.Types.ObjectId.isValid(propertyId))) {
            throw new errorHandler_1.AppError('One or more property IDs are invalid.', 400);
        }
        const companyId = new mongoose_1.default.Types.ObjectId(req.user.companyId);
        const accessible = yield (0, propertyAccess_1.propertyIdsForCaller)(req);
        const assignment = (0, propertyAccess_1.planOwnerPropertyAssignment)(existingPropertyIds.map(String), requestedIds, accessible === 'company' ? 'company' : accessible.map(String));
        if (assignment.rejected.length > 0) {
            throw new errorHandler_1.AppError('All properties must belong to your authorized portfolio.', 403);
        }
        const accessibleRequested = assignment.properties.filter((propertyId) => accessible === 'company' || accessible.some((row) => String(row) === propertyId));
        if (accessibleRequested.length > 0) {
            const companyProperties = yield Property_1.Property.find({
                _id: { $in: accessibleRequested.map((propertyId) => new mongoose_1.default.Types.ObjectId(propertyId)) },
                companyId,
                isDeleted: { $ne: true },
            }).select('_id propertyOwnerId');
            if (companyProperties.length !== accessibleRequested.length) {
                throw new errorHandler_1.AppError('All properties must belong to your company.', 403);
            }
            const assignedElsewhere = companyProperties.find((property) => property.propertyOwnerId && String(property.propertyOwnerId) !== String(ownerId || ''));
            if (assignedElsewhere) {
                throw new errorHandler_1.AppError('One or more properties are already assigned to another owner.', 403);
            }
        }
        return {
            properties: assignment.properties,
            selectedByCaller: accessibleRequested,
            removed: assignment.removed,
        };
    });
}
/** Writes the landlord pointer. Does not change Property.ownerId or any financial record. */
function commitOwnerPropertyLinks(companyId, ownerId, plan) {
    return __awaiter(this, void 0, void 0, function* () {
        const cid = new mongoose_1.default.Types.ObjectId(String(companyId));
        const oid = new mongoose_1.default.Types.ObjectId(String(ownerId));
        if (plan.selectedByCaller.length > 0) {
            yield Property_1.Property.updateMany({
                _id: { $in: plan.selectedByCaller.map((propertyId) => new mongoose_1.default.Types.ObjectId(propertyId)) },
                companyId: cid,
                isDeleted: { $ne: true },
            }, { $set: { propertyOwnerId: oid } });
        }
        if (plan.removed.length > 0) {
            yield Property_1.Property.updateMany({
                _id: { $in: plan.removed.map((propertyId) => new mongoose_1.default.Types.ObjectId(propertyId)) },
                companyId: cid,
                propertyOwnerId: oid,
            }, { $unset: { propertyOwnerId: 1 } });
        }
    });
}
