import mongoose from 'mongoose';
import { Payment } from '../models/Payment';
import { FinancialControlException } from '../models/FinancialControlException';
import { roundMoney } from '../utils/money';

const toId = (value: string) => new mongoose.Types.ObjectId(value);

function dayKey(value: Date | string | undefined): string {
  const d = value ? new Date(value) : new Date(0);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

export async function detectDuplicatePayments(companyId: string): Promise<number> {
  const rows = await Payment.find({
    companyId: toId(companyId),
    status: { $in: ['completed', 'posted'] },
    isProvisional: { $ne: true },
    reversalOfPaymentId: { $exists: false }
  })
    .select('_id propertyId amount currency paymentDate referenceNumber tenantId')
    .limit(5000)
    .lean();

  const buckets = new Map<string, typeof rows>();
  for (const row of rows) {
    const key = [
      String(row.propertyId || ''),
      roundMoney(Number(row.amount || 0)).toFixed(2),
      String(row.currency || 'USD'),
      dayKey(row.paymentDate as Date),
      String((row as any).tenantId || ''),
      String(row.referenceNumber || '')
    ].join('|');
    const list = buckets.get(key) || [];
    list.push(row);
    buckets.set(key, list);
  }

  let created = 0;
  for (const [, list] of buckets) {
    if (list.length < 2) continue;
    const primary = list[0];
    try {
      await FinancialControlException.updateOne(
        {
          companyId: toId(companyId),
          type: 'DUPLICATE_REVIEW_REQUIRED',
          entityType: 'Payment',
          entityId: String(primary._id),
          status: { $in: ['OPEN', 'UNDER_REVIEW'] }
        },
        {
          $setOnInsert: {
            companyId: toId(companyId),
            type: 'DUPLICATE_REVIEW_REQUIRED',
            severity: 'WARNING',
            status: 'OPEN',
            entityType: 'Payment',
            entityId: String(primary._id),
            description: `${list.length} completed payments share property, amount, currency, date, and payer/reference. Review only — nothing was merged or deleted.`,
            expected: 1,
            actual: list.length,
            difference: list.length - 1,
            currency: String(primary.currency || 'USD'),
            detectedAt: new Date(),
            detectedBy: 'duplicatePaymentReviewService'
          }
        },
        { upsert: true }
      );
      created += 1;
    } catch {
      // unique partial index may already have an open row
    }
  }
  return created;
}
