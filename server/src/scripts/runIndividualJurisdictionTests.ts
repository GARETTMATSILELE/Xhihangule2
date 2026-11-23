import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { calculateJurisdictionEstimate, saBracketTax } from '../services/individualJurisdiction/calculate';
import { systemTaxRuleSeeds } from '../services/taxRuleRegistry';
import {
  SA_TAX_YEAR_2027,
  SA_VAT,
  ZW_AIDS_LEVY_PERCENT
} from '../services/individualJurisdiction/publishedRules';
import {
  buildPropertyFinancialOverview,
  convertForReporting,
  deriveExpenseTaxMetadata,
  individualChannelDecision,
  sameObligation,
  settlementForEntry,
  sumSameCurrency
} from '../services/individualJurisdiction/operations';

const results: Record<string, string> = {};
const on = (date: string) => new Date(`${date}T00:00:00.000Z`);

function base(overrides: Record<string, unknown> = {}) {
  return {
    asOf: on('2026-06-01'),
    currency: 'USD',
    taxJurisdiction: 'ZW' as const,
    propertyJurisdiction: 'ZW' as const,
    residencyJurisdiction: 'ZW' as const,
    enabledTaxes: [] as string[],
    rentalIncome: 0,
    allowableExpenses: 0,
    ...overrides
  };
}

const amountOf = (code: string, input: ReturnType<typeof base>) =>
  calculateJurisdictionEstimate(input as any).lines.find((row) => row.code === code);

{
  const continuing = amountOf('NORMAL_INCOME_TAX', base({
    rentalIncome: 1000,
    allowableExpenses: 200,
    rentalTaxRegime: 'SELF_ASSESSMENT',
    incomeTaxRegistered: true,
    incomeTaxRegistrationDate: '2025-06-01',
    propertyUseClass: 'COMMERCIAL',
    enabledTaxes: ['NORMAL_INCOME_TAX', 'PRESUMPTIVE_RENTAL']
  }));
  assert.strictEqual(continuing?.amount, 200);
  assert.strictEqual(amountOf('PRESUMPTIVE_RENTAL', base({
    rentalIncome: 1000,
    rentalTaxRegime: 'SELF_ASSESSMENT',
    incomeTaxRegistered: true,
    incomeTaxRegistrationDate: '2025-06-01',
    propertyUseClass: 'COMMERCIAL',
    enabledTaxes: ['PRESUMPTIVE_RENTAL']
  }))?.status, 'NOT_APPLICABLE');
  const aids = amountOf('AIDS_LEVY', base({
    rentalIncome: 1000,
    allowableExpenses: 200,
    rentalTaxRegime: 'SELF_ASSESSMENT',
    incomeTaxRegistered: true,
    incomeTaxRegistrationDate: '2025-06-01'
  }));
  assert.strictEqual(aids?.amount, 6);
  assert.strictEqual(aids?.rate, ZW_AIDS_LEVY_PERCENT);
  assert.ok(aids?.notes.join(' ').includes('not included in the 25%'));
  results['ZW existing self-assessment and AIDS levy estimate'] = 'PASS';
}

{
  const presumptive = amountOf('PRESUMPTIVE_RENTAL', base({
    rentalIncome: 1000,
    allowableExpenses: 400,
    propertyUseClass: 'COMMERCIAL',
    rentalTaxRegime: 'PRESUMPTIVE_RENTAL',
    incomeTaxRegistered: true,
    incomeTaxRegistrationDate: '2026-02-01'
  }));
  assert.strictEqual(presumptive?.amount, 150);
  assert.strictEqual(amountOf('NORMAL_INCOME_TAX', base({
    rentalIncome: 1000,
    allowableExpenses: 400,
    propertyUseClass: 'COMMERCIAL',
    rentalTaxRegime: 'PRESUMPTIVE_RENTAL',
    incomeTaxRegistrationDate: '2026-02-01'
  }))?.status, 'NOT_APPLICABLE');
  assert.strictEqual(amountOf('PRESUMPTIVE_RENTAL', base({
    rentalIncome: 1000,
    propertyUseClass: 'RESIDENTIAL_DWELLING',
    rentalTaxRegime: 'PRESUMPTIVE_RENTAL',
    incomeTaxRegistrationDate: '2026-02-01'
  }))?.status, 'NOT_APPLICABLE');
  assert.strictEqual(amountOf('PRESUMPTIVE_RENTAL', base({
    rentalIncome: 1000,
    propertyUseClass: 'MIXED_USE',
    rentalTaxRegime: 'PRESUMPTIVE_RENTAL',
    incomeTaxRegistrationDate: '2026-02-01'
  }))?.status, 'REVIEW_REQUIRED');
  assert.strictEqual(amountOf('NORMAL_INCOME_TAX', base({
    rentalIncome: 1000,
    rentalTaxRegime: 'ACCOUNTANT_REVIEW'
  }))?.status, 'REVIEW_REQUIRED');
  results['ZW presumptive, residential exclusion, mixed use, no double tax'] = 'PASS';
}

{
  const registered = amountOf('VAT', base({
    asOf: on('2026-02-01'),
    rentalIncome: 1000,
    propertyUseClass: 'COMMERCIAL',
    vatRegistered: true,
    enabledTaxes: ['VAT'],
    rentalTaxRegime: 'PRESUMPTIVE_RENTAL',
    incomeTaxRegistrationDate: '2026-02-01'
  }));
  assert.strictEqual(registered?.rate, 15.5);
  assert.strictEqual(registered?.amount, 155);
  assert.strictEqual(amountOf('VAT', base({
    rentalIncome: 1000,
    propertyUseClass: 'RESIDENTIAL_DWELLING',
    vatRegistered: false
  }))?.status, 'NOT_ENABLED');
  results['ZW VAT registered and non-registered'] = 'PASS';
}

{
  assert.strictEqual(saBracketTax(245100), 44118);
  assert.strictEqual(saBracketTax(383100), 79998);
  assert.strictEqual(saBracketTax(530200), 125599);
  assert.strictEqual(saBracketTax(695800), 185215);
  assert.strictEqual(saBracketTax(887000), 259783);
  assert.strictEqual(saBracketTax(1878600), 666339);
  assert.strictEqual(saBracketTax(1878601), 666339.45);
  const tax = calculateJurisdictionEstimate(base({
    currency: 'ZAR',
    taxJurisdiction: 'ZA',
    propertyJurisdiction: 'ZA',
    residencyJurisdiction: 'ZA',
    enabledTaxes: ['PERSONAL_INCOME_TAX'],
    rentalIncome: 100000,
    allowableExpenses: 20000,
    otherAnnualTaxableIncome: 200000,
    ageCategory: 'UNDER_65',
    propertyUseClass: 'RESIDENTIAL_DWELLING'
  }) as any);
  const personal = tax.lines.find((row) => row.code === 'PERSONAL_INCOME_TAX');
  const without = Math.max(0, saBracketTax(200000) - SA_TAX_YEAR_2027.rebates.primary);
  const withRental = Math.max(0, saBracketTax(280000) - SA_TAX_YEAR_2027.rebates.primary);
  assert.strictEqual(personal?.amount, Math.round((withRental - without) * 100) / 100);
  assert.ok(personal?.notes.join(' ').includes('not a SARS assessment'));
  assert.strictEqual(calculateJurisdictionEstimate(base({
    currency: 'ZAR',
    taxJurisdiction: 'ZA',
    propertyJurisdiction: 'ZA',
    residencyJurisdiction: 'ZA',
    rentalIncome: 50000,
    allowableExpenses: 10000,
    enabledTaxes: ['PERSONAL_INCOME_TAX']
  }) as any).lines.find((row) => row.code === 'PERSONAL_INCOME_TAX')?.amount, null);
  results['ZA brackets, rebates and rental profit is not a flat rate'] = 'PASS';
}

{
  const loss = calculateJurisdictionEstimate(base({
    currency: 'ZAR',
    taxJurisdiction: 'ZA',
    propertyJurisdiction: 'ZA',
    residencyJurisdiction: 'ZA',
    enabledTaxes: ['PERSONAL_INCOME_TAX'],
    rentalIncome: 10000,
    allowableExpenses: 40000,
    otherAnnualTaxableIncome: 2000000,
    ageCategory: 'UNDER_65',
    propertyUseClass: 'RESIDENTIAL_DWELLING'
  }) as any);
  assert.strictEqual(loss.lines.find((row) => row.code === 'PERSONAL_INCOME_TAX')?.amount, 0);
  assert.ok(loss.lines.find((row) => row.code === 'PERSONAL_INCOME_TAX')?.reviewReasons.includes('RENTAL_LOSS_RING_FENCED'));
  const profit = calculateJurisdictionEstimate(base({
    currency: 'ZAR',
    taxJurisdiction: 'ZA',
    propertyJurisdiction: 'ZA',
    residencyJurisdiction: 'ZA',
    rentalIncome: 10000,
    allowableExpenses: 0,
    capitalExpenses: 50000,
    privateExpenses: 50000,
    propertyUseClass: 'RESIDENTIAL_DWELLING'
  }) as any);
  assert.strictEqual(profit.rentalProfit, 10000);
  results['ZA ring-fencing and non-deductible expenses'] = 'PASS';
}

{
  const residential = calculateJurisdictionEstimate(base({
    currency: 'ZAR',
    taxJurisdiction: 'ZA',
    propertyJurisdiction: 'ZA',
    residencyJurisdiction: 'ZA',
    vatRegistered: true,
    enabledTaxes: ['VAT'],
    rentalIncome: 10000,
    propertyUseClass: 'RESIDENTIAL_DWELLING'
  }) as any).lines.find((row) => row.code === 'VAT');
  assert.strictEqual(residential?.status, 'NOT_APPLICABLE');
  assert.ok(residential?.notes.join(' ').includes('Input tax cannot be claimed'));
  const commercial = calculateJurisdictionEstimate(base({
    currency: 'ZAR',
    taxJurisdiction: 'ZA',
    propertyJurisdiction: 'ZA',
    residencyJurisdiction: 'ZA',
    vatRegistered: true,
    enabledTaxes: ['VAT'],
    rentalIncome: 10000,
    propertyUseClass: 'COMMERCIAL'
  }) as any).lines.find((row) => row.code === 'VAT');
  assert.strictEqual(commercial?.amount, 1500);
  assert.strictEqual(commercial?.rate, SA_VAT.standardPercent);
  const threshold = calculateJurisdictionEstimate(base({
    asOf: on('2026-05-01'),
    currency: 'ZAR',
    taxJurisdiction: 'ZA',
    propertyJurisdiction: 'ZA',
    residencyJurisdiction: 'ZA',
    vatRegistered: false,
    enabledTaxes: ['VAT'],
    taxableSupplies: 2400000,
    propertyUseClass: 'COMMERCIAL'
  }) as any).lines.find((row) => row.code === 'VAT');
  assert.ok(threshold?.reviewReasons.includes('REGISTRATION_THRESHOLD'));
  const provisional = calculateJurisdictionEstimate(base({
    currency: 'ZAR',
    taxJurisdiction: 'ZA',
    propertyJurisdiction: 'ZA',
    residencyJurisdiction: 'ZA',
    rentalIncome: 1000,
    enabledTaxes: []
  }) as any).lines.find((row) => row.code === 'PROVISIONAL_TAX');
  assert.notStrictEqual(provisional?.status, 'ESTIMATE');
  const turnover = calculateJurisdictionEstimate(base({
    currency: 'ZAR',
    taxJurisdiction: 'ZA',
    propertyJurisdiction: 'ZA',
    residencyJurisdiction: 'ZA',
    rentalIncome: 100000
  }) as any).lines.find((row) => row.code === 'TURNOVER_TAX');
  assert.strictEqual(turnover?.status, 'NOT_ENABLED');
  const elected = calculateJurisdictionEstimate(base({
    currency: 'ZAR',
    taxJurisdiction: 'ZA',
    propertyJurisdiction: 'ZA',
    residencyJurisdiction: 'ZA',
    turnoverTaxElected: true,
    turnoverTaxEligibilityConfirmed: true,
    taxableTurnover: 700000
  }) as any);
  assert.strictEqual(elected.lines.find((row) => row.code === 'TURNOVER_TAX')?.amount, 1000);
  assert.strictEqual(elected.lines.find((row) => row.code === 'PERSONAL_INCOME_TAX')?.status, 'NOT_APPLICABLE');
  results['ZA VAT, thresholds, provisional tax and turnover tax'] = 'PASS';
}

{
  const missing = calculateJurisdictionEstimate(base({
    currency: 'EUR',
    taxJurisdiction: 'GLOBAL',
    propertyJurisdiction: 'GLOBAL',
    residencyJurisdiction: 'GLOBAL',
    globalTaxes: [{ name: 'Local income tax', category: 'PERSONAL_INCOME_TAX', method: 'PERCENT_OF_NET', rate: null }]
  }) as any).lines[0];
  assert.strictEqual(missing.amount, null);
  assert.strictEqual(missing.verified, false);
  const gross = calculateJurisdictionEstimate(base({
    currency: 'EUR',
    taxJurisdiction: 'GLOBAL',
    propertyJurisdiction: 'GLOBAL',
    residencyJurisdiction: 'GLOBAL',
    rentalIncome: 200,
    allowableExpenses: 50,
    globalTaxes: [{ name: 'Rental tax', category: 'RENTAL_INCOME_TAX', method: 'PERCENT_OF_GROSS', rate: 10 }]
  }) as any).lines[0];
  assert.strictEqual(gross.amount, 20);
  assert.strictEqual(gross.status, 'USER_CONFIGURED');
  const net = calculateJurisdictionEstimate(base({
    currency: 'EUR',
    taxJurisdiction: 'GLOBAL',
    propertyJurisdiction: 'GLOBAL',
    residencyJurisdiction: 'GLOBAL',
    rentalIncome: 200,
    allowableExpenses: 50,
    globalTaxes: [{ name: 'Income tax', category: 'PERSONAL_INCOME_TAX', method: 'PERCENT_OF_NET', rate: 10 }]
  }) as any).lines[0];
  assert.strictEqual(net.amount, 15);
  const brackets = calculateJurisdictionEstimate(base({
    currency: 'EUR',
    taxJurisdiction: 'GLOBAL',
    propertyJurisdiction: 'GLOBAL',
    residencyJurisdiction: 'GLOBAL',
    rentalIncome: 1000,
    globalTaxes: [{
      name: 'Brackets',
      category: 'PERSONAL_INCOME_TAX',
      method: 'PROGRESSIVE',
      brackets: [{ upTo: 500, base: 0, above: 0, rate: 0.1 }, { upTo: null, base: 50, above: 500, rate: 0.2 }]
    }]
  }) as any).lines[0];
  assert.strictEqual(brackets.amount, 150);
  const cross = calculateJurisdictionEstimate(base({
    taxJurisdiction: 'ZA',
    propertyJurisdiction: 'ZW',
    residencyJurisdiction: 'ZA',
    rentalIncome: 1000,
    propertyUseClass: 'COMMERCIAL',
    rentalTaxRegime: 'PRESUMPTIVE_RENTAL',
    incomeTaxRegistrationDate: '2026-02-01'
  }) as any);
  assert.strictEqual(cross.crossBorderReview, true);
  assert.strictEqual(cross.lines[0].code, 'CROSS_BORDER');
  assert.strictEqual(cross.lines.find((row) => row.code === 'PERSONAL_INCOME_TAX'), undefined);
  results['Global configuration and cross-border review'] = 'PASS';
}

{
  const converted = convertForReporting({ amount: 100, fromCurrency: 'USD', toCurrency: 'ZAR', rate: 18, rateDate: '2026-06-01', source: 'USER_PROVIDED' });
  assert.strictEqual(converted.originalAmount, 100);
  assert.strictEqual(converted.convertedAmount, 1800);
  assert.strictEqual(converted.originalPreserved, true);
  assert.strictEqual(convertForReporting({ amount: 100, fromCurrency: 'USD', toCurrency: 'ZAR' }).convertedAmount, null);
  assert.strictEqual(sumSameCurrency([{ amount: 1, currency: 'USD' }, { amount: 2, currency: 'ZAR' }]).total, null);
  const overview = buildPropertyFinancialOverview({
    currency: 'ZAR',
    monthlyRent: 1000,
    rentCollected: 400,
    periodStart: on('2026-06-01'),
    periodEnd: on('2026-07-01'),
    transactions: [
      { type: 'expense', category: 'Levies', amount: 100, currency: 'ZAR', date: '2026-06-10', obligationStatus: 'UNSETTLED' },
      { type: 'expense', category: 'Municipal Rates', amount: 50, currency: 'ZAR', date: '2026-06-10', obligationStatus: 'UNSETTLED' },
      { type: 'expense', category: 'Utilities', amount: 20, currency: 'USD', date: '2026-06-10', obligationStatus: 'UNSETTLED' }
    ]
  });
  assert.strictEqual(overview.outstandingRent, 600);
  assert.strictEqual(overview.outstandingLevies, 100);
  assert.strictEqual(overview.municipalCharges, 50);
  assert.strictEqual(overview.utilities, 0);
  assert.strictEqual(overview.totalOutstandingBills, 150);
  assert.strictEqual(overview.mixedCurrency, true);
  assert.strictEqual(overview.netOperatingIncome, 250);
  results['Currency separation and property financial overview'] = 'PASS';
}

{
  assert.strictEqual(settlementForEntry('Levies', 'unpaid'), 'UNSETTLED');
  assert.strictEqual(settlementForEntry('Repairs', 'unpaid'), 'NOT_AN_OBLIGATION');
  assert.strictEqual(sameObligation({
    propertyId: 'p', category: 'LEVIES', amount: 10, date: '2026-06-01', reference: 'A', settlementStatus: 'UNSETTLED'
  }, { propertyId: 'p', category: 'LEVIES', amount: 10, date: '2026-06-01', reference: 'A' }), true);
  assert.strictEqual(sameObligation({
    propertyId: 'p', category: 'LEVIES', amount: 10, date: '2026-06-01', reference: 'A', settlementStatus: 'SETTLED'
  }, { propertyId: 'p', category: 'LEVIES', amount: 10, date: '2026-06-01', reference: 'A' }), false);
  assert.strictEqual(deriveExpenseTaxMetadata('Repairs').deductibility, 'DEDUCTIBLE');
  assert.strictEqual(deriveExpenseTaxMetadata('Other').deductibility, 'ACCOUNTANT_REVIEW');
  assert.strictEqual(individualChannelDecision({ RENT_PAID: { email: false, inApp: true } }, 'RENT_PAYMENT_RECEIVED', 'EMAIL'), 'skip');
  assert.strictEqual(individualChannelDecision({ RENT_PAID: { email: false, inApp: true } }, 'RENT_PAYMENT_RECEIVED', 'IN_APP'), 'send');
  assert.strictEqual(individualChannelDecision(undefined, 'RENT_PAYMENT_RECEIVED', 'EMAIL'), 'inherit');
  results['Bills, expenses and notification preferences'] = 'PASS';
}

{
  const profile = fs.readFileSync(path.join(__dirname, '../services/individualTaxProfileService.ts'), 'utf8');
  const registry = fs.readFileSync(path.join(__dirname, '../services/taxRuleRegistry.ts'), 'utf8');
  assert.ok(profile.includes('historicalSnapshotsPreserved: true'));
  assert.ok(!profile.includes('TransactionTaxSnapshot.update'));
  assert.ok(registry.includes('ZW_AIDS_LEVY'));
  assert.ok(registry.includes('ZA_INDIVIDUAL_BRACKETS_2027'));
  assert.ok(systemTaxRuleSeeds().some((row) => row.ruleCode === 'ZW_INCOME_TAX_TRADE_INVESTMENT_2024' && row.notes?.includes('AIDS levy is NOT included')));
  assert.ok(systemTaxRuleSeeds().some((row) => row.ruleCode === 'ZA_VAT_COMPULSORY_THRESHOLD' && row.version === 2 && row.rate === 2300000));
  const sidebar = fs.readFileSync(path.join(__dirname, '../../../client/src/pages/IndividualDashboard/constants.ts'), 'utf8');
  assert.ok(sidebar.includes('My Properties'));
  assert.ok(sidebar.includes('Tax Compliance'));
  assert.ok(!sidebar.includes("text: 'Accounting'"));
  results['Historical snapshots, rule seeds and individual navigation'] = 'PASS';
}

console.log(JSON.stringify(results, null, 2));
if (Object.values(results).some((value) => value !== 'PASS')) {
  throw new Error('Individual jurisdiction tests failed');
}
console.log('Individual jurisdiction tests: ALL PASS');
