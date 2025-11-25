import mongoose from 'mongoose';
import { Payment } from '../models/Payment';
import { AgentAccount, IAgentAccount, Transaction } from '../models/AgentAccount';

export interface ReconciliationResult {
  payments: {
    duplicatesFound: number;
    groupsAffected: number;
    updates: Array<{ companyId: string; referenceNumber: string; keptId: string; updatedIds: string[] }>;
  };
  agentCommissions: {
    duplicatesFound: number;
    accountsAffected: number;
    removals: Array<{ agentId: string; reference: string; keptId: string; removedIds: string[] }>;
  };
}

function toObjectId(id: any): string {
  try {
    return new mongoose.Types.ObjectId(id).toString();
  } catch {
    return String(id);
  }
}

export async function reconcileDuplicates(dryRun: boolean = true): Promise<ReconciliationResult> {
  const result: ReconciliationResult = {
    payments: {
      duplicatesFound: 0,
      groupsAffected: 0,
      updates: []
    },
    agentCommissions: {
      duplicatesFound: 0,
      accountsAffected: 0,
      removals: []
    }
  };

  // 1) Payment reference duplicates per company
  const dupGroups = await Payment.aggregate([
    {
      $match: {
        referenceNumber: { $exists: true, $ne: '', $type: 'string' }
      }
    },
    {
      $group: {
        _id: { companyId: '$companyId', referenceNumber: '$referenceNumber' },
        count: { $sum: 1 },
        ids: { $push: { _id: '$_id', createdAt: '$createdAt' } }
      }
    },
    { $match: { count: { $gt: 1 } } }
  ]);

  for (const grp of dupGroups) {
    const companyId = toObjectId(grp._id.companyId);
    const referenceNumber: string = grp._id.referenceNumber;
    const ids: Array<{ _id: mongoose.Types.ObjectId; createdAt: Date }> = grp.ids || [];
    // keep earliest
    const sorted = [...ids].sort((a, b) => {
      const at = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bt = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return at - bt;
    });
    const keep = sorted[0];
    const dups = sorted.slice(1);
    result.payments.groupsAffected += 1;
    result.payments.duplicatesFound += dups.length;
    const updatedIds: string[] = [];
    if (!dryRun) {
      let idx = 1;
      for (const d of dups) {
        const newRef = `${referenceNumber}-DUP-${idx++}`;
        const update = await Payment.updateOne(
          { _id: d._id },
          { $set: { referenceNumber: newRef, notes: `Duplicate of ${referenceNumber}` } }
        );
        if (update.acknowledged) {
          updatedIds.push(toObjectId(d._id));
        }
      }
    } else {
      for (const d of dups) {
        updatedIds.push(toObjectId(d._id));
      }
    }
    result.payments.updates.push({
      companyId,
      referenceNumber,
      keptId: toObjectId(keep._id),
      updatedIds
    });
  }

  // 2) Agent commission duplicates by reference within each AgentAccount
  const accounts: IAgentAccount[] = await AgentAccount.find({}).lean();
  for (const acct of accounts) {
    const txns: Transaction[] = Array.isArray(acct.transactions) ? acct.transactions : [];
    const seen = new Map<string, string>(); // ref -> txnId kept
    const duplicates: Array<{ keptId: string; removeId: string; reference: string }> = [];
    for (const t of txns) {
      if (t.type === 'commission' && t.reference && typeof t.reference === 'string' && t.reference.trim().length > 0) {
        const ref = t.reference.trim();
        const idStr = t._id ? toObjectId(t._id) : '';
        if (!seen.has(ref)) {
          seen.set(ref, idStr);
        } else {
          duplicates.push({ keptId: seen.get(ref)!, removeId: idStr, reference: ref });
        }
      }
    }
    if (duplicates.length === 0) continue;

    result.agentCommissions.accountsAffected += 1;
    result.agentCommissions.duplicatesFound += duplicates.length;

    const removedByRef: Record<string, string[]> = {};
    const keptByRef: Record<string, string> = {};
    for (const d of duplicates) {
      removedByRef[d.reference] = removedByRef[d.reference] || [];
      removedByRef[d.reference].push(d.removeId);
      keptByRef[d.reference] = d.keptId;
    }

    if (!dryRun) {
      // Remove duplicate transactions, keep first
      const toRemoveIds = duplicates.map(d => d.removeId).filter(Boolean);
      await AgentAccount.updateOne(
        { _id: acct._id },
        { $pull: { transactions: { _id: { $in: toRemoveIds.map(id => new mongoose.Types.ObjectId(id)) } } } }
      );
      // Recalculate totals
      const fresh = await AgentAccount.findById(acct._id);
      if (fresh) {
        const tx = Array.isArray(fresh.transactions) ? fresh.transactions : [];
        const totalCommissions = tx.filter(x => x.type === 'commission').reduce((s, x) => s + (x.amount || 0), 0);
        const totalPayouts = tx.filter(x => x.type === 'payout').reduce((s, x) => s + (x.amount || 0), 0);
        const totalPenalties = tx.filter(x => x.type === 'penalty').reduce((s, x) => s + (x.amount || 0), 0);
        fresh.totalCommissions = totalCommissions;
        fresh.totalPayouts = totalPayouts;
        fresh.totalPenalties = totalPenalties;
        fresh.runningBalance = totalCommissions - totalPayouts - totalPenalties;
        const commissionDates = tx.filter(x => x.type === 'commission' && x.date).map(x => new Date(x.date as any).getTime());
        if (commissionDates.length > 0) {
          fresh.lastCommissionDate = new Date(Math.max(...commissionDates));
        }
        fresh.lastUpdated = new Date();
        await fresh.save();
      }
    }

    for (const ref of Object.keys(removedByRef)) {
      result.agentCommissions.removals.push({
        agentId: toObjectId(acct.agentId),
        reference: ref,
        keptId: keptByRef[ref],
        removedIds: removedByRef[ref]
      });
    }
  }

  return result;
}










