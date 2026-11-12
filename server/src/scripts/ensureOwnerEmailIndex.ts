/**
 * Explicit owner email index migration.
 * autoIndex and autoCreate are disabled, so Mongoose will not create this index.
 *
 * Dry run (default):
 *   npx ts-node --transpile-only src/scripts/ensureOwnerEmailIndex.ts
 *
 * Apply only when the dry run reports no duplicate, empty, or invalid emails:
 *   npx ts-node --transpile-only src/scripts/ensureOwnerEmailIndex.ts --apply
 *
 * The script never deletes or merges owner records.
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

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const INDEX_NAME = 'company_email_unique';

function maskEmail(email: string): string {
  const [local, domain] = String(email || '').split('@');
  const head = (local || '').slice(0, 2);
  return `${head}***@${domain || 'invalid'}`;
}

async function main() {
  const apply = process.argv.includes('--apply');
  const { connectDatabase } = await import('../config/database');
  const { PropertyOwner } = await import('../models/PropertyOwner');
  await connectDatabase();

  const owners = await PropertyOwner.find({}).select('companyId email').lean();
  const groups = new Map<string, { companyId: string; email: string; count: number }>();
  let emptyEmails = 0;
  let invalidEmails = 0;
  for (const owner of owners) {
    const email = String((owner as any).email || '').trim().toLowerCase();
    const companyId = String((owner as any).companyId || '');
    if (!email) {
      emptyEmails += 1;
      continue;
    }
    if (!EMAIL_RE.test(email)) invalidEmails += 1;
    const key = `${companyId}|${email}`;
    const current = groups.get(key) || { companyId, email, count: 0 };
    current.count += 1;
    groups.set(key, current);
  }
  const duplicates = [...groups.values()].filter((row) => row.count > 1);

  console.log(`owners=${owners.length}`);
  console.log(`emptyEmails=${emptyEmails}`);
  console.log(`invalidEmails=${invalidEmails}`);
  console.log(`duplicateCompanyEmails=${duplicates.length}`);
  for (const row of duplicates) {
    console.log(`duplicate company=${row.companyId} email=${maskEmail(row.email)} count=${row.count}`);
  }

  const indexes = await PropertyOwner.collection.indexes();
  const existing = indexes.find((index) => index.name === INDEX_NAME);
  console.log(`indexPresent=${Boolean(existing)}`);

  if (!apply) {
    console.log('dry-run only; no index was created');
    process.exit(duplicates.length || emptyEmails ? 2 : 0);
  }
  if (duplicates.length || emptyEmails) {
    console.error('Refusing to create the unique index until duplicate and empty emails are resolved manually.');
    process.exit(3);
  }
  if (existing) {
    console.log('index already present');
    process.exit(0);
  }
  await PropertyOwner.collection.createIndex(
    { companyId: 1, email: 1 },
    { unique: true, name: INDEX_NAME, background: true },
  );
  console.log('index created');
  process.exit(0);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Owner email index migration failed');
  process.exit(1);
});
