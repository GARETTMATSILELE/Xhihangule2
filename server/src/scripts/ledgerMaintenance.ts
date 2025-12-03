import dotenv from 'dotenv';
import { connectDatabase, closeDatabase } from '../config/database';
import { runPropertyLedgerMaintenance } from '../services/propertyAccountService';

// Load environment (supports ENV_FILE override)
const ENV_PATH = process.env.ENV_FILE || (process.env.NODE_ENV === 'production' ? '.env.production' : '.env');
dotenv.config({ path: ENV_PATH });

function parseArgs(argv: string[]): { companyId?: string; dryRun: boolean } {
  const args = argv.slice(2);
  let companyId: string | undefined;
  let dryRun = false;
  for (const a of args) {
    if (a === '--dry-run' || a === '--dry' || a === '-n') dryRun = true;
    else if (a.startsWith('--company-id=')) companyId = a.split('=')[1];
    else if (!a.startsWith('--') && !companyId) companyId = a;
  }
  return { companyId, dryRun };
}

async function main() {
  const { companyId, dryRun } = parseArgs(process.argv);
  if (!companyId) {
    console.error('Usage: npm run ledger:maintain -- --company-id=<id> [--dry-run]');
    process.exit(1);
  }
  const started = Date.now();
  console.log(`[ledger:maintain] Starting maintenance for companyId=${companyId} dryRun=${dryRun}`);
  try {
    await connectDatabase();
    const result = await runPropertyLedgerMaintenance({ companyId, dryRun });
    console.log('[ledger:maintain] Maintenance complete:', JSON.stringify(result, null, 2));
    console.log(`[ledger:maintain] Duration: ${Date.now() - started}ms`);
    process.exit(0);
  } catch (e: any) {
    console.error('[ledger:maintain] Failed:', e?.message || e);
    process.exit(1);
  } finally {
    try { await closeDatabase(); } catch {}
  }
}

// eslint-disable-next-line @typescript-eslint/no-floating-promises
main();


