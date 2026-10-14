import { VatReturn } from '../models/VatReturn';
import { TaxObligation } from '../models/TaxObligation';
import { TaxPayment } from '../models/TaxPayment';
import { TaxRate } from '../models/TaxRate';
import { ChartOfAccount } from '../models/ChartOfAccount';
import { Payment } from '../models/Payment';
import { Invoice } from '../models/Invoice';
import { TrustTransaction } from '../models/TrustTransaction';
import { GL } from './tax/chartAccounts';
import { openReview } from './taxObligationService';
import { glOutputVatForPeriod } from './vatReturnService';
import { detectVatRateReview } from './taxRateService';
import { roundMoney } from '../utils/money';
import { buildTrustReconciliationReport } from './tax/trustReconciliation';

const money = (n: number) => roundMoney(Number(n || 0));

export type IntegritySeverity = 'INFO' | 'WARNING' | 'HIGH' | 'CRITICAL';

export type IntegrityFinding = {
  category: 'VAT' | 'CGT' | 'CGWT' | 'TRUST' | 'COMPANY';
  issueType: string;
  severity: IntegritySeverity;
  entity: string;
  transaction?: string;
  taxType?: string;
  amount: number;
  reason: string;
  recommendedAction: string;
  currentAmount: number;
  expectedBasis: string;
  detail: string;
};

/**
 * Detection-only tax and trust integrity checks. Never repairs amounts, journals, or balances.
 */
export async function runTaxIntegrityChecks(companyId: string) {
  const findings: IntegrityFinding[] = [];
  const push = (finding: IntegrityFinding) => findings.push(finding);

  const now = new Date();
  const period = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  const vatObligations = await TaxObligation.find({
    companyId,
    taxPeriod: period,
    taxType: { $in: ['VAT_OUTPUT', 'VAT_ON_COMMISSION'] },
    status: { $ne: 'REVERSED' }
  }).lean();
  const obligationOutput = money(vatObligations.reduce((s, row) => s + Number(row.taxAmount || 0), 0));
  const glOutput = await glOutputVatForPeriod(companyId, period);
  if (Math.abs(obligationOutput - glOutput) > 0.005) {
    push({
      category: 'VAT',
      issueType: 'VAT_OBLIGATION_VS_GL_2101',
      severity: 'HIGH',
      entity: `VAT period ${period}`,
      taxType: 'VAT_OUTPUT',
      amount: obligationOutput,
      currentAmount: obligationOutput,
      expectedBasis: `GL 2101 credits ${glOutput}`,
      reason: `VAT obligation output ${obligationOutput} vs GL 2101 ${glOutput}`,
      recommendedAction: 'Review VAT obligations against GL 2101 for the period. Do not rewrite historical journals automatically.',
      detail: `VAT obligation output ${obligationOutput} vs GL 2101 ${glOutput}`
    });
  }

  const vatReturn = await VatReturn.findOne({ companyId, filingPeriod: period }).lean();
  if (vatReturn && Math.abs(Number(vatReturn.outputVat || 0) - obligationOutput) > 0.005) {
    push({
      category: 'VAT',
      issueType: 'VAT_RETURN_VS_OBLIGATIONS',
      severity: 'HIGH',
      entity: `VAT return ${period}`,
      taxType: 'VAT_OUTPUT',
      amount: Number(vatReturn.outputVat || 0),
      currentAmount: Number(vatReturn.outputVat || 0),
      expectedBasis: `obligations ${obligationOutput}`,
      reason: 'VAT return output does not match tax obligations for the period',
      recommendedAction: 'Rebuild the working paper or document a timing difference. Do not mark RECONCILED until explained.',
      detail: 'VAT return output does not match tax obligations for the period'
    });
  }

  const vatPaid = await TaxPayment.aggregate([
    { $match: { companyId: vatObligations[0]?.companyId, status: 'POSTED' } },
    { $unwind: '$allocations' },
    { $match: { 'allocations.taxType': { $in: ['VAT_OUTPUT', 'VAT_ON_COMMISSION'] } } },
    { $group: { _id: null, total: { $sum: '$allocations.amount' } } }
  ]);
  const obligationPaid = money(
    vatObligations.filter((row) => row.status === 'PAID' || row.status === 'RECONCILED').reduce((s, row) => s + Number(row.taxAmount || 0), 0)
  );
  const paymentPaid = money(Number(vatPaid[0]?.total || 0));
  if (vatPaid.length && Math.abs(obligationPaid - paymentPaid) > 0.5) {
    push({
      category: 'VAT',
      issueType: 'VAT_PAID_VS_TAXPAYMENT',
      severity: 'WARNING',
      entity: `VAT period ${period}`,
      taxType: 'VAT_OUTPUT',
      amount: obligationPaid,
      currentAmount: obligationPaid,
      expectedBasis: `TaxPayment allocations ${paymentPaid}`,
      reason: 'Paid VAT obligations do not match posted TaxPayment allocations',
      recommendedAction: 'Match TaxObligation PAID status to ZIMRA TaxPayment records. A receipt upload is not a payment.',
      detail: 'Paid VAT obligations do not match posted TaxPayment allocations'
    });
  }

  const unallocatedPayments = await TaxPayment.find({
    companyId,
    status: 'POSTED',
    unallocatedAmount: { $gt: 0.005 }
  }).select('_id amount unallocatedAmount').limit(50).lean();
  for (const payment of unallocatedPayments) {
    push({
      category: 'VAT',
      issueType: 'UNALLOCATED_ZIMRA_PAYMENT',
      severity: 'WARNING',
      entity: `TaxPayment ${payment._id}`,
      transaction: String(payment._id),
      taxType: 'ZIMRA_PAYMENT',
      amount: Number(payment.unallocatedAmount || 0),
      currentAmount: Number(payment.unallocatedAmount || 0),
      expectedBasis: `payment ${payment.amount}`,
      reason: 'ZIMRA payment has an explicit unallocated remainder',
      recommendedAction: 'Allocate the remainder to an obligation or document the tax prepayment (GL 1102).',
      detail: 'Unallocated ZIMRA payment remainder'
    });
  }

  const paidWithoutPayment = await TaxObligation.find({
    companyId,
    status: 'PAID',
    taxType: { $in: ['VAT_OUTPUT', 'VAT_ON_COMMISSION', 'CAPITAL_GAINS_TAX', 'CAPITAL_GAINS_WITHHOLDING_TAX'] }
  }).select('_id taxType taxAmount taxPeriod').limit(100).lean();
  if (paidWithoutPayment.length) {
    const allocatedIds = new Set(
      (
        await TaxPayment.find({ companyId, status: 'POSTED' }).select('allocations.taxObligationId').lean()
      ).flatMap((row) => (row.allocations || []).map((a: any) => String(a.taxObligationId || '')))
    );
    for (const row of paidWithoutPayment) {
      if (!allocatedIds.has(String(row._id))) {
        push({
          category: row.taxType === 'CAPITAL_GAINS_WITHHOLDING_TAX' ? 'CGWT' : row.taxType === 'CAPITAL_GAINS_TAX' ? 'CGT' : 'VAT',
          issueType: 'TAX_PAID_WITHOUT_PAYMENT_RECORD',
          severity: 'HIGH',
          entity: `TaxObligation ${row._id}`,
          transaction: String(row._id),
          taxType: row.taxType,
          amount: Number(row.taxAmount || 0),
          currentAmount: Number(row.taxAmount || 0),
          expectedBasis: 'matching TaxPayment allocation',
          reason: 'Obligation is PAID but no posted TaxPayment allocation exists',
          recommendedAction: 'Record a ZIMRA payment or revert PAID status. Do not treat a receipt upload as payment.',
          detail: 'Tax paid without payment record'
        });
      }
    }
  }

  const cgtRates = await TaxRate.countDocuments({ companyId, taxType: 'CGT', isActive: { $ne: false } });
  const cgwtRates = await TaxRate.countDocuments({ companyId, taxType: 'CGWT', isActive: { $ne: false } });
  if (cgtRates === 0) {
    push({
      category: 'CGT',
      issueType: 'MISSING_CGT_RATE',
      severity: 'HIGH',
      entity: 'TaxRate CGT',
      taxType: 'CAPITAL_GAINS_TAX',
      amount: 0,
      currentAmount: 0,
      expectedBasis: 'effective-dated CGT rate',
      reason: 'No active Capital Gains Tax rate is configured',
      recommendedAction: 'Configure an effective-dated CGT rate in Settings → Tax Rates before settling sales.',
      detail: 'Missing CGT rate'
    });
  }
  if (cgwtRates === 0) {
    push({
      category: 'CGWT',
      issueType: 'MISSING_CGWT_RATE',
      severity: 'HIGH',
      entity: 'TaxRate CGWT',
      taxType: 'CAPITAL_GAINS_WITHHOLDING_TAX',
      amount: 0,
      currentAmount: 0,
      expectedBasis: 'effective-dated CGWT rate',
      reason: 'No active Capital Gains Withholding Tax rate is configured',
      recommendedAction: 'Configure a CGWT rate or mark sales CGWT_NOT_APPLICABLE with a reason. Do not treat missing rate as zero withholding.',
      detail: 'Missing CGWT rate'
    });
  }

  const cgtRows = await TaxObligation.find({ companyId, taxType: 'CAPITAL_GAINS_TAX', status: { $ne: 'REVERSED' } }).lean();
  const cgwtRows = await TaxObligation.find({ companyId, taxType: 'CAPITAL_GAINS_WITHHOLDING_TAX', status: { $ne: 'REVERSED' } }).lean();
  for (const row of cgtRows) {
    if (row.status === 'ACCOUNTANT_REVIEW' || (Number(row.taxAmount || 0) === 0 && String(row.calculationBasis || '').includes('RATE'))) {
      push({
        category: 'CGT',
        issueType: 'SALE_SETTLEMENT_VS_CGT',
        severity: 'HIGH',
        entity: `TaxObligation ${row._id}`,
        transaction: String(row.paymentId || row._id),
        taxType: 'CAPITAL_GAINS_TAX',
        amount: Number(row.taxAmount || 0),
        currentAmount: Number(row.taxAmount || 0),
        expectedBasis: String(row.calculationBasis || ''),
        reason: 'Capital Gains Tax obligation requires review',
        recommendedAction: 'Complete acquisition cost and dated CGT rate, or mark CGT_NOT_APPLICABLE with a reason.',
        detail: 'Capital Gains Tax obligation requires review'
      });
    }
  }
  for (const row of cgwtRows) {
    if (row.status === 'ACCOUNTANT_REVIEW') {
      push({
        category: 'CGWT',
        issueType: 'SALE_SETTLEMENT_VS_CGWT',
        severity: 'HIGH',
        entity: `TaxObligation ${row._id}`,
        transaction: String(row.paymentId || row._id),
        taxType: 'CAPITAL_GAINS_WITHHOLDING_TAX',
        amount: Number(row.taxAmount || 0),
        currentAmount: Number(row.taxAmount || 0),
        expectedBasis: String(row.calculationBasis || ''),
        reason: 'Capital Gains Withholding Tax obligation requires review',
        recommendedAction: 'Record CGWT applicability. Missing rate is not the same as not applicable.',
        detail: 'Capital Gains Withholding Tax obligation requires review'
      });
    }
  }

  const legacyCgt = await TrustTransaction.find({
    companyId,
    type: 'CGT_DEDUCTION'
  })
    .select('_id debit credit trustAccountId type propertyId')
    .limit(50)
    .lean();
  for (const row of legacyCgt) {
    const amount = money(Number((row as any).debit || (row as any).credit || 0));
    push({
      category: 'CGT',
      issueType: 'LEGACY_CGT_CALCULATION',
      severity: 'WARNING',
      entity: `TrustTransaction ${row._id}`,
      transaction: String(row._id),
      taxType: 'CAPITAL_GAINS_TAX',
      amount,
      currentAmount: amount,
      expectedBasis: 'capital gain × dated CGT rate; historical 20% × sale price is legacy',
      reason: 'Historical trust deduction labelled CGT. May be 20% of gross sale price.',
      recommendedAction: 'Leave the historical amount unchanged. Review as LEGACY CGT DEDUCTION. Create a controlled adjustment only if the accountant decides it is required.',
      detail: 'Legacy CGT trust deduction'
    });
  }

  const glRows = await ChartOfAccount.find({
    companyId,
    code: { $in: [GL.TRUST_BANK, GL.OWNER_PAYABLE, GL.SELLER_PAYABLE, GL.ZIMRA_WITHHOLDING, GL.TENANT_DEPOSITS, GL.LEVY_PAYABLE, GL.AGENCY_REVENUE] },
    isDeleted: { $ne: true }
  }).select('code balance').lean();
  const glBalance = (code: string) => money(Number(glRows.find((row) => row.code === code)?.balance || 0));
  const trust = buildTrustReconciliationReport({
    trustBank: glBalance(GL.TRUST_BANK),
    ownerPayable: glBalance(GL.OWNER_PAYABLE),
    sellerPayable: glBalance(GL.SELLER_PAYABLE),
    zimraWithholding: glBalance(GL.ZIMRA_WITHHOLDING),
    tenantDeposits: glBalance(GL.TENANT_DEPOSITS),
    levyPayable: glBalance(GL.LEVY_PAYABLE)
  });
  if (trust.status === 'RECONCILIATION_EXCEPTION') {
    push({
      category: 'TRUST',
      issueType: trust.difference > 0 ? 'TRUST_SURPLUS' : 'TRUST_SHORTFALL',
      severity: Math.abs(trust.difference) > 1000 ? 'CRITICAL' : 'HIGH',
      entity: 'GL 1003 vs scoped client ledgers',
      taxType: 'TRUST',
      amount: trust.trustBank,
      currentAmount: trust.trustBank,
      expectedBasis: `client ledgers ${trust.clientLiabilities} (PARTIAL scope)`,
      reason: `Trust bank vs scoped client ledgers difference ${trust.difference}`,
      recommendedAction: 'Investigate the PARTIAL recon difference. Do not auto-repair. Excluded categories are documented on Tax Compliance.',
      detail: `Trust bank vs scoped client ledgers difference ${trust.difference}`
    });
  }

  const payments = await Payment.find({
    companyId,
    status: 'completed',
    isProvisional: { $ne: true },
    reversalOfPaymentId: { $exists: false }
  })
    .select('commissionDetails amount paymentType')
    .limit(500)
    .lean();
  let agencyShareTotal = 0;
  let commissionNetTotal = 0;
  for (const payment of payments) {
    agencyShareTotal = money(agencyShareTotal + Number((payment as any)?.commissionDetails?.agencyShare || 0));
    commissionNetTotal = money(
      commissionNetTotal + Number((payment as any)?.commissionDetails?.commissionNet || (payment as any)?.commissionDetails?.totalCommission || 0)
    );
  }
  const glCommission = glBalance(GL.AGENCY_REVENUE);
  if (payments.length && Math.abs(commissionNetTotal - glCommission) > 1) {
    push({
      category: 'COMPANY',
      issueType: 'COMPANY_COMMISSION_VS_GL_REVENUE',
      severity: 'WARNING',
      entity: 'GL 4001',
      taxType: 'AGENCY_REVENUE',
      amount: commissionNetTotal,
      currentAmount: commissionNetTotal,
      expectedBasis: `GL 4001 ${glCommission}; CompanyAccount.agencyShare ${agencyShareTotal} is retained share after agent/PREA split, not GL 4001`,
      reason: 'Commission net vs GL 4001 difference detected (detection only)',
      recommendedAction: 'Reconcile commissionNet to GL 4001. Do not force equality with CompanyAccount.agencyShare.',
      detail: 'Commission net vs GL 4001 difference detected (detection only)'
    });
  }

  const vatRateReview = await detectVatRateReview(companyId);
  if (vatRateReview) {
    push({
      category: 'VAT',
      issueType: 'VAT_RATE_2026_NOT_CONFIGURED',
      severity: 'HIGH',
      entity: 'TaxRate VAT',
      taxType: 'VAT',
      amount: Number(vatRateReview.currentRate || 0),
      currentAmount: Number(vatRateReview.currentRate || 0),
      expectedBasis: `${vatRateReview.expectedRate}% from 1 Jan 2026`,
      reason: vatRateReview.message,
      recommendedAction: 'Accountant review of the open VAT rate covering 1 January 2026. Do not rewrite historical rates.',
      detail: vatRateReview.message
    });
    await openReview({
      companyId,
      kind: 'VAT_RATE_2026_NOT_CONFIGURED',
      title: 'VAT RATE REVIEW REQUIRED',
      detail: vatRateReview.message,
      metadata: { currentRate: vatRateReview.currentRate, expectedRate: vatRateReview.expectedRate, severity: 'HIGH' }
    });
  }

  for (const finding of findings) {
    await openReview({
      companyId,
      kind: finding.issueType,
      title: finding.issueType.replace(/_/g, ' '),
      detail: finding.reason,
      metadata: finding
    });
  }

  return {
    generatedAt: new Date().toISOString(),
    detectionOnly: true,
    repaired: false,
    findings,
    trust
  };
}

export async function fiscalisationSummary(companyId: string) {
  try {
    const notFiscalised = await Invoice.countDocuments({
      companyId,
      fiscalisationStatus: { $ne: 'FISCALISATION_SUCCESS' }
    });
    return { notFiscalised };
  } catch {
    return { notFiscalised: 0 };
  }
}

export function companyAccountVsGlNote(): string {
  return 'CompanyAccount.agencyShare is the retained agency share after PREA and agent split. GL 4001 is commission net (company commission revenue). They are intentionally different. Reconcile commissionNet to GL 4001 and agencyShare to commissionNet − preaFee − agentShare. Historical CompanyAccount values are not rewritten.';
}
