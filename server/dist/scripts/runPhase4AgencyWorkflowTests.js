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
const assert_1 = __importDefault(require("assert"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const ownerRentNotificationPolicy_1 = require("../services/ownerRentNotificationPolicy");
const ownerCollectionService_1 = require("../services/ownerCollectionService");
function src(rel) {
    return fs_1.default.readFileSync(path_1.default.join(__dirname, '..', rel), 'utf8');
}
function main() {
    return __awaiter(this, void 0, void 0, function* () {
        const results = {};
        assert_1.default.strictEqual((0, ownerRentNotificationPolicy_1.ownerRentEmailDecision)(undefined), 'send');
        assert_1.default.strictEqual((0, ownerRentNotificationPolicy_1.ownerRentEmailDecision)(true), 'send');
        assert_1.default.strictEqual((0, ownerRentNotificationPolicy_1.ownerRentEmailDecision)(false), 'skip');
        results['Owner opt-out suppresses email'] = 'PASS';
        const email = (0, ownerRentNotificationPolicy_1.buildOwnerRentEmail)({
            ownerName: 'Owner A',
            propertyName: 'Borrowdale Example',
            amount: 1000,
            currency: 'USD',
            paymentDate: new Date('2026-10-01'),
            agencyName: 'The Benjamins Realty',
        });
        assert_1.default.ok(email.text.includes('USD 1000.00'));
        assert_1.default.ok(email.text.includes('Borrowdale Example'));
        assert_1.default.ok(!/national id|tenant id|bank/i.test(email.text));
        results['Owner email content'] = 'PASS';
        const sent = [];
        const store = new Map();
        const key = (0, ownerRentNotificationPolicy_1.ownerRentIdempotencyKey)('pay-1');
        const deps = {
            findByKey(k) {
                return __awaiter(this, void 0, void 0, function* () { return store.get(k) || null; });
            },
            save(doc) {
                return __awaiter(this, void 0, void 0, function* () { store.set(doc.idempotencyKey, { status: doc.status }); });
            },
            send() {
                return __awaiter(this, void 0, void 0, function* () { sent.push('mail'); });
            },
        };
        assert_1.default.strictEqual(yield (0, ownerRentNotificationPolicy_1.deliverOwnerRentNotice)({ idempotencyKey: key, ownerEmail: 'a@example.com', rentPaymentEmails: true, accountingComplete: true, email }, deps), 'SENT');
        assert_1.default.strictEqual(yield (0, ownerRentNotificationPolicy_1.deliverOwnerRentNotice)({ idempotencyKey: key, ownerEmail: 'a@example.com', rentPaymentEmails: true, accountingComplete: true, email }, deps), 'SENT');
        assert_1.default.strictEqual(sent.length, 1);
        results['Notification retry does not send a second email'] = 'PASS';
        const opted = new Map();
        let optedSends = 0;
        const skip = yield (0, ownerRentNotificationPolicy_1.deliverOwnerRentNotice)({
            idempotencyKey: (0, ownerRentNotificationPolicy_1.ownerRentIdempotencyKey)('pay-2'),
            ownerEmail: 'a@example.com',
            rentPaymentEmails: false,
            accountingComplete: true,
            email,
        }, {
            findByKey(k) {
                return __awaiter(this, void 0, void 0, function* () { return opted.get(k) || null; });
            },
            save(doc) {
                return __awaiter(this, void 0, void 0, function* () { opted.set(doc.idempotencyKey, { status: doc.status }); });
            },
            send() {
                return __awaiter(this, void 0, void 0, function* () { optedSends += 1; });
            },
        });
        assert_1.default.strictEqual(skip, 'SKIPPED_OPT_OUT');
        assert_1.default.strictEqual(optedSends, 0);
        results['Opted-out owner receives no email'] = 'PASS';
        let failedSends = 0;
        const failed = yield (0, ownerRentNotificationPolicy_1.deliverOwnerRentNotice)({
            idempotencyKey: (0, ownerRentNotificationPolicy_1.ownerRentIdempotencyKey)('pay-3'),
            ownerEmail: 'a@example.com',
            rentPaymentEmails: true,
            accountingComplete: true,
            email,
        }, {
            findByKey() {
                return __awaiter(this, void 0, void 0, function* () { return null; });
            },
            save() {
                return __awaiter(this, void 0, void 0, function* () { return; });
            },
            send() {
                return __awaiter(this, void 0, void 0, function* () { failedSends += 1; throw new Error('smtp down'); });
            },
        });
        assert_1.default.strictEqual(failed, 'FAILED');
        assert_1.default.strictEqual(failedSends, 1);
        results['Email failure is recorded and does not throw'] = 'PASS';
        (0, ownerCollectionService_1.assertOwnerCollectionTransition)('OWNER_REQUESTED', 'READY_FOR_COLLECTION');
        (0, ownerCollectionService_1.assertOwnerCollectionTransition)('READY_FOR_COLLECTION', 'COLLECTED');
        (0, ownerCollectionService_1.assertOwnerCollectionTransition)('COLLECTED', 'ACKNOWLEDGED');
        assert_1.default.throws(() => (0, ownerCollectionService_1.assertOwnerCollectionTransition)('OWNER_REQUESTED', 'ACKNOWLEDGED'));
        results['Owner collection cannot skip statuses'] = 'PASS';
        const notice = src('services/ownerRentNotificationService.ts');
        const collection = src('services/ownerCollectionService.ts');
        const payment = src('controllers/paymentController.ts');
        assert_1.default.ok(!notice.includes('postPaymentAccounting'));
        assert_1.default.ok(!collection.includes('postPaymentAccounting'));
        assert_1.default.ok(payment.includes('accountingComplete: true'));
        assert_1.default.ok(payment.includes('if (postResult.accountingComplete === true)'));
        assert_1.default.ok(src('routes/accountantRoutes.ts').includes('accounting-integrity') || fs_1.default.readFileSync(path_1.default.join(__dirname, '../../../client/src/App.tsx'), 'utf8').includes('accounting-integrity'));
        const individual = fs_1.default.readFileSync(path_1.default.join(__dirname, '../../../client/src/pages/IndividualDashboard/components/Sidebar.tsx'), 'utf8');
        assert_1.default.ok(!individual.includes('owner-collections'));
        assert_1.default.ok(!individual.includes('Action Centre'));
        results['Accounting path and individual dashboard stay separate'] = 'PASS';
        console.log(JSON.stringify(results, null, 2));
    });
}
main().catch((error) => {
    console.error(error);
    process.exit(1);
});
