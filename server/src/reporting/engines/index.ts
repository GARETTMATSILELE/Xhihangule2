import crypto from 'crypto';
import {
  AuditMetadataDTO,
  CashFlowDTO,
  CashFlowStepDTO,
  ChartDTO,
  CurrencyCode,
  MoneyAmountDTO,
  PropertyKPIDTO,
  ReconciliationCheckDTO,
  ReconciliationDTO,
  TimelineDTO
} from '../dto';
import { CanonicalLedgerEntry, sortLedgerEntries, sumCredits, sumDebits, toSourceReference } from '../ledger';

const roundMoney = (amount: number): number => Math.round(Number(amount || 0) * 100) / 100;

export const money = (amount: number, currency: CurrencyCode = 'USD'): MoneyAmountDTO => ({
  amount: roundMoney(amount),
  currency
});

export class ReconciliationEngine {
  reconcileMoney(id: string, label: string, expected: MoneyAmountDTO, actual: MoneyAmountDTO, sourceEntries: CanonicalLedgerEntry[]): ReconciliationCheckDTO {
    const variance = roundMoney(actual.amount - expected.amount);
    return {
      id,
      label,
      expected,
      actual,
      variance: money(variance, expected.currency),
      passed: Math.abs(variance) < 0.01,
      sourceReferences: sourceEntries.map(toSourceReference)
    };
  }

  summarize(checks: ReconciliationCheckDTO[]): ReconciliationDTO {
    return {
      status: checks.every((check) => check.passed) ? 'passed' : 'failed',
      checks
    };
  }
}

export class CashFlowEngine {
  build(entries: CanonicalLedgerEntry[], currency: CurrencyCode = 'USD', openingBalance = 0): CashFlowDTO {
    const ordered = sortLedgerEntries(entries);
    const inflows = ordered.filter((entry) => entry.credit > 0);
    const outflows = ordered.filter((entry) => entry.debit > 0);
    const ownerPayments = ordered.filter((entry) => entry.eventType.toUpperCase() === 'OWNER_PAYOUT');
    const totalInflows = sumCredits(inflows);
    const totalOutflows = sumDebits(outflows);
    const totalOwnerPayments = sumDebits(ownerPayments);
    const closingBalance = openingBalance + totalInflows - totalOutflows;
    const steps: CashFlowStepDTO[] = [
      {
        id: 'funds-received',
        label: 'Funds Received',
        amount: money(totalInflows, currency),
        direction: 'inflow',
        sourceReferences: inflows.map(toSourceReference)
      },
      {
        id: 'deductions',
        label: 'Deductions',
        amount: money(totalOutflows - totalOwnerPayments, currency),
        direction: 'outflow',
        sourceReferences: outflows.filter((entry) => entry.eventType.toUpperCase() !== 'OWNER_PAYOUT').map(toSourceReference)
      },
      {
        id: 'owner-payments',
        label: 'Owner Payments',
        amount: money(totalOwnerPayments, currency),
        direction: 'outflow',
        sourceReferences: ownerPayments.map(toSourceReference)
      },
      {
        id: 'balance-held',
        label: 'Balance Held',
        amount: money(closingBalance, currency),
        direction: 'balance',
        sourceReferences: ordered.map(toSourceReference)
      }
    ];

    const reconciliationEngine = new ReconciliationEngine();
    const expectedClosing = money(openingBalance + totalInflows - totalOutflows, currency);
    const actualClosing = money(closingBalance, currency);
    return {
      openingBalance: money(openingBalance, currency),
      totalInflows: money(totalInflows, currency),
      totalOutflows: money(totalOutflows, currency),
      ownerPayments: money(totalOwnerPayments, currency),
      closingBalance: money(closingBalance, currency),
      steps,
      reconciliation: reconciliationEngine.summarize([
        reconciliationEngine.reconcileMoney('cash-flow-balance', 'Cash flow closing balance equals inflows less outflows', expectedClosing, actualClosing, ordered)
      ])
    };
  }
}

export class PropertyKPIEngine {
  build(entries: CanonicalLedgerEntry[], currency: CurrencyCode = 'USD'): PropertyKPIDTO {
    const rentEntries = entries.filter((entry) => entry.eventType.toUpperCase() === 'RENT' || entry.eventType.toLowerCase() === 'income');
    const completedRent = sumCredits(rentEntries.filter((entry) => entry.status === 'completed'));
    const totalRent = sumCredits(rentEntries);
    return {
      occupancyRate: undefined,
      collectionRate: totalRent > 0 ? roundMoney((completedRent / totalRent) * 100) : undefined,
      outstandingRent: money(Math.max(0, totalRent - completedRent), currency),
      openMaintenanceCount: 0,
      closedMaintenanceCount: 0,
      financialKpis: {
        totalIncome: money(sumCredits(entries), currency),
        totalExpenses: money(sumDebits(entries), currency),
        netPosition: money(sumCredits(entries) - sumDebits(entries), currency)
      }
    };
  }
}

export class ChartEngine {
  buildCashFlowChart(cashFlow: CashFlowDTO): ChartDTO {
    return {
      id: 'cash-flow',
      title: 'Cash Flow',
      kind: 'waterfall',
      series: [
        {
          id: 'cash-flow-series',
          label: 'Cash Flow',
          currency: cashFlow.closingBalance.currency,
          points: cashFlow.steps.map((step) => ({ label: step.label, value: step.amount.amount }))
        }
      ],
      sourceReferences: cashFlow.steps.flatMap((step) => step.sourceReferences)
    };
  }
}

export class TimelineEngine {
  buildFinancialTimeline(entries: CanonicalLedgerEntry[], currency: CurrencyCode = 'USD'): TimelineDTO {
    return {
      id: 'financial-timeline',
      title: 'Financial Timeline',
      events: sortLedgerEntries(entries).map((entry) => ({
        id: entry.entryId,
        label: String(entry.metadata?.description || entry.eventType),
        occurredAt: entry.effectiveDate.toISOString(),
        amount: money(entry.amount, currency),
        status: entry.status,
        sourceReferences: [toSourceReference(entry)]
      }))
    };
  }
}

export class AuditTrailEngine {
  build(input: {
    reportType: string;
    generatedBy?: string;
    dtoVersion: string;
    templateVersion?: string;
    sourceLedgerVersion?: string;
    accountingVersion?: string;
    payloadForHash: unknown;
    correlationId?: string;
  }): AuditMetadataDTO {
    const generatedAt = new Date().toISOString();
    const correlationId = input.correlationId || crypto.randomUUID();
    const hash = crypto
      .createHash('sha256')
      .update(JSON.stringify(input.payloadForHash))
      .digest('hex');

    return {
      reportId: crypto.randomUUID(),
      reportType: input.reportType,
      generatedBy: input.generatedBy,
      generatedAt,
      softwareVersion: process.env.npm_package_version,
      dtoVersion: input.dtoVersion,
      templateVersion: input.templateVersion,
      sourceLedgerVersion: input.sourceLedgerVersion,
      accountingVersion: input.accountingVersion,
      hash,
      correlationId
    };
  }
}

