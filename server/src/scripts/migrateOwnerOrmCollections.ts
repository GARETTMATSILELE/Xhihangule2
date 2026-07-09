/**
 * Ensures owner ORM collections and indexes exist without altering PropertyOwner records.
 * Run: npx ts-node src/scripts/migrateOwnerOrmCollections.ts
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { OwnerDocument } from '../models/OwnerDocument';
import { OwnerBankingDetails } from '../models/OwnerBankingDetails';
import { OwnerPreferences } from '../models/OwnerPreferences';
import { OwnershipHistory } from '../models/OwnershipHistory';
import { PropertyOwner } from '../models/PropertyOwner';

dotenv.config();

async function main() {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!uri) throw new Error('MONGODB_URI required');
  await mongoose.connect(uri);

  const models = [OwnerDocument, OwnerBankingDetails, OwnerPreferences, OwnershipHistory, PropertyOwner];
  for (const model of models) {
    await model.createCollection().catch(() => undefined);
    await model.syncIndexes();
    console.log(`Synced indexes for ${model.modelName}`);
  }

  console.log('Owner ORM migration complete');
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
