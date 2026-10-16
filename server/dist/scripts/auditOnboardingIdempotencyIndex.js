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
 * Read-only report for the onboarding_sessions idempotencyKey index.
 * Does not drop indexes, rewrite keys, or delete sessions.
 * Refuses production and any non-local database host.
 *
 * Manual replacement, only after this report shows zero duplicate keys for that collection:
 * 1. Confirm the listed index is { idempotencyKey: 1 } named idempotencyKey_1 and is not unique.
 * 2. Drop only that index: db.<collection>.dropIndex("idempotencyKey_1")
 * 3. Create the unique index: db.<collection>.createIndex({ idempotencyKey: 1 }, { name: "idempotencyKey_1", unique: true })
 * Use onboarding_sessions and, if its report matches, payment_sessions.
 * Rollback: drop idempotencyKey_1 and recreate it without unique.
 * Cosmos DB accepts this drop-and-create pair. It does not alter an existing index in place.
 * If duplicate keys are listed, rename only the extra session keys after review. Do not delete sessions.
 */
const dotenv_1 = __importDefault(require("dotenv"));
const mongoose_1 = __importDefault(require("mongoose"));
dotenv_1.default.config();
function databaseHost(uri) {
    const withoutScheme = uri.replace(/^mongodb(\+srv)?:\/\//, '');
    const authority = withoutScheme.split('/')[0] || '';
    const hostPort = authority.split('@').pop() || '';
    return hostPort.split(':')[0].replace(/^\[|\]$/g, '');
}
function main() {
    return __awaiter(this, void 0, void 0, function* () {
        if (process.env.NODE_ENV === 'production') {
            console.error('Refusing onboarding index audit because NODE_ENV=production.');
            process.exit(2);
        }
        const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/property-management';
        const host = databaseHost(uri);
        if (host !== 'localhost' && host !== '127.0.0.1') {
            console.error('Refusing onboarding index audit because the database host is not local.');
            process.exit(2);
        }
        yield mongoose_1.default.connect(uri, { serverSelectionTimeoutMS: 8000, autoIndex: false });
        const reportCollection = (name) => __awaiter(this, void 0, void 0, function* () {
            const collection = mongoose_1.default.connection.collection(name);
            const indexes = yield collection.indexes();
            const idempotencyIndex = indexes.find((index) => index.name === 'idempotencyKey_1') || null;
            const duplicates = yield collection.aggregate([
                { $match: { idempotencyKey: { $type: 'string', $gt: '' } } },
                { $group: { _id: '$idempotencyKey', count: { $sum: 1 }, ids: { $push: '$_id' } } },
                { $match: { count: { $gt: 1 } } },
                { $project: { _id: 0, idempotencyKey: '$_id', count: 1, ids: 1 } }
            ]).toArray();
            const emptyKeys = yield collection.countDocuments({
                $or: [{ idempotencyKey: { $exists: false } }, { idempotencyKey: null }, { idempotencyKey: '' }]
            });
            return {
                collection: name,
                idempotencyIndex,
                duplicateNonEmptyKeys: duplicates.length,
                duplicates,
                emptyOrMissingKeys: emptyKeys
            };
        });
        console.log(JSON.stringify({
            readOnly: true,
            databaseHost: host,
            collections: [
                yield reportCollection('onboarding_sessions'),
                yield reportCollection('payment_sessions')
            ]
        }, null, 2));
        yield mongoose_1.default.disconnect();
    });
}
main().catch((error) => __awaiter(void 0, void 0, void 0, function* () {
    console.error(error);
    yield mongoose_1.default.disconnect().catch(() => undefined);
    process.exit(1);
}));
