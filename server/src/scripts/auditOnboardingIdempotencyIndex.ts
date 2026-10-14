/**
 * Read-only report for the onboarding_sessions idempotencyKey index.
 * Does not drop indexes, rewrite keys, or delete sessions.
 * Refuses production and any non-local database host.
 *
 * Manual replacement, only after this report shows zero duplicate keys for that collection:
 * 1. Confirm the listed index is { idempotencyKey: 1 } named idempotencyKey_1 and is not unique.
 * 2. Drop only that index: db.<collection>.dropIndex("idempotencyKey_1")
 * 3. Create the unique index: db.<collection>.createIndex({ idempotencyKey: 1 }, { name: "idempotencyKey_1", unique: true })
 * Use onboarding_sessions and, if its report matches, payment_sessions.
 * Rollback: drop idempotencyKey_1 and recreate it without unique.
 * Cosmos DB accepts this drop-and-create pair. It does not alter an existing index in place.
 * If duplicate keys are listed, rename only the extra session keys after review. Do not delete sessions.
 */
import dotenv from 'dotenv';
import mongoose from 'mongoose';

dotenv.config();

function databaseHost(uri: string): string {
  const withoutScheme = uri.replace(/^mongodb(\+srv)?:\/\//, '');
  const authority = withoutScheme.split('/')[0] || '';
  const hostPort = authority.split('@').pop() || '';
  return hostPort.split(':')[0].replace(/^\[|\]$/g, '');
}

async function main() {
  if (process.env.NODE_ENV === 'production') {
    console.error('Refusing onboarding index audit because NODE_ENV=production.');
    process.exit(2);
  }
  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/property-management';
  const host = databaseHost(uri);
  if (host !== 'localhost' && host !== '127.0.0.1') {
    console.error('Refusing onboarding index audit because the database host is not local.');
    process.exit(2);
  }

  await mongoose.connect(uri, { serverSelectionTimeoutMS: 8000, autoIndex: false });

  const reportCollection = async (name: string) => {
    const collection = mongoose.connection.collection(name);
    const indexes = await collection.indexes();
    const idempotencyIndex = indexes.find((index) => index.name === 'idempotencyKey_1') || null;
    const duplicates = await collection.aggregate([
      { $match: { idempotencyKey: { $type: 'string', $gt: '' } } },
      { $group: { _id: '$idempotencyKey', count: { $sum: 1 }, ids: { $push: '$_id' } } },
      { $match: { count: { $gt: 1 } } },
      { $project: { _id: 0, idempotencyKey: '$_id', count: 1, ids: 1 } }
    ]).toArray();
    const emptyKeys = await collection.countDocuments({
      $or: [{ idempotencyKey: { $exists: false } }, { idempotencyKey: null }, { idempotencyKey: '' }]
    });
    return {
      collection: name,
      idempotencyIndex,
      duplicateNonEmptyKeys: duplicates.length,
      duplicates,
      emptyOrMissingKeys: emptyKeys
    };
  };

  console.log(JSON.stringify({
    readOnly: true,
    databaseHost: host,
    collections: [
      await reportCollection('onboarding_sessions'),
      await reportCollection('payment_sessions')
    ]
  }, null, 2));
  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await mongoose.disconnect().catch(() => undefined);
  process.exit(1);
});
