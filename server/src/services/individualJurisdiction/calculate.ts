import { roundMoney } from '../../utils/money';
import {
  STANDARD_VAT_PERCENT_BEFORE_2026,
  STANDARD_VAT_PERCENT_FROM_2026,
  VAT_RATE_CHANGE_2026
} from '../tax/vatCalculation';
import {
  SA_PROVISIONAL,
  SA_TAX_YEAR_2027,
  SA_TURNOVER_TAX_2027,
  SA_VAT,
  ZW_AIDS_LEVY_PERCENT,
  type JurisdictionCode
} from './publishedRules';

export type EstimateStatus = 'ESTIMATE' | 'NOT_APPLICABLE' | 'REVIEW_REQUIRED' | 'NOT_ENABLED' | 'USER_CONFIGURED';

export type TaxEstimateLine = {
  code: string;
  name: string;
  jurisdiction: JurisdictionCode;
  status: EstimateStatus;
  currency: string;
  baseAmount: number | null;
  rate: number | null;
  amount: number | null;
  verified: boolean;
  sourceReference: string | null;
  reviewReasons: string[];
  notes: string[];
};

export type GlobalTaxInput = {
  id?: string;
  enabled?: boolean;
  name?: string;
  category?: string;
  rate?: number | null;
  method?: 'PERCENT_OF_GROSS' | 'PERCENT_OF_NET' | 'FIXED' | 'PROGRESSIVE';
  inclusive?: boolean;
  brackets?: Array<{ upTo: number | null; base: number; above: number; rate: number }>;
  currency?: string;
  effectiveFrom?: string | null;
  filingFrequency?: string;
  filingDeadline?: string;
  paymentDeadline?: string;
};

export type JurisdictionEstimateInput = {
  asOf: Date;
  currency: string;
  taxJurisdiction: JurisdictionCode;
  countryOfResidence?: string | null;
  taxResidencyCountry?: string | null;
  propertyLocationCountry?: string | null;
  propertyJurisdiction: JurisdictionCode;
  residencyJurisdiction: JurisdictionCode;
  enabledTaxes: string[];
  rentalIncome: number;
  allowableExpenses: number;
  nonDeductibleExpenses?: number;
  privateExpenses?: number;
  capitalExpenses?: number;
  rentedPortionPercent?: number;
  propertyUseClass?: string | null;
  tenancyUse?: 'RESIDENTIAL' | 'COMMERCIAL' | 'MIXED' | 'UNKNOWN';
  rentalTaxRegime?: string | null;
  incomeTaxRegistered?: boolean;
  incomeTaxRegistrationDate?: string | null;
  vatRegistered?: boolean;
  vatNumber?: string | null;
  taxableSupplies?: number | null;
  otherAnnualTaxableIncome?: number | null;
  ageCategory?: 'UNDER_65' | 'AGE_65' | 'AGE_75' | null;
  extraRebate?: number | null;
  carriesOnBusiness?: boolean;
  turnoverTaxElected?: boolean;
  turnoverTaxEligibilityConfirmed?: boolean;
  taxableTurnover?: number | null;
  ringFencingDoesNotApply?: boolean;
  priorResidentialLossYears?: number | null;
  globalTaxes?: GlobalTaxInput[];
  mixedCurrency?: boolean;
};

export type JurisdictionEstimate = {
  estimate: true;
  filingSubmitted: false;
  paymentSubmitted: false;
  complianceCertified: false;
  currency: string;
  taxJurisdiction: JurisdictionCode;
  propertyJurisdiction: JurisdictionCode;
  residencyJurisdiction: JurisdictionCode;
  crossBorderReview: boolean;
  rentalProfit: number | null;
  lines: TaxEstimateLine[];
  deadlines: Array<{ tax: string; description: string }>;
  disclaimer: string;
};

const DISCLAIMER = 'These figures are estimates from the records and tax settings in Mantis. They are not a tax assessment, not tax advice, and Mantis does not submit returns or make tax payments.';

function line(partial: Omit<TaxEstimateLine, 'verified'> & { verified?: boolean }): TaxEstimateLine {
  return { verified: partial.verified ?? false, ...partial };
}

function enabled(input: JurisdictionEstimateInput, code: string): boolean {
  return input.enabledTaxes.includes(code);
}

function portion(input: JurisdictionEstimateInput): number {
  const raw = input.rentedPortionPercent == null ? 100 : Number(input.rentedPortionPercent);
  if (!Number.isFinite(raw)) return 1;
  return Math.min(100, Math.max(0, raw)) / 100;
}

function useOf(input: JurisdictionEstimateInput): 'RESIDENTIAL' | 'COMMERCIAL' | 'MIXED' | 'UNKNOWN' {
  if (input.tenancyUse && input.tenancyUse !== 'UNKNOWN') return input.tenancyUse;
  const use = String(input.propertyUseClass || '').toUpperCase();
  if (use === 'RESIDENTIAL_DWELLING' || use === 'SHORT_TERM_ACCOMMODATION') return 'RESIDENTIAL';
  if (use === 'COMMERCIAL') return 'COMMERCIAL';
  if (use === 'MIXED_USE') return 'MIXED';
  return 'UNKNOWN';
}

function onOrBefore(value: string | null | undefined, isoDay: string): boolean {
  if (!value) return false;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  return date.toISOString().slice(0, 10) <= isoDay;
}

function between(date: Date, from: Date, to: Date): boolean {
  const day = date.toISOString().slice(0, 10);
  return day >= from.toISOString().slice(0, 10) && day <= to.toISOString().slice(0, 10);
}

function progressive(amount: number, brackets: ReadonlyArray<{ upTo: number; base: number; above: number; rate: number }>): number {
  const taxable = Math.max(0, amount);
  const bracket = brackets.find((row) => taxable <= row.upTo) || brackets[brackets.length - 1];
  return roundMoney(bracket.base + Math.max(0, taxable - bracket.above) * bracket.rate);
}

function zwVatPercent(asOf: Date): number {
  return asOf >= VAT_RATE_CHANGE_2026 ? STANDARD_VAT_PERCENT_FROM_2026 : STANDARD_VAT_PERCENT_BEFORE_2026;
}

function rentalProfit(input: JurisdictionEstimateInput): number {
  const share = portion(input);
  const income = roundMoney(Number(input.rentalIncome || 0) * share);
  const allowable = roundMoney(Number(input.allowableExpenses || 0) * share);
  return roundMoney(income - allowable);
}

function continuingSelfAssessment(input: JurisdictionEstimateInput): boolean {
  return Boolean(input.incomeTaxRegistered) && onOrBefore(input.incomeTaxRegistrationDate, '2025-12-31') && input.rentalTaxRegime !== 'PRESUMPTIVE_RENTAL';
}

function zimbabwe(input: JurisdictionEstimateInput, profit: number): TaxEstimateLine[] {
  const currency = input.currency;
  const use = useOf(input);
  const lines: TaxEstimateLine[] = [];
  const share = portion(input);
  const gross = roundMoney(Number(input.rentalIncome || 0) * share);
  const continuing = continuingSelfAssessment(input);
  const explicitPresumptive = input.rentalTaxRegime === 'PRESUMPTIVE_RENTAL' && !continuing;
  const newRegistrable = !continuing && !onOrBefore(input.incomeTaxRegistrationDate, '2025-12-31');
  const commercialQualifies = use === 'COMMERCIAL' && (explicitPresumptive || (newRegistrable && input.asOf >= new Date(Date.UTC(2026, 0, 1))));
  const presumptiveOn = enabled(input, 'PRESUMPTIVE_RENTAL') || explicitPresumptive || commercialQualifies;
  const normalOn = enabled(input, 'NORMAL_INCOME_TAX') || input.rentalTaxRegime === 'SELF_ASSESSMENT' || continuing;

  if (input.mixedCurrency) {
    return [line({
      code: 'CURRENCY',
      name: 'Currency',
      jurisdiction: 'ZW',
      status: 'REVIEW_REQUIRED',
      currency,
      baseAmount: null,
      rate: null,
      amount: null,
      sourceReference: null,
      reviewReasons: ['CURRENCY_CONVERSION_REQUIRED'],
      notes: ['Amounts in different currencies were not added together.']
    })];
  }

  let presumptiveApplies = false;
  if (!presumptiveOn) {
    lines.push(line({
      code: 'PRESUMPTIVE_RENTAL', name: 'Presumptive rental income tax', jurisdiction: 'ZW', status: 'NOT_ENABLED',
      currency, baseAmount: null, rate: 15, amount: null, verified: true,
      sourceReference: 'ZIMRA Public Notice 08 of 2026',
      reviewReasons: [], notes: ['Turn this on only for qualifying commercial rental.']
    }));
  } else if (use === 'RESIDENTIAL') {
    lines.push(line({
      code: 'PRESUMPTIVE_RENTAL', name: 'Presumptive rental income tax', jurisdiction: 'ZW', status: 'NOT_APPLICABLE',
      currency, baseAmount: gross, rate: 15, amount: null, verified: true,
      sourceReference: 'ZIMRA Public Notice 08 of 2026',
      reviewReasons: ['RESIDENTIAL_EXCLUDED'],
      notes: ['Residential premises are excluded from presumptive rental income tax.']
    }));
  } else if (use === 'MIXED' || use === 'UNKNOWN') {
    lines.push(line({
      code: 'PRESUMPTIVE_RENTAL', name: 'Presumptive rental income tax', jurisdiction: 'ZW', status: 'REVIEW_REQUIRED',
      currency, baseAmount: null, rate: 15, amount: null, verified: true,
      sourceReference: 'ZIMRA Public Notice 08 of 2026',
      reviewReasons: [use === 'MIXED' ? 'MIXED_USE' : 'USE_NOT_CLASSIFIED'],
      notes: ['Presumptive rental income tax is not calculated until the commercial portion is known.']
    }));
  } else if (continuing) {
    lines.push(line({
      code: 'PRESUMPTIVE_RENTAL', name: 'Presumptive rental income tax', jurisdiction: 'ZW', status: 'NOT_APPLICABLE',
      currency, baseAmount: gross, rate: 15, amount: null, verified: true,
      sourceReference: 'ZIMRA Public Notice 08 of 2026',
      reviewReasons: ['TRANSITIONAL_SELF_ASSESSMENT'],
      notes: ['A taxpayer registered for self-assessment on or before 31 December 2025 stays on that arrangement. Presumptive tax is not also charged.']
    }));
  } else if (!commercialQualifies && input.rentalTaxRegime !== 'PRESUMPTIVE_RENTAL') {
    lines.push(line({
      code: 'PRESUMPTIVE_RENTAL', name: 'Presumptive rental income tax', jurisdiction: 'ZW', status: 'REVIEW_REQUIRED',
      currency, baseAmount: null, rate: 15, amount: null, verified: true,
      sourceReference: 'ZIMRA Public Notice 08 of 2026',
      reviewReasons: ['ELIGIBILITY_NOT_CONFIRMED'],
      notes: ['Presumptive rental income tax is not assumed for every landlord.']
    }));
  } else {
    presumptiveApplies = true;
    lines.push(line({
      code: 'PRESUMPTIVE_RENTAL', name: 'Presumptive rental income tax', jurisdiction: 'ZW', status: 'ESTIMATE',
      currency, baseAmount: gross, rate: 15, amount: roundMoney(gross * 0.15), verified: true,
      sourceReference: 'ZIMRA Public Notice 08 of 2026',
      reviewReasons: [],
      notes: ['Estimate of 15% of qualifying gross commercial rental. Expenses are not deducted. This is a final-tax estimate, not a ZIMRA assessment.']
    }));
  }

  if (presumptiveApplies) {
    lines.push(line({
      code: 'NORMAL_INCOME_TAX', name: 'Normal income tax', jurisdiction: 'ZW', status: 'NOT_APPLICABLE',
      currency, baseAmount: profit, rate: 25, amount: null, verified: true,
      sourceReference: 'ZIMRA — income of an individual from trade and investments',
      reviewReasons: ['PRESUMPTIVE_IS_FINAL'],
      notes: ['The same rental income is not taxed again under normal income tax.']
    }));
  } else if (!normalOn) {
    lines.push(line({
      code: 'NORMAL_INCOME_TAX', name: 'Normal income tax', jurisdiction: 'ZW', status: 'REVIEW_REQUIRED',
      currency, baseAmount: null, rate: 25, amount: null, verified: true,
      sourceReference: 'ZIMRA — income of an individual from trade and investments',
      reviewReasons: ['REGIME_NOT_CONFIRMED'],
      notes: ['The 25% trade and investment rate is not applied until self-assessment applies. It is not assumed for every landlord.']
    }));
  } else if (profit < 0) {
    lines.push(line({
      code: 'NORMAL_INCOME_TAX', name: 'Normal income tax', jurisdiction: 'ZW', status: 'ESTIMATE',
      currency, baseAmount: profit, rate: 25, amount: 0, verified: true,
      sourceReference: 'ZIMRA — income of an individual from trade and investments',
      reviewReasons: [],
      notes: ['Taxable rental profit is below zero, so this estimate of tax on that profit is zero.']
    }));
  } else {
    const tax = roundMoney(Math.max(0, profit) * 0.25);
    const aids = roundMoney(tax * (ZW_AIDS_LEVY_PERCENT / 100));
    lines.push(line({
      code: 'NORMAL_INCOME_TAX', name: 'Normal income tax', jurisdiction: 'ZW', status: 'ESTIMATE',
      currency, baseAmount: profit, rate: 25, amount: tax, verified: true,
      sourceReference: 'Finance Act — 25% on taxable income of an individual from trade and investments, from the 2024 year of assessment',
      reviewReasons: [],
      notes: ['Estimate only. Taxable rental profit is rental income minus allowable expenses. The 25% rate does not include the AIDS levy.']
    }));
    lines.push(line({
      code: 'AIDS_LEVY', name: 'AIDS levy', jurisdiction: 'ZW', status: 'ESTIMATE',
      currency, baseAmount: tax, rate: ZW_AIDS_LEVY_PERCENT, amount: aids, verified: true,
      sourceReference: 'AIDS levy of 3% on income tax chargeable',
      reviewReasons: [],
      notes: ['Estimate of the 3% AIDS levy on the estimated tax chargeable. It is not included in the 25% rate.']
    }));
  }

  const vatOn = enabled(input, 'VAT') || Boolean(input.vatRegistered);
  if (!vatOn) {
    lines.push(line({
      code: 'VAT', name: 'VAT', jurisdiction: 'ZW', status: 'NOT_ENABLED',
      currency, baseAmount: null, rate: zwVatPercent(input.asOf), amount: null, verified: true,
      sourceReference: 'Zimbabwe VAT rate table',
      reviewReasons: [], notes: ['VAT is off until the landlord is registered or turns it on.']
    }));
  } else if (!input.vatRegistered) {
    lines.push(line({
      code: 'VAT', name: 'VAT', jurisdiction: 'ZW', status: 'NOT_APPLICABLE',
      currency, baseAmount: gross, rate: zwVatPercent(input.asOf), amount: null, verified: true,
      sourceReference: 'Zimbabwe VAT rate table',
      reviewReasons: [], notes: ['Output VAT is not calculated for a landlord who is not VAT registered.']
    }));
  } else if (use !== 'COMMERCIAL') {
    lines.push(line({
      code: 'VAT', name: 'VAT', jurisdiction: 'ZW', status: 'REVIEW_REQUIRED',
      currency, baseAmount: null, rate: zwVatPercent(input.asOf), amount: null, verified: true,
      sourceReference: 'Zimbabwe VAT Act — rental supplies are not automatically taxable',
      reviewReasons: ['SUPPLY_NOT_CONFIRMED'],
      notes: ['Residential and unclassified rentals are not treated as standard-rated. Presumptive tax does not switch VAT off.']
    }));
  } else {
    const rate = zwVatPercent(input.asOf);
    lines.push(line({
      code: 'VAT', name: 'VAT', jurisdiction: 'ZW', status: 'ESTIMATE',
      currency, baseAmount: gross, rate, amount: roundMoney(gross * (rate / 100)), verified: true,
      sourceReference: rate === STANDARD_VAT_PERCENT_FROM_2026
        ? 'Standard Zimbabwe VAT of 15.5% from 1 January 2026'
        : 'Standard Zimbabwe VAT before 1 January 2026',
      reviewReasons: [],
      notes: ['Estimate of output VAT on commercial rental where the landlord is VAT registered. This is not a VAT return.']
    }));
  }
  return lines;
}

function saRebates(input: JurisdictionEstimateInput): { amount: number; notes: string[] } {
  const notes = ['Primary rebate for the 2027 tax year is R17,820.'];
  let amount = SA_TAX_YEAR_2027.rebates.primary;
  if (input.ageCategory === 'AGE_65' || input.ageCategory === 'AGE_75') {
    amount += SA_TAX_YEAR_2027.rebates.secondary;
    notes.push('Secondary rebate of R9,765 is included because the age category is 65 or older.');
  }
  if (input.ageCategory === 'AGE_75') {
    amount += SA_TAX_YEAR_2027.rebates.tertiary;
    notes.push('Tertiary rebate of R3,249 is included because the age category is 75 or older.');
  }
  if (!input.ageCategory) notes.push('Age category was not provided, so only the primary rebate is used.');
  if (input.extraRebate && input.extraRebate > 0) {
    amount += Number(input.extraRebate);
    notes.push('An extra rebate entered by the owner was included and has not been verified against SARS medical credits.');
  }
  return { amount: roundMoney(amount), notes };
}

function saTaxAfterRebates(taxableIncome: number, rebate: number): number {
  return roundMoney(Math.max(0, progressive(taxableIncome, SA_TAX_YEAR_2027.brackets) - rebate));
}

function southAfrica(input: JurisdictionEstimateInput, profit: number): TaxEstimateLine[] {
  const currency = input.currency || 'ZAR';
  const use = useOf(input);
  const lines: TaxEstimateLine[] = [];
  const inYear = between(input.asOf, SA_TAX_YEAR_2027.effectiveFrom, SA_TAX_YEAR_2027.effectiveTo);
  const gross = roundMoney(Number(input.rentalIncome || 0) * portion(input));

  lines.push(line({
    code: 'RENTAL_PROFIT', name: 'Rental profit', jurisdiction: 'ZA', status: 'ESTIMATE',
    currency, baseAmount: profit, rate: null, amount: profit, verified: true,
    sourceReference: 'SARS — rental income and allowable expenses',
    reviewReasons: [],
    notes: [
      'Rental profit is the rented portion of rental income minus allowable rental expenses.',
      'Capital, private and non-deductible amounts are not deducted.',
      'This profit is not the owner’s final tax.'
    ]
  }));

  const turnover = Boolean(input.turnoverTaxElected && input.turnoverTaxEligibilityConfirmed);
  if (input.turnoverTaxElected && !input.turnoverTaxEligibilityConfirmed) {
    lines.push(line({
      code: 'TURNOVER_TAX', name: 'Turnover tax', jurisdiction: 'ZA', status: 'REVIEW_REQUIRED',
      currency, baseAmount: null, rate: null, amount: null, verified: true,
      sourceReference: SA_TURNOVER_TAX_2027.sourceReference,
      reviewReasons: ['ELIGIBILITY_NOT_CONFIRMED'],
      notes: ['Turnover tax is not applied until the owner confirms they qualify and have elected it.']
    }));
  } else if (!turnover) {
    lines.push(line({
      code: 'TURNOVER_TAX', name: 'Turnover tax', jurisdiction: 'ZA', status: 'NOT_ENABLED',
      currency, baseAmount: null, rate: null, amount: null, verified: true,
      sourceReference: SA_TURNOVER_TAX_2027.sourceReference,
      reviewReasons: [], notes: ['Turnover tax stays off for an ordinary rental landlord.']
    }));
  } else if (!inYear || input.taxableTurnover == null) {
    lines.push(line({
      code: 'TURNOVER_TAX', name: 'Turnover tax', jurisdiction: 'ZA', status: 'REVIEW_REQUIRED',
      currency, baseAmount: input.taxableTurnover ?? null, rate: null, amount: null, verified: true,
      sourceReference: SA_TURNOVER_TAX_2027.sourceReference,
      reviewReasons: [inYear ? 'TURNOVER_MISSING' : 'TAX_YEAR_NOT_COVERED'],
      notes: ['Enter taxable turnover for the 2027 year of assessment. Confirm the micro-business ceiling with SARS.']
    }));
  } else {
    const amount = progressive(Number(input.taxableTurnover), SA_TURNOVER_TAX_2027.brackets);
    lines.push(line({
      code: 'TURNOVER_TAX', name: 'Turnover tax', jurisdiction: 'ZA', status: 'ESTIMATE',
      currency, baseAmount: roundMoney(input.taxableTurnover), rate: null, amount, verified: true,
      sourceReference: SA_TURNOVER_TAX_2027.sourceReference,
      reviewReasons: [],
      notes: ['Estimate under the published turnover-tax table. It replaces normal income tax on the same turnover in this estimate. Confirm eligibility with SARS.']
    }));
  }

  const personalOn = enabled(input, 'PERSONAL_INCOME_TAX') || input.enabledTaxes.length === 0;
  if (turnover && input.taxableTurnover != null && inYear) {
    lines.push(line({
      code: 'PERSONAL_INCOME_TAX', name: 'Indicative personal income tax', jurisdiction: 'ZA', status: 'NOT_APPLICABLE',
      currency, baseAmount: null, rate: null, amount: null, verified: true,
      sourceReference: SA_TAX_YEAR_2027.sourceReference,
      reviewReasons: ['TURNOVER_TAX_ELECTED'],
      notes: ['Normal income tax is not also estimated on turnover that is taxed under the turnover-tax election.']
    }));
  } else if (!personalOn) {
    lines.push(line({
      code: 'PERSONAL_INCOME_TAX', name: 'Indicative personal income tax', jurisdiction: 'ZA', status: 'NOT_ENABLED',
      currency, baseAmount: null, rate: null, amount: null, verified: true,
      sourceReference: SA_TAX_YEAR_2027.sourceReference, reviewReasons: [], notes: []
    }));
  } else if (!inYear) {
    lines.push(line({
      code: 'PERSONAL_INCOME_TAX', name: 'Indicative personal income tax', jurisdiction: 'ZA', status: 'REVIEW_REQUIRED',
      currency, baseAmount: profit, rate: null, amount: null, verified: true,
      sourceReference: SA_TAX_YEAR_2027.sourceReference,
      reviewReasons: ['TAX_YEAR_NOT_COVERED'],
      notes: ['The stored SARS brackets cover 1 March 2026 to 28 February 2027. They are not applied outside that year.']
    }));
  } else if (input.otherAnnualTaxableIncome == null) {
    lines.push(line({
      code: 'PERSONAL_INCOME_TAX', name: 'Indicative personal income tax', jurisdiction: 'ZA', status: 'REVIEW_REQUIRED',
      currency, baseAmount: profit, rate: null, amount: null, verified: true,
      sourceReference: SA_TAX_YEAR_2027.sourceReference,
      reviewReasons: ['OTHER_INCOME_NOT_PROVIDED'],
      notes: ['Rental profit is not multiplied by one tax rate. Add other annual taxable income to estimate the incremental tax.']
    }));
  } else {
    const other = Math.max(0, Number(input.otherAnnualTaxableIncome));
    const residentialLoss = profit < 0 && (use === 'RESIDENTIAL' || use === 'MIXED' || use === 'UNKNOWN');
    const atTop = other > SA_TAX_YEAR_2027.topThreshold;
    const repeatedLoss = Number(input.priorResidentialLossYears || 0) >= 3;
    const ringFence = residentialLoss && !input.ringFencingDoesNotApply && (atTop || repeatedLoss || use === 'RESIDENTIAL' || use === 'MIXED' || use === 'UNKNOWN');
    const combined = ringFence ? other : other + profit;
    const rebates = saRebates(input);
    const taxWithout = saTaxAfterRebates(other, rebates.amount);
    const taxWith = saTaxAfterRebates(Math.max(0, combined), rebates.amount);
    const reasons = ringFence ? ['RENTAL_LOSS_RING_FENCED'] : [];
    lines.push(line({
      code: 'PERSONAL_INCOME_TAX', name: 'Indicative personal income tax', jurisdiction: 'ZA', status: 'ESTIMATE',
      currency, baseAmount: roundMoney(Math.max(0, combined)), rate: null, amount: roundMoney(taxWith - taxWithout), verified: true,
      sourceReference: SA_TAX_YEAR_2027.sourceReference,
      reviewReasons: reasons,
      notes: [
        'This is the difference between tax on other income and tax on other income plus rental profit, after the applicable rebates.',
        'It is not a SARS assessment.',
        ...rebates.notes,
        ...(ringFence ? ['The rental loss is ring-fenced for this estimate and is not set off against other income. Section 20A can apply to residential letting.'] : [])
      ]
    }));
  }

  const thresholdDate = input.asOf >= SA_VAT.thresholdChange;
  const compulsory = thresholdDate ? SA_VAT.compulsoryThresholdFromApril2026 : SA_VAT.compulsoryThresholdBeforeApril2026;
  const voluntary = thresholdDate ? SA_VAT.voluntaryThresholdFromApril2026 : SA_VAT.voluntaryThresholdBeforeApril2026;
  const supplies = input.taxableSupplies == null ? null : Number(input.taxableSupplies);
  if (!enabled(input, 'VAT') && !input.vatRegistered) {
    lines.push(line({
      code: 'VAT', name: 'VAT', jurisdiction: 'ZA', status: 'NOT_ENABLED',
      currency, baseAmount: supplies, rate: SA_VAT.standardPercent, amount: null, verified: true,
      sourceReference: SA_VAT.sourceReference, reviewReasons: [],
      notes: [`Compulsory registration is above R${compulsory.toLocaleString('en-ZA')}. Voluntary registration is above R${voluntary.toLocaleString('en-ZA')}. Residential accommodation is generally exempt.`]
    }));
  } else if (use === 'RESIDENTIAL') {
    lines.push(line({
      code: 'VAT', name: 'VAT', jurisdiction: 'ZA', status: 'NOT_APPLICABLE',
      currency, baseAmount: gross, rate: SA_VAT.standardPercent, amount: 0, verified: true,
      sourceReference: 'VAT Act — supply of residential accommodation is generally exempt',
      reviewReasons: [],
      notes: ['No output VAT is estimated on exempt residential accommodation. Input tax cannot be claimed against that exempt supply.']
    }));
  } else if (use === 'MIXED' || use === 'UNKNOWN') {
    lines.push(line({
      code: 'VAT', name: 'VAT', jurisdiction: 'ZA', status: 'REVIEW_REQUIRED',
      currency, baseAmount: null, rate: SA_VAT.standardPercent, amount: null, verified: true,
      sourceReference: SA_VAT.sourceReference,
      reviewReasons: ['SUPPLY_NOT_CONFIRMED'],
      notes: ['VAT is not calculated until the taxable and exempt portions are known.']
    }));
  } else if (!input.vatRegistered) {
    const overCompulsory = supplies != null && supplies > compulsory;
    lines.push(line({
      code: 'VAT', name: 'VAT', jurisdiction: 'ZA', status: overCompulsory ? 'REVIEW_REQUIRED' : 'NOT_APPLICABLE',
      currency, baseAmount: supplies, rate: SA_VAT.standardPercent, amount: null, verified: true,
      sourceReference: SA_VAT.sourceReference,
      reviewReasons: overCompulsory ? ['REGISTRATION_THRESHOLD'] : [],
      notes: [overCompulsory
        ? `Taxable supplies are above the compulsory registration threshold of R${compulsory.toLocaleString('en-ZA')}. VAT is not charged in this estimate because the landlord is not registered.`
        : `Voluntary registration is available above R${voluntary.toLocaleString('en-ZA')} but is not turned on automatically.`]
    }));
  } else {
    lines.push(line({
      code: 'VAT', name: 'VAT', jurisdiction: 'ZA', status: 'ESTIMATE',
      currency, baseAmount: gross, rate: SA_VAT.standardPercent, amount: roundMoney(gross * 0.15), verified: true,
      sourceReference: SA_VAT.sourceReference,
      reviewReasons: [],
      notes: ['Estimate of 15% output VAT on commercial rental for a registered vendor. This is not a VAT201.']
    }));
  }

  const rentalForProvisional = Math.max(0, profit);
  const underRentalExemption = rentalForProvisional <= SA_PROVISIONAL.rentalExemption && !input.carriesOnBusiness;
  const other = input.otherAnnualTaxableIncome;
  const threshold = input.ageCategory === 'AGE_75'
    ? SA_TAX_YEAR_2027.thresholds.age75
    : input.ageCategory === 'AGE_65'
      ? SA_TAX_YEAR_2027.thresholds.age65
      : SA_TAX_YEAR_2027.thresholds.under65;
  const underThreshold = other != null && (other + Math.max(0, profit)) <= threshold && !input.carriesOnBusiness;
  let provisionalStatus: EstimateStatus = 'REVIEW_REQUIRED';
  let provisionalNote = 'Provisional tax is not assumed for every landlord.';
  const provisionalReasons: string[] = [];
  if (!enabled(input, 'PROVISIONAL_TAX') && other == null && !input.carriesOnBusiness && rentalForProvisional <= SA_PROVISIONAL.rentalExemption) {
    provisionalStatus = 'NOT_ENABLED';
    provisionalNote = 'Provisional tax is off. The rental amount is within the R30,000 exemption if no other business is carried on, but other income was not entered.';
  } else if (underThreshold || underRentalExemption) {
    provisionalStatus = 'NOT_APPLICABLE';
    provisionalNote = underThreshold
      ? 'Estimated taxable income is within the tax threshold and no business was indicated, so provisional tax is not estimated.'
      : 'Rental income is R30,000 or less and no business was indicated, so the provisional-tax exemption may apply.';
  } else if (other == null) {
    provisionalReasons.push('OTHER_INCOME_NOT_PROVIDED');
    provisionalNote = 'Other taxable income is needed before provisional tax can be treated as required.';
  } else {
    provisionalStatus = 'ESTIMATE';
    provisionalNote = `Rental and other income indicate that provisional tax may apply. The first estimate is generally due on ${SA_PROVISIONAL.firstDue} and the second on the ${SA_PROVISIONAL.secondDue}. Mantis does not submit it.`;
  }
  lines.push(line({
    code: 'PROVISIONAL_TAX', name: 'Provisional tax', jurisdiction: 'ZA', status: provisionalStatus,
    currency, baseAmount: other == null ? null : roundMoney(other + Math.max(0, profit)), rate: null, amount: null, verified: true,
    sourceReference: SA_PROVISIONAL.sourceReference,
    reviewReasons: provisionalReasons,
    notes: [provisionalNote]
  }));
  return lines;
}

function globalTaxes(input: JurisdictionEstimateInput, profit: number): TaxEstimateLine[] {
  const configs = input.globalTaxes || [];
  if (!configs.length) {
    return [line({
      code: 'GLOBAL_SETUP', name: 'Tax setup', jurisdiction: 'GLOBAL', status: 'REVIEW_REQUIRED',
      currency: input.currency, baseAmount: null, rate: null, amount: null, verified: false,
      sourceReference: null,
      reviewReasons: ['NO_USER_TAX_CONFIGURED'],
      notes: ['No country tax pack is stored for this country. Add the taxes that apply. Rates you enter are marked User configured and are not independently verified.']
    })];
  }
  return configs.map((tax) => {
    const name = tax.name || tax.category || 'Configured tax';
    if (tax.enabled === false) {
      return line({
        code: tax.category || 'OTHER', name, jurisdiction: 'GLOBAL', status: 'NOT_ENABLED',
        currency: tax.currency || input.currency, baseAmount: null, rate: tax.rate ?? null, amount: null, verified: false,
        sourceReference: null, reviewReasons: [], notes: ['This tax is turned off.']
      });
    }
    const method = tax.method || 'PERCENT_OF_NET';
    const gross = roundMoney(Number(input.rentalIncome || 0) * portion(input));
    const base = method === 'PERCENT_OF_GROSS' || method === 'FIXED' ? gross : profit;
    if (method === 'PROGRESSIVE') {
      if (!tax.brackets?.length) {
        return line({
          code: tax.category || 'OTHER', name, jurisdiction: 'GLOBAL', status: 'USER_CONFIGURED',
          currency: tax.currency || input.currency, baseAmount: null, rate: null, amount: null, verified: false,
          sourceReference: null, reviewReasons: ['BRACKETS_MISSING'],
          notes: ['User configured. Add the brackets before an estimate is shown.']
        });
      }
      return line({
        code: tax.category || 'OTHER', name, jurisdiction: 'GLOBAL', status: 'USER_CONFIGURED',
        currency: tax.currency || input.currency, baseAmount: Math.max(0, profit), rate: null,
        amount: progressive(Math.max(0, profit), tax.brackets.map((row) => ({ ...row, upTo: row.upTo ?? Number.POSITIVE_INFINITY }))),
        verified: false, sourceReference: null, reviewReasons: ['USER_CONFIGURED_UNVERIFIED'],
        notes: ['User configured. This rate has not been independently verified. The result is an estimate.']
      });
    }
    if (tax.rate == null || !Number.isFinite(Number(tax.rate))) {
      return line({
        code: tax.category || 'OTHER', name, jurisdiction: 'GLOBAL', status: 'USER_CONFIGURED',
        currency: tax.currency || input.currency, baseAmount: null, rate: null, amount: null, verified: false,
        sourceReference: null, reviewReasons: ['RATE_MISSING'],
        notes: ['User configured. Enter the rate that applies. Mantis does not invent one.']
      });
    }
    const rate = Number(tax.rate);
    let amount = method === 'FIXED' ? roundMoney(rate) : roundMoney(Math.max(0, base) * (rate / 100));
    if (tax.inclusive && method !== 'FIXED' && rate > 0) {
      amount = roundMoney(Math.max(0, base) - Math.max(0, base) / (1 + rate / 100));
    }
    return line({
      code: tax.category || 'OTHER', name, jurisdiction: 'GLOBAL', status: 'USER_CONFIGURED',
      currency: tax.currency || input.currency, baseAmount: base, rate, amount, verified: false,
      sourceReference: null, reviewReasons: ['USER_CONFIGURED_UNVERIFIED'],
      notes: ['User configured. This rate has not been independently verified. The result is an estimate.']
    });
  });
}

export function calculateJurisdictionEstimate(input: JurisdictionEstimateInput): JurisdictionEstimate {
  const profit = input.mixedCurrency ? null : rentalProfit(input);
  const crossBorder = input.propertyJurisdiction !== input.residencyJurisdiction;
  const propertyEngine = input.propertyJurisdiction;
  let lines: TaxEstimateLine[] = [];
  if (input.mixedCurrency) {
    lines = [line({
      code: 'CURRENCY', name: 'Currency', jurisdiction: propertyEngine, status: 'REVIEW_REQUIRED',
      currency: input.currency, baseAmount: null, rate: null, amount: null,
      sourceReference: null, reviewReasons: ['CURRENCY_CONVERSION_REQUIRED'],
      notes: ['Amounts in different currencies were not added. Provide an exchange rate and keep the original amounts.']
    })];
  } else if (propertyEngine === 'ZW') lines = zimbabwe(input, profit || 0);
  else if (propertyEngine === 'ZA') lines = southAfrica(input, profit || 0);
  else lines = globalTaxes(input, profit || 0);

  if (crossBorder) {
    lines.unshift(line({
      code: 'CROSS_BORDER', name: 'Cross-border review', jurisdiction: input.residencyJurisdiction, status: 'REVIEW_REQUIRED',
      currency: input.currency, baseAmount: null, rate: null, amount: null,
      sourceReference: null, reviewReasons: ['CROSS_BORDER'],
      notes: ['Tax residency and the property country are different. Property-country taxes above are separate from residency-country tax, which is not calculated automatically.']
    }));
  }

  const deadlines = propertyEngine === 'ZW'
    ? [
      { tax: 'VAT', description: 'ZIMRA VAT returns are generally due on or before the 25th of the following month. Mantis does not submit the return.' },
      { tax: 'NORMAL_INCOME_TAX', description: 'Self-assessment quarterly payment dates used as reminders are 25 March, 25 June, 25 September and 20 December. Mantis does not submit the return.' },
      { tax: 'PRESUMPTIVE_RENTAL', description: 'Presumptive rental income tax follows the return and payment date in ZIMRA Public Notice 08 of 2026. Mantis does not submit the return.' }
    ]
    : propertyEngine === 'ZA'
      ? [
        { tax: 'PROVISIONAL_TAX', description: 'Provisional tax estimates are generally due on 31 August and the last day of February. Mantis does not submit them.' },
        { tax: 'VAT', description: 'The VAT return due date depends on the vendor’s tax period. It is not assumed here, and Mantis does not submit a VAT201.' },
        { tax: 'PERSONAL_INCOME_TAX', description: 'The annual individual return is the ITR12 for the year of assessment. Mantis does not submit it.' }
      ]
      : [{ tax: 'GLOBAL', description: 'Filing and payment dates are the ones entered by the owner. They are not independently verified.' }];

  return {
    estimate: true,
    filingSubmitted: false,
    paymentSubmitted: false,
    complianceCertified: false,
    currency: input.currency,
    taxJurisdiction: input.taxJurisdiction,
    propertyJurisdiction: input.propertyJurisdiction,
    residencyJurisdiction: input.residencyJurisdiction,
    crossBorderReview: crossBorder,
    rentalProfit: profit,
    lines,
    deadlines,
    disclaimer: DISCLAIMER
  };
}

export function saBracketTax(taxableIncome: number): number {
  return progressive(taxableIncome, SA_TAX_YEAR_2027.brackets);
}
