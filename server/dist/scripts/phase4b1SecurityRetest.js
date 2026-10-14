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
const http_1 = __importDefault(require("http"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const mongoose_1 = __importDefault(require("mongoose"));
const database_1 = require("../config/database");
const Payment_1 = require("../models/Payment");
const OwnerRentNotice_1 = require("../models/OwnerRentNotice");
const ownerRentNotificationService_1 = require("../services/ownerRentNotificationService");
const ownerRentNotificationPolicy_1 = require("../services/ownerRentNotificationPolicy");
const PASSWORD = 'Phase4b1-Accept-1';
const evidencePath = path_1.default.resolve(__dirname, '../../tmp/phase4b1-evidence.json');
function request(method, urlPath, token, body) {
    const payload = body === undefined ? null : JSON.stringify(body);
    return new Promise((resolve, reject) => {
        const req = http_1.default.request({
            hostname: '127.0.0.1', port: 5000, path: urlPath, method, timeout: 120000,
            headers: Object.assign(Object.assign({}, (payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {})), (token ? { Authorization: `Bearer ${token}` } : {})),
        }, (res) => {
            const chunks = [];
            res.on('data', (c) => chunks.push(c));
            res.on('end', () => resolve({ status: res.statusCode || 0, text: Buffer.concat(chunks).toString('utf8') }));
        });
        req.on('error', reject);
        if (payload)
            req.write(payload);
        req.end();
    });
}
function login(email) {
    return __awaiter(this, void 0, void 0, function* () {
        const result = yield request('POST', '/api/auth/login', null, { email, password: PASSWORD });
        const body = JSON.parse(result.text);
        if (!body.token)
            throw new Error(`login failed ${result.status}`);
        return body.token;
    });
}
function main() {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c, _d, _e, _f;
        if (process.env.NODE_ENV === 'production')
            process.exit(2);
        const evidence = JSON.parse(fs_1.default.readFileSync(evidencePath, 'utf8'));
        yield (0, database_1.connectDatabase)();
        const host = String(mongoose_1.default.connection.host || '');
        if (host !== 'localhost' && host !== '127.0.0.1')
            process.exit(2);
        const testToken = yield login(evidence.identities.testAdminEmail);
        const bToken = yield login(evidence.identities.companyBAdminEmail);
        const aToken = yield login(evidence.identities.companyAAdminEmail);
        const bPropertyId = '6acb543d271b8f101124081b';
        const bLeaseId = '6acb543d271b8f101124082e';
        const aLeaseId = evidence.records.leaseId;
        const tenantBody = (_a = evidence.http.find((row) => row.label === 'company B tenant')) === null || _a === void 0 ? void 0 : _a.body;
        const bTenantId = (tenantBody === null || tenantBody === void 0 ? void 0 : tenantBody._id) || ((_b = tenantBody === null || tenantBody === void 0 ? void 0 : tenantBody.data) === null || _b === void 0 ? void 0 : _b._id) || ((_c = tenantBody === null || tenantBody === void 0 ? void 0 : tenantBody.tenant) === null || _c === void 0 ? void 0 : _c._id);
        const stray = yield Payment_1.Payment.find({
            companyId: evidence.identities.testCompanyId,
            propertyId: bPropertyId,
        }).select('_id status amount accountingComplete companyId propertyId createdAt').lean();
        const bPaysBefore = yield Payment_1.Payment.countDocuments({ companyId: evidence.identities.companyBId });
        const testPaysBefore = yield Payment_1.Payment.countDocuments({ companyId: evidence.identities.testCompanyId });
        const leaseDenied = yield request('GET', `/api/leases/${bLeaseId}`, testToken);
        const leaseAllowed = yield request('GET', `/api/leases/${aLeaseId}`, testToken);
        const paymentDenied = yield request('POST', '/api/accountants/payments', testToken, {
            paymentType: 'rental', paymentDate: '2026-08-11', paymentMethod: 'cash', amount: 10, currency: 'USD',
            propertyId: bPropertyId, tenantId: bTenantId, rentalPeriodMonth: 8, rentalPeriodYear: 2026,
        });
        const bPaysAfter = yield Payment_1.Payment.countDocuments({ companyId: evidence.identities.companyBId });
        const testPaysAfter = yield Payment_1.Payment.countDocuments({ companyId: evidence.identities.testCompanyId });
        const aList = yield request('GET', '/api/properties', aToken);
        const bList = yield request('GET', '/api/properties', bToken);
        const aText = aList.text;
        const bText = bList.text;
        const payment = yield Payment_1.Payment.findById(evidence.borrowdale.paymentId);
        const before = yield OwnerRentNotice_1.OwnerRentNotice.findOne({ paymentId: payment === null || payment === void 0 ? void 0 : payment._id }).lean();
        if (payment)
            yield (0, ownerRentNotificationService_1.notifyOwnerOfRentPayment)(payment, { accountingComplete: payment.accountingComplete === true });
        const after = yield OwnerRentNotice_1.OwnerRentNotice.find({ paymentId: payment === null || payment === void 0 ? void 0 : payment._id }).lean();
        const email = (0, ownerRentNotificationPolicy_1.buildOwnerRentEmail)({
            ownerName: 'PHASE4B1_TEST_OWNER Disposable',
            propertyName: 'PHASE4B1_TEST_PROPERTY',
            amount: 1000,
            currency: 'USD',
            paymentDate: new Date('2026-10-11'),
            agencyName: 'PHASE4B1_TEST_COMPANY',
        });
        const result = {
            strayCrossPayments: stray.map((row) => ({
                id: String(row._id), status: row.status, amount: row.amount, accountingComplete: row.accountingComplete,
            })),
            leaseDenied: leaseDenied.status,
            leaseDeniedExposesProperty: leaseDenied.text.includes(bPropertyId),
            leaseAllowed: leaseAllowed.status,
            paymentDenied: paymentDenied.status,
            paymentDeniedBody: paymentDenied.text.slice(0, 300),
            companyBPaymentCountUnchanged: bPaysBefore === bPaysAfter,
            testCompanyPaymentCountUnchanged: testPaysBefore === testPaysAfter,
            companyAListStatus: aList.status,
            companyAListContainsBProperty: aText.includes(bPropertyId),
            companyBListStatus: bList.status,
            companyBListContainsOwnProperty: bText.includes(bPropertyId),
            idempotency: {
                beforeStatus: before === null || before === void 0 ? void 0 : before.status,
                beforeUpdatedAt: before === null || before === void 0 ? void 0 : before.updatedAt,
                afterCount: after.length,
                afterStatus: (_d = after[0]) === null || _d === void 0 ? void 0 : _d.status,
                afterUpdatedAt: (_e = after[0]) === null || _e === void 0 ? void 0 : _e.updatedAt,
                unchanged: String(before === null || before === void 0 ? void 0 : before.updatedAt) === String((_f = after[0]) === null || _f === void 0 ? void 0 : _f.updatedAt) && after.length === 1,
            },
            emailExposesTenantId: email.text.includes(String(evidence.records.tenantId)),
            emailExposesBank: /bank|account number/i.test(email.text),
            emailExcerpt: email.text,
        };
        evidence.securityRetest = result;
        fs_1.default.writeFileSync(evidencePath, JSON.stringify(evidence, null, 2));
        console.log(JSON.stringify(result, null, 2));
        yield mongoose_1.default.disconnect();
    });
}
main().catch((error) => __awaiter(void 0, void 0, void 0, function* () {
    console.error(error);
    try {
        yield mongoose_1.default.disconnect();
    }
    catch ( /* ignore */_a) { /* ignore */ }
    process.exit(1);
}));
