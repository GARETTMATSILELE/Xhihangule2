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
 * Safe migration: backfill missing Company.workspaceType values to "agency".
 *
 * Dry run:
 *   npx ts-node src/scripts/migrateCompanyWorkspaceType.ts
 *
 * Apply:
 *   npx ts-node src/scripts/migrateCompanyWorkspaceType.ts --apply
 */
const mongoose_1 = __importDefault(require("mongoose"));
const dotenv_1 = __importDefault(require("dotenv"));
const Company_1 = require("../models/Company");
dotenv_1.default.config();
function migrate() {
    return __awaiter(this, void 0, void 0, function* () {
        const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
        if (!uri)
            throw new Error('MONGODB_URI not set');
        const apply = process.argv.includes('--apply');
        yield mongoose_1.default.connect(uri);
        const query = {
            $or: [
                { workspaceType: { $exists: false } },
                { workspaceType: null },
                { workspaceType: '' }
            ]
        };
        const count = yield Company_1.Company.countDocuments(query);
        console.log(`Companies missing workspaceType: ${count}`);
        if (!apply) {
            console.log('Dry run only. Re-run with --apply to backfill workspaceType="agency".');
            yield mongoose_1.default.disconnect();
            return;
        }
        const result = yield Company_1.Company.updateMany(query, { $set: { workspaceType: 'agency' } });
        console.log(`Migration complete. Updated ${result.modifiedCount} compan${result.modifiedCount === 1 ? 'y' : 'ies'}.`);
        yield mongoose_1.default.disconnect();
    });
}
migrate().catch((err) => {
    console.error(err);
    process.exit(1);
});
