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
var __asyncValues = (this && this.__asyncValues) || function (o) {
    if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
    var m = o[Symbol.asyncIterator], i;
    return m ? m.call(o) : (o = typeof __values === "function" ? __values(o) : o[Symbol.iterator](), i = {}, verb("next"), verb("throw"), verb("return"), i[Symbol.asyncIterator] = function () { return this; }, i);
    function verb(n) { i[n] = o[n] && function (v) { return new Promise(function (resolve, reject) { v = o[n](v), settle(resolve, reject, v.done, v.value); }); }; }
    function settle(resolve, reject, d, v) { Promise.resolve(v).then(function(v) { resolve({ value: v, done: d }); }, reject); }
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Safe migration: maps legacy maintenance statuses to enterprise lifecycle values.
 * Run: npx ts-node src/scripts/migrateMaintenanceStatuses.ts
 */
const mongoose_1 = __importDefault(require("mongoose"));
const dotenv_1 = __importDefault(require("dotenv"));
const MaintenanceRequest_1 = require("../models/MaintenanceRequest");
const MaintenanceActivity_1 = require("../models/MaintenanceActivity");
const maintenanceStatus_1 = require("../utils/maintenanceStatus");
dotenv_1.default.config();
const MIGRATION_MAP = Object.assign(Object.assign({}, maintenanceStatus_1.LEGACY_STATUS_MAP), { pending: 'draft', pending_approval: 'awaiting_approval', pending_completion: 'awaiting_payment', cancelled: 'rejected' });
function migrate() {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, e_1, _b, _c;
        const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
        if (!uri)
            throw new Error('MONGODB_URI not set');
        yield mongoose_1.default.connect(uri);
        console.log('Connected. Migrating maintenance statuses...');
        const cursor = MaintenanceRequest_1.MaintenanceRequest.find({}).cursor();
        let updated = 0;
        try {
            for (var _d = true, cursor_1 = __asyncValues(cursor), cursor_1_1; cursor_1_1 = yield cursor_1.next(), _a = cursor_1_1.done, !_a; _d = true) {
                _c = cursor_1_1.value;
                _d = false;
                const doc = _c;
                const current = doc.status;
                const mapped = MIGRATION_MAP[current];
                if (mapped && mapped !== current) {
                    doc.status = mapped;
                    if (!doc.lastActivityAt)
                        doc.lastActivityAt = doc.updatedAt || doc.createdAt;
                    yield doc.save();
                    updated += 1;
                }
                else if (!doc.lastActivityAt) {
                    doc.lastActivityAt = doc.updatedAt || doc.createdAt;
                    yield doc.save();
                }
                const activityCount = yield MaintenanceActivity_1.MaintenanceActivity.countDocuments({ requestId: doc._id });
                if (activityCount === 0) {
                    yield MaintenanceActivity_1.MaintenanceActivity.create({
                        requestId: doc._id,
                        companyId: doc.companyId,
                        action: 'Request Created',
                        description: doc.title || 'Legacy maintenance request migrated',
                        createdAt: doc.createdAt,
                    });
                }
            }
        }
        catch (e_1_1) { e_1 = { error: e_1_1 }; }
        finally {
            try {
                if (!_d && !_a && (_b = cursor_1.return)) yield _b.call(cursor_1);
            }
            finally { if (e_1) throw e_1.error; }
        }
        console.log(`Migration complete. Updated ${updated} request(s).`);
        yield mongoose_1.default.disconnect();
    });
}
migrate().catch((err) => {
    console.error(err);
    process.exit(1);
});
