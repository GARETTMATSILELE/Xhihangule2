import 'dotenv/config';
import { connectDatabase, closeDatabase } from '../config/database';
import { reconcileDuplicates } from '../services/reconciliationService';

async function main() {
  const argv = process.argv.slice(2);
  const isApply = argv.includes('--apply');
  const isDryRun = argv.includes('--dry-run') || !isApply;

  console.log(`[reconcile] Starting reconciliation (${isDryRun ? 'dry-run' : 'apply'})`);
  await connectDatabase();
  try {
    const result = await reconcileDuplicates(isDryRun);
    console.log('[reconcile] Result summary:', JSON.stringify(result, null, 2));
    if (!isDryRun) {
      console.log('[reconcile] Apply completed successfully.');
    } else {
      console.log('[reconcile] Dry-run completed (no changes applied).');
    }
    process.exitCode = 0;
  } catch (e: any) {
    console.error('[reconcile] Failed:', e?.message || e);
    process.exitCode = 1;
  } finally {
    await closeDatabase();
  }
}

main().catch(async (e) => {
  console.error('[reconcile] Unhandled error:', e);
  try { await closeDatabase(); } catch {}
  process.exit(1);
});










