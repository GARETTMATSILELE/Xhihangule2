/**
 * Owner rental-payment notification.
 * Figures come from the stored commission snapshot produced by the existing
 * commission pipeline. This script does not post accounting.
 */
import assert from 'assert';
import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import { Payment } from '../models/Payment';
import { applyLevyPassThroughToSnapshot, calculatePropertyCommission } from '../services/propertyCommissionCalculator';
import {
  buildOwnerRentEmail,
  buildOwnerRentPaymentEmail,
  composeOwnerRentNotice,
  deliverOwnerRentNotice,
  ownerRentIdempotencyKey,
  ownerRentNoticeScope,
  resolveOwnerRentNoticeFigures,
  selectPropertyOwnerForRentNotice,
  type OwnerRentNoticeStatus,
  type OwnerRentPaymentSnapshot,
} from '../services/ownerRentNotificationPolicy';
import { roundMoney } from '../utils/money';

const ADDRESS = '12 Borrowdale Road, Harare';
const COLLECTION = 'Please advise us of a convenient date and time when you intend to collect the funds, so that we can make the necessary arrangements.';

function src(rel: string): string {
  return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
}

function rentalPayment(overrides: Partial<OwnerRentPaymentSnapshot> = {}): OwnerRentPaymentSnapshot {
  return {
    status: 'completed',
    paymentType: 'rental',
    currency: 'USD',
    rentalPeriodMonth: 11,
    rentalPeriodYear: 2026,
    ...overrides,
  };
}

function fromPipeline(input: {
  rent: number;
  levy?: number;
  vatOn?: boolean;
  treatment?: 'inclusive' | 'exclusive';
  rate?: number;
  payment?: Partial<OwnerRentPaymentSnapshot>;
}) {
  const result = calculatePropertyCommission({
    grossRent: input.rent,
    levy: 0,
    commissionPercentage: input.rate ?? 15,
    vatOnCommission: input.vatOn !== false,
    vatTreatment: input.treatment || 'exclusive',
    vatRate: input.vatOn === false ? 0 : 0.155,
  });
  const levy = input.levy ?? 0;
  const snapshot = applyLevyPassThroughToSnapshot(result, input.rent, levy);
  const payment = rentalPayment({
    amount: input.rent + levy,
    commissionDetails: snapshot as OwnerRentPaymentSnapshot['commissionDetails'],
    ...input.payment,
  });
  return { result, snapshot, payment };
}

function compose(payment: OwnerRentPaymentSnapshot, ownerName = 'Amina Dube', propertyAddress = ADDRESS) {
  const email = composeOwnerRentNotice({ payment, ownerName, propertyAddress });
  if (!email.ok) throw new Error(email.reason);
  return email.email;
}

function memoryStore() {
  const rows = new Map<string, { status: OwnerRentNoticeStatus; failureReason?: string }>();
  const sent: string[] = [];
  return {
    rows,
    sent,
    store: {
      async findByKey(key: string) {
        return rows.get(key) || null;
      },
      async save(doc: { idempotencyKey: string; status: OwnerRentNoticeStatus; failureReason?: string }) {
        rows.set(doc.idempotencyKey, { status: doc.status, failureReason: doc.failureReason });
      },
      async send(message: { to: string; subject: string; text: string }) {
        sent.push(message.subject);
      },
    },
  };
}

async function main() {
  const results: Record<string, string> = {};

  const standard = fromPipeline({ rent: 1000, levy: 50 });
  assert.strictEqual(standard.snapshot.paymentAllocation.grossAmount, 1050);
  assert.strictEqual(standard.snapshot.paymentAllocation.ownerPayable, 826.75);
  assert.strictEqual(standard.snapshot.commissionNet, 150);
  assert.strictEqual(standard.snapshot.vatAmount, 23.25);
  assert.strictEqual(standard.snapshot.levy, 50);
  const standardResolved = resolveOwnerRentNoticeFigures(standard.payment);
  if (!standardResolved.ok) throw new Error(standardResolved.reason);
  assert.strictEqual(standardResolved.figures.totalPaid, 1050);
  assert.strictEqual(standardResolved.figures.totalPaid, standard.snapshot.paymentAllocation.grossAmount);
  assert.notStrictEqual(standardResolved.figures.totalPaid, roundMoney(1050 + 50));
  assert.strictEqual(
    standardResolved.figures.netOwnerAmount,
    roundMoney(standardResolved.figures.totalPaid - standardResolved.figures.commission - standardResolved.figures.vatOnCommission - standardResolved.figures.levy)
  );
  const standardEmail = compose(standard.payment);
  assert.strictEqual(standardEmail.subject, `Rental Payment Received — ${ADDRESS} — November 2026`);
  for (const part of [standardEmail.text, standardEmail.html]) {
    assert.ok(part.includes(ADDRESS));
    assert.ok(part.includes('November 2026'));
    assert.ok(part.includes('Total Amount Paid (including levy, where applicable)'));
    assert.ok(part.includes('USD 1,050.00'));
    assert.ok(part.includes('Less: Commission'));
    assert.ok(part.includes('USD 150.00'));
    assert.ok(part.includes('Less: VAT on Commission'));
    assert.ok(part.includes('USD 23.25'));
    assert.ok(part.includes('Less: Levy'));
    assert.ok(part.includes('USD 50.00'));
    assert.ok(part.includes('Net Amount Payable to Owner'));
    assert.ok(part.includes('USD 826.75'));
    assert.strictEqual(part.split('USD 50.00').length - 1, 1);
    assert.strictEqual(part.split('USD 1,050.00').length - 1, 1);
    assert.ok(!part.includes('USD 1,000.00'));
    assert.ok(!part.includes('Levy collected with this payment'));
    assert.ok(!part.includes('Amount received'));
    assert.ok(part.includes(COLLECTION));
    assert.ok(part.includes('The Benjamins Realty'));
    assert.ok(!part.includes('776.75'));
  }
  assert.ok(standardEmail.text.includes('Total Amount Paid (including levy, where applicable): USD 1,050.00'));
  assert.ok(standardEmail.text.includes('Less: Levy: USD 50.00'));
  assert.ok(standardEmail.text.includes('Net Amount Payable to Owner: USD 826.75'));
  assert.ok(standardEmail.html.includes('font-weight:700'));
  assert.ok(!standardEmail.html.includes('October'));
  assert.ok(!standardEmail.text.includes('October'));
  const zwl = compose(fromPipeline({
    rent: 1000,
    levy: 50,
    payment: { currency: 'ZWL' },
  }).payment);
  assert.ok(zwl.text.includes('ZWL 826.75'));
  assert.ok(!zwl.text.includes('USD'));
  results['1 Standard rental payment uses the stored owner payable'] = 'PASS';

  const advance = compose(rentalPayment({
    ...fromPipeline({ rent: 1000, levy: 0 }).payment,
    rentalPeriodMonth: 11,
    rentalPeriodYear: 2026,
    advanceMonthsPaid: 3,
    advancePeriodStart: { month: 11, year: 2026 },
    advancePeriodEnd: { month: 1, year: 2027 },
    paymentDate: new Date('2026-10-19'),
  } as OwnerRentPaymentSnapshot));
  assert.ok(advance.subject.includes('November 2026–January 2027'));
  assert.ok(!advance.text.includes('October'));
  assert.ok(!advance.subject.includes('October'));
  results['2 Rent paid in advance uses the stored rental period'] = 'PASS';

  const combined = fromPipeline({
    rent: 1000,
    levy: 0,
    payment: { amount: 1500, depositAmount: 500 },
  });
  assert.strictEqual(combined.snapshot.paymentAllocation.rent, 1000);
  assert.strictEqual(combined.snapshot.paymentAllocation.grossAmount, 1000);
  const combinedResolved = resolveOwnerRentNoticeFigures(combined.payment);
  if (!combinedResolved.ok) throw new Error(combinedResolved.reason);
  assert.strictEqual(combinedResolved.figures.rentAmount, 1000);
  assert.strictEqual(combinedResolved.figures.totalPaid, 1000);
  const combinedEmail = compose(combined.payment);
  assert.ok(combinedEmail.text.includes('Total Amount Paid (including levy, where applicable): USD 1,000.00'));
  assert.ok(!combinedEmail.text.includes('1,500.00'));
  assert.ok(!combinedEmail.html.includes('1,500.00'));
  results['3 Combined rent and deposit uses the rent allocation'] = 'PASS';

  const vatOff = fromPipeline({ rent: 1000, levy: 0, vatOn: false });
  assert.strictEqual(vatOff.snapshot.vatAmount, 0);
  const vatOffEmail = compose(vatOff.payment);
  assert.ok(vatOffEmail.text.includes('Less: VAT on Commission: USD 0.00'));
  assert.ok(!vatOffEmail.text.includes('23.25'));
  assert.ok(!vatOffEmail.text.includes('15.5'));
  assert.strictEqual(
    (resolveOwnerRentNoticeFigures(vatOff.payment) as { ok: true; figures: { vatOnCommission: number; netOwnerAmount: number } }).figures.vatOnCommission,
    0
  );
  results['4 VAT disabled stays at the stored zero'] = 'PASS';

  const noLevy = fromPipeline({ rent: 1000, levy: 0 });
  const noLevyEmail = compose(noLevy.payment);
  assert.ok(noLevyEmail.text.includes('Total Amount Paid (including levy, where applicable): USD 1,000.00'));
  assert.ok(noLevyEmail.text.includes('Less: Levy: USD 0.00'));
  assert.ok(!noLevyEmail.text.includes('Levy collected with this payment'));
  assert.ok(!noLevyEmail.text.includes('Amount received'));
  const noLevyResolved = resolveOwnerRentNoticeFigures(noLevy.payment);
  if (!noLevyResolved.ok) throw new Error(noLevyResolved.reason);
  assert.strictEqual(noLevyResolved.figures.levy, 0);
  assert.strictEqual(noLevyResolved.figures.totalPaid, 1000);
  assert.strictEqual(
    noLevyResolved.figures.netOwnerAmount,
    roundMoney(noLevyResolved.figures.totalPaid - noLevy.snapshot.commissionNet - noLevy.snapshot.vatAmount)
  );
  results['5 No levy displays zero'] = 'PASS';

  const inclusive = fromPipeline({ rent: 1000, levy: 0, treatment: 'inclusive' });
  const inclusiveFigures = resolveOwnerRentNoticeFigures(inclusive.payment);
  if (!inclusiveFigures.ok) throw new Error(inclusiveFigures.reason);
  assert.strictEqual(inclusiveFigures.figures.commission, inclusive.snapshot.commissionNet);
  assert.strictEqual(inclusiveFigures.figures.vatOnCommission, inclusive.snapshot.vatAmount);
  assert.strictEqual(inclusiveFigures.figures.netOwnerAmount, inclusive.snapshot.paymentAllocation.ownerPayable);
  assert.strictEqual(
    inclusiveFigures.figures.netOwnerAmount,
    roundMoney(inclusive.result.grossRent - inclusive.result.commissionGross)
  );
  assert.notStrictEqual(
    inclusiveFigures.figures.netOwnerAmount,
    roundMoney(inclusive.result.grossRent - inclusive.result.commissionGross - inclusive.result.vatAmount)
  );
  assert.strictEqual(inclusiveFigures.figures.totalPaid, inclusive.snapshot.paymentAllocation.grossAmount);
  assert.strictEqual(
    inclusiveFigures.figures.netOwnerAmount,
    roundMoney(inclusiveFigures.figures.totalPaid - inclusiveFigures.figures.commission - inclusiveFigures.figures.vatOnCommission - inclusiveFigures.figures.levy)
  );
  const inclusiveEmail = buildOwnerRentPaymentEmail({
    ownerName: 'Amina Dube',
    propertyAddress: ADDRESS,
    figures: inclusiveFigures.figures,
  });
  assert.ok(inclusiveEmail.text.includes(`Less: Commission: USD ${inclusive.snapshot.commissionNet.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`));
  assert.ok(!inclusiveEmail.text.includes(String(inclusive.result.ownerAmount + inclusive.result.vatAmount)));
  results['6 VAT-inclusive commission is not deducted twice'] = 'PASS';

  const duplicateEmail = compose(standard.payment);
  const duplicate = memoryStore();
  const duplicateKey = ownerRentIdempotencyKey('pay-standard');
  const first = await deliverOwnerRentNotice({
    idempotencyKey: duplicateKey,
    ownerEmail: 'owner@example.com',
    rentPaymentEmails: true,
    accountingComplete: true,
    email: duplicateEmail,
  }, duplicate.store);
  const second = await deliverOwnerRentNotice({
    idempotencyKey: duplicateKey,
    ownerEmail: 'owner@example.com',
    rentPaymentEmails: true,
    accountingComplete: true,
    email: duplicateEmail,
  }, duplicate.store);
  assert.strictEqual(first, 'SENT');
  assert.strictEqual(second, 'SENT');
  assert.strictEqual(duplicate.sent.length, 1);
  results['7 Duplicate completion sends one email'] = 'PASS';

  const failed = resolveOwnerRentNoticeFigures(rentalPayment({
    ...standard.payment,
    status: 'failed',
  }));
  assert.strictEqual(failed.ok, false);
  if (failed.ok) throw new Error('failed payment was accepted');
  assert.strictEqual(failed.reason, 'payment_not_completed');
  const pending = resolveOwnerRentNoticeFigures({ ...standard.payment, status: 'pending' });
  assert.strictEqual(pending.ok, false);
  const missingPeriod = resolveOwnerRentNoticeFigures({
    ...standard.payment,
    rentalPeriodMonth: undefined,
    rentalPeriodYear: undefined,
  });
  assert.strictEqual(missingPeriod.ok, false);
  if (missingPeriod.ok) throw new Error('missing period was accepted');
  assert.strictEqual(missingPeriod.reason, 'rental_period_missing');
  const brokenAllocation = resolveOwnerRentNoticeFigures({
    ...standard.payment,
    commissionDetails: {
      ...standard.payment.commissionDetails,
      paymentAllocation: {
        ...standard.payment.commissionDetails?.paymentAllocation,
        ownerPayable: 1,
      },
    },
  });
  assert.strictEqual(brokenAllocation.ok, false);
  if (brokenAllocation.ok) throw new Error('broken allocation was accepted');
  assert.strictEqual(brokenAllocation.reason, 'allocation_does_not_reconcile');
  const levyAddedTwice = resolveOwnerRentNoticeFigures({
    ...standard.payment,
    commissionDetails: {
      ...standard.payment.commissionDetails,
      paymentAllocation: {
        ...standard.payment.commissionDetails?.paymentAllocation,
        grossAmount: 1100,
      },
    },
  });
  assert.strictEqual(levyAddedTwice.ok, false);
  if (levyAddedTwice.ok) throw new Error('double-counted levy was accepted');
  assert.strictEqual(levyAddedTwice.reason, 'allocation_does_not_reconcile');
  const missingTotal = resolveOwnerRentNoticeFigures({
    ...standard.payment,
    commissionDetails: {
      ...standard.payment.commissionDetails,
      paymentAllocation: {
        ...standard.payment.commissionDetails?.paymentAllocation,
        grossAmount: undefined,
      },
    },
  });
  assert.strictEqual(missingTotal.ok, false);
  if (missingTotal.ok) throw new Error('missing total was accepted');
  assert.strictEqual(missingTotal.reason, 'allocation_incomplete');
  let incompleteSends = 0;
  const notReady = await deliverOwnerRentNotice({
    idempotencyKey: ownerRentIdempotencyKey('incomplete'),
    ownerEmail: 'owner@example.com',
    rentPaymentEmails: true,
    accountingComplete: false,
    email: duplicateEmail,
  }, {
    async findByKey() { return null; },
    async save() { throw new Error('must not save'); },
    async send() { incompleteSends += 1; },
  });
  assert.strictEqual(notReady, 'NOT_READY');
  assert.strictEqual(incompleteSends, 0);
  assert.strictEqual(composeOwnerRentNotice({
    payment: { ...standard.payment, status: 'failed' },
    ownerName: 'Amina Dube',
    propertyAddress: ADDRESS,
  }).ok, false);
  results['8 Failed or incomplete payments are not confirmed'] = 'PASS';

  const missingContact = memoryStore();
  const missingStatus = await deliverOwnerRentNotice({
    idempotencyKey: ownerRentIdempotencyKey('no-email'),
    ownerEmail: '   ',
    rentPaymentEmails: true,
    accountingComplete: true,
    email: duplicateEmail,
  }, missingContact.store);
  assert.strictEqual(missingStatus, 'FAILED');
  assert.strictEqual(missingContact.rows.get(ownerRentIdempotencyKey('no-email'))?.failureReason, 'Owner email missing');
  assert.strictEqual(missingContact.sent.length, 0);
  results['9 Missing owner email is recorded and not sent'] = 'PASS';

  assert.strictEqual(ownerRentNoticeScope({
    paymentCompanyId: 'company-a',
    propertyCompanyId: 'company-a',
    ownerCompanyId: 'company-a',
  }), true);
  assert.strictEqual(ownerRentNoticeScope({
    paymentCompanyId: 'company-a',
    propertyCompanyId: 'company-b',
    ownerCompanyId: 'company-a',
  }), false);
  assert.strictEqual(ownerRentNoticeScope({
    paymentCompanyId: 'company-a',
    propertyCompanyId: 'company-a',
    ownerCompanyId: 'company-b',
  }), false);
  const companyA = compose(standard.payment, 'Amina Dube', '1 Company A Close, Harare');
  const companyB = compose(fromPipeline({ rent: 800, levy: 0, rate: 10 }).payment, 'Tendai Moyo', '9 Company B Way, Bulawayo');
  assert.ok(companyA.text.includes('1 Company A Close, Harare'));
  assert.ok(!companyA.text.includes('9 Company B Way, Bulawayo'));
  assert.ok(!companyA.text.includes('Tendai Moyo'));
  assert.ok(companyB.text.includes('9 Company B Way, Bulawayo'));
  assert.ok(!companyB.text.includes('1 Company A Close, Harare'));
  assert.ok(!companyB.text.includes('USD 1,000.00'));
  results['10 Companies do not share payment figures'] = 'PASS';

  const propertyId = 'property-1';
  const selectedOwner = selectPropertyOwnerForRentNotice({
    companyId: 'company-a',
    propertyId,
    owners: [
      { id: 'agent-user', companyId: 'company-a', propertyIds: [], active: true },
      { id: 'owner-a', companyId: 'company-a', propertyIds: [propertyId, 'property-2'], active: true },
      { id: 'owner-b', companyId: 'company-b', propertyIds: [propertyId], active: true },
      { id: 'inactive-owner', companyId: 'company-a', propertyIds: [propertyId], active: false },
    ],
  });
  assert.strictEqual(selectedOwner?.id, 'owner-a');
  assert.strictEqual(selectPropertyOwnerForRentNotice({
    companyId: 'company-a',
    propertyId,
    owners: [
      { id: 'owner-a', companyId: 'company-a', propertyIds: [propertyId] },
      { id: 'owner-c', companyId: 'company-a', propertyIds: [propertyId] },
    ],
  }), null);
  const noticeService = src('services/ownerRentNotificationService.ts');
  assert.ok(noticeService.includes('properties: payment.propertyId'));
  assert.ok(!noticeService.includes('property?.ownerId'));
  results['13 Owner email comes from the property owner property list'] = 'PASS';

  const untouched = fromPipeline({ rent: 1000, levy: 50 }).payment;
  const before = JSON.stringify(untouched);
  let providerAttempts = 0;
  let providerDelivered = 0;
  const providerRows = new Map<string, { status: OwnerRentNoticeStatus; failureReason?: string }>();
  const providerStore = {
    async findByKey(key: string) { return providerRows.get(key) || null; },
    async save(doc: { idempotencyKey: string; status: OwnerRentNoticeStatus; failureReason?: string }) {
      providerRows.set(doc.idempotencyKey, { status: doc.status, failureReason: doc.failureReason });
    },
    async send() {
      providerAttempts += 1;
      if (providerAttempts === 1) throw new Error('smtp down');
      providerDelivered += 1;
    },
  };
  const providerKey = ownerRentIdempotencyKey('provider');
  const providerEmail = compose(untouched);
  const failedDelivery = await deliverOwnerRentNotice({
    idempotencyKey: providerKey,
    ownerEmail: 'owner@example.com',
    rentPaymentEmails: true,
    accountingComplete: true,
    email: providerEmail,
  }, providerStore);
  assert.strictEqual(failedDelivery, 'FAILED');
  assert.strictEqual(JSON.stringify(untouched), before);
  assert.strictEqual(providerRows.get(providerKey)?.status, 'FAILED');
  const retried = await deliverOwnerRentNotice({
    idempotencyKey: providerKey,
    ownerEmail: 'owner@example.com',
    rentPaymentEmails: true,
    accountingComplete: true,
    email: providerEmail,
  }, providerStore);
  assert.strictEqual(retried, 'SENT');
  assert.strictEqual(providerDelivered, 1);
  assert.strictEqual(JSON.stringify(untouched), before);
  results['11 Provider failure keeps the payment intact and can be retried'] = 'PASS';

  const legacy = buildOwnerRentEmail({
    ownerName: 'Owner A',
    propertyName: 'Borrowdale Example',
    amount: 1000,
    currency: 'USD',
    paymentDate: new Date('2026-10-01'),
    agencyName: 'The Benjamins Realty',
  });
  assert.ok(legacy.text.includes('USD 1000.00'));
  assert.ok(legacy.text.includes('Borrowdale Example'));
  const agent = src('services/agentPaymentNotificationService.ts');
  const inApp = src('models/Notification.ts');
  const workflow = src('agency/workflowNotify.ts');
  const ownerService = src('services/ownerRentNotificationService.ts');
  assert.ok(agent.includes('export async function sendAgentPaymentNotificationEmail'));
  assert.ok(agent.includes('sendMail'));
  assert.ok(!agent.includes('ownerRentNotificationPolicy'));
  assert.ok(inApp.includes('sendMail'));
  assert.ok(!inApp.includes('ownerRentNotificationPolicy'));
  assert.ok(!workflow.includes('ownerRentNotificationPolicy'));
  assert.ok(!ownerService.includes('postPaymentAccounting'));
  assert.ok(!ownerService.includes('payment.save'));
  assert.ok(!ownerService.includes('Payment.update'));
  assert.ok(ownerService.includes('composeOwnerRentNotice'));
  const hostile = compose(standard.payment, 'Amina <script>alert(1)</script>', '12 <img src=x onerror=alert(1)> Road');
  assert.ok(!hostile.html.includes('<script>'));
  assert.ok(hostile.html.includes('&lt;script&gt;'));
  assert.ok(!hostile.html.includes('<img'));
  assert.ok(!hostile.text.includes('pay-standard'));
  results['12 Other notifications stay on their existing mail path'] = 'PASS';

  const id = () => new mongoose.Types.ObjectId();
  function persistedAllocation(input: {
    rent: number;
    levy?: number;
    vatOn?: boolean;
    treatment?: 'inclusive' | 'exclusive';
    rate?: number;
  }) {
    const built = fromPipeline(input);
    const doc = new Payment({
      paymentType: 'rental',
      propertyType: 'residential',
      propertyId: id(),
      tenantId: id(),
      agentId: id(),
      companyId: id(),
      paymentDate: new Date('2027-04-01'),
      paymentMethod: 'cash',
      amount: input.rent + (input.levy || 0),
      rentalPeriodMonth: 4,
      rentalPeriodYear: 2027,
      processedBy: id(),
      commissionDetails: built.snapshot,
      status: 'completed',
      currency: 'USD',
    });
    const stored = doc.get('commissionDetails.paymentAllocation');
    return { built, stored };
  }

  function assertWaterfall(stored: any, levy: number, vatExpected: 'zero' | 'positive') {
    assert.ok(stored, 'paymentAllocation was stripped on cast');
    assert.strictEqual(stored.grossAmount, roundMoney(stored.rent + stored.levy));
    assert.strictEqual(stored.levy, levy);
    assert.strictEqual(stored.source, 'canonical_payment_allocation');
    if (vatExpected === 'zero') assert.strictEqual(stored.vatOnCommission, 0);
    else assert.ok(stored.vatOnCommission > 0);
    assert.strictEqual(
      stored.ownerPayable,
      roundMoney(stored.grossAmount - stored.commissionNet - stored.vatOnCommission - stored.levy)
    );
  }

  const vatOnLevyOff = persistedAllocation({ rent: 1900, levy: 0, vatOn: true, treatment: 'exclusive', rate: 10 });
  assertWaterfall(vatOnLevyOff.stored, 0, 'positive');
  results['14 VAT on and levy off persists allocation'] = 'PASS';

  const vatOffLevyOn = persistedAllocation({ rent: 1800, levy: 100, vatOn: false, rate: 10 });
  assertWaterfall(vatOffLevyOn.stored, 100, 'zero');
  assert.strictEqual(vatOffLevyOn.stored.vatOnCommission, 0);
  results['15 VAT off and levy on persists allocation'] = 'PASS';

  const bothOn = persistedAllocation({ rent: 1800, levy: 100, vatOn: true, treatment: 'exclusive', rate: 10 });
  assertWaterfall(bothOn.stored, 100, 'positive');
  results['16 VAT on and levy on persists allocation'] = 'PASS';

  const bothOff = persistedAllocation({ rent: 1900, levy: 0, vatOn: false, rate: 10 });
  assertWaterfall(bothOff.stored, 0, 'zero');
  results['17 VAT off and levy off persists allocation'] = 'PASS';

  const inclusiveStored = persistedAllocation({ rent: 1000, levy: 50, vatOn: true, treatment: 'inclusive', rate: 15 });
  assertWaterfall(inclusiveStored.stored, 50, 'positive');
  assert.strictEqual(
    roundMoney(inclusiveStored.stored.commissionNet + inclusiveStored.stored.vatOnCommission),
    inclusiveStored.built.result.commissionGross
  );
  results['18 Inclusive VAT is deducted once'] = 'PASS';

  const exclusiveStored = persistedAllocation({ rent: 1000, levy: 50, vatOn: true, treatment: 'exclusive', rate: 15 });
  assertWaterfall(exclusiveStored.stored, 50, 'positive');
  assert.ok(exclusiveStored.stored.vatOnCommission > 0);
  results['19 Exclusive VAT is stored on the allocation'] = 'PASS';

  const bare = new Payment({
    paymentType: 'rental',
    propertyType: 'residential',
    propertyId: id(),
    tenantId: id(),
    agentId: id(),
    companyId: id(),
    paymentDate: new Date('2027-03-01'),
    paymentMethod: 'cash',
    amount: 1900,
    rentalPeriodMonth: 3,
    rentalPeriodYear: 2027,
    processedBy: id(),
    commissionDetails: {
      totalCommission: 190,
      preaFee: 0,
      agentShare: 0,
      agencyShare: 190,
      ownerAmount: 1710,
    },
    status: 'completed',
    accountingComplete: true,
    currency: 'USD',
  });
  assert.strictEqual(bare.get('commissionDetails.paymentAllocation'), undefined);
  assert.strictEqual(bare.get('commissionDetails.paymentAllocation.grossAmount'), undefined);
  const missingAllocation = resolveOwnerRentNoticeFigures({
    status: 'completed',
    paymentType: 'rental',
    currency: 'USD',
    amount: 1900,
    rentalPeriodMonth: 3,
    rentalPeriodYear: 2027,
    commissionDetails: {
      totalCommission: 190,
      ownerAmount: 1710,
      commissionNet: 190,
      vatOnCommission: 0,
      levy: 0,
    },
  });
  assert.strictEqual(missingAllocation.ok, false);
  if (missingAllocation.ok) throw new Error('missing allocation must refuse');
  assert.strictEqual(missingAllocation.reason, 'allocation_incomplete');
  results['20 Missing allocation is not invented'] = 'PASS';

  const noGross = fromPipeline({ rent: 1900, levy: 0, vatOn: false });
  delete (noGross.snapshot as { paymentAllocation?: { grossAmount?: number } }).paymentAllocation?.grossAmount;
  const missingGross = resolveOwnerRentNoticeFigures(noGross.payment);
  assert.strictEqual(missingGross.ok, false);
  if (missingGross.ok) throw new Error('missing gross must refuse');
  assert.strictEqual(missingGross.reason, 'allocation_incomplete');
  results['21 Missing grossAmount is not treated as zero'] = 'PASS';

  const badOwner = fromPipeline({ rent: 1900, levy: 0, vatOn: false });
  badOwner.snapshot.paymentAllocation.ownerPayable = 1;
  const badPayable = resolveOwnerRentNoticeFigures(badOwner.payment);
  assert.strictEqual(badPayable.ok, false);
  if (badPayable.ok) throw new Error('bad owner payable must refuse');
  assert.strictEqual(badPayable.reason, 'allocation_does_not_reconcile');
  results['22 Incorrect ownerPayable is refused'] = 'PASS';

  const postedWithoutAllocation = resolveOwnerRentNoticeFigures({
    status: 'completed',
    paymentType: 'rental',
    currency: 'USD',
    amount: 1900,
    rentalPeriodMonth: 4,
    rentalPeriodYear: 2027,
    commissionDetails: {
      totalCommission: 190,
      ownerAmount: 1710,
      commissionNet: 190,
      vatAmount: 0,
      levy: 100,
    },
  });
  assert.strictEqual(postedWithoutAllocation.ok, false);
  results['23 Accounting complete without allocation does not send'] = 'PASS';

  const agentCreate = src('controllers/agentController.ts');
  const createBody = agentCreate.slice(
    agentCreate.indexOf('export const createAgentPayment'),
    agentCreate.indexOf('export const updateAgentPayment')
  );
  const allocationAt = createBody.indexOf('applyLevyPassThroughToSnapshot');
  const saveAt = createBody.indexOf('await payment.save()');
  const postAt = createBody.indexOf('ensurePaymentAccountingPosted');
  const notifyAt = createBody.indexOf('notifyOwnerOfRentPayment');
  assert.ok(allocationAt > 0 && allocationAt < saveAt);
  assert.ok(saveAt < postAt);
  assert.ok(postAt < notifyAt);
  assert.ok(createBody.includes('postResult.accountingComplete === true'));
  assert.ok(src('models/Payment.ts').includes('paymentAllocation:'));
  assert.ok(!src('services/ownerRentNotificationService.ts').includes('allocateRentalReceipt'));
  assert.ok(!src('services/ownerRentNotificationPolicy.ts').includes('allocateRentalReceipt'));
  results['24 Allocation is stored before accounting and mail'] = 'PASS';

  console.log(JSON.stringify(results, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
