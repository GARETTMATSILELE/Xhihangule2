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
exports.runSaasSafeIndexes = runSaasSafeIndexes;
const mongoose_1 = __importDefault(require("mongoose"));
const database_1 = require("../config/database");
const logger_1 = require("../utils/logger");
const safeUniqueIndexes = [
    {
        collection: 'users',
        keys: { normalizedEmail: 1 },
        name: 'users_normalizedEmail_unique_v1',
        unique: true,
        partialFilterExpression: { normalizedEmail: { $type: 'string', $ne: '' }, isArchived: { $ne: true } }
    },
    {
        collection: 'companies',
        keys: { normalizedEmail: 1 },
        name: 'companies_normalizedEmail_unique_v1',
        unique: true,
        partialFilterExpression: { normalizedEmail: { $type: 'string', $ne: '' } }
    },
    {
        collection: 'companies',
        keys: { normalizedRegistrationNumber: 1 },
        name: 'companies_normalizedRegistrationNumber_unique_v1',
        unique: true,
        partialFilterExpression: { normalizedRegistrationNumber: { $type: 'string', $ne: '' } }
    },
    {
        collection: 'companies',
        keys: { normalizedTinNumber: 1 },
        name: 'companies_normalizedTinNumber_unique_v1',
        unique: true,
        partialFilterExpression: { normalizedTinNumber: { $type: 'string', $ne: '' } }
    }
];
function reportDuplicates(collectionName, field) {
    return __awaiter(this, void 0, void 0, function* () {
        const collection = mongoose_1.default.connection.collection(collectionName);
        return collection.aggregate([
            { $match: { [field]: { $type: 'string', $ne: '' } } },
            { $group: { _id: `$${field}`, ids: { $push: '$_id' }, count: { $sum: 1 } } },
            { $match: { count: { $gt: 1 } } },
            { $limit: 20 }
        ]).toArray();
    });
}
function runSaasSafeIndexes() {
    return __awaiter(this, void 0, void 0, function* () {
        yield (0, database_1.connectDatabase)();
        for (const index of safeUniqueIndexes) {
            try {
                yield mongoose_1.default.connection.collection(index.collection).createIndex(index.keys, {
                    name: index.name,
                    unique: index.unique,
                    partialFilterExpression: index.partialFilterExpression,
                    background: true
                });
                logger_1.logger.info('Created safe SaaS index', { collection: index.collection, name: index.name });
            }
            catch (error) {
                const duplicates = yield reportDuplicates(index.collection, Object.keys(index.keys)[0]);
                logger_1.logger.warn('Skipped safe SaaS index because legacy duplicates or index conflicts exist', {
                    collection: index.collection,
                    name: index.name,
                    message: (error === null || error === void 0 ? void 0 : error.message) || String(error),
                    duplicateSamples: duplicates
                });
            }
        }
    });
}
if (require.main === module) {
    runSaasSafeIndexes()
        .then(() => {
        logger_1.logger.info('SaaS safe index migration completed');
        process.exit(0);
    })
        .catch((error) => {
        logger_1.logger.error('SaaS safe index migration failed', { message: (error === null || error === void 0 ? void 0 : error.message) || String(error) });
        process.exit(1);
    });
}
