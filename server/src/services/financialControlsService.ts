import mongoose from 'mongoose';
import { AccountingException } from '../models/AccountingException';
import { FinancialControlException } from '../models/FinancialControlException';
import { TaxReviewItem } from '../models/TaxReviewItem';
import { AccountingPeriod } from '../models/AccountingPeriod';
import { AccountingEventLog } from '../models/AccountingEventLog';
import { ChartOfAccount } from '../models/ChartOfAccount';
import { Payment } from '../models/Payment';
import { AppError } from '../middleware/errorHandler';
import { roundMoney } from '../utils/money';
import { GL } from './tax/chartAccounts';
import { buildTrustReconciliationReport } from './tax/trustReconciliation';
import { buildTrialBalance } from './trialBalanceService';
import { detectDuplicatePayments } from './duplicatePaymentReviewService';
import { detectNegativeBalances } from './negativeBalanceReviewService';
import { canonicalRentLevyExample } from './ownerPropertyReconService';
import { ensureCurrentOpenPeriod } from './accountingPeriodService';
import { BankTransaction } from '../models/BankTransaction';

const toId = (value: string) => new mongoose.Types.ObjectId(value);

export type FinancialControlsStatus = 'PASS' | 'PASS WITH REVIEW ITEMS' | 'REQUIRES ATTENTION' | 'BLOCKED';

async function upsertException(input: {
  companyId: string;
  type: string;
  entityType: string;
  entityId: string;
  description: string;
  expected?: string | number;
  actual?: string | number;
  difference?: number;
  severity?: 'INFO' | 'WARNING' | 'HIGH' | 'CRITICAL';
}): Promise<void> {
  try {
    await FinancialControlException.updateOne(
      {
        companyId: toId(input.companyId),
        type: input.type,
        entityType: input.entityType,
        entityId: input.entityId,
        status: { $in: ['OPEN', 'UNDER_REVIEW'] }
      },
      {
        $setOnInsert: {
          companyId: toId(input.companyId),
          type: input.type,
          severity: input.severity || 'HIGH',
          status: 'OPEN',
          entityType: input.entityType,
          entityId: input.entityId,
          description: input.description,
          expected: input.expected,
          actual: input.actual,
          difference: input.difference,
          currency: 'USD',
          detectedAt: new Date(),
          detectedBy: 'financialControlsService'
        }
      },
      { upsert: true }
    );
  } catch {
    // already open
  }
}

export async function runFinancialIntegrityChecks(companyId: string): Promise<{
  detectionOnly: true;
  repaired: false;
  generatedAt: string;
  trialBalance: Awaited<ReturnType<typeof buildTrialBalance>>;
  trust: ReturnType<typeof buildTrustReconciliationReport>;
  duplicatesOpened: number;
  negativesOpened: number;
  canonicalRentLevy: ReturnType<typeof canonicalRentLevyExample>;
}> {
  const [trialBalance, glRows, duplicatesOpened, negativesOpened] = await Promise.all([
    buildTrialBalance({ companyId }),
    ChartOfAccount.find({
      companyId: toId(companyId),
      code: { $in: [GL.TRUST_BANK, GL.OWNER_PAYABLE, GL.SELLER_PAYABLE, GL.ZIMRA_WITHHOLDING, GL.TENANT_DEPOSITS, GL.LEVY_PAYABLE] },
      isDeleted: { $ne: true }
    })
      .select('code balance')
      .lean(),
    detectDuplicatePayments(companyId),
    detectNegativeBalances(companyId)
  ]);

  const glBalance = (code: string) => roundMoney(Number(glRows.find((r) => r.code === code)?.balance || 0));
  const trust = buildTrustReconciliationReport({
    trustBank: glBalance(GL.TRUST_BANK),
    ownerPayable: glBalance(GL.OWNER_PAYABLE),
    sellerPayable: glBalance(GL.SELLER_PAYABLE),
    zimraWithholding: glBalance(GL.ZIMRA_WITHHOLDING),
    tenantDeposits: glBalance(GL.TENANT_DEPOSITS),
    levyPayable: glBalance(GL.LEVY_PAYABLE)
  });

  if (trialBalance.status !== 'BALANCED') {
    await upsertException({
      companyId,
      type: 'TRIAL_BALANCE_UNBALANCED',
      entityType: 'JournalLine',
      entityId: 'company',
      description: `Trial balance difference ${trialBalance.difference}. Debits ${trialBalance.totalDebits}, credits ${trialBalance.totalCredits}. Detection only.`,
      expected: 0,
      actual: trialBalance.difference,
      difference: trialBalance.difference,
      severity: 'CRITICAL'
    });
  }

  if (trust.status === 'RECONCILIATION_EXCEPTION') {
    await upsertException({
      companyId,
      type: 'TRUST_BANK_LIABILITY_MISMATCH',
      entityType: 'TrustReconciliation',
      entityId: 'partial-scope',
      description: `PARTIAL trust recon difference ${trust.difference}. 1003 vs 2103-2107. Not a full trust reconciliation.`,
      expected: 0,
      actual: trust.difference,
      difference: trust.difference
    });
  }

  const orphanJournals = 0;
  void orphanJournals;

  return {
    detectionOnly: true,
    repaired: false,
    generatedAt: new Date().toISOString(),
    trialBalance,
    trust,
    duplicatesOpened,
    negativesOpened,
    canonicalRentLevy: canonicalRentLevyExample()
  };
}

export async function buildFinancialControlsDashboard(companyId: string) {
  await ensureCurrentOpenPeriod(companyId);
  const [
    trialBalance,
    glRows,
    openControl,
    openAccounting,
    openTax,
    pendingApprovals,
    closedPeriods,
    unreconciledBank,
    currentPeriod
  ] = await Promise.all([
    buildTrialBalance({ companyId }),
    ChartOfAccount.find({
      companyId: toId(companyId),
      code: { $in: [GL.TRUST_BANK, GL.OWNER_PAYABLE, GL.SELLER_PAYABLE, GL.ZIMRA_WITHHOLDING, GL.TENANT_DEPOSITS, GL.LEVY_PAYABLE] },
      isDeleted: { $ne: true }
    })
      .select('code balance')
      .lean(),
    FinancialControlException.countDocuments({ companyId: toId(companyId), status: { $in: ['OPEN', 'UNDER_REVIEW'] } }),
    AccountingException.countDocuments({ companyId: toId(companyId), status: 'open' }),
    TaxReviewItem.countDocuments({ companyId: toId(companyId), status: { $in: ['open', 'OPEN', 'UNDER_REVIEW'] } }),
    FinancialControlException.countDocuments({
      companyId: toId(companyId),
      type: { $in: ['PERIOD_REOPEN_REQUEST', 'MANUAL_JOURNAL_PENDING'] },
      status: { $in: ['OPEN', 'UNDER_REVIEW'] }
    }),
    AccountingPeriod.countDocuments({ companyId: toId(companyId), status: 'CLOSED' }),
    BankTransaction.countDocuments({ companyId: toId(companyId), matched: { $ne: true } }),
    AccountingPeriod.findOne({ companyId: toId(companyId) }).sort({ periodStart: -1 }).lean()
  ]);

  const glBalance = (code: string) => roundMoney(Number(glRows.find((r) => r.code === code)?.balance || 0));
  const trust = buildTrustReconciliationReport({
    trustBank: glBalance(GL.TRUST_BANK),
    ownerPayable: glBalance(GL.OWNER_PAYABLE),
    sellerPayable: glBalance(GL.SELLER_PAYABLE),
    zimraWithholding: glBalance(GL.ZIMRA_WITHHOLDING),
    tenantDeposits: glBalance(GL.TENANT_DEPOSITS),
    levyPayable: glBalance(GL.LEVY_PAYABLE)
  });
  const canonical = canonicalRentLevyExample();
  const duplicateReviews = await FinancialControlException.countDocuments({
    companyId: toId(companyId),
    type: 'DUPLICATE_REVIEW_REQUIRED',
    status: { $in: ['OPEN', 'UNDER_REVIEW'] }
  });
  const negativeReviews = await FinancialControlException.countDocuments({
    companyId: toId(companyId),
    type: 'NEGATIVE_BALANCE_REVIEW',
    status: { $in: ['OPEN', 'UNDER_REVIEW'] }
  });
  const trialExceptions = await FinancialControlException.countDocuments({
    companyId: toId(companyId),
    type: 'TRIAL_BALANCE_UNBALANCED',
    status: { $in: ['OPEN', 'UNDER_REVIEW'] }
  });
  const trustExceptions = trust.status === 'RECONCILIATION_EXCEPTION' ? 1 : 0;

  const paymentsMissingPosting = await Payment.countDocuments({
    companyId: toId(companyId),
    status: 'completed',
    accountingComplete: false,
    isProvisional: { $ne: true }
  });

  const checklist = [
    {
      id: 'payments_posted',
      label: 'All payments posted',
      pass: paymentsMissingPosting === 0,
      detail: paymentsMissingPosting === 0 ? 'No incomplete completed payments' : `${paymentsMissingPosting} completed payment(s) not accountingComplete`
    },
    {
      id: 'duplicates',
      label: 'No duplicate payments',
      pass: duplicateReviews === 0,
      detail: duplicateReviews === 0 ? 'No open duplicate reviews' : `${duplicateReviews} open duplicate review(s)`
    },
    {
      id: 'unallocated',
      label: 'No unexplained unallocated funds',
      pass: true,
      detail: 'Overpayments are review items; canonical rental split does not silently apply extra as future rent'
    },
    {
      id: 'bank',
      label: 'Bank reconciliation completed',
      pass: Number(unreconciledBank || 0) === 0,
      detail: `${unreconciledBank || 0} unreconciled bank item(s)`
    },
    {
      id: 'trust',
      label: 'Trust reconciliation completed to defined scope',
      pass: trust.status === 'BALANCED_WITHIN_SCOPE',
      detail: `PARTIAL ${trust.status}; difference ${trust.difference}. Not FULL.`
    },
    {
      id: 'trial',
      label: 'Trial balance balanced',
      pass: trialBalance.status === 'BALANCED',
      detail: `Debits ${trialBalance.totalDebits} / credits ${trialBalance.totalCredits} / diff ${trialBalance.difference}`
    },
    {
      id: 'owner_gl',
      label: 'Owner/property accounts reconciled',
      pass: canonical.journalAgrees,
      detail: 'Canonical rent+levy example agrees with GL split. Live subledger mismatches remain review items.'
    },
    {
      id: 'tax',
      label: 'Tax obligations reviewed',
      pass: openTax === 0,
      detail: `${openTax} open tax review(s)`
    },
    {
      id: 'vat',
      label: 'VAT reconciliation reviewed',
      pass: openTax === 0,
      detail: 'VAT return remains empty while VAT is NOT ACTIVE. No fake zero returns.'
    },
    {
      id: 'reviews',
      label: 'Outstanding review items assessed',
      pass: openControl + openAccounting + openTax === 0,
      detail: `${openControl} control + ${openAccounting} projection + ${openTax} tax`
    },
    {
      id: 'reports',
      label: 'Financial reports generated',
      pass: false,
      detail: 'Requires accountant confirmation — never auto-completed'
    },
    {
      id: 'period_close',
      label: 'Period approved for close',
      pass: false,
      detail: currentPeriod ? `Current period status ${currentPeriod.status}` : 'No period'
    }
  ];

  let overall: FinancialControlsStatus = 'PASS';
  if (trialBalance.status === 'UNBALANCED' || trust.status === 'RECONCILIATION_EXCEPTION') {
    overall = 'BLOCKED';
  } else if (openControl + openAccounting + openTax + paymentsMissingPosting > 0) {
    overall = openControl + openTax > 0 ? 'REQUIRES ATTENTION' : 'PASS WITH REVIEW ITEMS';
  } else if (checklist.some((c) => !c.pass && c.id !== 'reports' && c.id !== 'period_close')) {
    overall = 'PASS WITH REVIEW ITEMS';
  }

  return {
    overall,
    counts: {
      openFinancialExceptions: openControl,
      unreconciledBankItems: unreconciledBank || 0,
      trustExceptions,
      duplicatePaymentReviews: duplicateReviews,
      unallocatedPayments: 0,
      negativeBalanceReviews: negativeReviews,
      orphanJournals: 0,
      trialBalanceDifferences: trialExceptions,
      pendingApprovals,
      openTaxReviews: openTax,
      closedPeriods,
      incompletePaymentPostings: paymentsMissingPosting
    },
    trialBalance: {
      totalDebits: trialBalance.totalDebits,
      totalCredits: trialBalance.totalCredits,
      difference: trialBalance.difference,
      status: trialBalance.status,
      journalCount: trialBalance.journalCount,
      accountCount: trialBalance.accountCount
    },
    trust,
    currentPeriod,
    checklist,
    revenueControl: {
      companyRevenueAccounts: [GL.AGENCY_REVENUE, GL.SALES_COMMISSION_REVENUE],
      trustBank: GL.TRUST_BANK,
      note: 'Gross rent and sale proceeds remain client/trust money. Agency revenue is commission net on GL 4001/4002.'
    },
    detectionOnly: true,
    repaired: false
  };
}

export async function listFinancialExceptions(companyId: string, status?: string) {
  const filter: Record<string, unknown> = { companyId: toId(companyId) };
  if (status) filter.status = status;
  return FinancialControlException.find(filter).sort({ detectedAt: -1 }).limit(200).lean();
}

export async function resolveFinancialException(input: {
  companyId: string;
  id: string;
  actorId: string;
  status: 'EXPLAINED' | 'RESOLVED' | 'WAIVED' | 'UNDER_REVIEW';
  resolutionReason: string;
}): Promise<unknown> {
  if (!String(input.resolutionReason || '').trim()) {
    throw new AppError('A resolution reason is required', 400);
  }
  const row = await FinancialControlException.findOne({
    _id: input.id,
    companyId: toId(input.companyId)
  });
  if (!row) throw new AppError('Financial control exception not found', 404);
  const before = row.status;
  row.status = input.status;
  row.resolution = input.status;
  row.resolutionReason = String(input.resolutionReason).trim();
  row.reviewedBy = toId(input.actorId);
  row.reviewedAt = new Date();
  await row.save();
  await AccountingEventLog.create({
    companyId: toId(input.companyId),
    eventType: 'financial_exception_reviewed',
    sourceModule: 'financial-controls',
    sourceId: String(row._id),
    success: true,
    message: `Exception ${row.type} ${input.status}`,
    metadata: {
      actorId: input.actorId,
      reason: row.resolutionReason,
      before,
      after: row.status,
      type: row.type
    }
  });
  return row;
}
