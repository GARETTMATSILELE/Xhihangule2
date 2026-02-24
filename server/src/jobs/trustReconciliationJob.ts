import { CronJob } from 'cron';
import mongoose from 'mongoose';
import { Payment } from '../models/Payment';
import { TrustTransaction } from '../models/TrustTransaction';
import { TrustReconciliationResult } from '../models/TrustReconciliationResult';
import { emitEvent } from '../events/eventBus';
import trustAccountService from '../services/trustAccountService';

let job: CronJob | null = null;

const money = (n: number): number => Number(Number(n || 0).toFixed(2));

const runCompanyReconciliation = async (companyId: string) => {
  const payments = await Payment.find({
    companyId: new mongoose.Types.ObjectId(companyId),
    paymentType: 'sale',
    status: 'completed'
  })
    .select('_id propertyId amount referenceNumber paymentDate tenantId')
    .lean();

  let missingPostings = 0;
  let balanceMismatches = 0;
  let autoRepairs = 0;
  const details: Array<Record<string, unknown>> = [];

  for (const payment of payments) {
    const exists = await TrustTransaction.findOne({
      companyId: new mongoose.Types.ObjectId(companyId),
      paymentId: payment._id
    })
      .select('_id trustAccountId')
      .lean();

    if (!exists) {
      missingPostings += 1;
      details.push({ type: 'missing_posting', paymentId: String(payment._id) });
      try {
        await emitEvent('payment.confirmed', {
          eventId: `payment.confirmed:${String(payment._id)}`,
          paymentId: String(payment._id),
          propertyId: String(payment.propertyId),
          payerId: String(payment.tenantId || ''),
          amount: Number(payment.amount || 0),
          reference: String(payment.referenceNumber || ''),
          date: new Date(payment.paymentDate || new Date()).toISOString(),
          companyId
        });
        autoRepairs += 1;
      } catch (error: any) {
        details.push({ type: 'repair_failed', paymentId: String(payment._id), error: error?.message || 'emit failed' });
      }
    }
  }

  const trustAccounts = await trustAccountService.listTrustAccounts(companyId, { page: 1, limit: 500 });
  for (const account of trustAccounts.items as any[]) {
    const rows = await TrustTransaction.find({
      companyId: new mongoose.Types.ObjectId(companyId),
      trustAccountId: account._id
    })
      .select('runningBalance')
      .sort({ createdAt: -1 })
      .limit(1)
      .lean();
    const expected = rows.length ? money(Number(rows[0].runningBalance || 0)) : 0;
    const actual = money(Number(account.runningBalance || 0));
    if (expected !== actual) {
      balanceMismatches += 1;
      details.push({ type: 'balance_mismatch', trustAccountId: String(account._id), expected, actual });
      // Safe repair: update only if account is not closed.
      if (String(account.status) !== 'CLOSED') {
        await (await import('../models/TrustAccount')).TrustAccount.updateOne(
          { _id: account._id, companyId: new mongoose.Types.ObjectId(companyId), status: { $ne: 'CLOSED' } },
          { $set: { runningBalance: expected, closingBalance: expected } }
        );
        autoRepairs += 1;
      }
    }
  }

  await TrustReconciliationResult.create({
    companyId: new mongoose.Types.ObjectId(companyId),
    runAt: new Date(),
    checkedPayments: payments.length,
    missingPostings,
    balanceMismatches,
    autoRepairs,
    details: { items: details.slice(0, 500) }
  });
};

export const runTrustReconciliationOnce = async () => {
  const companyIds = await Payment.distinct('companyId', { paymentType: 'sale' });
  for (const companyId of companyIds) {
    await runCompanyReconciliation(String(companyId));
  }
};

export const startTrustReconciliationJob = () => {
  if (job) return;
  // Run daily at 02:15 server time.
  job = new CronJob('15 2 * * *', () => {
    void runTrustReconciliationOnce();
  });
  job.start();
};

export const stopTrustReconciliationJob = () => {
  if (job) {
    job.stop();
    job = null;
  }
};

