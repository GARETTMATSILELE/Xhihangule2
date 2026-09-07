import { LedgerRowDTO, OwnerStatementDTO, ReportPeriodDTO, StatementRowType } from '../dto';
import { CashFlowEngine, ChartEngine, money, PropertyKPIEngine, ReconciliationEngine, TimelineEngine, AuditTrailEngine } from '../engines';
import { CanonicalLedgerEntry, sortLedgerEntries, toSourceReference } from '../ledger';
import { PaymentCommissionSnapshot, ReportingReadModels } from '../readModels';
import { cleanStatementDescription, formatRentPeriodDescription } from '../rentalPeriod';

export interface OwnerStatementBuildInput {
  companyId: string;
  propertyId: string;
  period: ReportPeriodDTO;
  generatedBy?: string;
  companyName?: string;
  companyLogo?: string;
  correlationId?: string;
}

const DTO_VERSION = 'owner-statement.v1';
const LEDGER_ORIGIN = new Date('1900-01-01T00:00:00.000Z');

const parseDate = (value: string): Date => new Date(`${value}T00:00:00.000Z`);
const parseEndDate = (value: string): Date => new Date(`${value}T23:59:59.999Z`);

const isCompleted = (entry: CanonicalLedgerEntry): boolean =>
  String(entry.status || 'completed').toLowerCase() === 'completed';

const isPassThrough = (entry: CanonicalLedgerEntry): boolean => {
  const eventType = String(entry.eventType || '').toUpperCase();
  const treatment = String(entry.metadata?.accountingTreatment || '').toUpperCase();
  return entry.sourceSystem === 'pass_through' || eventType.startsWith('PASS_THROUGH') || treatment === 'PASS_THROUGH';
};

const isOpeningBalance = (entry: CanonicalLedgerEntry): boolean =>
  String(entry.eventType || '').toUpperCase() === 'OPENING_BALANCE';

const isOwnerPayout = (entry: CanonicalLedgerEntry): boolean =>
  String(entry.eventType || '').toUpperCase() === 'OWNER_PAYOUT';

const toRowType = (entry: CanonicalLedgerEntry): StatementRowType => {
  if (isOwnerPayout(entry)) return 'Payout';
  if (entry.credit > 0) return 'Income';
  if (entry.debit > 0) return 'Expense';
  return 'Other';
};

const paymentIdOf = (entry: CanonicalLedgerEntry): string | undefined => {
  const value = entry.metadata?.paymentId;
  return value ? String(value) : undefined;
};

const skipDuplicateTransactionPayout = (
  entry: CanonicalLedgerEntry,
  payoutRefs: Set<string>
): boolean => {
  if (entry.sourceSystem !== 'property_account' || !isOwnerPayout(entry)) return false;
  const ref = String(entry.metadata?.referenceNumber || entry.sourceId || '');
  return Boolean(ref) && payoutRefs.has(ref);
};

const describeRow = (
  entry: CanonicalLedgerEntry,
  rowType: StatementRowType,
  snapshot?: PaymentCommissionSnapshot
): string => {
  if (rowType === 'Payout') {
    const recipient = String(entry.metadata?.recipientName || '').trim();
    const cleaned = cleanStatementDescription(String(entry.metadata?.description || ''), '');
    if (/^owner payout\s*[-–—]/i.test(cleaned)) return cleaned;
    if (recipient) return `Owner payout - ${recipient}`;
    return cleaned || 'Owner Payout';
  }
  if (rowType === 'Income') {
    const rentalPeriod = snapshot
      ? formatRentPeriodDescription({
          rentalPeriodMonth: snapshot.rentalPeriodMonth,
          rentalPeriodYear: snapshot.rentalPeriodYear,
          advanceMonthsPaid: snapshot.advanceMonthsPaid,
          advancePeriodStart: snapshot.advancePeriodStart,
          advancePeriodEnd: snapshot.advancePeriodEnd
        })
      : undefined;
    if (rentalPeriod) return rentalPeriod;
    return cleanStatementDescription(String(entry.metadata?.description || ''), 'Rental Income');
  }
  return cleanStatementDescription(
    String(entry.metadata?.description || entry.eventType || ''),
    rowType === 'Expense' ? 'Expense' : 'Transaction'
  );
};

export class OwnerStatementBuilder {
  constructor(
    private readonly readModels: ReportingReadModels,
    private readonly cashFlowEngine = new CashFlowEngine(),
    private readonly kpiEngine = new PropertyKPIEngine(),
    private readonly timelineEngine = new TimelineEngine(),
    private readonly chartEngine = new ChartEngine(),
    private readonly reconciliationEngine = new ReconciliationEngine(),
    private readonly auditTrailEngine = new AuditTrailEngine()
  ) {}

  async build(input: OwnerStatementBuildInput): Promise<OwnerStatementDTO> {
    const periodStart = parseDate(input.period.startDate);
    const periodEnd = parseEndDate(input.period.endDate);

    const [owner, property, entriesToDate, leaseContext, maintenanceContext, inspectionContext] = await Promise.all([
      this.readModels.owner.getOwnerForProperty(input.companyId, input.propertyId),
      this.readModels.property.getProperty(input.companyId, input.propertyId),
      this.readModels.ledger.getLedgerEntries({
        companyId: input.companyId,
        propertyId: input.propertyId,
        from: LEDGER_ORIGIN,
        to: periodEnd
      }),
      this.readModels.lease.getLeaseContext(input.companyId, input.propertyId),
      this.readModels.maintenance.getMaintenanceContext(input.companyId, input.propertyId),
      this.readModels.inspection.getInspectionContext(input.companyId, input.propertyId)
    ]);

    const currency = entriesToDate[0]?.currency || 'USD';
    const payoutRefs = new Set(
      entriesToDate
        .filter((entry) => entry.sourceSystem === 'owner_payout')
        .map((entry) => String(entry.metadata?.referenceNumber || entry.sourceId || ''))
        .filter(Boolean)
    );
    const qualifying = sortLedgerEntries(
      entriesToDate.filter((entry) =>
        isCompleted(entry) &&
        !isPassThrough(entry) &&
        !skipDuplicateTransactionPayout(entry, payoutRefs)
      )
    );
    const prePeriod = qualifying.filter((entry) => entry.effectiveDate < periodStart);
    const inPeriod = qualifying.filter((entry) => entry.effectiveDate >= periodStart && entry.effectiveDate <= periodEnd);
    const openingBalanceAmount = prePeriod.reduce((sum, entry) => sum + entry.credit - entry.debit, 0)
      + inPeriod.filter(isOpeningBalance).reduce((sum, entry) => sum + entry.credit - entry.debit, 0);
    const periodRows = inPeriod.filter((entry) => !isOpeningBalance(entry));

    const paymentIds = Array.from(new Set(periodRows.map(paymentIdOf).filter((id): id is string => Boolean(id))));
    const paymentSnapshots = this.readModels.payment.getPropertyCommissionSnapshots
      ? await this.readModels.payment.getPropertyCommissionSnapshots(
          input.companyId,
          input.propertyId,
          periodStart,
          periodEnd,
          paymentIds
        )
      : [];
    const snapshotByPaymentId = new Map(paymentSnapshots.map((row) => [row.paymentId, row]));
    const snapshotByReference = new Map(
      paymentSnapshots
        .filter((row) => row.referenceNumber)
        .map((row) => [String(row.referenceNumber), row])
    );
    const snapshotFor = (entry: CanonicalLedgerEntry) =>
      snapshotByPaymentId.get(paymentIdOf(entry) || '') ||
      snapshotByReference.get(String(entry.metadata?.referenceNumber || ''));

    const cashFlow = this.cashFlowEngine.build(periodRows, currency, openingBalanceAmount);
    const propertyKpis = this.kpiEngine.build(periodRows, currency);
    const timeline = this.timelineEngine.buildFinancialTimeline(periodRows, currency);
    const charts = [this.chartEngine.buildCashFlowChart(cashFlow)];
    const rentalEntries = periodRows.filter((entry) =>
      entry.eventType.toUpperCase() === 'RENT' || entry.eventType.toLowerCase() === 'income'
    );
    const ownerPaymentEntries = periodRows.filter(isOwnerPayout);
    const expenseEntries = periodRows.filter((entry) => entry.debit > 0 && !isOwnerPayout(entry));
    const otherIncomeEntries = periodRows.filter((entry) => entry.credit > 0 && !rentalEntries.includes(entry));

    let runningBalance = openingBalanceAmount;
    const trustLedger: LedgerRowDTO[] = periodRows.map((entry) => {
      runningBalance += entry.credit - entry.debit;
      const rowType = toRowType(entry);
      const snapshot = snapshotFor(entry);
      const ownerAmount = rowType === 'Income' || entry.credit > 0
        ? money(entry.credit, currency)
        : money(-entry.debit, currency);
      const rentAmount = rowType === 'Income' && snapshot && Number(snapshot.grossRent || 0) > 0
        ? money(snapshot.grossRent, currency)
        : undefined;
      return {
        id: entry.entryId,
        date: entry.effectiveDate.toISOString(),
        reference: String(entry.metadata?.referenceNumber || entry.sourceId || ''),
        description: describeRow(entry, rowType, snapshot),
        debit: money(entry.debit, currency),
        credit: money(entry.credit, currency),
        runningBalance: money(runningBalance, currency),
        status: entry.status,
        sourceReferences: [toSourceReference(entry)],
        rowType,
        rentAmount,
        commission: rowType === 'Income' && snapshot ? money(snapshot.commission, currency) : undefined,
        vatOnCommission: rowType === 'Income' && snapshot ? money(snapshot.vatOnCommission, currency) : undefined,
        levies: rowType === 'Income' && snapshot ? money(snapshot.levy, currency) : undefined,
        ownerAmount,
        vatRate: snapshot?.vatRate
      };
    });

    const ownerPayments = trustLedger.filter((row) =>
      ownerPaymentEntries.some((entry) => entry.entryId === row.id)
    );

    const incomeBreakdown = [
      {
        id: 'rental-income',
        label: 'Rental Income',
        amount: money(rentalEntries.reduce((sum, entry) => sum + entry.credit, 0), currency),
        direction: 'inflow' as const,
        sourceReferences: rentalEntries.map(toSourceReference)
      },
      {
        id: 'other-income',
        label: 'Other Income',
        amount: money(otherIncomeEntries.reduce((sum, entry) => sum + entry.credit, 0), currency),
        direction: 'inflow' as const,
        sourceReferences: otherIncomeEntries.map(toSourceReference)
      }
    ];

    const displayedSnapshots = Array.from(new Map(
      periodRows
        .map((entry) => snapshotFor(entry))
        .filter((row): row is PaymentCommissionSnapshot => Boolean(row))
        .map((row) => [row.paymentId, row])
    ).values());
    const settlementGrossRent = displayedSnapshots.reduce((sum, row) => sum + Number(row.grossRent || 0), 0);
    const settlementLevy = displayedSnapshots.reduce((sum, row) => sum + Number(row.levy || 0), 0);
    const settlementCommission = displayedSnapshots.reduce((sum, row) => sum + Number(row.commission || 0), 0);
    const settlementVat = displayedSnapshots.reduce((sum, row) => sum + Number(row.vatOnCommission || 0), 0);
    const settlementOwnerPayable = displayedSnapshots.reduce((sum, row) => sum + Number(row.ownerPayable || 0), 0);

    const expenseBreakdown = [
      {
        id: 'expenses',
        label: 'Expenses',
        amount: money(expenseEntries.reduce((sum, entry) => sum + entry.debit, 0), currency),
        direction: 'outflow' as const,
        sourceReferences: expenseEntries.map(toSourceReference)
      }
    ];
    if (settlementLevy > 0) {
      expenseBreakdown.push({
        id: 'levy',
        label: 'Levy',
        amount: money(settlementLevy, currency),
        direction: 'outflow' as const,
        sourceReferences: displayedSnapshots.map((row) => ({ sourceSystem: 'payment', sourceModel: 'Payment', sourceId: row.paymentId }))
      });
    }
    if (settlementCommission > 0) {
      expenseBreakdown.push({
        id: 'management-commission',
        label: 'Management Commission',
        amount: money(settlementCommission, currency),
        direction: 'outflow' as const,
        sourceReferences: displayedSnapshots.map((row) => ({ sourceSystem: 'payment', sourceModel: 'Payment', sourceId: row.paymentId }))
      });
    }
    if (settlementVat > 0) {
      expenseBreakdown.push({
        id: 'vat-on-commission',
        label: 'VAT on Commission',
        amount: money(settlementVat, currency),
        direction: 'outflow' as const,
        sourceReferences: displayedSnapshots.map((row) => ({ sourceSystem: 'payment', sourceModel: 'Payment', sourceId: row.paymentId }))
      });
    }

    const totalRentalIncome = rentalEntries.reduce((sum, entry) => sum + entry.credit, 0);
    const totalOtherIncome = otherIncomeEntries.reduce((sum, entry) => sum + entry.credit, 0);
    const totalDeductions = expenseEntries.reduce((sum, entry) => sum + entry.debit, 0);
    const ownerPaid = ownerPaymentEntries.reduce((sum, entry) => sum + entry.debit, 0);
    const netAvailable = totalRentalIncome + totalOtherIncome - totalDeductions;
    const closingBalance = cashFlow.closingBalance;

    const summaryCheck = this.reconciliationEngine.reconcileMoney(
      'owner-statement-closing-balance',
      'Closing balance equals opening plus funds received less deductions and owner payments',
      money(openingBalanceAmount + totalRentalIncome + totalOtherIncome - totalDeductions - ownerPaid, currency),
      closingBalance,
      periodRows
    );
    const runningBalanceCheck = this.reconciliationEngine.reconcileMoney(
      'owner-statement-running-balance',
      'Final ledger running balance equals closing balance held',
      closingBalance,
      trustLedger.length ? trustLedger[trustLedger.length - 1].runningBalance : money(openingBalanceAmount, currency),
      periodRows
    );
    const reconciliation = this.reconciliationEngine.summarize([summaryCheck, runningBalanceCheck]);
    const trustPosition = {
      openingBalance: cashFlow.openingBalance,
      moneyReceived: cashFlow.totalInflows,
      expenses: money(totalDeductions, currency),
      ownerPayments: money(ownerPaid, currency),
      closingBalanceHeld: closingBalance,
      reconciliation
    };
    const propertyPerformance = {
      occupancyRate: propertyKpis.occupancyRate,
      rentCollectionRate: propertyKpis.collectionRate,
      outstandingRent: propertyKpis.outstandingRent,
      openMaintenance: Number((maintenanceContext as Record<string, unknown> | undefined)?.open ?? propertyKpis.openMaintenanceCount),
      closedMaintenance: Number((maintenanceContext as Record<string, unknown> | undefined)?.closed ?? propertyKpis.closedMaintenanceCount),
      lastInspection: (inspectionContext as Record<string, unknown> | undefined)?.lastInspectionDate as string | undefined || propertyKpis.lastInspectionDate,
      nextInspection: (inspectionContext as Record<string, unknown> | undefined)?.nextInspectionDate as string | undefined || propertyKpis.nextInspectionDate
    };
    const tenantStatus = {
      tenant: (leaseContext as Record<string, unknown> | undefined)?.tenant as OwnerStatementDTO['tenantStatus']['tenant'],
      lease: (leaseContext as Record<string, unknown> | undefined)?.lease as OwnerStatementDTO['tenantStatus']['lease'],
      monthlyRent: (leaseContext as Record<string, unknown> | undefined)?.monthlyRent
        ? money(Number((leaseContext as Record<string, unknown>).monthlyRent), currency)
        : undefined,
      rentStatus: propertyKpis.outstandingRent.amount > 0 ? 'arrears' : 'current',
      arrears: propertyKpis.outstandingRent,
      deposit: (leaseContext as Record<string, unknown> | undefined)?.deposit
        ? money(Number((leaseContext as Record<string, unknown>).deposit), currency)
        : undefined,
      nextDueDate: (leaseContext as Record<string, unknown> | undefined)?.nextDueDate as string | undefined,
      occupancy: ((leaseContext as Record<string, unknown> | undefined)?.occupancy as string | undefined) || (propertyKpis.occupancyRate === 0 ? 'vacant' : 'unknown')
    };
    const notes = {
      managementNotes: [],
      maintenanceNotes: Array.isArray((maintenanceContext as Record<string, unknown> | undefined)?.notes)
        ? ((maintenanceContext as Record<string, unknown>).notes as string[])
        : [],
      inspectionNotes: Array.isArray((inspectionContext as Record<string, unknown> | undefined)?.notes)
        ? ((inspectionContext as Record<string, unknown>).notes as string[])
        : [],
      latePaymentNotes: propertyKpis.outstandingRent.amount > 0 ? ['Outstanding rent detected in reporting KPI summary.'] : [],
      generalComments: []
    };

    const totalOwnerAmount = trustLedger
      .filter((row) => row.rowType === 'Income')
      .reduce((sum, row) => sum + Number(row.ownerAmount?.amount || 0), 0);
    const statementSummary = {
      openingBalance: money(openingBalanceAmount, currency),
      totalRent: money(settlementGrossRent, currency),
      totalCommission: money(settlementCommission, currency),
      totalVat: money(settlementVat, currency),
      totalLevies: money(settlementLevy, currency),
      totalOwnerAmount: money(totalOwnerAmount, currency),
      totalPayouts: money(ownerPaid, currency),
      closingBalance
    };

    const preAuditPayload = {
      companyId: input.companyId,
      propertyId: input.propertyId,
      period: input.period,
      totals: {
        totalRentalIncome,
        totalOtherIncome,
        totalDeductions,
        ownerPaid,
        closingBalance: closingBalance.amount
      }
    };
    const dataWarnings = [
      ...(periodRows.length === 0 && openingBalanceAmount === 0 ? ['No property account ledger entries found for this property and statement period.'] : []),
      ...(!property ? ['Property metadata was not found for this property ID.'] : []),
      ...(!owner ? ['Owner metadata was not found for this property ID.'] : [])
    ];

    return {
      dtoVersion: DTO_VERSION,
      status: reconciliation.status === 'passed' ? 'reconciled' : 'variance',
      audit: this.auditTrailEngine.build({
        reportType: 'owner-statement',
        generatedBy: input.generatedBy,
        dtoVersion: DTO_VERSION,
        templateVersion: 'owner-statement-template.v2',
        sourceLedgerVersion: 'canonical-ledger-projection.v1',
        payloadForHash: preAuditPayload,
        correlationId: input.correlationId
      }),
      company: {
        displayName: input.companyName || 'Mantis',
        logo: input.companyLogo,
        type: 'company'
      },
      owner: {
        id: owner?.id,
        displayName: owner?.displayName || 'Unknown Owner',
        email: owner?.email,
        phone: owner?.phone,
        type: 'owner'
      },
      property: {
        id: input.propertyId,
        name: property?.name || 'Property',
        address: property?.address
      },
      statementNumber: `OWNER-${input.period.label}`,
      period: input.period,
      executiveSummary: {
        openingBalance: money(openingBalanceAmount, currency),
        rentalIncome: money(totalRentalIncome, currency),
        otherIncome: money(totalOtherIncome, currency),
        totalFundsReceived: money(totalRentalIncome + totalOtherIncome, currency),
        totalDeductions: money(totalDeductions, currency),
        netAvailable: money(netAvailable, currency),
        ownerPaid: money(ownerPaid, currency),
        closingTrustBalance: closingBalance
      },
      cashFlow,
      trustLedger,
      incomeBreakdown,
      expenseBreakdown,
      ownerPayments,
      trustPosition,
      tenantStatus,
      propertyPerformance,
      notes,
      preparedBy: {
        id: input.generatedBy,
        displayName: input.generatedBy || 'Mantis Reporting',
        type: 'agent'
      },
      dataQuality: {
        hasLedgerData: periodRows.length > 0 || openingBalanceAmount !== 0,
        ledgerEntryCount: periodRows.length,
        sourceSystems: Array.from(new Set(periodRows.map((entry) => entry.sourceSystem))),
        warnings: dataWarnings
      },
      propertyKpis,
      charts,
      timeline,
      pluginSections: [],
      statementSummary,
      rentalSettlement: displayedSnapshots.length
        ? {
            grossRent: money(settlementGrossRent, currency),
            levy: money(settlementLevy, currency),
            commission: money(settlementCommission, currency),
            vatOnCommission: money(settlementVat, currency),
            ownerPayable: money(settlementOwnerPayable, currency)
          }
        : undefined,
      reconciliation
    };
  }
}
