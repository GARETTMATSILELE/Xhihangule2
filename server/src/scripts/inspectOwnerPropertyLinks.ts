/**
 * Read-only check for Property.ownerId being mistaken for a landlord id.
 * Prints counts only. Does not update properties.
 */
import fs from 'fs';
import path from 'path';
import { config as loadEnv, parse as parseEnv } from 'dotenv';

const serverRoot = path.resolve(__dirname, '..', '..');
loadEnv({ path: path.join(serverRoot, '.env') });
const localPath = path.join(serverRoot, '.env.development.local');
if (fs.existsSync(localPath)) {
  const parsed = parseEnv(fs.readFileSync(localPath));
  for (const [key, value] of Object.entries(parsed)) {
    if (!process.env[key]) process.env[key] = value;
  }
}

async function main() {
  const { connectDatabase } = await import('../config/database');
  const { Property } = await import('../models/Property');
  const { PropertyOwner } = await import('../models/PropertyOwner');
  const { User } = await import('../models/User');
  await connectDatabase();

  const [properties, owners, users] = await Promise.all([
    Property.find({ isDeleted: { $ne: true } }).select('ownerId propertyOwnerId').lean(),
    PropertyOwner.find({}).select('_id').lean(),
    User.find({}).select('_id').lean(),
  ]);
  const ownerIds = new Set(owners.map((owner) => String((owner as any)._id)));
  const userIds = new Set(users.map((user) => String((user as any)._id)));
  let ownerIdMatchesLandlord = 0;
  let ownerIdMatchesUser = 0;
  let ownerIdMatchesBoth = 0;
  let ownerIdMatchesNeither = 0;
  let propertyOwnerLinks = 0;
  for (const property of properties) {
    const ownerId = String((property as any).ownerId || '');
    if ((property as any).propertyOwnerId) propertyOwnerLinks += 1;
    if (!ownerId) continue;
    const asOwner = ownerIds.has(ownerId);
    const asUser = userIds.has(ownerId);
    if (asOwner && asUser) ownerIdMatchesBoth += 1;
    else if (asOwner) ownerIdMatchesLandlord += 1;
    else if (asUser) ownerIdMatchesUser += 1;
    else ownerIdMatchesNeither += 1;
  }
  console.log(JSON.stringify({
    properties: properties.length,
    propertyOwnerLinks,
    ownerIdMatchesUser,
    ownerIdMatchesLandlord,
    ownerIdMatchesBoth,
    ownerIdMatchesNeither,
  }));
  process.exit(0);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Owner link inspection failed');
  process.exit(1);
});
