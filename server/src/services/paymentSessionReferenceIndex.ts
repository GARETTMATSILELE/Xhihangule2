import mongoose from 'mongoose';

export type PaymentSessionReferenceIndexResult = {
  created: boolean;
  alreadyPresent: boolean;
  duplicateGroups: number;
};

/**
 * Unique provider reference index for subscription checkout sessions.
 * Skips creation when duplicates already exist. Does not update or delete sessions.
 * This is separate from the rental `payments` reference index.
 */
export async function ensurePaymentSessionProviderRefIndex(): Promise<PaymentSessionReferenceIndexResult> {
  const collection = mongoose.connection.collection('payment_sessions');
  const existing = await collection.indexes();
  const alreadyPresent = existing.some((index) => index.name === 'payment_sessions_provider_providerRef_unique');
  const duplicates = await collection.aggregate([
    { $match: { providerRef: { $type: 'string', $gt: '' } } },
    { $group: { _id: { provider: '$provider', providerRef: '$providerRef' }, count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 } } },
    { $count: 'groups' }
  ]).toArray();
  const duplicateGroups = Number(duplicates[0]?.groups || 0);
  if (alreadyPresent) return { created: false, alreadyPresent: true, duplicateGroups };
  if (duplicateGroups > 0) return { created: false, alreadyPresent: false, duplicateGroups };
  await collection.createIndex(
    { provider: 1, providerRef: 1 },
    { unique: true, sparse: true, name: 'payment_sessions_provider_providerRef_unique' }
  );
  return { created: true, alreadyPresent: false, duplicateGroups: 0 };
}
