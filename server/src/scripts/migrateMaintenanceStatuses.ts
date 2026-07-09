/**
 * Safe migration: maps legacy maintenance statuses to enterprise lifecycle values.
 * Run: npx ts-node src/scripts/migrateMaintenanceStatuses.ts
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { MaintenanceRequest } from '../models/MaintenanceRequest';
import { MaintenanceActivity } from '../models/MaintenanceActivity';
import { LEGACY_STATUS_MAP } from '../utils/maintenanceStatus';

dotenv.config();

const MIGRATION_MAP: Record<string, string> = {
  ...LEGACY_STATUS_MAP,
  pending: 'draft',
  pending_approval: 'awaiting_approval',
  pending_completion: 'awaiting_payment',
  cancelled: 'rejected',
};

async function migrate() {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!uri) throw new Error('MONGODB_URI not set');
  await mongoose.connect(uri);
  console.log('Connected. Migrating maintenance statuses...');

  const cursor = MaintenanceRequest.find({}).cursor();
  let updated = 0;
  for await (const doc of cursor) {
    const current = doc.status;
    const mapped = MIGRATION_MAP[current];
    if (mapped && mapped !== current) {
      doc.status = mapped as any;
      if (!doc.lastActivityAt) doc.lastActivityAt = doc.updatedAt || doc.createdAt;
      await doc.save();
      updated += 1;
    } else if (!doc.lastActivityAt) {
      doc.lastActivityAt = doc.updatedAt || doc.createdAt;
      await doc.save();
    }

    const activityCount = await MaintenanceActivity.countDocuments({ requestId: doc._id });
    if (activityCount === 0) {
      await MaintenanceActivity.create({
        requestId: doc._id,
        companyId: doc.companyId,
        action: 'Request Created',
        description: doc.title || 'Legacy maintenance request migrated',
        createdAt: doc.createdAt,
      });
    }
  }

  console.log(`Migration complete. Updated ${updated} request(s).`);
  await mongoose.disconnect();
}

migrate().catch((err) => {
  console.error(err);
  process.exit(1);
});
