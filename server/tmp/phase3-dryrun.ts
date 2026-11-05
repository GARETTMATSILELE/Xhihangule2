import fs from 'fs';
import mongoose from 'mongoose';
import { accountingConnection } from '../src/config/database';
import { repairPaymentAccounting } from '../src/services/paymentAccountingReconciliation';
import { allocateRentalReceipt } from '../src/services/tax/paymentAllocation';
import { buildAgentReceiptJournal } from '../src/services/tax/principalAgentJournal';
import { historicalTransactionDomain } from '../src/services/transactionDomain';
import { roundMoney } from '../src/utils/money';

type Klass = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G';

function money(value: unknown): number {
  return roundMoney(Number(value || 0));
}

function classify(blockers: string[], eligible: boolean): Klass {
  if (eligible) return 'A';
  if (blockers.includes('reversed_payment')) return 'F';
  if (blockers.includes('receipt_reference_belongs_to_another_payment')) return 'C';
  if (blockers.some((item) => item.startsWith('period_'))) return 'D';
  if (blockers.includes('journal_unbalanced')) return 'E';
  if (blockers.includes('company_mismatch') || blockers.includes('journal_not_required')) return 'G';
  return 'B';
}

function expectedLines(payment: any) {
  const details = payment?.commissionDetails || {};
  const amount = money(Math.max(0, Number(payment?.amount || 0)));
  const vat = money(Number(details.vatOnCommission || details.vatAmount || 0) + Number(payment?.vatAmount || 0));
  const commissionNet = money(Number(details.commissionNet || details.totalCommission || 0));
  const levy = money(Number(details.levy ?? payment?.levyAllocated ?? 0));
  const domain = historicalTransactionDomain(payment);
  const allocation = allocateRentalReceipt({
    amount,
    rent: money(Number(payment?.rentAllocated ?? details.commissionBase ?? amount - levy)),
    levy,
    commissionBase: money(Number(details.commissionBase || 0)),
    commissionNet,
    vatOnCommission: money(Number(details.vatOnCommission || 0))
  });
  const journal = buildAgentReceiptJournal({
    paymentType: domain === 'SALE' ? 'sale' : 'rental',
    amount,
    ownerAmount: allocation.ownerPayable,
    commissionNet: allocation.commissionNet,
    vatAmount: vat,
    levyAmount: domain === 'SALE' ? 0 : allocation.levyPayable
  });
  const agentShare = money(details.agentShare);
  const commissionJournal = agentShare > 0
    ? [
        { accountCode: '5002', debit: agentShare, credit: 0 },
        { accountCode: '2102', debit: 0, credit: agentShare }
      ]
    : [];
  return {
    receiptReference: `PAY-${String(payment.referenceNumber || payment._id)}`,
    commissionReference: agentShare > 0 ? `COM-${String(payment.referenceNumber || payment._id)}` : null,
    receiptLines: journal.lines.map((line) => ({
      accountCode: line.accountCode,
      debit: money(line.debit),
      credit: money(line.credit)
    })),
    receiptDebit: money(journal.lines.reduce((sum, line) => sum + Number(line.debit || 0), 0)),
    receiptCredit: money(journal.lines.reduce((sum, line) => sum + Number(line.credit || 0), 0)),
    commissionJournal
  };
}

async function main() {
  const summary = JSON.parse(fs.readFileSync('tmp/phase3-summary.json', 'utf8'));
  const ids: string[] = summary.missing.map((item: { paymentId: string }) => item.paymentId);
  const uri = process.env.MONGODB_URI;
  const accountingUri = process.env.ACCOUNTING_DB_URI;
  if (!uri || !accountingUri) throw new Error('Production URIs were not supplied to the dry-run process.');

  const options = { retryWrites: false, autoIndex: false, autoCreate: false, serverSelectionTimeoutMS: 30000 };
  await mongoose.connect(uri, options);
  await accountingConnection.openUri(accountingUri, options as any);
  const db = mongoose.connection.db;
  if (!db) throw new Error('Main database connection did not open.');
  const journalsBefore = await db.collection('journalentries').countDocuments();
  const paymentsBefore = await db.collection('payments').countDocuments();
  const originalBefore = await db.collection('payments').findOne(
    { _id: new mongoose.Types.ObjectId('6a54dfbd0c6fad277e2541dc') },
    { projection: { amount: 1, accountingComplete: 1, accountingStatus: 1, commissionDetails: 1 } }
  );

  const results: any[] = [];
  const outPath = 'tmp/phase3-dryrun.json';
  for (let index = 0; index < ids.length; index += 1) {
    const paymentId = ids[index];
    try {
      const result = await repairPaymentAccounting(paymentId, {
        dryRun: true,
        reason: 'Phase 3 production read-only recovery eligibility audit'
      });
      if (result.dryRun !== true || result.componentsCreated.length > 0) {
        throw new Error(`Dry-run attempted a financial write for ${paymentId}`);
      }
      const blockers = result.recoveryAssessment?.blockers || [];
      const klass = classify(blockers, Boolean(result.recoveryAssessment?.eligible));
      const payment = klass === 'A' ? await mongoose.connection.collection('payments').findOne({ _id: new mongoose.Types.ObjectId(paymentId) }) : null;
      results.push({
        paymentId,
        class: klass,
        eligible: Boolean(result.recoveryAssessment?.eligible),
        blockers,
        missing: result.recon.missing,
        mismatched: result.recon.mismatched,
        wouldCreate: result.plan.wouldCreate,
        manualReview: result.recoveryAssessment?.manualReview || false,
        periodStatus: result.recoveryAssessment?.checks?.periodStatus || null,
        journalBalanced: result.recoveryAssessment?.checks?.journalBalanced || false,
        expected: klass === 'A' && payment ? expectedLines(payment) : undefined
      });
    } catch (error: any) {
      results.push({ paymentId, class: 'G', error: String(error?.message || error).slice(0, 300) });
    }
    if ((index + 1) % 25 === 0 || index + 1 === ids.length) {
      fs.writeFileSync(outPath, JSON.stringify({ completed: results.length, total: ids.length, results }));
      console.log(JSON.stringify({ completed: results.length, total: ids.length }));
    }
  }

  const journalsAfter = await db.collection('journalentries').countDocuments();
  const paymentsAfter = await db.collection('payments').countDocuments();
  const originalAfter = await db.collection('payments').findOne(
    { _id: new mongoose.Types.ObjectId('6a54dfbd0c6fad277e2541dc') },
    { projection: { amount: 1, accountingComplete: 1, accountingStatus: 1, 'commissionDetails.ownerAmount': 1, 'commissionDetails.agentShare': 1, 'commissionDetails.agencyShare': 1, 'commissionDetails.preaFee': 1 } }
  );
  const classes: Record<string, number> = { A: 0, B: 0, C: 0, D: 0, E: 0, F: 0, G: 0 };
  for (const row of results) classes[row.class] = (classes[row.class] || 0) + 1;
  const original = results.find((row) => row.paymentId === '6a54dfbd0c6fad277e2541dc') || null;
  fs.writeFileSync(outPath, JSON.stringify({
    completed: results.length,
    total: ids.length,
    classes,
    integrity: {
      journalsBefore,
      journalsAfter,
      paymentsBefore,
      paymentsAfter,
      originalBefore,
      originalAfter
    },
    original,
    results
  }));
  console.log(JSON.stringify({ done: true, classes, journalsChanged: journalsBefore !== journalsAfter, paymentsChanged: paymentsBefore !== paymentsAfter }));
  await mongoose.disconnect();
  await accountingConnection.close();
}

main().catch((error) => {
  console.error(String(error?.stack || error).replace(/mongodb(?:\+srv)?:\/\/[^\s'"]+/gi, '[redacted-uri]'));
  process.exit(1);
});
