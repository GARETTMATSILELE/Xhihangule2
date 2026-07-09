import { PropertyType } from '../types/property';

export type PropertyCategory = 'Residential' | 'Commercial' | 'Land' | 'Special Use';
export type PropertyOperationalStatus = 'Vacant' | 'Occupied' | 'Under Maintenance' | 'Reserved' | 'Archived';
export type PropertyUse = 'Rental' | 'Sale' | 'Both' | 'Internal';

export type PropertySpecificationFieldType = 'number' | 'text' | 'boolean' | 'select';

export interface PropertySpecificationField {
  key: string;
  label: string;
  type: PropertySpecificationFieldType;
  options?: string[];
}

export interface PropertyTemplate {
  name: string;
  category: PropertyCategory;
  subtype: string;
  type: PropertyType;
  specifications: Record<string, unknown>;
  amenities: string[];
}

export const PROPERTY_CATEGORIES: PropertyCategory[] = [
  'Residential',
  'Commercial',
  'Land',
  'Special Use',
];

export const PROPERTY_SUBTYPES = {
  Residential: [
    'Apartment',
    'House',
    'Townhouse',
    'Duplex',
    'Cluster Home',
    'Cottage',
    'Room',
    'Student Accommodation',
    'Villa',
    'Penthouse',
  ],
  Commercial: [
    'Office',
    'Retail Shop',
    'Warehouse',
    'Factory',
    'Industrial Unit',
    'Medical Suite',
    'Restaurant',
    'Workshop',
    'Mixed Use',
  ],
  Land: [
    'Residential Stand',
    'Commercial Stand',
    'Industrial Stand',
    'Farm',
    'Plot',
  ],
  'Special Use': [
    'School',
    'Church',
    'Guest Lodge',
    'Government Building',
    'Sports Facility',
    'Other',
  ],
} as const satisfies Record<PropertyCategory, readonly string[]>;

export type PropertySubtype = (typeof PROPERTY_SUBTYPES)[PropertyCategory][number];

export const PROPERTY_OPERATIONAL_STATUSES: PropertyOperationalStatus[] = [
  'Vacant',
  'Occupied',
  'Under Maintenance',
  'Reserved',
  'Archived',
];

export const PROPERTY_USES: PropertyUse[] = ['Rental', 'Sale', 'Both', 'Internal'];

export const AMENITIES_BY_CATEGORY: Record<PropertyCategory, string[]> = {
  Residential: ['Pool', 'Garden', 'Gym', 'Air Conditioning', 'Security', 'Borehole', 'Solar'],
  Commercial: ['Reception', 'Loading Bay', 'Backup Power', 'Access Control', 'Visitor Parking'],
  Land: ['Water Connection', 'Electricity Connection', 'Road Access', 'Boundary Fence'],
  'Special Use': ['Parking', 'Security', 'Backup Power', 'Accessibility', 'Reception'],
};

const residentialSpecs: PropertySpecificationField[] = [
  { key: 'bedrooms', label: 'Bedrooms', type: 'number' },
  { key: 'bathrooms', label: 'Bathrooms', type: 'number' },
  { key: 'garages', label: 'Garages', type: 'number' },
  { key: 'parkingBays', label: 'Parking Bays', type: 'number' },
  { key: 'floorArea', label: 'Floor Area', type: 'number' },
  { key: 'hasPool', label: 'Pool', type: 'boolean' },
  { key: 'hasGarden', label: 'Garden', type: 'boolean' },
  { key: 'hasSolar', label: 'Solar', type: 'boolean' },
  { key: 'hasBorehole', label: 'Borehole', type: 'boolean' },
  { key: 'hasGenerator', label: 'Generator', type: 'boolean' },
];

const apartmentSpecs: PropertySpecificationField[] = [
  { key: 'apartmentNumber', label: 'Apartment Number', type: 'text' },
  { key: 'floorNumber', label: 'Floor Number', type: 'number' },
  { key: 'buildingName', label: 'Building Name', type: 'text' },
  { key: 'block', label: 'Block', type: 'text' },
  { key: 'liftAvailable', label: 'Lift Available', type: 'boolean' },
];

const houseSpecs: PropertySpecificationField[] = [
  { key: 'standNumber', label: 'Stand Number', type: 'text' },
  { key: 'domesticQuarters', label: 'Domestic Quarters', type: 'boolean' },
  { key: 'electricFence', label: 'Electric Fence', type: 'boolean' },
  { key: 'boundaryWall', label: 'Boundary Wall', type: 'boolean' },
];

const commercialSpecs: PropertySpecificationField[] = [
  { key: 'floorArea', label: 'Floor Area', type: 'number' },
  { key: 'officeCount', label: 'Office Count', type: 'number' },
  { key: 'meetingRooms', label: 'Meeting Rooms', type: 'number' },
  { key: 'parkingSpaces', label: 'Parking Spaces', type: 'number' },
  { key: 'loadingBay', label: 'Loading Bay', type: 'boolean' },
  { key: 'generator', label: 'Generator', type: 'boolean' },
  { key: 'securityAccess', label: 'Security Access', type: 'boolean' },
];

const warehouseSpecs: PropertySpecificationField[] = [
  { key: 'storageArea', label: 'Storage Area', type: 'number' },
  { key: 'warehouseHeight', label: 'Warehouse Height', type: 'number' },
  { key: 'dockingBays', label: 'Docking Bays', type: 'number' },
  { key: 'forkliftAccess', label: 'Forklift Access', type: 'boolean' },
  { key: 'coldStorage', label: 'Cold Storage', type: 'boolean' },
  { key: 'yardSpace', label: 'Yard Space', type: 'boolean' },
  { key: 'officeIncluded', label: 'Office Included', type: 'boolean' },
];

const landSpecs: PropertySpecificationField[] = [
  { key: 'landSize', label: 'Land Size', type: 'number' },
  { key: 'zoning', label: 'Zoning', type: 'text' },
  { key: 'waterConnection', label: 'Water Connection', type: 'boolean' },
  { key: 'electricityConnection', label: 'Electricity Connection', type: 'boolean' },
  { key: 'titleDeedNumber', label: 'Title Deed Number', type: 'text' },
];

const specialUseSpecs: PropertySpecificationField[] = [
  { key: 'floorArea', label: 'Floor Area', type: 'number' },
  { key: 'parkingSpaces', label: 'Parking Spaces', type: 'number' },
  { key: 'capacity', label: 'Capacity', type: 'number' },
  { key: 'securityAccess', label: 'Security Access', type: 'boolean' },
  { key: 'backupPower', label: 'Backup Power', type: 'boolean' },
];

export const PROPERTY_TEMPLATES: PropertyTemplate[] = [
  {
    name: '2 Bedroom Apartment',
    category: 'Residential',
    subtype: 'Apartment',
    type: 'apartment',
    specifications: { bedrooms: 2, bathrooms: 1, parkingBays: 1 },
    amenities: ['Security', 'Parking'],
  },
  {
    name: '3 Bedroom House',
    category: 'Residential',
    subtype: 'House',
    type: 'house',
    specifications: { bedrooms: 3, bathrooms: 2, garages: 1, hasGarden: true },
    amenities: ['Garden', 'Security'],
  },
  {
    name: 'Office Suite',
    category: 'Commercial',
    subtype: 'Office',
    type: 'commercial',
    specifications: { officeCount: 1, meetingRooms: 1, parkingSpaces: 2, securityAccess: true },
    amenities: ['Reception', 'Access Control'],
  },
  {
    name: 'Warehouse',
    category: 'Commercial',
    subtype: 'Warehouse',
    type: 'commercial',
    specifications: { storageArea: 0, dockingBays: 1, forkliftAccess: true, officeIncluded: true },
    amenities: ['Loading Bay', 'Backup Power'],
  },
  {
    name: 'Retail Shop',
    category: 'Commercial',
    subtype: 'Retail Shop',
    type: 'commercial',
    specifications: { floorArea: 0, parkingSpaces: 1, securityAccess: true },
    amenities: ['Visitor Parking', 'Access Control'],
  },
];

export function derivePropertyCategory(input: {
  propertyCategory?: string | null;
  propertyType?: PropertyType | string | null;
}): PropertyCategory {
  const explicit = (input.propertyCategory ?? undefined) as PropertyCategory | undefined;
  if (explicit && PROPERTY_CATEGORIES.includes(explicit)) return explicit;

  const t = input.propertyType ?? undefined;
  if (t === 'apartment' || t === 'house') return 'Residential';
  if (t === 'commercial') return 'Commercial';
  if (t === 'land') return 'Land';
  // Safe fallback: keep legacy flows working even if type is missing/unknown.
  return 'Residential';
}

export function derivePropertySubtype(input: {
  propertySubtype?: string | null;
  propertyType?: PropertyType | string | null;
  propertyCategory?: PropertyCategory | string | null;
}): string {
  const category = derivePropertyCategory({
    propertyCategory: input.propertyCategory,
    propertyType: input.propertyType,
  });

  const explicit = input.propertySubtype ?? undefined;
  const allowed = PROPERTY_SUBTYPES[category] as readonly string[];
  if (explicit && allowed.includes(explicit)) return explicit;

  // Legacy defaults (Phase 1.1 rules)
  const t = input.propertyType ?? undefined;
  const legacySubtype =
    t === 'apartment' ? 'Apartment' :
    t === 'house' ? 'House' :
    t === 'commercial' ? 'Office' :
    t === 'land' ? 'Residential Stand' :
    undefined;
  if (legacySubtype && allowed.includes(legacySubtype)) return legacySubtype;

  // Final fallback: first subtype of derived category.
  return allowed[0] ?? 'Other';
}

export function getSubtypesForCategory(category: PropertyCategory): readonly string[] {
  return PROPERTY_SUBTYPES[category] ?? [];
}

export function getLegacyTypeForCategory(category: PropertyCategory, subtype?: string): PropertyType {
  if (category === 'Residential') {
    if (subtype === 'House') return 'house';
    return 'apartment';
  }
  if (category === 'Land') return 'land';
  return 'commercial';
}

export function getSpecificationFields(category: PropertyCategory, subtype?: string): PropertySpecificationField[] {
  if (category === 'Residential') {
    if (subtype === 'Apartment' || subtype === 'Penthouse' || subtype === 'Student Accommodation') {
      return [...residentialSpecs, ...apartmentSpecs];
    }
    if (subtype === 'House' || subtype === 'Townhouse' || subtype === 'Duplex' || subtype === 'Cluster Home' || subtype === 'Cottage' || subtype === 'Villa') {
      return [...residentialSpecs, ...houseSpecs];
    }
    return residentialSpecs;
  }
  if (category === 'Commercial') {
    if (subtype === 'Warehouse' || subtype === 'Factory' || subtype === 'Industrial Unit') {
      return [...commercialSpecs, ...warehouseSpecs];
    }
    return commercialSpecs;
  }
  if (category === 'Land') return landSpecs;
  return specialUseSpecs;
}

