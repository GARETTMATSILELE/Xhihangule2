export type PropertyStatus = 'available' | 'rented' | 'maintenance';
export type PropertyType = 'apartment' | 'house' | 'commercial';

export interface Property {
  _id: string;
  name: string;
  address: string;
  type: PropertyType;
  status: PropertyStatus;
  rent: number;
  bedrooms: number;
  bathrooms: number;
  area: number;
  description: string;
  images: string[];
  amenities: string[];
  companyId: string;
  ownerId: string;
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
  rentalType?: 'management' | 'introduction';
  commission?: number;
  // New fields for levy/municipal fees
  levyOrMunicipalType?: 'levy' | 'municipal';
  levyOrMunicipalAmount?: number;
}

export interface PropertyFormData extends Omit<Property, '_id' | 'id' | 'createdAt' | 'updatedAt' | 'status' | 'occupiedUnits'> {
  _id?: string;
  status?: PropertyStatus;
  occupiedUnits?: number;
  // New fields
  rentalType?: 'management' | 'introduction';
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