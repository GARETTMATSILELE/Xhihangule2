import type { TaxRuleRecord } from './taxRuleRegistry';
import { isCompanyVatRegisteredOnDate } from './tax/vatApplicability';
import type { VatSupplyTreatment } from './tax/taxTypes';
import { normalizeRentalTaxRegime, type RentalTaxRegime } from './tax/rentalTaxTypes';
import {
  uncalculatedTaxFields,
  type TaxCalculationStatus,
  type TaxClassificationSource,
  type TaxProfileSnapshot,
  type TaxRuleReference,
  type TransactionTaxSourceKind
} from './tax/taxMetadataTypes';

export type ClassificationInput = {
  sourceKind: TransactionTaxSourceKind;
  transactionDate: Date;
  vatRegistered: boolean;
  vatRegistrationEffectiveDate?: Date | string | null;
  vatRegistrationCancelledAt?: Date | string | null;
  vatNumber?: string;
  rentalTaxRegime: string;
  incomeTaxRegistered: boolean;
  propertyUseClass?: string | null;
  vatSupplyTreatment?: string | null;
  rentalTaxTreatment?: string | null;
  ownerProfileVersion?: number;
  propertyUpdatedAt?: string | null;
  userVatTreatment?: string | null;
  userDeductibility?: string | null;
  userCapitalOrRevenue?: string | null;
  vatRule?: TaxRuleRecord | null;
  presumptiveRule?: TaxRuleRecord | null;
  incomeTaxRule?: TaxRuleRecord | null;
};

export type BuiltTaxClassification = {
  taxTypesRelevant: string[];
  taxRuleReferences: TaxRuleReference[];
  taxProfileSnapshot: TaxProfileSnapshot;
  vatTreatment: string;
  rentalTaxTreatment: string;
  rentalTaxRegime: string;
  deductibility: string | null;
  capitalOrRevenue: string | null;
  classificationSource: TaxClassificationSource;
  classificationStatus: TaxCalculationStatus;
  taxCalculationStatus: TaxCalculationStatus;
  reviewReasons: string[];
} & ReturnType<typeof uncalculatedTaxFields>;

function ruleRef(
  taxType: string,
  rule: TaxRuleRecord | null | undefined,
  status: TaxCalculationStatus
): TaxRuleReference {
  return {
    taxType,
    ruleId: rule?.id || null,
    ruleCode: rule?.ruleCode || null,
    ruleVersion: rule?.version ?? null,
    effectiveFrom: rule?.effectiveFrom ? new Date(rule.effectiveFrom).toISOString().slice(0, 10) : null,
    sourceReference: rule?.sourceReference || null,
    configuredRate: rule?.rate ?? null,
    taxAmount: null,
    taxCalculationStatus: status
  };
}

function vatTreatmentOf(input: ClassificationInput): string {
  if (input.userVatTreatment) return String(input.userVatTreatment);
  return String(input.vatSupplyTreatment || 'ACCOUNTANT_REVIEW');
}

/**
 * Classify a transaction for tax metadata. Never computes taxAmount.
 */
export function buildTaxClassification(input: ClassificationInput): BuiltTaxClassification {
  const reviewReasons: string[] = [];
  const vatTreatment = vatTreatmentOf(input);
  const rentalTaxTreatment = normalizeRentalTaxRegime(input.rentalTaxTreatment || input.rentalTaxRegime);
  const rentalTaxRegime = normalizeRentalTaxRegime(input.rentalTaxRegime);
  const registered = isCompanyVatRegisteredOnDate(
    {
      vatRegistered: input.vatRegistered,
      vatRegistrationEffectiveDate: input.vatRegistrationEffectiveDate,
      vatRegistrationCancelledAt: input.vatRegistrationCancelledAt
    },
    input.transactionDate
  );

  if (!input.propertyUseClass) reviewReasons.push('MISSING_PROPERTY_TAX_CLASSIFICATION');
  if (!input.vatSupplyTreatment || vatTreatment === 'ACCOUNTANT_REVIEW') reviewReasons.push('VAT_REVIEW_REQUIRED');
  if (rentalTaxTreatment === 'ACCOUNTANT_REVIEW' || rentalTaxRegime === 'ACCOUNTANT_REVIEW') {
    reviewReasons.push('TAX_TREATMENT_REVIEW_REQUIRED');
  }

  const taxTypesRelevant: string[] = [];
  const taxRuleReferences: TaxRuleReference[] = [];
  let source: TaxClassificationSource = input.propertyUseClass ? 'PROPERTY_PROFILE' : 'LANDLORD_PROFILE';
  if (input.userVatTreatment || input.userDeductibility || input.userCapitalOrRevenue) source = 'USER_SELECTED';

  let vatStatus: TaxCalculationStatus = 'NOT_CALCULATED';
  let rentalStatus: TaxCalculationStatus = 'NOT_CALCULATED';
  let deductibility = input.userDeductibility || null;
  let capitalOrRevenue = input.userCapitalOrRevenue || null;

  if (input.sourceKind === 'PAYMENT_DEPOSIT' || input.sourceKind === 'LIABILITY') {
    vatStatus = 'NOT_APPLICABLE';
    rentalStatus = 'NOT_APPLICABLE';
    deductibility = 'NOT_APPLICABLE';
    capitalOrRevenue = capitalOrRevenue || 'ACCOUNTANT_REVIEW';
    source = 'ACCOUNTANT_REVIEW';
    reviewReasons.length = 0;
  } else if (input.sourceKind === 'CAPITAL') {
    taxTypesRelevant.push('INCOME_TAX');
    vatStatus = registered && vatTreatment === 'STANDARD_TAXABLE' ? 'READY_FOR_CALCULATION' : registered ? 'NOT_CALCULATED' : 'NOT_APPLICABLE';
    rentalStatus = 'NOT_APPLICABLE';
    deductibility = deductibility || 'CAPITAL';
    capitalOrRevenue = 'CAPITAL';
    if (registered) {
      taxTypesRelevant.unshift('VAT');
      taxRuleReferences.push(ruleRef('VAT', input.vatRule, vatStatus));
      if (!input.vatRule) reviewReasons.push('TAX_RULE_UNAVAILABLE');
    }
    taxRuleReferences.push(ruleRef('INCOME_TAX', input.incomeTaxRule, 'REVIEW_REQUIRED'));
    if (!input.incomeTaxRule) reviewReasons.push('TAX_RULE_UNAVAILABLE');
  } else if (input.sourceKind === 'PAYMENT_RENT' || input.sourceKind === 'OTHER_INCOME') {
    if (registered) {
      taxTypesRelevant.push('VAT');
      if (vatTreatment === 'ACCOUNTANT_REVIEW') vatStatus = 'REVIEW_REQUIRED';
      else if (vatTreatment === 'STANDARD_TAXABLE') vatStatus = 'READY_FOR_CALCULATION';
      else vatStatus = 'NOT_APPLICABLE';
      taxRuleReferences.push(ruleRef('VAT', input.vatRule, vatStatus));
      if (vatStatus === 'READY_FOR_CALCULATION' && !input.vatRule) reviewReasons.push('TAX_RULE_UNAVAILABLE');
    } else {
      vatStatus = 'NOT_APPLICABLE';
    }

    if (rentalTaxTreatment === 'PRESUMPTIVE_RENTAL' || rentalTaxRegime === 'PRESUMPTIVE_RENTAL') {
      taxTypesRelevant.push('PRESUMPTIVE_RENTAL_INCOME_TAX');
      rentalStatus = 'READY_FOR_CALCULATION';
      taxRuleReferences.push(ruleRef('PRESUMPTIVE_RENTAL_INCOME_TAX', input.presumptiveRule, rentalStatus));
      if (!input.presumptiveRule) reviewReasons.push('TAX_RULE_UNAVAILABLE');
    } else if (rentalTaxTreatment === 'SELF_ASSESSMENT' || rentalTaxRegime === 'SELF_ASSESSMENT') {
      taxTypesRelevant.push('INCOME_TAX');
      rentalStatus = 'READY_FOR_CALCULATION';
      taxRuleReferences.push(ruleRef('INCOME_TAX', input.incomeTaxRule, 'READY_FOR_CALCULATION'));
      if (!input.incomeTaxRule) reviewReasons.push('TAX_RULE_UNAVAILABLE');
    } else if (rentalTaxTreatment === 'EXEMPT' || rentalTaxTreatment === 'NOT_APPLICABLE') {
      rentalStatus = 'NOT_APPLICABLE';
    } else {
      rentalStatus = 'REVIEW_REQUIRED';
      taxTypesRelevant.push('PRESUMPTIVE_RENTAL_INCOME_TAX');
      taxTypesRelevant.push('INCOME_TAX');
      taxRuleReferences.push(ruleRef('INCOME_TAX', input.incomeTaxRule, 'REVIEW_REQUIRED'));
    }
    deductibility = deductibility || 'NOT_APPLICABLE';
    capitalOrRevenue = capitalOrRevenue || 'REVENUE';
  } else {
    if (registered && vatTreatment !== 'NO_VAT') {
      taxTypesRelevant.push('VAT');
      if (vatTreatment === 'ACCOUNTANT_REVIEW' || !input.userVatTreatment) vatStatus = 'REVIEW_REQUIRED';
      else if (vatTreatment === 'STANDARD_TAXABLE' || vatTreatment === 'VAT_INCLUSIVE' || vatTreatment === 'VAT_EXCLUSIVE') {
        vatStatus = 'READY_FOR_CALCULATION';
      } else vatStatus = 'NOT_APPLICABLE';
      taxRuleReferences.push(ruleRef('VAT', input.vatRule, vatStatus));
    } else {
      vatStatus = 'NOT_APPLICABLE';
    }
    taxTypesRelevant.push('INCOME_TAX');
    taxRuleReferences.push(ruleRef('INCOME_TAX', input.incomeTaxRule, deductibility === 'DEDUCTIBLE' ? 'READY_FOR_CALCULATION' : 'REVIEW_REQUIRED'));
    rentalStatus = 'NOT_APPLICABLE';
    deductibility = deductibility || 'ACCOUNTANT_REVIEW';
    capitalOrRevenue = capitalOrRevenue || 'REVENUE';
    if (deductibility === 'ACCOUNTANT_REVIEW') reviewReasons.push('MISSING_EXPENSE_CLASSIFICATION');
  }

  const statuses = [vatStatus, rentalStatus];
  let taxCalculationStatus: TaxCalculationStatus = 'NOT_CALCULATED';
  if (statuses.every((s) => s === 'NOT_APPLICABLE')) taxCalculationStatus = 'NOT_APPLICABLE';
  else if (statuses.includes('REVIEW_REQUIRED') || reviewReasons.length) taxCalculationStatus = 'REVIEW_REQUIRED';
  else if (statuses.includes('READY_FOR_CALCULATION')) taxCalculationStatus = 'READY_FOR_CALCULATION';
  else taxCalculationStatus = 'NOT_CALCULATED';

  return {
    taxTypesRelevant: Array.from(new Set(taxTypesRelevant)),
    taxRuleReferences,
    taxProfileSnapshot: {
      vatRegistered: registered,
      vatNumber: input.vatNumber || '',
      rentalTaxRegime,
      incomeTaxRegistered: Boolean(input.incomeTaxRegistered),
      propertyUseClass: input.propertyUseClass || null,
      vatSupplyTreatment: (input.vatSupplyTreatment || 'ACCOUNTANT_REVIEW') as VatSupplyTreatment,
      rentalTaxTreatment,
      ownerProfileVersion: Number(input.ownerProfileVersion || 1),
      propertyUpdatedAt: input.propertyUpdatedAt || null
    },
    vatTreatment,
    rentalTaxTreatment,
    rentalTaxRegime,
    deductibility,
    capitalOrRevenue,
    classificationSource: source,
    classificationStatus: taxCalculationStatus,
    taxCalculationStatus,
    reviewReasons: Array.from(new Set(reviewReasons)),
    ...uncalculatedTaxFields()
  };
}
