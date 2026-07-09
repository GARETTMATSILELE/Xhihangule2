/**
 * Safe migration: backfill missing Company.workspaceType values to "agency".
 *
 * Dry run:
 *   npx ts-node src/scripts/migrateCompanyWorkspaceType.ts
 *
 * Apply:
 *   npx ts-node src/scripts/migrateCompanyWorkspaceType.ts --apply
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { Company } from '../models/Company';

dotenv.config();

async function migrate() {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!uri) throw new Error('MONGODB_URI not set');

  const apply = process.argv.includes('--apply');
  await mongoose.connect(uri);

  const query = {
    $or: [
      { workspaceType: { $exists: false } },
      { workspaceType: null },
      { workspaceType: '' }
    ]
  };
  const count = await Company.countDocuments(query);

  console.log(`Companies missing workspaceType: ${count}`);
  if (!apply) {
    console.log('Dry run only. Re-run with --apply to backfill workspaceType="agency".');
    await mongoose.disconnect();
    return;
  }

  const result = await Company.updateMany(query, { $set: { workspaceType: 'agency' } });
  console.log(`Migration complete. Updated ${result.modifiedCount} compan${result.modifiedCount === 1 ? 'y' : 'ies'}.`);
  await mongoose.disconnect();
}

migrate().catch((err) => {
  console.error(err);
  process.exit(1);
});
