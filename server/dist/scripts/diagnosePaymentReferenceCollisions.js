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
 * Read-only listing of payment reference collisions.
 * Does not update payments, rebuild indexes, or connect to a non-local database.
 */
const dotenv_1 = __importDefault(require("dotenv"));
const mongoose_1 = __importDefault(require("mongoose"));
const collections_1 = require("../config/collections");
const paymentReferenceDiagnostics_1 = require("../services/paymentReferenceDiagnostics");
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
            console.error('Refusing payment-reference diagnostic because NODE_ENV=production.');
            process.exit(2);
        }
        const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/property-management';
        const host = databaseHost(uri);
        if (host !== 'localhost' && host !== '127.0.0.1') {
            console.error('Refusing payment-reference diagnostic because the database host is not local.');
            process.exit(2);
        }
        yield mongoose_1.default.connect(uri, { serverSelectionTimeoutMS: 8000 });
        const payments = mongoose_1.default.connection.collection(collections_1.COLLECTIONS.PAYMENTS);
        const indexes = yield payments.indexes();
        const uniqueIndex = indexes.find((index) => index.name === 'companyId_1_referenceNumber_1');
        const groups = yield payments.aggregate([
            { $match: { referenceNumber: { $type: 'string', $gt: '' } } },
            {
                $group: {
                    _id: { companyId: '$companyId', referenceNumber: '$referenceNumber' },
                    count: { $sum: 1 },
                    records: {
                        $push: {
                            id: '$_id',
                            status: '$status',
                            paymentType: '$paymentType',
                            paymentDate: '$paymentDate',
                            createdAt: '$createdAt',
                            amount: '$amount',
                        },
                    },
                },
            },
            { $match: { count: { $gt: 1 } } },
            { $sort: { count: -1 } },
        ]).toArray();
        const report = {
            readOnly: true,
            databaseHost: host,
            collection: collections_1.COLLECTIONS.PAYMENTS,
            uniqueIndexName: 'companyId_1_referenceNumber_1',
            uniqueIndexActive: Boolean(uniqueIndex && uniqueIndex.unique),
            collisionGroups: groups.length,
            groups: groups.map((group) => {
                var _a, _b;
                return ({
                    companyId: String(((_a = group._id) === null || _a === void 0 ? void 0 : _a.companyId) || ''),
                    referenceNumber: String(((_b = group._id) === null || _b === void 0 ? void 0 : _b.referenceNumber) || ''),
                    count: group.count,
                    classification: (0, paymentReferenceDiagnostics_1.classifyPaymentReferenceGroup)(group.records || []),
                    records: (group.records || []).slice(0, 20).map((record) => ({
                        id: String(record.id),
                        status: record.status || '',
                        paymentType: record.paymentType || '',
                        paymentDate: record.paymentDate || null,
                        createdAt: record.createdAt || null,
                        amount: record.amount,
                    })),
                });
            }),
        };
        console.log(JSON.stringify(report, null, 2));
        yield mongoose_1.default.disconnect();
    });
}
main().catch((error) => __awaiter(void 0, void 0, void 0, function* () {
    console.error('Payment-reference diagnostic failed:', error instanceof Error ? error.message : 'unknown error');
    try {
        yield mongoose_1.default.disconnect();
    }
    catch ( /* already closed */_a) { /* already closed */ }
    process.exit(1);
}));
