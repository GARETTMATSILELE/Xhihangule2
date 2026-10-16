/**
 * Agent and accountant VAT paths on an isolated database.
 * Does not open the application database.
 */
import mongoose from 'mongoose';
import { User } from '../models/User';
import { Company } from '../models/Company';
import { Property } from '../models/Property';
import { Tenant } from '../models/Tenant';
import { Payment } from '../models/Payment';
import { TaxObligation } from '../models/TaxObligation';
import { createAgentPayment } from '../controllers/agentController';
import { createPaymentAccountant } from '../controllers/paymentController';
import { ensurePaymentAccountingPosted, missingOriginalVatObligation } from '../services/paymentAccountingReconciliation';
import { detectVatOnCommissionExceptions } from '../services/taxIntegrityService';
import { ensureSystemTaxRules } from '../services/taxRuleRegistry';
import { accountingConnection } from '../config/database';

const DB = process.env.VAT_PATH_DB || 'mongodb://127.0.0.1:27017/vat_path_consistency_test';
const ACCOUNTING_DB = process.env.VAT_PATH_ACCOUNTING_DB || 'mongodb://127.0.0.1:27017/vat_path_consistency_accounting';
const PAYMENT_DATE = new Date('2026-10-13T10:00:00.000Z');
const PRIOR_DATE = new Date('2025-06-15T10:00:00.000Z');
const failures: string[] = [];

function assert(condition: boolean, message: string) {
  if (!condition) failures.push(message);
}

function mockRes() {
  const res: any = {
    statusCode: 200,
    body: undefined as any,
    status(code: number) { this.statusCode = code; return this; },
    json(payload: any) { this.body = payload; return this; }
  };
  return res;
}

function view(payment: any) {
  const details = payment?.commissionDetails || {};
  return {
    apply: Boolean(payment?.applyVatOnCommission),
    rate: Number(payment?.vatOnCommissionRate || 0),
    treatment: payment?.vatCommissionTreatment || null,
    commission: Number(details.totalCommission || 0),
    vat: Number(details.vatOnCommission || 0),
    owner: Number(details.ownerAmount || 0),
    complete: payment?.accountingComplete === true
  };
}

async function callPath(kind: 'agent' | 'accountant', user: any, body: Record<string, unknown>) {
  const req: any = {
    user: {
      userId: String(user._id),
      companyId: String(user.companyId),
      role: user.role,
      roles: [user.role]
    },
    headers: {},
    body,
    params: {}
  };
  const res = mockRes();
  if (kind === 'agent') await createAgentPayment(req, res);
  else await createPaymentAccountant(req, res);
  const id = res.body?.data?._id || res.body?.payment?._id;
  const saved = id ? await Payment.findById(id).lean() : null;
  return { status: res.statusCode, body: res.body, saved };
}

async function main() {
  process.env.MANTIS_TEST_SEAM = '1';
  await mongoose.connect(DB);
  await mongoose.connection.dropDatabase();
  await accountingConnection.openUri(ACCOUNTING_DB);
  await accountingConnection.dropDatabase();
  await ensureSystemTaxRules();

  const agent = await User.create({
    email: 'vat-path-agent@example.test',
    password: 'test-pass-1',
    firstName: 'Path',
    lastName: 'Agent',
    role: 'agent',
    roles: ['agent'],
    isActive: true,
    sessionVersion: 1
  });
  const accountant = await User.create({
    email: 'vat-path-accountant@example.test',
    password: 'test-pass-1',
    firstName: 'Path',
    lastName: 'Accountant',
    role: 'accountant',
    roles: ['accountant'],
    isActive: true,
    sessionVersion: 1
  });

  async function company(name: string, registered: boolean, country = 'Zimbabwe') {
    const row = await Company.create({
      name,
      address: '1 Test Street',
      phone: '0770000099',
      email: `${name.replace(/\s+/g, '-').toLowerCase()}@example.test`,
      registrationNumber: `REG-${name}`,
      tinNumber: `TIN-${name}`,
      country,
      ownerId: agent._id,
      taxProfile: registered
        ? { vatRegistered: true, vatNumber: 'ZW-PATH', vatRegistrationEffectiveDate: new Date('2020-01-01T00:00:00.000Z') }
        : { vatRegistered: false }
    });
    agent.companyId = row._id;
    accountant.companyId = row._id;
    await agent.save();
    await accountant.save();
    return row;
  }

  const registered = await company('Path Registered', true);
  const unregistered = await company('Path Unregistered', false);
  const noRate = await company('Path No Rate', true, 'France');

  async function property(companyId: mongoose.Types.ObjectId, name: string, commission: number, vatOn: boolean, treatment?: 'inclusive' | 'exclusive') {
    return Property.create({
      companyId,
      ownerId: agent._id,
      agentId: agent._id,
      name,
      address: `${name} Road`,
      rentalType: 'management',
      rent: 1800,
      commission,
      vatOnCommission: vatOn,
      vatCommissionTreatment: treatment
    });
  }

  const exclusive = await property(registered._id, 'Exclusive 15', 15, true, 'exclusive');
  const inclusive = await property(registered._id, 'Inclusive 10', 10, true, 'inclusive');
  const otherRate = await property(registered._id, 'Exclusive 12', 12, true, 'exclusive');
  const disabled = await property(registered._id, 'VAT Off', 15, false);
  const unregisteredProperty = await property(unregistered._id, 'Unregistered', 15, true, 'exclusive');
  const noRateProperty = await property(noRate._id, 'No Rate', 15, true, 'exclusive');

  async function tenant(companyId: mongoose.Types.ObjectId, email: string) {
    return Tenant.create({
      firstName: 'Test',
      lastName: 'Tenant',
      email,
      phone: '0771111111',
      companyId,
      ownerId: agent._id,
      status: 'Active'
    });
  }
  const registeredTenant = await tenant(registered._id, 'path-tenant@example.test');
  const unregisteredTenant = await tenant(unregistered._id, 'path-unreg-tenant@example.test');
  const noRateTenant = await tenant(noRate._id, 'path-norate-tenant@example.test');

  let month = 1;
  function base(user: any, propertyId: any, tenantId: any, extra: Record<string, unknown> = {}) {
    const period = month++;
    return {
      propertyId: String(propertyId),
      tenantId: String(tenantId),
      agentId: String(agent._id),
      amount: 1800,
      depositAmount: 0,
      paymentDate: PAYMENT_DATE.toISOString(),
      paymentMethod: 'bank_transfer',
      paymentType: 'rental',
      propertyType: 'residential',
      rentalPeriodMonth: ((period - 1) % 12) + 1,
      rentalPeriodYear: 2026 + Math.floor((period - 1) / 12),
      idempotencyKey: `path:${new mongoose.Types.ObjectId().toString()}`,
      ...extra
    };
  }

  async function pair(companyUserCompanyId: any, propertyId: any, tenantId: any, extra: Record<string, unknown> = {}) {
    agent.companyId = companyUserCompanyId;
    accountant.companyId = companyUserCompanyId;
    const agentCall = await callPath('agent', agent, base(agent, propertyId, tenantId, extra));
    const accountantCall = await callPath('accountant', accountant, base(accountant, propertyId, tenantId, extra));
    return { agentCall, accountantCall };
  }

  const registeredPair = await pair(registered._id, exclusive._id, registeredTenant._id);
  assert(registeredPair.agentCall.status === 201, `agent registered create status ${registeredPair.agentCall.status} ${registeredPair.agentCall.body?.message}`);
  assert(registeredPair.accountantCall.status === 201, `accountant registered create status ${registeredPair.accountantCall.status} ${registeredPair.accountantCall.body?.message}`);
  const agentRegistered = view(registeredPair.agentCall.saved);
  const accountantRegistered = view(registeredPair.accountantCall.saved);
  assert(JSON.stringify(agentRegistered) === JSON.stringify(accountantRegistered), `registered paths differ ${JSON.stringify(agentRegistered)} vs ${JSON.stringify(accountantRegistered)}`);
  assert(agentRegistered.apply === true && agentRegistered.vat === 41.85 && agentRegistered.commission === 270 && agentRegistered.owner === 1488.15, `registered snapshot ${JSON.stringify(agentRegistered)}`);
  assert(agentRegistered.complete === true, 'registered agent payment is accounting complete');

  const third = await callPath('agent', agent, base(agent, exclusive._id, registeredTenant._id));
  assert(view(third.saved).vat === 41.85, 'a later payment resolves VAT on its own and is not copied from the first');

  const unregisteredPair = await pair(unregistered._id, unregisteredProperty._id, unregisteredTenant._id);
  assert(unregisteredPair.agentCall.status === 201 && unregisteredPair.accountantCall.status === 201, 'unregistered creates succeed');
  const agentUnregistered = view(unregisteredPair.agentCall.saved);
  const accountantUnregistered = view(unregisteredPair.accountantCall.saved);
  assert(JSON.stringify(agentUnregistered) === JSON.stringify(accountantUnregistered), `unregistered paths differ ${JSON.stringify(agentUnregistered)} vs ${JSON.stringify(accountantUnregistered)}`);
  assert(agentUnregistered.apply === false && agentUnregistered.vat === 0 && agentUnregistered.commission === 270 && agentUnregistered.owner === 1530, `unregistered snapshot ${JSON.stringify(agentUnregistered)}`);
  const unregisteredObligations = await TaxObligation.countDocuments({ paymentId: { $in: [unregisteredPair.agentCall.saved?._id, unregisteredPair.accountantCall.saved?._id] }, taxType: 'VAT_ON_COMMISSION' });
  assert(unregisteredObligations === 0, 'unregistered payments do not create VAT obligations');

  const disabledPair = await pair(registered._id, disabled._id, registeredTenant._id);
  assert(view(disabledPair.agentCall.saved).vat === 0 && view(disabledPair.accountantCall.saved).vat === 0, 'VAT disabled withholds VAT on both paths');

  const inclusivePair = await pair(registered._id, inclusive._id, registeredTenant._id);
  assert(view(inclusivePair.agentCall.saved).vat === 24.16 && view(inclusivePair.accountantCall.saved).vat === 24.16, `inclusive VAT is 24.16 on both paths, got ${view(inclusivePair.agentCall.saved).vat} and ${view(inclusivePair.accountantCall.saved).vat}`);
  assert(view(inclusivePair.agentCall.saved).treatment === 'inclusive', 'inclusive treatment is stored');

  const ratePair = await pair(registered._id, otherRate._id, registeredTenant._id);
  assert(view(ratePair.agentCall.saved).commission === 216 && view(ratePair.agentCall.saved).vat === 33.48, `12% exclusive VAT is 33.48, got ${JSON.stringify(view(ratePair.agentCall.saved))}`);
  assert(JSON.stringify(view(ratePair.agentCall.saved)) === JSON.stringify(view(ratePair.accountantCall.saved)), '12% paths differ');

  const priorPair = await pair(registered._id, exclusive._id, registeredTenant._id, { paymentDate: PRIOR_DATE.toISOString(), rentalPeriodYear: 2025 });
  assert(view(priorPair.agentCall.saved).rate === 0.15 && view(priorPair.agentCall.saved).vat === 40.5, `2025 rate gives VAT 40.50, got ${JSON.stringify(view(priorPair.agentCall.saved))}`);
  assert(view(priorPair.accountantCall.saved).vat === 40.5, 'accountant prior-rate VAT matches');

  const advance = await pair(registered._id, exclusive._id, registeredTenant._id, { amount: 3600, advanceMonthsPaid: 2 });
  assert(view(advance.agentCall.saved).commission === 540 && view(advance.agentCall.saved).vat === 83.7, `advance VAT is 83.70, got ${JSON.stringify(view(advance.agentCall.saved))}`);
  assert(view(advance.accountantCall.saved).vat === 83.7, 'accountant advance VAT matches');

  const deposit = await pair(registered._id, exclusive._id, registeredTenant._id, { amount: 0, depositAmount: 500 });
  assert(view(deposit.agentCall.saved).vat === 0 && view(deposit.agentCall.saved).commission === 0, 'deposit-only agent receipt has no commission VAT');
  assert(view(deposit.accountantCall.saved).vat === 0 && view(deposit.accountantCall.saved).commission === 0, 'deposit-only accountant receipt has no commission VAT');

  const beforeMissing = await Payment.countDocuments({ companyId: noRate._id });
  const missingAgent = await callPath('agent', { ...agent.toObject(), companyId: noRate._id, role: 'agent' }, base(agent, noRateProperty._id, noRateTenant._id));
  const missingAccountant = await callPath('accountant', { ...accountant.toObject(), companyId: noRate._id, role: 'accountant' }, base(accountant, noRateProperty._id, noRateTenant._id));
  assert(missingAgent.status === 400 && missingAccountant.status === 400, `missing central rate is rejected, agent ${missingAgent.status} accountant ${missingAccountant.status}`);
  const afterMissing = await Payment.countDocuments({ companyId: noRate._id });
  assert(afterMissing === beforeMissing, 'missing central rate does not save a payment');

  const repeatBody = base(agent, exclusive._id, registeredTenant._id, { idempotencyKey: 'path-repeat-1' });
  agent.companyId = registered._id;
  const firstRepeat = await callPath('agent', agent, repeatBody);
  const secondRepeat = await callPath('agent', agent, repeatBody);
  assert(String(firstRepeat.saved?._id) === String(secondRepeat.saved?._id), 'repeated idempotency key returns the same payment');
  const repeatObligations = await TaxObligation.countDocuments({ paymentId: firstRepeat.saved?._id, taxType: 'VAT_ON_COMMISSION', reversalOf: null });
  assert(repeatObligations === 1, `repeated processing keeps one original obligation, got ${repeatObligations}`);

  const concurrentBodies = [
    base(agent, exclusive._id, registeredTenant._id),
    base(accountant, exclusive._id, registeredTenant._id)
  ];
  const concurrent = await Promise.all([
    callPath('agent', agent, concurrentBodies[0]),
    callPath('accountant', accountant, concurrentBodies[1])
  ]);
  assert(concurrent[0].status === 201 && concurrent[1].status === 201, 'concurrent creates succeed');
  assert(view(concurrent[0].saved).vat === 41.85 && view(concurrent[1].saved).vat === 41.85, 'concurrent payments each resolve VAT 41.85');
  assert(String(concurrent[0].saved?._id) !== String(concurrent[1].saved?._id), 'concurrent payments are separate records');

  const gapCall = await callPath('agent', agent, base(agent, exclusive._id, registeredTenant._id, { notes: 'FAIL_VAT_OBLIGATION' }));
  assert(gapCall.status === 201, `obligation-failure payment is saved, status ${gapCall.status}`);
  assert(view(gapCall.saved).vat === 41.85, 'failed obligation posting leaves the VAT snapshot unchanged');
  assert(gapCall.saved?.accountingComplete !== true, 'a VAT snapshot without an obligation is not accounting complete');
  const gapCount = await TaxObligation.countDocuments({ paymentId: gapCall.saved?._id, taxType: 'VAT_ON_COMMISSION' });
  assert(gapCount === 0, 'the completeness gate does not create the missing obligation');
  const gapMessage = await missingOriginalVatObligation(gapCall.saved);
  assert(Boolean(gapMessage && gapMessage.includes('no original VAT_ON_COMMISSION obligation')), `gap detector message: ${gapMessage}`);
  const findings = await detectVatOnCommissionExceptions(String(registered._id));
  const gapFinding = findings.find((row: any) => String(row.transaction) === String(gapCall.saved?._id) && row.issueType === 'VAT_SNAPSHOT_WITHOUT_OBLIGATION');
  assert(Boolean(gapFinding), 'integrity detection reports the snapshot without an obligation');

  delete process.env.MANTIS_TEST_SEAM;
  const repaired = await ensurePaymentAccountingPosted(String(gapCall.saved?._id), { createdBy: String(agent._id) });
  const repairedPayment = await Payment.findById(gapCall.saved?._id).lean();
  const repairedObligation = await TaxObligation.findOne({ paymentId: gapCall.saved?._id, taxType: 'VAT_ON_COMMISSION', reversalOf: null }).lean();
  assert(repaired.accountingComplete === true, 'explicit re-post through the accounting pipeline can complete after the obligation exists');
  assert(Number(repairedPayment?.commissionDetails?.vatOnCommission || 0) === 41.85, 're-post does not change the VAT snapshot');
  assert(Number((repairedObligation as any)?.taxAmount || 0) === 41.85, 're-post obligation uses the stored snapshot');

  if (failures.length) {
    console.error(failures.join('\n'));
    throw new Error(`${failures.length} VAT path consistency assertion(s) failed`);
  }
  console.log('VAT path consistency tests passed', JSON.stringify({
    registered: agentRegistered,
    unregistered: agentUnregistered,
    advanceVat: view(advance.agentCall.saved).vat,
    priorVat: view(priorPair.agentCall.saved).vat
  }));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.connection.dropDatabase().catch(() => undefined);
    await accountingConnection.dropDatabase().catch(() => undefined);
    await mongoose.disconnect().catch(() => undefined);
    await accountingConnection.close().catch(() => undefined);
  });
