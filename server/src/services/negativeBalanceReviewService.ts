import mongoose from 'mongoose';
import { ChartOfAccount } from '../models/ChartOfAccount';
import { FinancialControlException } from '../models/FinancialControlException';
import { GL } from './tax/chartAccounts';
import { roundMoney } from '../utils/money';

const toId = (value: string) => new mongoose.Types.ObjectId(value);

const WATCH = [
  GL.TRUST_BANK,
  GL.OWNER_PAYABLE,
  GL.SELLER_PAYABLE,
  GL.ZIMRA_WITHHOLDING,
  GL.TENANT_DEPOSITS,
  GL.LEVY_PAYABLE,
  GL.VAT_PAYABLE,
  GL.AGENCY_REVENUE,
  GL.COMPANY_BANK
];

export async function detectNegativeBalances(companyId: string): Promise<number> {
  const rows = await ChartOfAccount.find({
    companyId: toId(companyId),
    code: { $in: WATCH },
    isDeleted: { $ne: true }
  })
    .select('code name balance type')
    .lean();

  let created = 0;
  for (const row of rows) {
    const balance = roundMoney(Number(row.balance || 0));
    if (balance >= -0.005) continue;
    try {
      await FinancialControlException.updateOne(
        {
          companyId: toId(companyId),
          type: 'NEGATIVE_BALANCE_REVIEW',
          entityType: 'ChartOfAccount',
          entityId: String(row._id),
          status: { $in: ['OPEN', 'UNDER_REVIEW'] }
        },
        {
          $setOnInsert: {
            companyId: toId(companyId),
            type: 'NEGATIVE_BALANCE_REVIEW',
            severity: 'HIGH',
            status: 'OPEN',
            entityType: 'ChartOfAccount',
            entityId: String(row._id),
            description: `GL ${row.code} ${row.name} has a negative balance of ${balance}. Classify as permitted, temporary, or unexplained. Detection only — not auto-corrected.`,
            expected: 0,
            actual: balance,
            difference: balance,
            currency: 'USD',
            detectedAt: new Date(),
            detectedBy: 'negativeBalanceReviewService'
          }
        },
        { upsert: true }
      );
      created += 1;
    } catch {
      // already open
    }
  }
  return created;
}
