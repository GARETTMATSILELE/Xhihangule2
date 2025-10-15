export type PropertyStatus = 'available' | 'rented' | 'maintenance' | 'under_offer' | 'sold';
export type PropertyType = 'apartment' | 'house' | 'commercial' | 'land';

export interface Property {
  _id: string;
  name: string;
  address: string;
  type: PropertyType;
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
  commissionPreaPercent?: number;
  commissionAgencyPercentRemaining?: number;
  commissionAgentPercentRemaining?: number;
  saleType?: 'cash' | 'installment';
  // New fields for levy/municipal fees
  levyOrMunicipalType?: 'levy' | 'municipal';
  levyOrMunicipalAmount?: number;
}

export interface PropertyFormData extends Omit<Property, '_id' | 'id' | 'createdAt' | 'updatedAt' | 'status' | 'occupiedUnits'> {
  _id?: string;
  status?: PropertyStatus;
  occupiedUnits?: number;
  // New fields
  rentalType?: 'management' | 'introduction' | 'sale';
  commission?: number;
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