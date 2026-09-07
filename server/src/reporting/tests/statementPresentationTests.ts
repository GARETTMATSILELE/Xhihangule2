import assert from 'assert';
import { OwnerStatementBuilder } from '../builders';
import { CanonicalLedgerEntry, LedgerQuery } from '../ledger';
import { PaymentCommissionSnapshot, ReportingReadModels } from '../readModels';
import { cleanStatementDescription, formatRentPeriodDescription } from '../rentalPeriod';
import { resolveStatementRentAmount } from '../statementRent';

const companyId = 'company-1';
const propertyId = 'property-1';
const currency = 'USD';

const entry = (
  input: Partial<CanonicalLedgerEntry> & Pick<CanonicalLedgerEntry, 'entryId' | 'eventType' | 'debit' | 'credit' | 'effectiveDate'>
): CanonicalLedgerEntry => ({
  sourceSystem: input.sourceSystem || 'property_account',
  sourceModel: input.sourceModel || 'PropertyAccount.transactions',
  sourceId: input.entryId,
  companyId,
  propertyId,
  direction: input.debit > 0 ? 'debit' : 'credit',
  amount: input.debit > 0 ? input.debit : input.credit,
  currency,
  status: 'completed',
  ...input
});

const createReadModels = (
  ledgerEntries: CanonicalLedgerEntry[],
  snapshots: PaymentCommissionSnapshot[] = []
): ReportingReadModels => ({
  owner: {
    async getOwnerForProperty() {
      return { id: 'owner-1', displayName: 'Joseph Mapuvire' };
    }
  },
  property: {
    async getProperty() {
      return { id: propertyId, name: 'Make up By Gamu', address: 'Share 12, 27 Lanark Road, Avondale, Harare' };
    }
  },
  ledger: {
    async getLedgerEntries(_query: LedgerQuery) {
      return ledgerEntries.filter((item) => {
        if (_query.from && item.effectiveDate < _query.from) return false;
        if (_query.to && item.effectiveDate > _query.to) return false;
        return true;
      });
    }
  },
  payment: {
    async getPaymentTraceReferences() {
      return {};
    },
    async getPropertyCommissionSnapshots() {
      return snapshots;
    }
  },
  lease: {
    async getLeaseContext() {
      return { monthlyRent: 1100 };
    }
  },
  maintenance: {
    async getMaintenanceContext() {
      return { notes: [] };
    }
  },
  inspection: {
    async getInspectionContext() {
      return { notes: [] };
    }
  },
  trust: {
    async getTrustContext() {
      return undefined;
    }
  }
});

export async function runStatementPresentationTests(): Promise<void> {
  assert.strictEqual(formatRentPeriodDescription({ rentalPeriodMonth: 7, rentalPeriodYear: 2026 }), 'July 2026 Rent');
  assert.strictEqual(
    formatRentPeriodDescription({
      rentalPeriodMonth: 7,
      rentalPeriodYear: 2026,
      advanceMonthsPaid: 3,
      advancePeriodStart: { month: 7, year: 2026 },
      advancePeriodEnd: { month: 9, year: 2026 }
    }),
    'July–September 2026 Rent'
  );
  assert.strictEqual(
    formatRentPeriodDescription({ rentalPeriodMonth: 11, rentalPeriodYear: 2026, advanceMonthsPaid: 3 }),
    'November 2026–January 2027 Rent'
  );
  assert.strictEqual(formatRentPeriodDescription({}), undefined, 'Missing rental-period metadata must not be invented from a payment date.');
  assert.strictEqual(cleanStatementDescription('Rental income - REF-1765198259150-5'), 'Rental Income');

  assert.strictEqual(
    resolveStatementRentAmount({ rentUsed: 1100, advanceMonthsPaid: 1, rentAllocated: 1100, commissionBase: 1100 }),
    1100,
    'Rent Amount must be the property rent, not cash received plus levy.'
  );
  assert.strictEqual(
    resolveStatementRentAmount({ rentUsed: 1100, advanceMonthsPaid: 3 }),
    3300,
    'Multi-month rent should use rentUsed x months paid.'
  );
  assert.strictEqual(
    resolveStatementRentAmount({ rentAllocated: 1100, commissionBase: 1000 }),
    1100,
    'rentAllocated is the stored rent portion and must be preferred over commissionBase.'
  );
  assert.strictEqual(
    resolveStatementRentAmount({ commissionBase: 1100 }),
    1100,
    'commissionBase alone is a stored rent snapshot when levy is absent; do not invent a levy.'
  );
  assert.strictEqual(
    resolveStatementRentAmount({ commissionBase: 1000, levy: 100 }),
    1100,
    'When only commissionBase is stored, restore the stored levy so Rent Amount is the rental charge, not commission + owner amount.'
  );
  assert.strictEqual(
    resolveStatementRentAmount({ amount: 2500 }),
    2500,
    'When rent snapshot fields are absent, use the stored rental payment amount rather than leaving Rent Amount blank.'
  );
  assert.strictEqual(
    resolveStatementRentAmount({ rentUsed: 1100, amount: 2500 }),
    1100,
    'Stored rentUsed must be preferred over payment.amount.'
  );
  assert.strictEqual(
    resolveStatementRentAmount({}),
    undefined,
    'Missing rent fields must not invent a Rent Amount.'
  );

  const snapshots: PaymentCommissionSnapshot[] = [
    {
      paymentId: 'pay-july',
      paymentDate: new Date('2026-08-02T00:00:00.000Z'),
      grossRent: 1100,
      levy: 100,
      commission: 100,
      vatOnCommission: 15.5,
      vatRate: 0.155,
      vatTreatment: 'exclusive',
      ownerPayable: 884.5,
      rentalPeriodMonth: 7,
      rentalPeriodYear: 2026
    },
    {
      paymentId: 'pay-multi',
      paymentDate: new Date('2026-09-02T00:00:00.000Z'),
      grossRent: 3300,
      levy: 300,
      commission: 300,
      vatOnCommission: 46.5,
      vatRate: 0.155,
      ownerPayable: 2653.5,
      advanceMonthsPaid: 3,
      advancePeriodStart: { month: 7, year: 2026 },
      advancePeriodEnd: { month: 9, year: 2026 }
    }
  ];

  const ledgerEntries: CanonicalLedgerEntry[] = [
    entry({
      entryId: 'opening-1',
      eventType: 'OPENING_BALANCE',
      debit: 0,
      credit: 425,
      effectiveDate: new Date('2026-06-30T00:00:00.000Z'),
      metadata: { description: 'Opening balance' }
    }),
    entry({
      entryId: 'rent-july',
      eventType: 'RENT',
      debit: 0,
      credit: 884.5,
      effectiveDate: new Date('2026-08-02T00:00:00.000Z'),
      metadata: { description: 'Rental income - REF-1765198259150-5', paymentId: 'pay-july' }
    }),
    entry({
      entryId: 'payout-1',
      eventType: 'OWNER_PAYOUT',
      sourceSystem: 'owner_payout',
      sourceModel: 'PropertyAccount.ownerPayouts',
      debit: 500,
      credit: 0,
      effectiveDate: new Date('2026-08-10T00:00:00.000Z'),
      metadata: { description: 'Owner payout - Joseph Mapuvire', referenceNumber: 'PAYOUT-1' }
    }),
    entry({
      entryId: 'rent-multi',
      eventType: 'income',
      debit: 0,
      credit: 2653.5,
      effectiveDate: new Date('2026-09-02T00:00:00.000Z'),
      metadata: { description: 'Rental income - REF-MULTI', paymentId: 'pay-multi' }
    }),
    entry({
      entryId: 'legacy-rent',
      eventType: 'income',
      debit: 0,
      credit: 990,
      effectiveDate: new Date('2026-09-15T00:00:00.000Z'),
      metadata: { description: 'Rental income - REF-LEGACY' }
    }),
    entry({
      entryId: 'pass-through-levy',
      eventType: 'PASS_THROUGH_LEVY_COLLECTION',
      sourceSystem: 'pass_through',
      debit: 0,
      credit: 100,
      effectiveDate: new Date('2026-08-02T00:00:00.000Z'),
      metadata: { description: 'Levy collected' }
    })
  ];

  const builder = new OwnerStatementBuilder(createReadModels(ledgerEntries, snapshots));
  const dto = await builder.build({
    companyId,
    propertyId,
    companyName: 'The Benjamins Realty',
    generatedBy: 'tester',
    period: {
      startDate: '2026-07-01',
      endDate: '2026-09-30',
      label: '2026-07-01 - 2026-09-30'
    }
  });

  assert.strictEqual(dto.statementSummary?.openingBalance.amount, 425, 'Opening balance should come from pre-period ledger net, not a frontend recalculation.');
  assert.ok(!dto.trustLedger.some((row) => row.rowType === 'Income' && /opening/i.test(row.description)), 'Opening balance must not appear as a table row.');
  assert.ok(!dto.trustLedger.some((row) => /PASS_THROUGH/i.test(row.id) || /levy collected/i.test(row.description)), 'Pass-through levy collections must not appear as separate statement rows.');

  const july = dto.trustLedger.find((row) => row.id.includes('rent-july'));
  assert.ok(july, 'July rental income row should be present.');
  assert.strictEqual(july?.rowType, 'Income');
  assert.strictEqual(july?.description, 'July 2026 Rent');
  assert.strictEqual(july?.rentAmount?.amount, 1100);
  assert.strictEqual(july?.commission?.amount, 100);
  assert.strictEqual(july?.vatOnCommission?.amount, 15.5);
  assert.strictEqual(july?.levies?.amount, 100);
  assert.strictEqual(july?.ownerAmount?.amount, 884.5);
  assert.strictEqual(july?.runningBalance.amount, 1309.5, 'First income running balance should start from the opening balance.');
  assert.ok(!/REF-1765198259150-5/.test(july?.description || ''), 'Payment reference must not be the primary description.');

  const payout = dto.trustLedger.find((row) => row.rowType === 'Payout');
  assert.ok(payout, 'Owner payouts should appear in the same chronological table.');
  assert.strictEqual(payout?.description, 'Owner payout - Joseph Mapuvire');
  assert.strictEqual(payout?.rentAmount, undefined);
  assert.strictEqual(payout?.ownerAmount?.amount, -500);
  assert.strictEqual(payout?.runningBalance.amount, 809.5);

  const multi = dto.trustLedger.find((row) => row.id.includes('rent-multi'));
  assert.strictEqual(multi?.description, 'July–September 2026 Rent');
  assert.strictEqual(multi?.rentAmount?.amount, 3300);
  assert.strictEqual(multi?.vatOnCommission?.amount, 46.5);

  const legacy = dto.trustLedger.find((row) => row.id.includes('legacy-rent'));
  assert.strictEqual(legacy?.description, 'Rental Income', 'Legacy rows without rental-period metadata should fall back to a clean description.');
  assert.strictEqual(legacy?.rentAmount, undefined, 'Legacy rows must not invent rent/commission/VAT/levy figures.');
  assert.strictEqual(legacy?.vatOnCommission, undefined);
  assert.strictEqual(legacy?.ownerAmount?.amount, 990);

  const balances = dto.trustLedger.map((row) => row.runningBalance.amount);
  const summedBalances = balances.reduce((sum, value) => sum + value, 0);
  assert.notStrictEqual(dto.statementSummary?.closingBalance.amount, summedBalances, 'Closing balance must be the final running balance, never the sum of the balance column.');
  assert.strictEqual(dto.statementSummary?.closingBalance.amount, dto.trustLedger[dto.trustLedger.length - 1].runningBalance.amount);
  assert.strictEqual(dto.statementSummary?.totalRent.amount, 4400);
  assert.strictEqual(dto.statementSummary?.totalCommission.amount, 400);
  assert.strictEqual(dto.statementSummary?.totalVat.amount, 62);
  assert.strictEqual(dto.statementSummary?.totalLevies.amount, 400);
  assert.strictEqual(dto.statementSummary?.totalPayouts.amount, 500);
  assert.ok(!dto.statementNumber.includes(propertyId), 'Statement identifier should not expose internal database IDs.');

  const vatOffSnapshots: PaymentCommissionSnapshot[] = [{
    paymentId: 'pay-vat-off',
    paymentDate: new Date('2026-08-02T00:00:00.000Z'),
    grossRent: 1100,
    levy: 0,
    commission: 110,
    vatOnCommission: 0,
    ownerPayable: 990,
    rentalPeriodMonth: 7,
    rentalPeriodYear: 2026
  }];
  const vatOffDto = await new OwnerStatementBuilder(createReadModels([
    entry({
      entryId: 'rent-vat-off',
      eventType: 'income',
      debit: 0,
      credit: 990,
      effectiveDate: new Date('2026-08-02T00:00:00.000Z'),
      metadata: { description: 'Rental income', paymentId: 'pay-vat-off' }
    })
  ], vatOffSnapshots)).build({
    companyId,
    propertyId,
    companyName: 'The Benjamins Realty',
    period: { startDate: '2026-08-01', endDate: '2026-08-31', label: '2026-08' }
  });
  assert.strictEqual(vatOffDto.trustLedger[0].commission?.amount, 110);
  assert.strictEqual(vatOffDto.trustLedger[0].vatOnCommission?.amount, 0);
  assert.strictEqual(vatOffDto.trustLedger[0].ownerAmount?.amount, 990);

  const inclusiveSnapshots: PaymentCommissionSnapshot[] = [{
    paymentId: 'pay-inclusive',
    paymentDate: new Date('2026-08-02T00:00:00.000Z'),
    grossRent: 1100,
    levy: 100,
    commission: 86.58,
    vatOnCommission: 13.42,
    vatRate: 0.155,
    vatTreatment: 'inclusive',
    ownerPayable: 900,
    rentalPeriodMonth: 8,
    rentalPeriodYear: 2026
  }];
  const inclusiveDto = await new OwnerStatementBuilder(createReadModels([
    entry({
      entryId: 'rent-inclusive',
      eventType: 'income',
      debit: 0,
      credit: 900,
      effectiveDate: new Date('2026-08-02T00:00:00.000Z'),
      metadata: { paymentId: 'pay-inclusive', description: 'Rental income' }
    })
  ], inclusiveSnapshots)).build({
    companyId,
    propertyId,
    companyName: 'The Benjamins Realty',
    period: { startDate: '2026-08-01', endDate: '2026-08-31', label: '2026-08' }
  });
  assert.strictEqual(inclusiveDto.trustLedger[0].commission?.amount, 86.58, 'Inclusive VAT commission must use the stored transaction amount.');
  assert.strictEqual(inclusiveDto.trustLedger[0].vatOnCommission?.amount, 13.42);
  assert.strictEqual(inclusiveDto.trustLedger[0].description, 'August 2026 Rent');

  const referenceJoinDto = await new OwnerStatementBuilder(createReadModels([
    entry({
      entryId: 'rent-by-ref',
      eventType: 'income',
      debit: 0,
      credit: 884.5,
      effectiveDate: new Date('2026-08-02T00:00:00.000Z'),
      metadata: { description: 'Rental income', referenceNumber: 'REF-JULY' }
    })
  ], [{
    paymentId: 'pay-by-ref',
    paymentDate: new Date('2026-08-02T00:00:00.000Z'),
    referenceNumber: 'REF-JULY',
    grossRent: 1100,
    levy: 100,
    commission: 100,
    vatOnCommission: 15.5,
    vatRate: 0.155,
    vatTreatment: 'exclusive',
    ownerPayable: 884.5,
    rentalPeriodMonth: 7,
    rentalPeriodYear: 2026
  }])).build({
    companyId,
    propertyId,
    companyName: 'The Benjamins Realty',
    period: { startDate: '2026-08-01', endDate: '2026-08-31', label: '2026-08' }
  });
  assert.strictEqual(referenceJoinDto.trustLedger[0].rentAmount?.amount, 1100, 'Rent Amount should still resolve when the ledger row is joined by payment reference.');
  assert.strictEqual(referenceJoinDto.trustLedger[0].description, 'July 2026 Rent');
  assert.strictEqual(referenceJoinDto.trustLedger[0].ownerAmount?.amount, 884.5);
  assert.ok(!('ownerShare' in (referenceJoinDto.trustLedger[0] as object)), 'Statement rows must not expose a second owner figure.');

  const expenseDto = await new OwnerStatementBuilder(createReadModels([
    entry({
      entryId: 'rent-before-expense',
      eventType: 'income',
      debit: 0,
      credit: 884.5,
      effectiveDate: new Date('2026-08-02T00:00:00.000Z'),
      metadata: { paymentId: 'pay-july', description: 'Rental income' }
    }),
    entry({
      entryId: 'expense-cleaning',
      eventType: 'EXPENSE',
      debit: 60,
      credit: 0,
      effectiveDate: new Date('2026-08-27T00:00:00.000Z'),
      metadata: { description: 'Cleaning' }
    })
  ], [snapshots[0]])).build({
    companyId,
    propertyId,
    companyName: 'The Benjamins Realty',
    period: { startDate: '2026-08-01', endDate: '2026-08-31', label: '2026-08' }
  });
  const expenseRow = expenseDto.trustLedger.find((row) => row.id.includes('expense-cleaning'));
  assert.strictEqual(expenseRow?.rowType, 'Expense');
  assert.strictEqual(expenseRow?.description, 'Cleaning');
  assert.strictEqual(expenseRow?.rentAmount, undefined);
  assert.strictEqual(expenseRow?.commission, undefined);
  assert.strictEqual(expenseRow?.ownerAmount?.amount, -60);
  assert.strictEqual(expenseRow?.runningBalance.amount, 824.5);

  const noLevyVatDto = await new OwnerStatementBuilder(createReadModels([
    entry({
      entryId: 'rent-no-levy-vat',
      eventType: 'income',
      debit: 0,
      credit: 884.5,
      effectiveDate: new Date('2026-08-02T00:00:00.000Z'),
      metadata: { paymentId: 'pay-no-levy-vat', description: 'Rental income' }
    })
  ], [{
    paymentId: 'pay-no-levy-vat',
    paymentDate: new Date('2026-08-02T00:00:00.000Z'),
    grossRent: 1000,
    levy: 0,
    commission: 100,
    vatOnCommission: 15.5,
    vatRate: 0.155,
    vatTreatment: 'exclusive',
    ownerPayable: 884.5,
    rentalPeriodMonth: 8,
    rentalPeriodYear: 2026
  }])).build({
    companyId,
    propertyId,
    companyName: 'The Benjamins Realty',
    period: { startDate: '2026-08-01', endDate: '2026-08-31', label: '2026-08' }
  });
  assert.strictEqual(noLevyVatDto.trustLedger[0].rentAmount?.amount, 1000);
  assert.strictEqual(noLevyVatDto.trustLedger[0].commission?.amount, 100);
  assert.strictEqual(noLevyVatDto.trustLedger[0].vatOnCommission?.amount, 15.5);
  assert.strictEqual(noLevyVatDto.trustLedger[0].levies?.amount, 0);
  assert.strictEqual(noLevyVatDto.trustLedger[0].ownerAmount?.amount, 884.5);

  const namedPayoutDto = await new OwnerStatementBuilder(createReadModels([
    entry({
      entryId: 'payout-named',
      eventType: 'OWNER_PAYOUT',
      sourceSystem: 'owner_payout',
      debit: 250,
      credit: 0,
      effectiveDate: new Date('2026-08-12T00:00:00.000Z'),
      metadata: { recipientName: 'John Doe' }
    })
  ])).build({
    companyId,
    propertyId,
    companyName: 'The Benjamins Realty',
    period: { startDate: '2026-08-01', endDate: '2026-08-31', label: '2026-08' }
  });
  assert.strictEqual(namedPayoutDto.trustLedger[0].rowType, 'Payout');
  assert.strictEqual(namedPayoutDto.trustLedger[0].description, 'Owner payout - John Doe');
  assert.strictEqual(namedPayoutDto.trustLedger[0].rentAmount, undefined);
  assert.strictEqual(namedPayoutDto.trustLedger[0].ownerAmount?.amount, -250);
}
