import { Payment } from '../models/Payment';
import { TaxRecord } from '../models/TaxRecord';
import { TaxObligation } from '../models/TaxObligation';
import { TrustAccount } from '../models/TrustAccount';
import { TrustTransaction } from '../models/TrustTransaction';
import { Company } from '../models/Company';
import { isFlatSalePriceCgt } from './tax/cgtCalculation';
import { detectVatRateReview } from './taxRateService';
import { roundMoney } from '../utils/money';
import { openReview } from './taxObligationService';

/**
 * Read-only historical review. Does not rewrite payments, journals, or tax amounts.
 */
export async function buildComplianceMigrationReport(companyId: string) {
  const issues: Array<{
    reference: string;
    kind: string;
    detail: string;
    paymentId?: string;
  }> = [];

  const company = await Company.findById(companyId).select('taxProfile vatNumber tinNumber').lean();
  const vatRegistered = Boolean((company as any)?.taxProfile?.vatRegistered);
  if (!vatRegistered && !(company as any)?.vatNumber) {
    issues.push({
      reference: 'COMPANY',
      kind: 'VAT_REGISTRATION_STATUS_MISSING',
      detail: 'Company VAT registration status is not configured'
    });
    await openReview({
      companyId,
      kind: 'VAT_REGISTRATION_STATUS_MISSING',
      title: 'VAT registration status missing'
    });
  }

  const payments = await Payment.find({
    companyId,
    status: 'completed',
    reversalOfPaymentId: { $exists: false }
  })
    .select('referenceNumber paymentType amount vatAmount commissionDetails paymentDate')
    .limit(2000)
    .lean();

  for (const payment of payments) {
    const ref = String((payment as any).referenceNumber || payment._id);
    if (String(payment.paymentType) === 'sale') {
      const cgtGuess = roundMoney(Number(payment.amount || 0) * 0.2);
      if (cgtGuess > 0 && isFlatSalePriceCgt(Number(payment.amount || 0), cgtGuess)) {
        // Flag only when a TaxRecord already stored that pattern
      }
    }
  }

  const taxRecords = await TaxRecord.find({ companyId, taxType: 'CGT' }).lean();
  for (const record of taxRecords) {
    const trust = await TrustAccount.findById(record.trustAccountId).select('propertyId purchasePrice').lean();
    const salePrice = Number((trust as any)?.purchasePrice || 0);
    if (salePrice > 0 && isFlatSalePriceCgt(salePrice, Number(record.amount || 0))) {
      issues.push({
        reference: String(record._id),
        kind: 'LEGACY_CGT_ON_GROSS_SALE_PRICE',
        detail: `CGT ${record.amount} equals 20% of sale price ${salePrice}`,
        paymentId: undefined
      });
      await openReview({
        companyId,
        kind: 'LEGACY_CGT_CALCULATION',
        title: 'Historical calculation may require accountant review',
        detail: `Historical CGT ${record.amount} equals 20% of sale price ${salePrice}. Historical calculation may require accountant review. No amount was rewritten.`,
        propertyId: trust?.propertyId ? String(trust.propertyId) : undefined,
        metadata: { taxRecordId: String(record._id), salePrice, amount: record.amount }
      });
    }
  }

  const cgwtMissing = await TrustAccount.find({ companyId, status: { $in: ['OPEN', 'SETTLED'] } })
    .select('_id propertyId purchasePrice')
    .lean();
  for (const account of cgwtMissing) {
    const hasCgwt = await TaxObligation.exists({
      companyId,
      taxType: 'CAPITAL_GAINS_WITHHOLDING_TAX',
      propertyId: account.propertyId,
      status: { $ne: 'REVERSED' }
    });
    if (!hasCgwt && Number(account.purchasePrice || 0) > 0) {
      issues.push({
        reference: String(account._id),
        kind: 'CGWT_MISSING',
        detail: 'Sale trust has no Capital Gains Withholding Tax obligation'
      });
      await openReview({
        companyId,
        kind: 'CGWT_MISSING',
        title: 'Capital Gains Withholding Tax missing',
        propertyId: String(account.propertyId),
        metadata: { trustAccountId: String(account._id) }
      });
    }
  }

  const centralVatReview = await detectVatRateReview(companyId);
  if (centralVatReview) {
    issues.push({
      reference: 'VAT-RATE-2026',
      kind: 'VAT_RATE_2026_NOT_CONFIGURED',
      detail: centralVatReview.message
    });
    await openReview({
      companyId,
      kind: 'VAT_RATE_2026_NOT_CONFIGURED',
      title: 'Central VAT rate from 1 January 2026 needs system-admin review',
      detail: centralVatReview.message
    });
  }

  const obligationCount = await TaxObligation.countDocuments({ companyId, status: { $ne: 'REVERSED' } });
  const trustTxCount = await TrustTransaction.countDocuments({ companyId });

  return {
    generatedAt: new Date().toISOString(),
    companyId,
    scannedPayments: payments.length,
    scannedCgtRecords: taxRecords.length,
    existingTaxObligations: obligationCount,
    trustTransactions: trustTxCount,
    issues,
    note: 'No historical amounts were recalculated or rewritten.'
  };
}
