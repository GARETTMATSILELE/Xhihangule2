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
exports.ensurePaymentSessionProviderRefIndex = ensurePaymentSessionProviderRefIndex;
const mongoose_1 = __importDefault(require("mongoose"));
/**
 * Unique provider reference index for subscription checkout sessions.
 * Skips creation when duplicates already exist. Does not update or delete sessions.
 * This is separate from the rental `payments` reference index.
 */
function ensurePaymentSessionProviderRefIndex() {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        const collection = mongoose_1.default.connection.collection('payment_sessions');
        const existing = yield collection.indexes();
        const alreadyPresent = existing.some((index) => index.name === 'payment_sessions_provider_providerRef_unique');
        const duplicates = yield collection.aggregate([
            { $match: { providerRef: { $type: 'string', $gt: '' } } },
            { $group: { _id: { provider: '$provider', providerRef: '$providerRef' }, count: { $sum: 1 } } },
            { $match: { count: { $gt: 1 } } },
            { $count: 'groups' }
        ]).toArray();
        const duplicateGroups = Number(((_a = duplicates[0]) === null || _a === void 0 ? void 0 : _a.groups) || 0);
        if (alreadyPresent)
            return { created: false, alreadyPresent: true, duplicateGroups };
        if (duplicateGroups > 0)
            return { created: false, alreadyPresent: false, duplicateGroups };
        yield collection.createIndex({ provider: 1, providerRef: 1 }, { unique: true, sparse: true, name: 'payment_sessions_provider_providerRef_unique' });
        return { created: true, alreadyPresent: false, duplicateGroups: 0 };
    });
}
