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
Object.defineProperty(exports, "__esModule", { value: true });
exports.notifyOnce = notifyOnce;
exports.notifyLandlord = notifyLandlord;
exports.notifyPropertyAgent = notifyPropertyAgent;
const Notification_1 = require("../models/Notification");
const Property_1 = require("../models/Property");
const PropertyOwner_1 = require("../models/PropertyOwner");
const User_1 = require("../models/User");
/**
 * In-app workflow notice. Email is skipped so a mail failure cannot be
 * reported as delivery, and a notification error never throws to the caller.
 */
function notifyOnce(companyId, userId, key, title, message) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!companyId || !userId || !key)
            return;
        try {
            const existing = yield Notification_1.Notification.findOne({
                companyId,
                userId,
                'payload.idempotencyKey': key,
            }).select('_id').lean();
            if (existing)
                return;
            yield Notification_1.Notification.create({
                companyId,
                userId,
                title,
                message,
                read: false,
                payload: { idempotencyKey: key, skipEmail: true },
            });
        }
        catch (error) {
            console.warn('[agency-workflow] notification was not recorded');
        }
    });
}
function notifyLandlord(companyId, propertyId, key, title, message) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const property = yield Property_1.Property.findOne({ _id: propertyId, companyId }).select('propertyOwnerId').lean();
            const owner = (property === null || property === void 0 ? void 0 : property.propertyOwnerId)
                ? yield PropertyOwner_1.PropertyOwner.findOne({ _id: property.propertyOwnerId, companyId }).select('email').lean()
                : yield PropertyOwner_1.PropertyOwner.findOne({ companyId, properties: propertyId }).select('email').lean();
            if (!(owner === null || owner === void 0 ? void 0 : owner.email))
                return;
            const user = yield User_1.User.findOne({ email: owner.email, companyId, role: 'owner' }).select('_id').lean();
            yield notifyOnce(companyId, user ? String(user._id) : undefined, key, title, message);
        }
        catch (error) {
            console.warn('[agency-workflow] landlord notification was not recorded');
        }
    });
}
function notifyPropertyAgent(companyId, propertyId, key, title, message) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const property = yield Property_1.Property.findOne({ _id: propertyId, companyId }).select('agentId').lean();
            yield notifyOnce(companyId, (property === null || property === void 0 ? void 0 : property.agentId) ? String(property.agentId) : undefined, key, title, message);
        }
        catch (error) {
            console.warn('[agency-workflow] agent notification was not recorded');
        }
    });
}
