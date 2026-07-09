import mongoose from 'mongoose';
import { connectDatabase } from '../config/database';
import { logger } from '../utils/logger';

type IndexSpec = {
  collection: string;
  keys: Record<string, 1 | -1>;
  name: string;
  unique?: boolean;
  partialFilterExpression?: Record<string, any>;
};

const safeUniqueIndexes: IndexSpec[] = [
  {
    collection: 'users',
    keys: { normalizedEmail: 1 },
    name: 'users_normalizedEmail_unique_v1',
    unique: true,
    partialFilterExpression: { normalizedEmail: { $type: 'string', $ne: '' }, isArchived: { $ne: true } }
  },
  {
    collection: 'companies',
    keys: { normalizedEmail: 1 },
    name: 'companies_normalizedEmail_unique_v1',
    unique: true,
    partialFilterExpression: { normalizedEmail: { $type: 'string', $ne: '' } }
  },
  {
    collection: 'companies',
    keys: { normalizedRegistrationNumber: 1 },
    name: 'companies_normalizedRegistrationNumber_unique_v1',
    unique: true,
    partialFilterExpression: { normalizedRegistrationNumber: { $type: 'string', $ne: '' } }
  },
  {
    collection: 'companies',
    keys: { normalizedTinNumber: 1 },
    name: 'companies_normalizedTinNumber_unique_v1',
    unique: true,
    partialFilterExpression: { normalizedTinNumber: { $type: 'string', $ne: '' } }
  }
];

async function reportDuplicates(collectionName: string, field: string) {
  const collection = mongoose.connection.collection(collectionName);
  return collection.aggregate([
    { $match: { [field]: { $type: 'string', $ne: '' } } },
    { $group: { _id: `$${field}`, ids: { $push: '$_id' }, count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 } } },
    { $limit: 20 }
  ]).toArray();
}

export async function runSaasSafeIndexes() {
  await connectDatabase();

  for (const index of safeUniqueIndexes) {
    try {
      await mongoose.connection.collection(index.collection).createIndex(index.keys, {
        name: index.name,
        unique: index.unique,
        partialFilterExpression: index.partialFilterExpression,
        background: true
      } as any);
      logger.info('Created safe SaaS index', { collection: index.collection, name: index.name });
    } catch (error: any) {
      const duplicates = await reportDuplicates(index.collection, Object.keys(index.keys)[0]);
      logger.warn('Skipped safe SaaS index because legacy duplicates or index conflicts exist', {
        collection: index.collection,
        name: index.name,
        message: error?.message || String(error),
        duplicateSamples: duplicates
      });
    }
  }
}

if (require.main === module) {
  runSaasSafeIndexes()
    .then(() => {
      logger.info('SaaS safe index migration completed');
      process.exit(0);
    })
    .catch((error) => {
      logger.error('SaaS safe index migration failed', { message: error?.message || String(error) });
      process.exit(1);
    });
}
