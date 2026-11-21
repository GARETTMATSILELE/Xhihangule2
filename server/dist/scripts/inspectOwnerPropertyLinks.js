"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
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
/**
 * Read-only check for Property.ownerId being mistaken for a landlord id.
 * Prints counts only. Does not update properties.
 */
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const dotenv_1 = require("dotenv");
const serverRoot = path_1.default.resolve(__dirname, '..', '..');
(0, dotenv_1.config)({ path: path_1.default.join(serverRoot, '.env') });
const localPath = path_1.default.join(serverRoot, '.env.development.local');
if (fs_1.default.existsSync(localPath)) {
    const parsed = (0, dotenv_1.parse)(fs_1.default.readFileSync(localPath));
    for (const [key, value] of Object.entries(parsed)) {
        if (!process.env[key])
            process.env[key] = value;
    }
}
function main() {
    return __awaiter(this, void 0, void 0, function* () {
        const { connectDatabase } = yield Promise.resolve().then(() => __importStar(require('../config/database')));
        const { Property } = yield Promise.resolve().then(() => __importStar(require('../models/Property')));
        const { PropertyOwner } = yield Promise.resolve().then(() => __importStar(require('../models/PropertyOwner')));
        const { User } = yield Promise.resolve().then(() => __importStar(require('../models/User')));
        yield connectDatabase();
        const [properties, owners, users] = yield Promise.all([
            Property.find({ isDeleted: { $ne: true } }).select('ownerId propertyOwnerId').lean(),
            PropertyOwner.find({}).select('_id').lean(),
            User.find({}).select('_id').lean(),
        ]);
        const ownerIds = new Set(owners.map((owner) => String(owner._id)));
        const userIds = new Set(users.map((user) => String(user._id)));
        let ownerIdMatchesLandlord = 0;
        let ownerIdMatchesUser = 0;
        let ownerIdMatchesBoth = 0;
        let ownerIdMatchesNeither = 0;
        let propertyOwnerLinks = 0;
        for (const property of properties) {
            const ownerId = String(property.ownerId || '');
            if (property.propertyOwnerId)
                propertyOwnerLinks += 1;
            if (!ownerId)
                continue;
            const asOwner = ownerIds.has(ownerId);
            const asUser = userIds.has(ownerId);
            if (asOwner && asUser)
                ownerIdMatchesBoth += 1;
            else if (asOwner)
                ownerIdMatchesLandlord += 1;
            else if (asUser)
                ownerIdMatchesUser += 1;
            else
                ownerIdMatchesNeither += 1;
        }
        console.log(JSON.stringify({
            properties: properties.length,
            propertyOwnerLinks,
            ownerIdMatchesUser,
            ownerIdMatchesLandlord,
            ownerIdMatchesBoth,
            ownerIdMatchesNeither,
        }));
        process.exit(0);
    });
}
main().catch((error) => {
    console.error(error instanceof Error ? error.message : 'Owner link inspection failed');
    process.exit(1);
});
