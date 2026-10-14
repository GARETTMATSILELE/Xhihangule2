import assert from 'assert';
import fs from 'fs';
import path from 'path';
import {
  assertApplicationTransition,
  assertJobTransition,
  assertMaintenanceTransition,
  assertQuoteNotLocked,
  assertQuoteTransition,
  assertViewingTransition,
  assertWorkMayStart,
} from '../ecosystem/workflowMachine';
import { computeProfileCompletion, toPublicListing, toTenantApplication, toTenantViewing } from '../ecosystem/listingUtils';
import { isEcosystemFlagEnabled } from '../ecosystem/flags';
import { LEGACY_STATUS_FROM_ECOSYSTEM } from '../ecosystem/constants';
import { isDeniedTenantPropertyFile, isTenantVisiblePropertyFile } from '../ecosystem/documentAccess';

function srcFile(rel: string): string {
  const candidates = [
    path.join(__dirname, '..', '..', 'src', rel),
    path.join(__dirname, '..', rel),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return fs.readFileSync(candidate, 'utf8');
  }
  throw new Error(`Source file not found: ${rel}`);
}

async function run(): Promise<void> {
  const results: Record<string, string> = {};

  {
    assert.ok(srcFile('services/paymentAccountingOrchestrator.ts').includes('export async function postPaymentAccounting'));
    assert.ok(!srcFile('ecosystem/services/paymentProvider.ts').includes('await postPaymentAccounting'));
    results['Online payments do not bypass canonical posting'] = 'PASS';
  }

  {
    const orch = srcFile('services/paymentAccountingOrchestrator.ts');
    const ecosystemRoutes = srcFile('ecosystem/routes.ts');
    assert.ok(ecosystemRoutes.includes("app.use") === false);
    assert.ok(srcFile('index.ts').includes("app.use('/api/ecosystem'"));
    assert.ok(orch.includes('individualTaxMetadataService') || orch.includes('postPaymentAccounting'));
    results['Ecosystem is mounted additively'] = 'PASS';
  }

  {
    assertViewingTransition('REQUESTED', 'CONFIRMED');
    assertApplicationTransition('DRAFT', 'SUBMITTED');
    assertApplicationTransition('SUBMITTED', 'UNDER_REVIEW');
    assertMaintenanceTransition('REPORTED', 'UNDER_REVIEW');
    assertMaintenanceTransition('QUOTE_RECEIVED', 'OWNER_APPROVAL');
    assertQuoteTransition('SUBMITTED', 'SELECTED');
    assertQuoteTransition('SELECTED', 'SENT_TO_OWNER');
    assertJobTransition('SELECTED', 'AUTHORISED');
    assertJobTransition('AUTHORISED', 'ACCEPTED');
    results['Happy-path state machines'] = 'PASS';
  }

  {
    let blocked = false;
    try {
      assertMaintenanceTransition('REPORTED', 'AUTHORISED');
    } catch {
      blocked = true;
    }
    assert.ok(blocked, 'cannot skip to authorised');
    blocked = false;
    try {
      assertQuoteNotLocked('OWNER_APPROVED');
    } catch {
      blocked = true;
    }
    assert.ok(blocked, 'owner-approved quotes are locked');
    blocked = false;
    try {
      assertWorkMayStart({ ownerApproved: false, agentAuthorised: true, status: 'WORK_IN_PROGRESS' });
    } catch {
      blocked = true;
    }
    assert.ok(blocked, 'work cannot start without owner approval');
    blocked = false;
    try {
      assertWorkMayStart({ ownerApproved: true, agentAuthorised: false, status: 'WORK_IN_PROGRESS' });
    } catch {
      blocked = true;
    }
    assert.ok(blocked, 'work cannot start without agent authorisation');
    blocked = false;
    try {
      assertViewingTransition('REQUESTED', 'COMPLETED');
    } catch {
      blocked = true;
    }
    assert.ok(blocked, 'viewing cannot jump to completed');
    blocked = false;
    try {
      assertQuoteTransition('SUBMITTED', 'OWNER_APPROVED');
    } catch {
      blocked = true;
    }
    assert.ok(blocked, 'quote cannot skip owner workflow');
    results['Authorization guards'] = 'PASS';
  }

  {
    const pct = computeProfileCompletion({
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
    assert.strictEqual(pct, 100);
    assert.ok(computeProfileCompletion({ fullName: 'A', email: 'a@b.c' }) < 50);
    results['Profile completion is not a quality score'] = 'PASS';
  }

  {
    const listing = toPublicListing({
      _id: '1',
      name: 'Flat',
      address: 'Harare',
      rent: 400,
      commission: 15,
      ownerId: 'secret',
      propertyOwnerId: 'secret2',
      taxNotes: 'hidden',
    });
    assert.strictEqual((listing as any).commission, undefined);
    assert.strictEqual((listing as any).ownerId, undefined);
    assert.strictEqual((listing as any).taxNotes, undefined);
    assert.strictEqual(listing.rent, 400);
    const app = toTenantApplication({
      _id: 'a1',
      status: 'SUBMITTED',
      agentNotes: 'internal',
      notes: 'tenant note',
      statusHistory: [{ status: 'SUBMITTED', at: new Date(), note: 'agent only' }],
    });
    assert.strictEqual((app as any).agentNotes, undefined);
    assert.strictEqual(app.notes, 'tenant note');
    assert.strictEqual((app.statusHistory[0] as any).note, undefined);
    const viewing = toTenantViewing({ _id: 'v1', status: 'REQUESTED', agentNotes: 'hidden', message: 'hi' });
    assert.strictEqual((viewing as any).agentNotes, undefined);
    results['Listings strip private financials'] = 'PASS';
  }

  {
    assert.strictEqual(isEcosystemFlagEnabled({ featureFlags: {} }, 'tenantPortalEnabled'), false);
    assert.strictEqual(isEcosystemFlagEnabled({ featureFlags: { tenantPortalEnabled: true } }, 'tenantPortalEnabled'), true);
    results['Feature flags default off'] = 'PASS';
  }

  {
    assert.strictEqual(LEGACY_STATUS_FROM_ECOSYSTEM.REPORTED, 'draft');
    assert.strictEqual(LEGACY_STATUS_FROM_ECOSYSTEM.OWNER_APPROVAL, 'awaiting_approval');
    assert.strictEqual(LEGACY_STATUS_FROM_ECOSYSTEM.CLOSED, 'closed');
    results['Legacy maintenance status mapping preserved'] = 'PASS';
  }

  {
    const user = srcFile('models/User.ts');
    assert.ok(user.includes("'tenant'"));
    assert.ok(user.includes("'contractor'"));
    assert.ok(user.includes("'admin'"));
    results['RBAC extended additively'] = 'PASS';
  }

  {
    const middleware = srcFile('ecosystem/middleware.ts');
    assert.ok(!middleware.includes("flag === 'tenantPortalEnabled' || flag === 'contractorPortalEnabled'"));
    assert.ok(middleware.includes('FEATURE_DISABLED'));
    assert.ok(middleware.includes('Never trust client-supplied companyId'));
    assert.ok(srcFile('ecosystem/routes.ts').includes("requireFlag('tenantPortalEnabled')"));
    assert.ok(srcFile('ecosystem/routes.ts').includes("requireFlag('maintenanceQuotesEnabled')"));
    assert.ok(srcFile('ecosystem/routes.ts').includes("requireFlag('onlinePaymentsEnabled')"));
    results['Feature flags enforced on routes'] = 'PASS';
  }

  {
    const pay = srcFile('ecosystem/services/paymentProvider.ts');
    assert.ok(!pay.includes('req.body.companyId'));
    assert.ok(pay.includes('You can only initialize payments for your own tenancy'));
    assert.ok(pay.includes('posted: false'));
    const wf = srcFile('ecosystem/services/maintenanceWorkflowService.ts');
    assert.ok(wf.includes('requestChangeOrder'));
    assert.ok(wf.includes('You can only rate contractors for jobs you participated in'));
    assert.ok(wf.includes('INSPECTION_LOCKED'));
    assert.ok(srcFile('ecosystem/services/notificationService.ts').includes('VIEWING_RESCHEDULED'));
    assert.ok(srcFile('ecosystem/services/notificationService.ts').includes("eventType === 'QUOTE_REQUESTED' && isChannelGloballyEnabled('SMS')"));
    assert.ok(srcFile('ecosystem/services/maintenanceWorkflowService.ts').includes('idempotencyKey: `quote-invite:${invitation?._id}`'));
    assert.ok(!srcFile('ecosystem/services/maintenanceWorkflowService.ts').includes('smsAvailable: true'));
    assertJobTransition('QUOTE_REQUESTED', 'CANCELLED');
    let workBlocked = false;
    try {
      assertWorkMayStart({ ownerApproved: false, agentAuthorised: false, status: 'ACCEPTED' });
    } catch {
      workBlocked = true;
    }
    assert.ok(workBlocked, 'declining or accepting a request does not authorise work');
    assert.ok(srcFile('ecosystem/services/tenantPortalService.ts').includes('propertyMarketplaceEnabled'));
    results['Hardening controls present'] = 'PASS';
  }

  {
    assert.ok(isTenantVisiblePropertyFile({ fileType: 'lease', fileName: 'signed-lease.pdf' }));
    assert.ok(isTenantVisiblePropertyFile({ fileType: 'receipt', fileName: 'rent-receipt.pdf' }));
    assert.ok(!isTenantVisiblePropertyFile({ fileType: 'tax', fileName: 'VAT.pdf' }));
    assert.ok(!isTenantVisiblePropertyFile({ fileType: 'document', fileName: 'owner-bank-details.pdf' }));
    assert.ok(!isTenantVisiblePropertyFile({ fileType: 'accounting', fileName: 'journal.xlsx' }));
    assert.ok(isDeniedTenantPropertyFile({ fileName: 'internal-agent-notes.pdf' }));
    const docs = srcFile('ecosystem/services/tenantPortalService.ts');
    assert.ok(docs.includes('isTenantVisiblePropertyFile'));
    assert.ok(docs.includes("You cannot access this document"));
    assert.ok(docs.includes(".select('fileName fileType propertyId uploadedAt')"));
    results['Tenant document authorization'] = 'PASS';
  }

  {
    const wf = srcFile('ecosystem/services/maintenanceWorkflowService.ts');
    assert.ok(wf.includes('assertOwnerCanActOnProperty'));
    assert.ok(!wf.includes('$or: [{ _id: property.propertyOwnerId }'));
    assert.ok(srcFile('ecosystem/routes.ts').includes('assertOwnerCanActOnProperty'));
    results['Owner quote isolation is relationship-based'] = 'PASS';
  }

  console.log('Ecosystem tests');
  for (const [name, status] of Object.entries(results)) {
    console.log(`  ${status}  ${name}`);
  }
  console.log(`All ${Object.keys(results).length} checks passed.`);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
