import dotenv from 'dotenv';
import mongoose from 'mongoose';

dotenv.config();

type Transaction = {
  _id?: any;
  type: 'commission' | 'payout' | 'penalty' | 'adjustment';
  amount: number;
  date: Date;
  description: string;
  reference?: string;
  status: 'pending' | 'completed' | 'failed' | 'cancelled';
  runningBalance?: number;
  notes?: string;
  category?: string;
  paymentId?: any;
};

async function main() {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI || '';
  if (!uri) {
    console.error('Missing MONGODB_URI env');
    process.exit(1);
  }

  const dryRun = process.argv.includes('--dry');
  const onlyAgentId = process.argv.find((a) => a.startsWith('--agent='))?.split('=')[1];

  await mongoose.connect(uri);
  const db = mongoose.connection;
  db.on('error', (err) => console.error('Mongo error:', err));

  const AgentAccounts = db.collection('agentaccounts');

  let scanned = 0; let modified = 0; let removed = 0;

  const cursor = AgentAccounts.find({}, { projection: { _id: 1, agentId: 1, transactions: 1 } });
  while (await cursor.hasNext()) {
    const acc: any = await cursor.next();
    if (!acc) break;
    scanned++;
    if (onlyAgentId && String(acc.agentId) !== String(onlyAgentId)) continue;

    const txs: Transaction[] = Array.isArray(acc.transactions) ? acc.transactions : [];
    if (txs.length === 0) continue;

    const inferRole = (ref: string): 'owner' | 'collaborator' | 'agent' => {
      const r = (ref || '').toLowerCase();
      if (r.endsWith('-owner')) return 'owner';
      if (r.endsWith('-collaborator')) return 'collaborator';
      return 'agent';
    };
    const normalizeRef = (ref?: string) => String(ref || '').trim().replace(/\s+/g, ' ').toLowerCase();

    // Partition non-commission and commission
    const nonCommission: Transaction[] = [];
    const commissions: Transaction[] = [];
    for (const t of txs) {
      if (t.type === 'commission') commissions.push(t); else nonCommission.push(t);
    }

    // Group payment-backed commissions by (paymentId, role), keep latest by date
    const keepByPidRole: Record<string, Transaction> = Object.create(null);
    // Bucket legacy commissions (no paymentId) by (normalizedRef, role, amountCents)
    const legacyBuckets: Record<string, Transaction[]> = Object.create(null);

    for (const t of commissions) {
      const ref = String(t.reference || '');
      const role = inferRole(ref);
      if ((t as any).paymentId) {
        const key = `${String((t as any).paymentId)}:${role}`;
        const existing = keepByPidRole[key];
        if (!existing || new Date(t.date).getTime() >= new Date(existing.date).getTime()) {
          keepByPidRole[key] = t;
        }
      } else {
        const amtCents = Math.round(Number(t.amount || 0) * 100);
        const bucketKey = `${normalizeRef(ref)}:${role}:${amtCents}`;
        if (!legacyBuckets[bucketKey]) legacyBuckets[bucketKey] = [];
        legacyBuckets[bucketKey].push(t);
      }
    }

    // Build a set of pid-backed keys by (normalizedRef, role) to drop matching legacy
    const pidRefRoleKeys = new Set<string>();
    Object.values(keepByPidRole).forEach(t => {
      pidRefRoleKeys.add(`${normalizeRef(t.reference)}:${inferRole(String(t.reference || ''))}`);
    });

    // Final commissions: start with payment-backed (unique per paymentId+role)
    const finalCommissions: Transaction[] = Object.values(keepByPidRole);

    // For each legacy bucket, keep at most one entry if there is no payment-backed entry for same normalizedRef+role
    for (const bucketKey of Object.keys(legacyBuckets)) {
      const list = legacyBuckets[bucketKey];
      if (!list || list.length === 0) continue;
      // Derive role/ref from first entry
      const sample = list[0];
      const ref = String(sample.reference || '');
      const role = inferRole(ref);
      const refRoleKey = `${normalizeRef(ref)}:${role}`;
      if (pidRefRoleKeys.has(refRoleKey)) {
        // Covered by a payment-backed entry -> drop entire legacy bucket
        removed += list.length;
        continue;
      }
      // Otherwise keep a single (earliest by date) legacy entry
      const chosen = list.slice().sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())[0];
      // Collapse rest
      removed += list.length - 1;
      finalCommissions.push(chosen);
    }

    // Sort by date ascending
    const newTxs = [...nonCommission, ...finalCommissions]
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    // Recalculate totals and running balance in cents; include only completed
    let commissionCents = 0; let payoutCents = 0; let penaltyCents = 0; let balanceCents = 0;
    for (const t of newTxs) {
      const amtCents = Math.round(Number(t.amount || 0) * 100);
      const isCompleted = t.status === 'completed';
      if (t.type === 'commission' && isCompleted) { commissionCents += amtCents; balanceCents += amtCents; }
      else if (t.type === 'payout' && isCompleted) { payoutCents += amtCents; balanceCents -= amtCents; }
      else if (t.type === 'penalty' && isCompleted) { penaltyCents += amtCents; balanceCents -= amtCents; }
      (t as any).runningBalance = Number((balanceCents / 100).toFixed(2));
    }

    // Determine if anything changed
    const changed = JSON.stringify(txs) !== JSON.stringify(newTxs);
    if (changed && !dryRun) {
      await AgentAccounts.updateOne({ _id: acc._id }, {
        $set: {
          transactions: newTxs,
          totalCommissions: Number((commissionCents / 100).toFixed(2)),
          totalPayouts: Number((payoutCents / 100).toFixed(2)),
          totalPenalties: Number((penaltyCents / 100).toFixed(2)),
          runningBalance: Number((balanceCents / 100).toFixed(2)),
          lastUpdated: new Date(),
        }
      });
      modified++;
    } else if (changed && dryRun) {
      modified++;
    }
  }

  console.log(`${dryRun ? 'Would modify' : 'Modified'} ${modified} agent accounts; ${dryRun ? 'would remove' : 'removed'} ${removed} duplicate commission transactions. Scanned ${scanned} accounts.`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

