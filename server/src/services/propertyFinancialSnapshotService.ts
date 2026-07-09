import mongoose from 'mongoose';
import { Property } from '../models/Property';
import { Lease } from '../models/Lease';
import { IPropertyAccount, Transaction } from '../models/PropertyAccount';
import propertyAccountService from './propertyAccountService';
import { AppError } from '../middleware/errorHandler';

/** Canonical per-property financial view — same ledger source as accountant property accounts. */
export interface PropertyFinancialSnapshot {
  propertyId: string;
  propertyName: string;
  address: string;
  monthlyRent: number;
  /** Tenant rent owed (Property.currentArrears) */
  tenantArrears: number;
  ledger: {
    accountId: string;
    ledgerType: 'rental' | 'sale';
    runningBalance: number;
    totalIncome: number;
    totalExpenses: number;
    totalOwnerPayouts: number;
  };
  monthlyIncomeByMonth: { month: string; amount: number }[];
}

function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function buildMonthlyIncome(transactions: Transaction[]): { month: string; amount: number }[] {
  const map: Record<string, number> = {};
  for (const t of transactions) {
    if (t.type !== 'income' || t.status !== 'completed') continue;
    const d = t.date ? new Date(t.date) : new Date();
    const key = monthKey(d);
    map[key] = (map[key] || 0) + Number(t.amount || 0);
  }
  return Object.entries(map)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-12)
    .map(([month, amount]) => ({ month, amount }));
}

export async function getPropertyFinancialSnapshot(
  propertyId: string,
  companyId: string,
  _legacyLedgerHint?: 'rental' | 'sale'
): Promise<PropertyFinancialSnapshot> {
  const pid = new mongoose.Types.ObjectId(propertyId);
  const cid = new mongoose.Types.ObjectId(companyId);

  const property = await Property.findOne({ _id: pid, companyId: cid, isDeleted: { $ne: true } }).lean();
  if (!property) throw new AppError('Property not found', 404);

  const account = (await propertyAccountService.getPropertyAccount(propertyId)) as IPropertyAccount;
  const transactions = Array.isArray(account.transactions) ? account.transactions : [];

  const activeLease = await Lease.findOne({
    propertyId: pid,
    companyId: cid,
    status: 'active',
  })
    .select('rentAmount')
    .lean();

  return {
    propertyId: String(property._id),
    propertyName: property.name,
    address: property.address || '',
    monthlyRent: Number(property.rent || activeLease?.rentAmount || 0),
    tenantArrears: Number(property.currentArrears || 0),
    ledger: {
      accountId: String(account._id),
      ledgerType: (account.ledgerType as 'rental' | 'sale'),
      runningBalance: Number(account.runningBalance || 0),
      totalIncome: Number(account.totalIncome || 0),
      totalExpenses: Number(account.totalExpenses || 0),
      totalOwnerPayouts: Number(account.totalOwnerPayouts || 0),
    },
    monthlyIncomeByMonth: buildMonthlyIncome(transactions),
  };
}

export async function getPropertyFinancialSnapshots(
  propertyIds: mongoose.Types.ObjectId[],
  companyId: string,
  _legacyLedgerHint?: 'rental' | 'sale'
): Promise<Map<string, PropertyFinancialSnapshot>> {
  const map = new Map<string, PropertyFinancialSnapshot>();
  await Promise.all(
    propertyIds.map(async (id) => {
      try {
        const snap = await getPropertyFinancialSnapshot(String(id), companyId);
        map.set(String(id), snap);
      } catch {
        // Property may be deleted or missing ledger — skip
      }
    })
  );
  return map;
}

export function mergeMonthlyIncome(
  snapshots: PropertyFinancialSnapshot[]
): { month: string; amount: number }[] {
  const map: Record<string, number> = {};
  for (const s of snapshots) {
    for (const row of s.monthlyIncomeByMonth) {
      map[row.month] = (map[row.month] || 0) + row.amount;
    }
  }
  return Object.entries(map)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-12)
    .map(([month, amount]) => ({ month, amount }));
}

export function aggregateOwnerLedgerTotals(snapshots: PropertyFinancialSnapshot[]) {
  return snapshots.reduce(
    (acc, s) => ({
      rentCollected: acc.rentCollected + s.ledger.totalIncome,
      totalExpenses: acc.totalExpenses + s.ledger.totalExpenses,
      ownerPayouts: acc.ownerPayouts + s.ledger.totalOwnerPayouts,
      trustBalance: acc.trustBalance + s.ledger.runningBalance,
      tenantArrears: acc.tenantArrears + s.tenantArrears,
      monthlyRevenue: acc.monthlyRevenue + s.monthlyRent,
    }),
    { rentCollected: 0, totalExpenses: 0, ownerPayouts: 0, trustBalance: 0, tenantArrears: 0, monthlyRevenue: 0 }
  );
}
