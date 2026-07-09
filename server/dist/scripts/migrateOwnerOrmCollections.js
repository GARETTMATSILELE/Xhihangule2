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
/**
 * Ensures owner ORM collections and indexes exist without altering PropertyOwner records.
 * Run: npx ts-node src/scripts/migrateOwnerOrmCollections.ts
 */
const mongoose_1 = __importDefault(require("mongoose"));
const dotenv_1 = __importDefault(require("dotenv"));
const OwnerDocument_1 = require("../models/OwnerDocument");
const OwnerBankingDetails_1 = require("../models/OwnerBankingDetails");
const OwnerPreferences_1 = require("../models/OwnerPreferences");
const OwnershipHistory_1 = require("../models/OwnershipHistory");
const PropertyOwner_1 = require("../models/PropertyOwner");
dotenv_1.default.config();
function main() {
    return __awaiter(this, void 0, void 0, function* () {
        const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
        if (!uri)
            throw new Error('MONGODB_URI required');
        yield mongoose_1.default.connect(uri);
        const models = [OwnerDocument_1.OwnerDocument, OwnerBankingDetails_1.OwnerBankingDetails, OwnerPreferences_1.OwnerPreferences, OwnershipHistory_1.OwnershipHistory, PropertyOwner_1.PropertyOwner];
        for (const model of models) {
            yield model.createCollection().catch(() => undefined);
            yield model.syncIndexes();
            console.log(`Synced indexes for ${model.modelName}`);
        }
        console.log('Owner ORM migration complete');
        yield mongoose_1.default.disconnect();
    });
}
main().catch((err) => {
    console.error(err);
    process.exit(1);
});
