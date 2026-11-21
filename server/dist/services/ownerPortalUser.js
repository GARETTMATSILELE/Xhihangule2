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
exports.decideOwnerPortalAccess = decideOwnerPortalAccess;
exports.provisionOwnerPortalUser = provisionOwnerPortalUser;
const mongoose_1 = __importDefault(require("mongoose"));
const User_1 = require("../models/User");
function decideOwnerPortalAccess(existing, companyId) {
    if (!existing)
        return 'create';
    const sameCompany = String(existing.companyId || '') === String(companyId);
    const roles = Array.isArray(existing.roles) && existing.roles.length ? existing.roles : [existing.role || ''];
    const ownerOnly = roles.length > 0 && roles.every((role) => role === 'owner');
    if (sameCompany && ownerOnly)
        return 'already_owner';
    return 'blocked';
}
function provisionOwnerPortalUser(input) {
    return __awaiter(this, void 0, void 0, function* () {
        const email = String(input.email || '').trim().toLowerCase();
        const companyId = String(input.companyId);
        const existing = yield User_1.User.findOne({ email }).select('companyId role roles');
        const decision = decideOwnerPortalAccess(existing, companyId);
        if (decision === 'already_owner') {
            return {
                portalAccess: 'already_available',
                portalMessage: 'Owner portal access already exists for this email.',
            };
        }
        if (decision === 'blocked') {
            return {
                portalAccess: 'unavailable',
                portalMessage: 'The owner was saved, but portal access was not created because this email already belongs to another account.',
            };
        }
        try {
            yield new User_1.User({
                email,
                password: input.password,
                firstName: input.firstName,
                lastName: input.lastName,
                role: 'owner',
                roles: ['owner'],
                companyId: new mongoose_1.default.Types.ObjectId(companyId),
                isActive: true,
            }).save();
            return {
                portalAccess: 'created',
                portalMessage: 'Owner portal access was created.',
            };
        }
        catch (error) {
            if ((error === null || error === void 0 ? void 0 : error.code) === 11000) {
                return {
                    portalAccess: 'unavailable',
                    portalMessage: 'The owner was saved, but portal access was not created because this email already belongs to another account.',
                };
            }
            throw error;
        }
    });
}
