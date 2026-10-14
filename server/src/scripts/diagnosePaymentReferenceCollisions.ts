/**
 * Read-only listing of payment reference collisions.
 * Does not update payments, rebuild indexes, or connect to a non-local database.
 */
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { COLLECTIONS } from '../config/collections';
import { classifyPaymentReferenceGroup } from '../services/paymentReferenceDiagnostics';

dotenv.config();

function databaseHost(uri: string): string {
  const withoutScheme = uri.replace(/^mongodb(\+srv)?:\/\//, '');
  const authority = withoutScheme.split('/')[0] || '';
  const hostPort = authority.split('@').pop() || '';
  return hostPort.split(':')[0].replace(/^\[|\]$/g, '');
}

async function main() {
  if (process.env.NODE_ENV === 'production') {
    console.error('Refusing payment-reference diagnostic because NODE_ENV=production.');
    process.exit(2);
  }
  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/property-management';
  const host = databaseHost(uri);
  if (host !== 'localhost' && host !== '127.0.0.1') {
    console.error('Refusing payment-reference diagnostic because the database host is not local.');
    process.exit(2);
  }

  await mongoose.connect(uri, { serverSelectionTimeoutMS: 8000 });
  const payments = mongoose.connection.collection(COLLECTIONS.PAYMENTS);
  const indexes = await payments.indexes();
  const uniqueIndex = indexes.find((index) => index.name === 'companyId_1_referenceNumber_1');
  const groups = await payments.aggregate([
    { $match: { referenceNumber: { $type: 'string', $gt: '' } } },
    {
      $group: {
        _id: { companyId: '$companyId', referenceNumber: '$referenceNumber' },
        count: { $sum: 1 },
        records: {
          $push: {
            id: '$_id',
            status: '$status',
            paymentType: '$paymentType',
            paymentDate: '$paymentDate',
            createdAt: '$createdAt',
            amount: '$amount',
          },
        },
      },
    },
    { $match: { count: { $gt: 1 } } },
    { $sort: { count: -1 } },
  ]).toArray();

  const report = {
    readOnly: true,
    databaseHost: host,
    collection: COLLECTIONS.PAYMENTS,
    uniqueIndexName: 'companyId_1_referenceNumber_1',
    uniqueIndexActive: Boolean(uniqueIndex && uniqueIndex.unique),
    collisionGroups: groups.length,
    groups: groups.map((group) => ({
      companyId: String(group._id?.companyId || ''),
      referenceNumber: String(group._id?.referenceNumber || ''),
      count: group.count,
      classification: classifyPaymentReferenceGroup(group.records || []),
      records: (group.records || []).slice(0, 20).map((record: any) => ({
        id: String(record.id),
        status: record.status || '',
        paymentType: record.paymentType || '',
        paymentDate: record.paymentDate || null,
        createdAt: record.createdAt || null,
        amount: record.amount,
      })),
    })),
  };
  console.log(JSON.stringify(report, null, 2));
  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error('Payment-reference diagnostic failed:', error instanceof Error ? error.message : 'unknown error');
  try { await mongoose.disconnect(); } catch { /* already closed */ }
  process.exit(1);
});
