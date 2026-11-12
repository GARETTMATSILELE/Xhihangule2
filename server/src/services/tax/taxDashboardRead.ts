import { TaxObligation } from '../../models/TaxObligation';
import { TaxReviewItem } from '../../models/TaxReviewItem';
import { ChartOfAccount } from '../../models/ChartOfAccount';
import { detectVatRateReview } from '../taxRateService';
import { GL } from './chartAccounts';
import { buildTrustReconciliationReport } from './trustReconciliation';
import { loadCompanyTaxPosition } from './taxPositionRead';
import { loadNewTaxIntegrity } from './newTaxIntegrityRead';
import { buildTaxDashboard, type TaxComplianceSignals, type TaxDashboardView } from './taxDashboard';
import type { TaxPosition } from './taxPosition';
import { roundMoney } from '../../utils/money';

const OPEN_REVIEW = { $in: ['open', 'OPEN', 'UNDER_REVIEW'] };

/**
 * Read-only tax dashboard. Loads the canonical position and compliance signals.
 * It does not create obligations, post journals, or edit ledgers.
 */
export async function loadComplianceSignals(companyId: string): Promise<TaxComplianceSignals> {
  const [openReviews, vatRateReview, cgtHistoricalReviews, cgwtMissingApplicability, unpaidVatPeriods, glRows] =
    await Promise.all([
      TaxReviewItem.countDocuments({ companyId, status: OPEN_REVIEW }),
      detectVatRateReview(companyId),
      TaxReviewItem.countDocuments({
        companyId,
        kind: { $in: ['CGT_MISSING_ACQUISITION_COST', 'CGT_RATE_NOT_CONFIGURED', 'LEGACY_CGT_ON_GROSS_SALE_PRICE', 'CGT_SETTLEMENT_REVIEW_REQUIRED', 'LEGACY_CGT_CALCULATION'] },
        status: OPEN_REVIEW
      }),
      TaxReviewItem.countDocuments({
        companyId,
        kind: { $in: ['CGWT_MISSING', 'CGWT_RATE_NOT_CONFIGURED', 'CGWT_RATE_MISSING', 'CGWT_APPLICABILITY_UNDECIDED'] },
        status: OPEN_REVIEW
      }),
      TaxObligation.distinct('taxPeriod', {
        companyId,
        taxType: { $in: ['VAT_OUTPUT', 'VAT_ON_COMMISSION'] },
        status: { $nin: ['PAID', 'RECONCILED', 'REVERSED'] }
      }),
      ChartOfAccount.find({
        companyId,
        code: { $in: [GL.TRUST_BANK, GL.OWNER_PAYABLE, GL.SELLER_PAYABLE, GL.ZIMRA_WITHHOLDING, GL.TENANT_DEPOSITS, GL.LEVY_PAYABLE] },
        isDeleted: { $ne: true }
      }).select('code balance').lean()
    ]);

  const glBalance = (code: string) => roundMoney(Number(glRows.find((row) => row.code === code)?.balance || 0));
  const trust = buildTrustReconciliationReport({
    trustBank: glBalance(GL.TRUST_BANK),
    ownerPayable: glBalance(GL.OWNER_PAYABLE),
    sellerPayable: glBalance(GL.SELLER_PAYABLE),
    zimraWithholding: glBalance(GL.ZIMRA_WITHHOLDING),
    tenantDeposits: glBalance(GL.TENANT_DEPOSITS),
    levyPayable: glBalance(GL.LEVY_PAYABLE)
  });

  return {
    openReviews,
    vatRateReview: Boolean(vatRateReview),
    cgtHistoricalReviews,
    cgwtMissingApplicability,
    unpaidVatPeriods: unpaidVatPeriods.length,
    trustStatus: trust.status
  };
}

export async function loadTaxPositionResponse(
  companyId: string,
  asOf?: Date,
  taxPeriod?: string
): Promise<TaxPosition & { newPeriod: Awaited<ReturnType<typeof loadNewTaxIntegrity>>; dashboard: TaxDashboardView }> {
  const [position, newPeriod, signals] = await Promise.all([
    loadCompanyTaxPosition(companyId, asOf),
    loadNewTaxIntegrity(companyId),
    loadComplianceSignals(companyId)
  ]);
  const dashboard = buildTaxDashboard(position, {
    taxPeriod,
    compliance: { ...signals, newPeriodStatus: newPeriod.status }
  });
  return { ...position, newPeriod, dashboard };
}
