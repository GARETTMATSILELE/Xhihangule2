import { roundMoney } from '../utils/money';

export type IntegrityClassification =
  | 'COMPLETE'
  | 'INCOMPLETE'
  | 'HISTORICAL JOURNAL GAP'
  | 'VAT CONFIGURATION REVIEW'
  | 'VAT OBLIGATION MISSING'
  | 'ZERO OWNER INCOME'
  | 'UNPOSTED RENTAL'
  | 'RATE REVIEW'
  | 'STALE EXCEPTION';

export type OwnerIncomeDisposition = 'NOT_APPLICABLE' | 'MISSING' | 'POSTED' | 'INCORRECT';

const MONEY_TOLERANCE = 0.05;

export function receiptExplainedByCommissionSnapshot(payment: any): boolean {
  const details = payment?.commissionDetails;
  if (!details || typeof details !== 'object') return false;
  const amount = roundMoney(Number(payment?.amount || 0));
  if (amount <= 0) return false;
  const owner = roundMoney(Number(details.ownerAmount || 0));
  const commission = roundMoney(Number(
    details.totalCommission != null
      ? details.totalCommission
      : Number(details.agentShare || 0) + Number(details.agencyShare || 0) + Number(details.preaFee || 0)
  ));
  const vat = roundMoney(Number(details.vatOnCommission ?? details.vatAmount ?? 0));
  const treatment = String(details.vatTreatment || '').toLowerCase();
  const vatOutside = treatment === 'inclusive' ? 0 : vat;
  const levy = roundMoney(Number(details.levy ?? payment?.levyAllocated ?? 0));
  const explained = roundMoney(owner + commission + vatOutside);
  return Math.abs(explained - amount) <= MONEY_TOLERANCE
    || Math.abs(roundMoney(explained + levy) - amount) <= MONEY_TOLERANCE;
}

export function legitimateZeroOwnerIncome(payment: any): boolean {
  const amount = roundMoney(Number(payment?.amount || 0));
  const owner = roundMoney(Number(payment?.commissionDetails?.ownerAmount || 0));
  return amount > 0 && owner <= 0 && receiptExplainedByCommissionSnapshot(payment);
}

export function commissionRateDisagrees(payment: any, propertyCommission?: unknown): boolean {
  const snapshotRate = payment?.commissionDetails?.commissionPercentage ?? payment?.commissionDetails?.commissionRate;
  if (snapshotRate == null || propertyCommission == null || propertyCommission === '') return false;
  const stored = Number(propertyCommission);
  const snapshot = Number(snapshotRate);
  if (!Number.isFinite(stored) || !Number.isFinite(snapshot)) return false;
  return Math.abs(stored - snapshot) > 0.01;
}

export type ProjectionPresence = {
  ownerIncome?: boolean;
  agentCommission?: boolean;
  companyCommission?: boolean;
  journal?: boolean;
};

export function classifyAccountingIntegrityRow(input: {
  component?: string;
  issue?: string;
  missingRecord?: string;
  status?: string;
  payment?: any;
  propertyCommission?: unknown;
  presence?: ProjectionPresence | null;
  rentalType?: unknown;
}): {
  classification: IntegrityClassification;
  explanation: string;
  ownerIncomeDisposition: OwnerIncomeDisposition;
  commercialArrangement?: 'confirmed';
} {
  const payment = input.payment || {};
  const component = String(input.component || '');
  const text = `${component} ${input.issue || ''} ${input.missingRecord || ''}`.toLowerCase();
  const presence = input.presence || null;
  const reference = String(payment.referenceNumber || payment._id || 'this receipt');
  const period = payment.rentalPeriodYear || payment.rentalPeriodMonth
    ? `${payment.rentalPeriodYear || '?'}-${payment.rentalPeriodMonth || '?'}`
    : 'unspecified';
  const zeroOwner = legitimateZeroOwnerIncome(payment);
  const rateDisagrees = commissionRateDisagrees(payment, input.propertyCommission);
  const rentalType = String(input.rentalType || payment?.propertyId?.rentalType || payment?.rentalType || '').toLowerCase();
  const confirmedIntroduction = rentalType === 'introduction' && !rateDisagrees && zeroOwner;
  const confirmedText = confirmedIntroduction
    ? `Commercial arrangement: confirmed. Commission rate ${Number(payment?.commissionDetails?.commissionPercentage ?? payment?.commissionDetails?.commissionRate)}%. Commission ${roundMoney(Number(payment?.commissionDetails?.totalCommission || 0)).toFixed(2)}. Owner income is not applicable (0.00). Agent commission ${roundMoney(Number(payment?.commissionDetails?.agentShare || 0)).toFixed(2)}. Company commission ${roundMoney(Number(payment?.commissionDetails?.agencyShare || 0)).toFixed(2)}.`
    : '';
  const ownerExpected = roundMoney(Number(payment?.commissionDetails?.ownerAmount || 0)) > 0;
  const agentExpected = roundMoney(Number(payment?.commissionDetails?.agentShare || 0)) > 0;
  const companyExpected = roundMoney(Number(payment?.commissionDetails?.agencyShare || 0)) > 0;
  const ownerPosted = Boolean(presence?.ownerIncome);
  const agentPosted = Boolean(presence?.agentCommission);
  const companyPosted = Boolean(presence?.companyCommission);
  const journalPosted = Boolean(presence?.journal);
  const ownerMissing = ownerExpected && presence != null && !ownerPosted;
  const agentMissing = agentExpected && presence != null && !agentPosted;
  const companyMissing = companyExpected && presence != null && !companyPosted;
  const journalMissing = presence != null && !journalPosted && roundMoney(Number(payment?.amount || 0)) > 0;
  const projectionsMissing = ownerMissing || agentMissing || companyMissing;

  let ownerIncomeDisposition: OwnerIncomeDisposition = 'POSTED';
  if (rateDisagrees && roundMoney(Number(payment?.commissionDetails?.ownerAmount || 0)) <= 0) {
    ownerIncomeDisposition = 'INCORRECT';
  } else if (zeroOwner) {
    ownerIncomeDisposition = 'NOT_APPLICABLE';
  } else if (ownerMissing || (ownerExpected && presence == null && text.includes('owner'))) {
    ownerIncomeDisposition = 'MISSING';
  } else if (!ownerExpected) {
    ownerIncomeDisposition = zeroOwner ? 'NOT_APPLICABLE' : 'MISSING';
  }

  const artifactNowPresent = presence != null && (
    ((component === 'MISSING_JOURNAL' || component === 'HISTORICAL_JOURNAL_GAP') && journalPosted)
    || ((component === 'OWNER_INCOME_PROJECTION_MISSING' || component === 'ownerIncome') && ownerPosted)
  );
  if (artifactNowPresent && !projectionsMissing && !journalMissing && !rateDisagrees) {
    return {
      classification: 'STALE EXCEPTION',
      explanation: `Payment ${reference} now has the accounting record this exception was opened for. The stored exception is waiting for the next detection cycle. No historical amount was rewritten.`,
      ownerIncomeDisposition
    };
  }

  if (text.includes('vat_configuration') || text.includes('vat configuration') || component === 'VAT_CONFIGURATION_INCOMPLETE' || text.includes('vat_category') || text.includes('vat_treatment')) {
    return {
      classification: 'VAT CONFIGURATION REVIEW',
      explanation: `VAT was not applied to ${reference}. Company VAT registration, category, or the property VAT treatment is incomplete. No VAT record or tax obligation is created until that configuration is complete.`,
      ownerIncomeDisposition
    };
  }

  if (component === 'MISSING_TAX_OBLIGATION' || text.includes('tax obligation') || text.includes('vat obligation')) {
    const vat = roundMoney(Number(payment?.commissionDetails?.vatOnCommission ?? payment?.commissionDetails?.vatAmount ?? 0));
    return {
      classification: 'VAT OBLIGATION MISSING',
      explanation: `Payment ${reference} deducted VAT of ${vat.toFixed(2)} but has no matching tax obligation. The historical obligation is not created by this check.`,
      ownerIncomeDisposition
    };
  }

  if (journalMissing && projectionsMissing) {
    const gaps = [
      `Rental receipt exists (${reference}, period ${period}).`,
      ownerMissing ? 'Owner income posting missing.' : (zeroOwner ? 'Owner income is not applicable under the stored snapshot.' : ''),
      agentMissing ? 'Agent commission posting missing.' : '',
      companyMissing ? 'Company commission posting missing.' : '',
      'Receipt journal missing.'
    ].filter(Boolean);
    return {
      classification: 'UNPOSTED RENTAL',
      explanation: gaps.join(' '),
      ownerIncomeDisposition: ownerMissing ? 'MISSING' : ownerIncomeDisposition
    };
  }

  if (rateDisagrees) {
    return {
      classification: 'RATE REVIEW',
      explanation: `Payment ${reference} used commission ${Number(payment?.commissionDetails?.commissionPercentage ?? payment?.commissionDetails?.commissionRate)}% but the property is configured at ${Number(input.propertyCommission)}%. The stored snapshot is not rewritten.`,
      ownerIncomeDisposition: 'INCORRECT'
    };
  }

  if (journalMissing && !projectionsMissing) {
    const tracked = payment.accountingComplete != null || Boolean(payment.accountingStatus);
    return {
      classification: tracked && payment.accountingComplete === false ? 'INCOMPLETE' : 'HISTORICAL JOURNAL GAP',
      explanation: confirmedIntroduction
        ? `${confirmedText} The receipt journal is still missing and is reported independently. This receipt is not accounting-complete while that journal is absent.`
        : zeroOwner
        ? `Receipt ${reference} has a calculated owner income of 0.00 because the stored introduction commission consumes the receipt. Commission ${roundMoney(Number(payment?.commissionDetails?.totalCommission || 0)).toFixed(2)}, agent ${roundMoney(Number(payment?.commissionDetails?.agentShare || 0)).toFixed(2)}, company ${roundMoney(Number(payment?.commissionDetails?.agencyShare || 0)).toFixed(2)}. Owner income is not applicable. The receipt journal is still missing and is not reconstructed.`
        : `Receipt ${reference} has its expected subledgers and is missing only the receipt journal. This is a historical journal gap, not a current posting of that journal.`,
      ownerIncomeDisposition,
      ...(confirmedIntroduction ? { commercialArrangement: 'confirmed' as const } : {})
    };
  }

  if (zeroOwner && !journalMissing) {
    const agent = roundMoney(Number(payment?.commissionDetails?.agentShare || 0));
    const company = roundMoney(Number(payment?.commissionDetails?.agencyShare || 0));
    const commission = roundMoney(Number(payment?.commissionDetails?.totalCommission || 0));
    return {
      classification: 'ZERO OWNER INCOME',
      explanation: confirmedIntroduction
        ? `${confirmedText} ${journalPosted ? 'The receipt journal is present.' : 'A missing journal is reported separately.'}`
        : `Owner income is not applicable. The stored snapshot calculates owner income 0.00 from commission ${commission.toFixed(2)} (agent ${agent.toFixed(2)}, company ${company.toFixed(2)}). ${journalPosted ? 'The receipt journal is present.' : 'A missing journal is reported separately.'}`,
      ownerIncomeDisposition: 'NOT_APPLICABLE',
      ...(confirmedIntroduction ? { commercialArrangement: 'confirmed' as const } : {})
    };
  }

  if (String(input.status || '').toUpperCase() === 'VALID' || String(input.status || '').toUpperCase() === 'COMPLETE') {
    return {
      classification: 'COMPLETE',
      explanation: `Payment ${reference} has the required accounting records.`,
      ownerIncomeDisposition
    };
  }

  return {
    classification: 'INCOMPLETE',
    explanation: input.issue || `Payment ${reference} is missing a required accounting posting.`,
    ownerIncomeDisposition
  };
}
