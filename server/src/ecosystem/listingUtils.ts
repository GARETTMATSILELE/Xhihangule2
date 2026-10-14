export function computeProfileCompletion(profile: Record<string, any>): number {
  const fields = [
    'fullName', 'phone', 'email', 'idNumber', 'address', 'employmentStatus',
    'employer', 'emergencyContactName', 'emergencyContactPhone', 'householdSize',
    'rentalPreferences', 'preferredLocations',
  ];
  const filled = fields.filter((f) => {
    const v = profile[f];
    if (Array.isArray(v)) return v.length > 0;
    return v !== undefined && v !== null && String(v).trim() !== '';
  }).length;
  return Math.round((filled / fields.length) * 100);
}

export function toPublicListing(doc: any) {
  return {
    _id: doc._id,
    name: doc.name,
    address: doc.address,
    type: doc.type,
    propertyCategory: doc.propertyCategory,
    bedrooms: doc.bedrooms,
    bathrooms: doc.bathrooms,
    area: doc.area,
    description: doc.description,
    images: doc.images || [],
    videos: doc.videos || [],
    amenities: doc.amenities || [],
    rent: doc.rent,
    deposit: doc.deposit,
    availableFrom: doc.availableFrom,
    paymentTerms: doc.paymentTerms,
    leaseRequirements: doc.leaseRequirements,
  };
}

export function toTenantViewing(doc: any) {
  if (!doc) return doc;
  return {
    _id: doc._id,
    propertyId: doc.propertyId,
    requestedDate: doc.requestedDate,
    preferredTime: doc.preferredTime,
    attendees: doc.attendees,
    message: doc.message,
    status: doc.status,
    proposedDate: doc.proposedDate,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

export function toTenantApplication(doc: any) {
  if (!doc) return doc;
  return {
    _id: doc._id,
    propertyId: doc.propertyId,
    status: doc.status,
    notes: doc.notes,
    submittedAt: doc.submittedAt,
    snapshot: doc.snapshot,
    documents: doc.documents,
    statusHistory: (doc.statusHistory || []).map((h: any) => ({
      status: h.status,
      at: h.at,
    })),
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}
