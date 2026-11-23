import { Payment } from '../../models/Payment';
import { Property } from '../../models/Property';
import { LandlordFinancialTransaction } from '../../models/LandlordFinancialTransaction';
import individualTaxProfileService from '../individualTaxProfileService';
import { countsTowardRentReceipt } from '../rentalPeriodCoverage';
import { roundMoney } from '../../utils/money';
import { calculateJurisdictionEstimate, type GlobalTaxInput, type JurisdictionEstimate } from './calculate';
import { resolveIndividualJurisdiction, type JurisdictionCode } from './publishedRules';

const QUALIFYING = new Set(['DEDUCTIBLE', 'PARTIALLY_DEDUCTIBLE']);

function yearBounds(asOf: Date, jurisdiction: JurisdictionCode) {
  if (jurisdiction === 'ZA') {
    const startYear = asOf.getUTCMonth() < 2 ? asOf.getUTCFullYear() - 1 : asOf.getUTCFullYear();
    return {
      start: new Date(Date.UTC(startYear, 2, 1)),
      end: new Date(Date.UTC(startYear + 1, 2, 1))
    };
  }
  return {
    start: new Date(Date.UTC(asOf.getUTCFullYear(), 0, 1)),
    end: new Date(Date.UTC(asOf.getUTCFullYear() + 1, 0, 1))
  };
}

export async function estimateIndividualTaxes(companyId: string, body: Record<string, unknown> = {}): Promise<{
  properties: Array<JurisdictionEstimate & { propertyId: string; propertyName: string }>;
  combined: JurisdictionEstimate | null;
  portfolioSeparated: boolean;
  disclaimer: string;
}> {
  const profile = await individualTaxProfileService.getOwnerProfile(companyId);
  const asOf = body.asOf ? new Date(String(body.asOf)) : new Date();
  const residency = resolveIndividualJurisdiction(profile.taxResidencyCountry || profile.taxResidence, profile.taxJurisdiction);
  const ownerJurisdiction = resolveIndividualJurisdiction(profile.taxJurisdiction, residency);
  const enabled = profile.enabledTaxes.length
    ? profile.enabledTaxes
    : ownerJurisdiction === 'ZA'
      ? ['PERSONAL_INCOME_TAX']
      : ownerJurisdiction === 'ZW'
        ? [
          ...(profile.rentalTaxRegime === 'PRESUMPTIVE_RENTAL' ? ['PRESUMPTIVE_RENTAL'] : []),
          ...(profile.rentalTaxRegime === 'SELF_ASSESSMENT' || profile.incomeTaxRegistered ? ['NORMAL_INCOME_TAX'] : []),
          ...(profile.vatRegistered ? ['VAT'] : [])
        ]
        : (profile.globalTaxes || []).filter((row) => row.enabled !== false).map((row) => String(row.category || 'OTHER'));

  const properties = body.propertyId
    ? await Property.find({ _id: body.propertyId, companyId, isDeleted: { $ne: true } }).lean()
    : await Property.find({ companyId, isDeleted: { $ne: true } }).lean();

  const sa = (profile.saProfile || {}) as Record<string, unknown>;
  const results = [];
  for (const property of properties) {
    const propertyJurisdiction = resolveIndividualJurisdiction((property as any).locationCountry, ownerJurisdiction);
    const bounds = yearBounds(asOf, propertyJurisdiction);
    const currency = String((property as any).operatingCurrency || profile.preferredCurrency || 'USD').toUpperCase();
    const transactions = await LandlordFinancialTransaction.find({
      companyId: property.companyId,
      propertyId: property._id,
      status: 'POSTED',
      date: { $gte: bounds.start, $lt: bounds.end }
    }).select('amount currency sourceKind deductibility').lean();
    const payments = await Payment.find({
      companyId: property.companyId,
      propertyId: property._id,
      status: { $in: ['completed', 'paid', 'success'] } as any,
      paymentDate: { $gte: bounds.start, $lt: bounds.end }
    }).lean();
    const currencies = new Set<string>([currency]);
    let rentalIncome = 0;
    for (const payment of payments) {
      if (!countsTowardRentReceipt(payment as any)) continue;
      const paymentCurrency = String((payment as any).currency || currency).toUpperCase();
      currencies.add(paymentCurrency);
      if (paymentCurrency === currency) rentalIncome += Number((payment as any).amount || 0);
    }
    let allowable = 0;
    let nonDeductible = 0;
    let capital = 0;
    for (const row of transactions) {
      const rowCurrency = String(row.currency || currency).toUpperCase();
      currencies.add(rowCurrency);
      if (rowCurrency !== currency || row.sourceKind === 'OTHER_INCOME') continue;
      const amount = Number(row.amount || 0);
      if (row.deductibility === 'CAPITAL') capital += amount;
      else if (QUALIFYING.has(String(row.deductibility || ''))) allowable += amount;
      else nonDeductible += amount;
    }
    const estimate = calculateJurisdictionEstimate({
      asOf,
      currency,
      taxJurisdiction: ownerJurisdiction,
      countryOfResidence: profile.countryOfResidence,
      taxResidencyCountry: profile.taxResidencyCountry,
      propertyLocationCountry: (property as any).locationCountry || '',
      propertyJurisdiction,
      residencyJurisdiction: residency,
      enabledTaxes: enabled,
      rentalIncome: roundMoney(rentalIncome),
      allowableExpenses: roundMoney(allowable),
      nonDeductibleExpenses: roundMoney(nonDeductible),
      capitalExpenses: roundMoney(capital),
      rentedPortionPercent: body.rentedPortionPercent == null ? Number(sa.rentedPortionPercent ?? 100) : Number(body.rentedPortionPercent),
      propertyUseClass: (property as any).propertyUseClass || null,
      rentalTaxRegime: (property as any).rentalTaxTreatment || profile.rentalTaxRegime,
      incomeTaxRegistered: profile.incomeTaxRegistered,
      incomeTaxRegistrationDate: profile.incomeTaxRegistrationDate,
      vatRegistered: profile.vatRegistered,
      vatNumber: profile.vatNumber,
      taxableSupplies: body.taxableSupplies == null ? (sa.taxableSupplies as number | null) : Number(body.taxableSupplies),
      otherAnnualTaxableIncome: body.otherAnnualTaxableIncome == null ? (sa.otherAnnualTaxableIncome as number | null) : Number(body.otherAnnualTaxableIncome),
      ageCategory: (body.ageCategory as any) || (sa.ageCategory as any) || null,
      extraRebate: body.extraRebate == null ? (sa.extraRebate as number | null) : Number(body.extraRebate),
      carriesOnBusiness: Boolean(body.carriesOnBusiness ?? sa.carriesOnBusiness),
      turnoverTaxElected: Boolean(sa.turnoverTaxElected),
      turnoverTaxEligibilityConfirmed: Boolean(sa.turnoverTaxEligibilityConfirmed),
      taxableTurnover: body.taxableTurnover == null ? (sa.taxableTurnover as number | null) : Number(body.taxableTurnover),
      ringFencingDoesNotApply: Boolean(sa.ringFencingDoesNotApply),
      priorResidentialLossYears: sa.priorResidentialLossYears == null ? null : Number(sa.priorResidentialLossYears),
      globalTaxes: (profile.globalTaxes || []) as GlobalTaxInput[],
      mixedCurrency: currencies.size > 1
    });
    results.push({ ...estimate, propertyId: String(property._id), propertyName: property.name });
  }

  const currencies = new Set(results.map((row) => row.currency));
  const jurisdictions = new Set(results.map((row) => row.propertyJurisdiction));
  return {
    properties: results,
    combined: results.length === 1 ? results[0] : null,
    portfolioSeparated: results.length > 1 && (currencies.size > 1 || jurisdictions.size > 1),
    disclaimer: results[0]?.disclaimer || 'These figures are estimates. Mantis does not submit returns or make tax payments.'
  };
}
