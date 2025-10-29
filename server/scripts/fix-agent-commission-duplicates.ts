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
};

interface AgentAccountDoc extends mongoose.Document {
  _id: any;
  agentId: mongoose.Types.ObjectId;
  transactions: Transaction[];
  totalCommissions: number;
  totalPayouts: number;
  totalPenalties: number;
  runningBalance: number;
  lastUpdated: Date;
}

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

  const cursor = AgentAccounts.find({}, { projection: { _id: 1, agentId: 1, transactions: 1, totalCommissions: 1, totalPayouts: 1, totalPenalties: 1 } });
  while (await cursor.hasNext()) {
    const acc: any = await cursor.next();
    if (!acc) break;
    scanned++;
    if (onlyAgentId && String(acc.agentId) !== String(onlyAgentId)) continue; // scope if provided

    const txs: Transaction[] = Array.isArray(acc.transactions) ? acc.transactions : [];
    if (txs.length === 0) continue;

    // Build groups by baseRef extracted from description/reference
    const extractBaseRef = (t: Transaction): string | null => {
    if (t.reference) {
      // For sales split entries the reference could be RCPT-...-owner/collaborator; for rentals legacy duplicates used '-agent'
      const ref = String(t.reference);
      const m = ref.match(/^(.*?)(?:-(owner|collaborator|agent))?$/);
      return m ? m[1] : ref;
    }
      if (typeof t.description === 'string') {
        const m = t.description.match(/payment\s+([^\s]+)$/i);
        if (m) return m[1];
      }
      return null;
    };

    const groups = new Map<string, Transaction[]>();
    for (const t of txs) {
      if (t.type !== 'commission') continue;
      const ref = extractBaseRef(t);
      if (!ref) continue;
      if (!groups.has(ref)) groups.set(ref, []);
      groups.get(ref)!.push(t);
    }

    let changed = false;
    const toKeep = new Set<string>();
    const toRemoveIds: any[] = [];

    for (const [ref, list] of groups.entries()) {
      if (list.length < 2) continue;
      // Prefer keeping an entry WITHOUT the '(agent)' tag in description if present
      const withoutTag = list.find((t) => !/(\(agent\))/i.test(t.description || '')) || list[0];
      for (const t of list) {
        const idStr = String((t as any)._id || '');
        if (t === withoutTag) {
          toKeep.add(idStr);
        } else if (/(\(agent\))/i.test(t.description || '')) {
          toRemoveIds.push((t as any)._id);
        }
      }
    }

    if (toRemoveIds.length > 0) {
      changed = true;
      removed += toRemoveIds.length;
      if (!dryRun) {
        // Filter transactions
        const newTxs = txs.filter((t: any) => !toRemoveIds.some((id) => String(id) === String(t._id)));
        // Recalculate totals and running balance
        let totalCommissions = 0; let totalPayouts = 0; let totalPenalties = 0; let balance = 0;
        const sorted = newTxs.slice().sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        for (const t of sorted) {
          if (t.type === 'commission') { totalCommissions += t.amount; balance += t.amount; }
          else if (t.type === 'payout') { totalPayouts += t.amount; balance -= t.amount; }
          else if (t.type === 'penalty') { totalPenalties += t.amount; balance -= t.amount; }
          (t as any).runningBalance = balance;
        }
        await AgentAccounts.updateOne({ _id: acc._id }, {
          $set: {
            transactions: newTxs,
            totalCommissions,
            totalPayouts,
            totalPenalties,
            runningBalance: balance,
            lastUpdated: new Date(),
          }
        });
      }
    }

    if (changed) modified++;
  }

  console.log(`${dryRun ? 'Would modify' : 'Modified'} ${modified} agent accounts; ${dryRun ? 'would remove' : 'removed'} ${removed} duplicate commission transactions. Scanned ${scanned} accounts.`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});


