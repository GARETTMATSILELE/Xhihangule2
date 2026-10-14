export type PropertyStatus = 'available' | 'rented' | 'maintenance' | 'under_offer' | 'sold';
export type PropertyType = 'apartment' | 'house' | 'commercial' | 'land';
export type PropertyCategory = 'Residential' | 'Commercial' | 'Land' | 'Special Use';
export type PropertyOperationalStatus = 'Vacant' | 'Occupied' | 'Under Maintenance' | 'Reserved' | 'Archived';
export type PropertyUse = 'Rental' | 'Sale' | 'Both' | 'Internal';

export interface Property {
  _id: string;
  name: string;
  address: string;
  type: PropertyType;
  /**
   * Additive, optional fields for the classification engine.
   * Backwards compatible: legacy records may not have these fields.
   */
  propertyCategory?: PropertyCategory;
  propertySubtype?: string;
  propertySpecifications?: Record<string, unknown>;
  propertyOperationalStatus?: PropertyOperationalStatus;
  propertyUse?: PropertyUse;
  status: PropertyStatus;
  rent: number;
  price?: number;
  bedrooms: number;
  bathrooms: number;
  area: number;
  builtArea?: number;
  landArea?: number;
  pricePerSqm?: number;
  description: string;
  images: string[];
  amenities: string[];
  companyId: string;
  ownerId: string;
  agentId?: string;
  propertyOwnerId?: string;
  buyerId?: string;
  occupancyRate: number;
  totalRentCollected: number;
  currentArrears: number;
  nextLeaseExpiry: Date;
  createdAt: Date;
  updatedAt: Date;
  // Additional fields for tenant and lease information
  tenantName?: string;
  rentBalance?: number;
  rentalCredit?: number;
  leaseRenewal?: Date;
  startDate?: Date;
  endDate?: Date;
  paidInAdvance?: boolean;
  advanceMonths?: number;
  // New fields
  rentalType?: 'management' | 'introduction' | 'sale';
  commission?: number;
  vatOnCommission?: boolean;
  vatCommissionTreatment?: 'inclusive' | 'exclusive';
  vatSupplyTreatment?: 'EXEMPT' | 'STANDARD_TAXABLE' | 'ZERO_RATED' | 'OUT_OF_SCOPE' | 'ACCOUNTANT_REVIEW';
  propertyUseClass?: 'RESIDENTIAL_DWELLING' | 'COMMERCIAL' | 'MIXED_USE' | 'SHORT_TERM_ACCOMMODATION' | 'SALE' | 'AGENCY_COMMISSION' | 'OTHER_SERVICE';
  saleVatTreatment?: 'EXEMPT' | 'STANDARD_TAXABLE' | 'ZERO_RATED' | 'OUT_OF_SCOPE' | 'ACCOUNTANT_REVIEW';
  vatEffectiveFrom?: Date | string;
  vatEffectiveTo?: Date | string;
  rentalTaxTreatment?: 'SELF_ASSESSMENT' | 'PRESUMPTIVE_RENTAL' | 'EXEMPT' | 'NOT_APPLICABLE' | 'ACCOUNTANT_REVIEW';
  rentalTaxEffectiveFrom?: Date | string;
  ownershipPercentage?: number;
  taxNotes?: string;
  acquisitionCost?: number;
  acquisitionDate?: Date | string;
  improvementCosts?: number;
  qualifyingExpenses?: number;
  sellingCosts?: number;
  commissionPreaPercent?: number;
  commissionAgencyPercentRemaining?: number;
  commissionAgentPercentRemaining?: number;
  saleType?: 'cash' | 'installment';
  // New fields for levy/municipal fees
  levyOrMunicipalType?: 'levy' | 'municipal';
  levyOrMunicipalAmount?: number;
  isDeleted?: boolean;
  deletedAt?: Date | null;
  deletedBy?: string | null;
  archivedAt?: Date | null;
  archivedBy?: string | null;
  monthlyIncome?: number;
  monthlyExpenses?: number;
  netProfit?: number;
  occupancyPercent?: number;
  collectionPercent?: number;
  profitabilityPercent?: number;
  expenseRatio?: number;
}

export interface PropertyFormData extends Omit<Property, '_id' | 'id' | 'createdAt' | 'updatedAt' | 'status' | 'occupiedUnits'> {
  _id?: string;
  status?: PropertyStatus;
  occupiedUnits?: number;
  // New fields
  rentalType?: 'management' | 'introduction' | 'sale';
  commission?: number;
  vatOnCommission?: boolean;
  vatCommissionTreatment?: 'inclusive' | 'exclusive';
  vatSupplyTreatment?: 'EXEMPT' | 'STANDARD_TAXABLE' | 'ZERO_RATED' | 'OUT_OF_SCOPE' | 'ACCOUNTANT_REVIEW';
  propertyUseClass?: 'RESIDENTIAL_DWELLING' | 'COMMERCIAL' | 'MIXED_USE' | 'SHORT_TERM_ACCOMMODATION' | 'SALE' | 'AGENCY_COMMISSION' | 'OTHER_SERVICE';
  saleVatTreatment?: 'EXEMPT' | 'STANDARD_TAXABLE' | 'ZERO_RATED' | 'OUT_OF_SCOPE' | 'ACCOUNTANT_REVIEW';
  vatEffectiveFrom?: Date | string;
  vatEffectiveTo?: Date | string;
  rentalTaxTreatment?: 'SELF_ASSESSMENT' | 'PRESUMPTIVE_RENTAL' | 'EXEMPT' | 'NOT_APPLICABLE' | 'ACCOUNTANT_REVIEW';
  rentalTaxEffectiveFrom?: Date | string;
  ownershipPercentage?: number;
  taxNotes?: string;
  acquisitionCost?: number;
  acquisitionDate?: Date | string;
  improvementCosts?: number;
  qualifyingExpenses?: number;
  sellingCosts?: number;
  // New fields for levy/municipal fees
  levyOrMunicipalType?: 'levy' | 'municipal';
  levyOrMunicipalAmount?: number;
}

export interface PropertyFilter {
  status: 'all' | PropertyStatus;
  location: string;
  rentRange: {
    min: number;
    max: number;
  };
} 