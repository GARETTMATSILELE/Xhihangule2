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
const workflowMachine_1 = require("../ecosystem/workflowMachine");
const listingUtils_1 = require("../ecosystem/listingUtils");
const flags_1 = require("../ecosystem/flags");
const constants_1 = require("../ecosystem/constants");
const documentAccess_1 = require("../ecosystem/documentAccess");
function srcFile(rel) {
    const candidates = [
        path_1.default.join(__dirname, '..', '..', 'src', rel),
        path_1.default.join(__dirname, '..', rel),
    ];
    for (const candidate of candidates) {
        if (fs_1.default.existsSync(candidate))
            return fs_1.default.readFileSync(candidate, 'utf8');
    }
    throw new Error(`Source file not found: ${rel}`);
}
function run() {
    return __awaiter(this, void 0, void 0, function* () {
        const results = {};
        {
            assert_1.default.ok(srcFile('services/paymentAccountingOrchestrator.ts').includes('export async function postPaymentAccounting'));
            assert_1.default.ok(!srcFile('ecosystem/services/paymentProvider.ts').includes('await postPaymentAccounting'));
            results['Online payments do not bypass canonical posting'] = 'PASS';
        }
        {
            const orch = srcFile('services/paymentAccountingOrchestrator.ts');
            const ecosystemRoutes = srcFile('ecosystem/routes.ts');
            assert_1.default.ok(ecosystemRoutes.includes("app.use") === false);
            assert_1.default.ok(srcFile('index.ts').includes("app.use('/api/ecosystem'"));
            assert_1.default.ok(orch.includes('individualTaxMetadataService') || orch.includes('postPaymentAccounting'));
            results['Ecosystem is mounted additively'] = 'PASS';
        }
        {
            (0, workflowMachine_1.assertViewingTransition)('REQUESTED', 'CONFIRMED');
            (0, workflowMachine_1.assertApplicationTransition)('DRAFT', 'SUBMITTED');
            (0, workflowMachine_1.assertApplicationTransition)('SUBMITTED', 'UNDER_REVIEW');
            (0, workflowMachine_1.assertMaintenanceTransition)('REPORTED', 'UNDER_REVIEW');
            (0, workflowMachine_1.assertMaintenanceTransition)('QUOTE_RECEIVED', 'OWNER_APPROVAL');
            (0, workflowMachine_1.assertQuoteTransition)('SUBMITTED', 'SELECTED');
            (0, workflowMachine_1.assertQuoteTransition)('SELECTED', 'SENT_TO_OWNER');
            (0, workflowMachine_1.assertJobTransition)('SELECTED', 'AUTHORISED');
            (0, workflowMachine_1.assertJobTransition)('AUTHORISED', 'ACCEPTED');
            results['Happy-path state machines'] = 'PASS';
        }
        {
            let blocked = false;
            try {
                (0, workflowMachine_1.assertMaintenanceTransition)('REPORTED', 'AUTHORISED');
            }
            catch (_a) {
                blocked = true;
            }
            assert_1.default.ok(blocked, 'cannot skip to authorised');
            blocked = false;
            try {
                (0, workflowMachine_1.assertQuoteNotLocked)('OWNER_APPROVED');
            }
            catch (_b) {
                blocked = true;
            }
            assert_1.default.ok(blocked, 'owner-approved quotes are locked');
            blocked = false;
            try {
                (0, workflowMachine_1.assertWorkMayStart)({ ownerApproved: false, agentAuthorised: true, status: 'WORK_IN_PROGRESS' });
            }
            catch (_c) {
                blocked = true;
            }
            assert_1.default.ok(blocked, 'work cannot start without owner approval');
            blocked = false;
            try {
                (0, workflowMachine_1.assertWorkMayStart)({ ownerApproved: true, agentAuthorised: false, status: 'WORK_IN_PROGRESS' });
            }
            catch (_d) {
                blocked = true;
            }
            assert_1.default.ok(blocked, 'work cannot start without agent authorisation');
            blocked = false;
            try {
                (0, workflowMachine_1.assertViewingTransition)('REQUESTED', 'COMPLETED');
            }
            catch (_e) {
                blocked = true;
            }
            assert_1.default.ok(blocked, 'viewing cannot jump to completed');
            blocked = false;
            try {
                (0, workflowMachine_1.assertQuoteTransition)('SUBMITTED', 'OWNER_APPROVED');
            }
            catch (_f) {
                blocked = true;
            }
            assert_1.default.ok(blocked, 'quote cannot skip owner workflow');
            results['Authorization guards'] = 'PASS';
        }
        {
            const pct = (0, listingUtils_1.computeProfileCompletion)({
                fullName: 'Ada',
                phone: '1',
                email: 'a@b.c',
                idNumber: 'x',
                address: 'y',
                employmentStatus: 'employed',
                employer: 'co',
                emergencyContactName: 'n',
                emergencyContactPhone: 'p',
                householdSize: 2,
                rentalPreferences: 'quiet',
                preferredLocations: ['Harare'],
            });
            assert_1.default.strictEqual(pct, 100);
            assert_1.default.ok((0, listingUtils_1.computeProfileCompletion)({ fullName: 'A', email: 'a@b.c' }) < 50);
            results['Profile completion is not a quality score'] = 'PASS';
        }
        {
            const listing = (0, listingUtils_1.toPublicListing)({
                _id: '1',
                name: 'Flat',
                address: 'Harare',
                rent: 400,
                commission: 15,
                ownerId: 'secret',
                propertyOwnerId: 'secret2',
                taxNotes: 'hidden',
            });
            assert_1.default.strictEqual(listing.commission, undefined);
            assert_1.default.strictEqual(listing.ownerId, undefined);
            assert_1.default.strictEqual(listing.taxNotes, undefined);
            assert_1.default.strictEqual(listing.rent, 400);
            const app = (0, listingUtils_1.toTenantApplication)({
                _id: 'a1',
                status: 'SUBMITTED',
                agentNotes: 'internal',
                notes: 'tenant note',
                statusHistory: [{ status: 'SUBMITTED', at: new Date(), note: 'agent only' }],
            });
            assert_1.default.strictEqual(app.agentNotes, undefined);
            assert_1.default.strictEqual(app.notes, 'tenant note');
            assert_1.default.strictEqual(app.statusHistory[0].note, undefined);
            const viewing = (0, listingUtils_1.toTenantViewing)({ _id: 'v1', status: 'REQUESTED', agentNotes: 'hidden', message: 'hi' });
            assert_1.default.strictEqual(viewing.agentNotes, undefined);
            results['Listings strip private financials'] = 'PASS';
        }
        {
            assert_1.default.strictEqual((0, flags_1.isEcosystemFlagEnabled)({ featureFlags: {} }, 'tenantPortalEnabled'), false);
            assert_1.default.strictEqual((0, flags_1.isEcosystemFlagEnabled)({ featureFlags: { tenantPortalEnabled: true } }, 'tenantPortalEnabled'), true);
            results['Feature flags default off'] = 'PASS';
        }
        {
            assert_1.default.strictEqual(constants_1.LEGACY_STATUS_FROM_ECOSYSTEM.REPORTED, 'draft');
            assert_1.default.strictEqual(constants_1.LEGACY_STATUS_FROM_ECOSYSTEM.OWNER_APPROVAL, 'awaiting_approval');
            assert_1.default.strictEqual(constants_1.LEGACY_STATUS_FROM_ECOSYSTEM.CLOSED, 'closed');
            results['Legacy maintenance status mapping preserved'] = 'PASS';
        }
        {
            const user = srcFile('models/User.ts');
            assert_1.default.ok(user.includes("'tenant'"));
            assert_1.default.ok(user.includes("'contractor'"));
            assert_1.default.ok(user.includes("'admin'"));
            results['RBAC extended additively'] = 'PASS';
        }
        {
            const middleware = srcFile('ecosystem/middleware.ts');
            assert_1.default.ok(!middleware.includes("flag === 'tenantPortalEnabled' || flag === 'contractorPortalEnabled'"));
            assert_1.default.ok(middleware.includes('FEATURE_DISABLED'));
            assert_1.default.ok(middleware.includes('Never trust client-supplied companyId'));
            assert_1.default.ok(srcFile('ecosystem/routes.ts').includes("requireFlag('tenantPortalEnabled')"));
            assert_1.default.ok(srcFile('ecosystem/routes.ts').includes("requireFlag('maintenanceQuotesEnabled')"));
            assert_1.default.ok(srcFile('ecosystem/routes.ts').includes("requireFlag('onlinePaymentsEnabled')"));
            results['Feature flags enforced on routes'] = 'PASS';
        }
        {
            const pay = srcFile('ecosystem/services/paymentProvider.ts');
            assert_1.default.ok(!pay.includes('req.body.companyId'));
            assert_1.default.ok(pay.includes('You can only initialize payments for your own tenancy'));
            assert_1.default.ok(pay.includes('posted: false'));
            const wf = srcFile('ecosystem/services/maintenanceWorkflowService.ts');
            assert_1.default.ok(wf.includes('requestChangeOrder'));
            assert_1.default.ok(wf.includes('You can only rate contractors for jobs you participated in'));
            assert_1.default.ok(wf.includes('INSPECTION_LOCKED'));
            assert_1.default.ok(srcFile('ecosystem/services/notificationService.ts').includes('VIEWING_RESCHEDULED'));
            assert_1.default.ok(srcFile('ecosystem/services/notificationService.ts').includes("eventType === 'QUOTE_REQUESTED' && isChannelGloballyEnabled('SMS')"));
            assert_1.default.ok(srcFile('ecosystem/services/maintenanceWorkflowService.ts').includes('idempotencyKey: `quote-invite:${invitation?._id}`'));
            assert_1.default.ok(!srcFile('ecosystem/services/maintenanceWorkflowService.ts').includes('smsAvailable: true'));
            (0, workflowMachine_1.assertJobTransition)('QUOTE_REQUESTED', 'CANCELLED');
            let workBlocked = false;
            try {
                (0, workflowMachine_1.assertWorkMayStart)({ ownerApproved: false, agentAuthorised: false, status: 'ACCEPTED' });
            }
            catch (_g) {
                workBlocked = true;
            }
            assert_1.default.ok(workBlocked, 'declining or accepting a request does not authorise work');
            assert_1.default.ok(srcFile('ecosystem/services/tenantPortalService.ts').includes('propertyMarketplaceEnabled'));
            results['Hardening controls present'] = 'PASS';
        }
        {
            assert_1.default.ok((0, documentAccess_1.isTenantVisiblePropertyFile)({ fileType: 'lease', fileName: 'signed-lease.pdf' }));
            assert_1.default.ok((0, documentAccess_1.isTenantVisiblePropertyFile)({ fileType: 'receipt', fileName: 'rent-receipt.pdf' }));
            assert_1.default.ok(!(0, documentAccess_1.isTenantVisiblePropertyFile)({ fileType: 'tax', fileName: 'VAT.pdf' }));
            assert_1.default.ok(!(0, documentAccess_1.isTenantVisiblePropertyFile)({ fileType: 'document', fileName: 'owner-bank-details.pdf' }));
            assert_1.default.ok(!(0, documentAccess_1.isTenantVisiblePropertyFile)({ fileType: 'accounting', fileName: 'journal.xlsx' }));
            assert_1.default.ok((0, documentAccess_1.isDeniedTenantPropertyFile)({ fileName: 'internal-agent-notes.pdf' }));
            const docs = srcFile('ecosystem/services/tenantPortalService.ts');
            assert_1.default.ok(docs.includes('isTenantVisiblePropertyFile'));
            assert_1.default.ok(docs.includes("You cannot access this document"));
            assert_1.default.ok(docs.includes(".select('fileName fileType propertyId uploadedAt')"));
            results['Tenant document authorization'] = 'PASS';
        }
        {
            const wf = srcFile('ecosystem/services/maintenanceWorkflowService.ts');
            assert_1.default.ok(wf.includes('assertOwnerCanActOnProperty'));
            assert_1.default.ok(!wf.includes('$or: [{ _id: property.propertyOwnerId }'));
            assert_1.default.ok(srcFile('ecosystem/routes.ts').includes('assertOwnerCanActOnProperty'));
            results['Owner quote isolation is relationship-based'] = 'PASS';
        }
        console.log('Ecosystem tests');
        for (const [name, status] of Object.entries(results)) {
            console.log(`  ${status}  ${name}`);
        }
        console.log(`All ${Object.keys(results).length} checks passed.`);
    });
}
run().catch((error) => {
    console.error(error);
    process.exit(1);
});
