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
const mongodb_1 = require("mongodb");
function main() {
    return __awaiter(this, void 0, void 0, function* () {
        const client = new mongodb_1.MongoClient('mongodb://localhost:27017');
        yield client.connect();
        const db = client.db('property-management');
        const email = 'modo@gmail.com';
        const companies = yield db.collection('companies').find({
            $or: [{ email }, { normalizedEmail: email }]
        }).project({
            name: 1,
            email: 1,
            normalizedEmail: 1,
            tinNumber: 1,
            registrationNumber: 1,
            normalizedTinNumber: 1,
            normalizedRegistrationNumber: 1,
            onboardingStatus: 1,
            tenantStatus: 1,
            isActive: 1,
            companyType: 1,
            createdAt: 1,
            ownerId: 1
        }).toArray();
        const users = yield db.collection('users').find({
            $or: [{ email }, { normalizedEmail: email }]
        }).project({
            email: 1,
            normalizedEmail: 1,
            companyId: 1,
            isActive: 1,
            isArchived: 1,
            role: 1,
            createdAt: 1
        }).toArray();
        const indexes = yield db.collection('companies').indexes();
        const emptyTin = yield db.collection('companies').countDocuments({ tinNumber: '' });
        const emptyReg = yield db.collection('companies').countDocuments({ registrationNumber: '' });
        const nullTin = yield db.collection('companies').countDocuments({ tinNumber: null });
        const missingTin = yield db.collection('companies').countDocuments({ tinNumber: { $exists: false } });
        console.log(JSON.stringify({
            companies,
            users,
            emptyTin,
            emptyReg,
            nullTin,
            missingTin,
            indexes: indexes.map((index) => ({
                name: index.name,
                key: index.key,
                unique: Boolean(index.unique),
                sparse: Boolean(index.sparse)
            }))
        }, null, 2));
        yield client.close();
    });
}
main().catch((error) => {
    console.error((error === null || error === void 0 ? void 0 : error.message) || error);
    process.exit(1);
});
