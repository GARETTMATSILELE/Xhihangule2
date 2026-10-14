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
const ownerWaterfall_1 = require("../reporting/ownerWaterfall");
const ownerRentNotificationPolicy_1 = require("../services/ownerRentNotificationPolicy");
const lettingWorkflow_1 = require("../agency/lettingWorkflow");
const workflowMachine_1 = require("../ecosystem/workflowMachine");
function src(rel) {
    return fs_1.default.readFileSync(path_1.default.join(__dirname, '..', rel), 'utf8');
}
function main() {
    return __awaiter(this, void 0, void 0, function* () {
        const results = {};
        const waterfall = (0, ownerWaterfall_1.explainOwnerWaterfall)({
            grossAmount: 1000,
            commissionAmount: 100,
            levyAmount: 100,
            vatOnCommission: 15.5,
            recordedOwnerAmount: 784.5,
        });
        assert_1.default.strictEqual(waterfall.netOwnerAmount, 784.5);
        assert_1.default.strictEqual(waterfall.reviewRequired, false);
        results['Borrowdale waterfall comes from explainOwnerWaterfall'] = 'PASS';
        const email = { subject: 'Rent', text: 'Amount received: USD 1000.00' };
        let sends = 0;
        const notReady = yield (0, ownerRentNotificationPolicy_1.deliverOwnerRentNotice)({
            idempotencyKey: 'owner-rent-payment:pay-x',
            ownerEmail: 'owner@example.com',
            rentPaymentEmails: true,
            accountingComplete: false,
            email,
        }, {
            findByKey() {
                return __awaiter(this, void 0, void 0, function* () { return null; });
            },
            save() {
                return __awaiter(this, void 0, void 0, function* () { throw new Error('must not save'); });
            },
            send() {
                return __awaiter(this, void 0, void 0, function* () { sends += 1; });
            },
        });
        assert_1.default.strictEqual(notReady, 'NOT_READY');
        assert_1.default.strictEqual(sends, 0);
        results['Incomplete accounting does not email the owner'] = 'PASS';
        assert_1.default.deepStrictEqual((0, lettingWorkflow_1.listingBlockers)({ assessmentStatus: 'ASSESSMENT_SUBMITTED', mandateStatus: 'SENT' }).length > 0, true);
        assert_1.default.deepStrictEqual((0, lettingWorkflow_1.listingBlockers)({ assessmentStatus: 'OWNER_APPROVED', mandateStatus: 'SIGNED' }), []);
        results['Listing requires approved assessment and signed mandate'] = 'PASS';
        assert_1.default.ok((0, lettingWorkflow_1.leaseActivationBlockers)({ applicationStatus: 'SHORTLISTED', tenantSignedAt: null, ownerSignedAt: null, depositRequired: 100, depositReceived: 0 }).includes('Owner approval required'));
        assert_1.default.ok((0, lettingWorkflow_1.leaseActivationBlockers)({ applicationStatus: 'OWNER_APPROVED', tenantSignedAt: null, ownerSignedAt: null, depositRequired: 100, depositReceived: 0 }).includes('Tenant signature required'));
        assert_1.default.ok((0, lettingWorkflow_1.leaseActivationBlockers)({ applicationStatus: 'OWNER_APPROVED', tenantSignedAt: new Date(), ownerSignedAt: null, depositRequired: 100, depositReceived: 0 }).includes('Deposit payment outstanding'));
        assert_1.default.ok((0, lettingWorkflow_1.leaseActivationBlockers)({ applicationStatus: 'OWNER_APPROVED', tenantSignedAt: new Date(), ownerSignedAt: null, depositRequired: 100, depositReceived: 100 }).includes('Owner signature required'));
        assert_1.default.deepStrictEqual((0, lettingWorkflow_1.leaseActivationBlockers)({ applicationStatus: 'OWNER_APPROVED', tenantSignedAt: new Date(), ownerSignedAt: new Date(), depositRequired: 100, depositReceived: 100 }), []);
        results['Lease activation gates'] = 'PASS';
        const due = new Date('2026-10-01');
        assert_1.default.strictEqual((0, lettingWorkflow_1.classifyRentCollection)({ dueDate: due, rent: 1000, received: 0, now: new Date('2026-10-01') }), 'DUE');
        assert_1.default.strictEqual((0, lettingWorkflow_1.classifyRentCollection)({ dueDate: due, rent: 1000, received: 0, now: new Date('2026-10-05') }), 'OVERDUE');
        assert_1.default.strictEqual((0, lettingWorkflow_1.classifyRentCollection)({ dueDate: due, rent: 1000, received: 400, now: new Date('2026-10-05') }), 'PARTIALLY_PAID');
        assert_1.default.strictEqual((0, lettingWorkflow_1.classifyRentCollection)({ dueDate: due, rent: 1000, received: 1000, now: new Date('2026-10-05') }), 'PAID');
        results['Rent collection board states'] = 'PASS';
        assert_1.default.ok((0, lettingWorkflow_1.maintenanceRequestBlockers)({ quoteStatus: 'SUBMITTED', approvedAmount: 100, requestedAmount: 100, agentAuthorised: true }).includes('Owner quote approval required'));
        assert_1.default.ok((0, lettingWorkflow_1.maintenanceRequestBlockers)({ quoteStatus: 'OWNER_APPROVED', approvedAmount: 100, requestedAmount: 100, agentAuthorised: false }).includes('Agent authorisation required'));
        assert_1.default.ok((0, lettingWorkflow_1.maintenanceRequestBlockers)({ quoteStatus: 'OWNER_APPROVED', approvedAmount: 100, requestedAmount: 150, agentAuthorised: true }).includes('Requested amount exceeds the approved quote'));
        assert_1.default.deepStrictEqual((0, lettingWorkflow_1.maintenanceRequestBlockers)({ quoteStatus: 'OWNER_APPROVED', approvedAmount: 100, requestedAmount: 100, agentAuthorised: true, quoteCompanyId: 'a', requestCompanyId: 'a' }), []);
        results['Maintenance payment request gates'] = 'PASS';
        assert_1.default.doesNotThrow(() => (0, workflowMachine_1.assertApplicationTransition)('UNDER_REVIEW', 'SHORTLISTED'));
        assert_1.default.doesNotThrow(() => (0, workflowMachine_1.assertApplicationTransition)('SHORTLISTED', 'SENT_TO_OWNER'));
        assert_1.default.doesNotThrow(() => (0, workflowMachine_1.assertApplicationTransition)('SENT_TO_OWNER', 'OWNER_APPROVED'));
        assert_1.default.throws(() => (0, workflowMachine_1.assertApplicationTransition)('UNDER_REVIEW', 'OWNER_APPROVED'));
        results['Application shortlist transitions'] = 'PASS';
        assert_1.default.strictEqual((0, lettingWorkflow_1.nextAgencyAction)({}), 'Complete assessment');
        assert_1.default.strictEqual((0, lettingWorkflow_1.nextAgencyAction)({ assessmentStatus: 'OWNER_APPROVED', mandateStatus: 'DRAFT' }), 'Obtain signed mandate');
        results['Next action is derived from records'] = 'PASS';
        const controller = src('agency/lettingController.ts');
        const collection = src('controllers/ownerCollectionController.ts');
        const individual = fs_1.default.readFileSync(path_1.default.join(__dirname, '../../../client/src/pages/IndividualDashboard/components/Sidebar.tsx'), 'utf8');
        assert_1.default.ok(controller.includes('financialPosting: false'));
        assert_1.default.ok(!controller.includes('postPaymentAccounting'));
        assert_1.default.ok(collection.includes('explainOwnerWaterfall'));
        assert_1.default.ok(collection.includes('OPERATIONAL_OVERRIDE'));
        assert_1.default.ok(!individual.includes('letting/portfolio'));
        assert_1.default.ok(src('ecosystem/routes.ts').includes('Owner approval is a separate gate'));
        results['No second accounting path and individual sidebar stays clear'] = 'PASS';
        console.log(JSON.stringify(results, null, 2));
    });
}
main().catch((error) => {
    console.error(error);
    process.exit(1);
});
