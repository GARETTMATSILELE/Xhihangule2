export const TAX_DISCLAIMER =
  "Mantis provides accounting records, tax classifications and tax-working papers based on information entered into the system and configured tax rules. It does not constitute tax advice and does not replace the taxpayer's responsibility to comply with ZIMRA requirements or obtain professional advice where required.";

export const RENTAL_TAX_REGIMES = [
  'ACCOUNTANT_REVIEW',
  'SELF_ASSESSMENT',
  'PRESUMPTIVE_RENTAL',
  'EXEMPT',
  'NOT_APPLICABLE'
] as const;

export type RentalTaxRegime = (typeof RENTAL_TAX_REGIMES)[number];

export type TaxpayerType = 'INDIVIDUAL' | 'COMPANY' | 'TRUST' | 'OTHER';

export type OwnerTaxProfile = {
  companyId: string;
  taxpayerType: TaxpayerType;
  legalName: string;
  tradingName: string;
  nationalIdOrCompanyRegistrationReference: string;
  tin: string;
  vatRegistered: boolean;
  vatNumber: string;
  vatRegistrationDate: string | null;
  vatRegistrationCancelledAt: string | null;
  vatCategory: string;
  incomeTaxRegistered: boolean;
  incomeTaxRegistrationDate: string | null;
  rentalTaxRegime: RentalTaxRegime;
  rentalTaxRegistrationDate: string | null;
  taxResidence: string;
  taxYearStartMonth: number;
  accountantName: string;
  accountantContact: string;
  taxNotes: string;
  rentalTaxRegimeInferredFromWorkspace: false;
  configuredTaxRules?: Array<{
    ruleCode: string;
    version: number;
    taxType: string;
    rate: number | null;
    effectiveFrom: string;
    effectiveTo: string | null;
    sourceReference: string;
  }>;
  disclaimer?: string;
};

export type PropertyTaxProfile = {
  propertyId: string;
  propertyName: string;
  propertyUseClass: string | null;
  vatSupplyTreatment: string;
  vatEffectiveFrom: string | null;
  vatEffectiveTo: string | null;
  rentalTaxTreatment: RentalTaxRegime;
  rentalTaxEffectiveFrom: string | null;
  ownershipPercentage: number;
  acquisitionDate: string | null;
  acquisitionCost: number | null;
  improvementCost: number | null;
  taxNotes: string;
  reviewRequired: boolean;
  reviewReasons: string[];
  disclaimer?: string;
};
