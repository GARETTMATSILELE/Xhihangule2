import mongoose from 'mongoose';
import { Payment } from '../models/Payment';
import { TrustTransaction } from '../models/TrustTransaction';
import { TaxObligation } from '../models/TaxObligation';
import { explainOwnerWaterfall } from '../reporting/ownerWaterfall';
import { historicalTransactionDomain } from './transactionDomain';
import { reconcilePayment } from './paymentAccountingReconciliation';

const postingLabel = (required: boolean, present: boolean): 'Complete' | 'Incomplete' | 'Not Applicable' => {
  if (!required) return 'Not Applicable';
  return present ? 'Complete' : 'Incomplete';
};

export async function buildFinancialTrace(companyId: string, paymentId: string) {
  if (!mongoose.isValidObjectId(paymentId)) return null;
  const payment = await Payment.findOne({ _id: paymentId, companyId }).lean();
  if (!payment) return null;
  const details = (payment as any).commissionDetails || {};
  const levy = Number(details.levy ?? (payment as any).levyAllocated ?? 0);
  const gross = Number(details.grossRent ?? (payment as any).amount ?? 0);
  const commission = Number(details.commissionNet ?? details.totalCommission ?? 0);
  const vat = Number(details.vatOnCommission ?? details.vatAmount ?? 0);
  const vatRate = details.vatRate == null ? undefined : Number(details.vatRate);
  const recordedOwner = details.paymentAllocation?.ownerPayable != null
    ? Number(details.paymentAllocation.ownerPayable)
    : (details.ownerAmount != null ? Number(details.ownerAmount) - levy : undefined);
  const waterfall = explainOwnerWaterfall({
    grossAmount: gross,
    commissionAmount: commission,
    levyAmount: levy,
    vatOnCommission: vat,
    vatRate: Number.isFinite(Number(vatRate)) ? Number(vatRate) : undefined,
    recordedOwnerAmount: recordedOwner
  });
  const domain = historicalTransactionDomain(payment as any);
  const recon = await reconcilePayment(String(payment._id));
  const expected = recon.expected || ({} as any);
  const actual = recon.actual || ({} as any);
  const taxCount = await TaxObligation.countDocuments({ companyId, paymentId: payment._id });
  const trustCount = domain === 'SALE'
    ? await TrustTransaction.countDocuments({ companyId, paymentId: payment._id })
    : 0;
  const reversalPaymentId = (payment as any).reversalPaymentId ? String((payment as any).reversalPaymentId) : undefined;
  const reversalOfPaymentId = (payment as any).reversalOfPaymentId ? String((payment as any).reversalOfPaymentId) : undefined;
  return {
    payment: {
      id: String(payment._id),
      date: (payment as any).paymentDate,
      amount: Number((payment as any).amount || 0),
      method: (payment as any).paymentMethod,
      type: (payment as any).paymentType,
      domain,
      propertyId: (payment as any).propertyId ? String((payment as any).propertyId) : undefined,
      tenantId: (payment as any).tenantId ? String((payment as any).tenantId) : undefined,
      leaseId: (payment as any).leaseId ? String((payment as any).leaseId) : undefined,
      reference: (payment as any).referenceNumber,
      currency: (payment as any).currency || 'USD',
      status: (payment as any).status,
      accountingState: (payment as any).accountingStatus || recon.status,
      accountingComplete: Boolean((payment as any).accountingComplete)
    },
    allocation: waterfall,
    posting: {
      ownerIncome: postingLabel(Boolean(expected.ownerIncome), Boolean(actual.ownerIncome)),
      agentCommission: postingLabel(Boolean(expected.agentCommission), Boolean(actual.agentCommission)),
      companyCommission: postingLabel(Boolean(expected.companyCommission), Boolean(actual.companyCommission)),
      journal: postingLabel(Boolean(expected.journal), Boolean(actual.journal)),
      trust: domain === 'SALE' ? postingLabel(true, trustCount > 0) : 'Not Applicable',
      tax: postingLabel(vat > 0, taxCount > 0)
    },
    reversal: {
      state: (payment as any).reversalState || null,
      reversalPaymentId: reversalPaymentId || null,
      reversalOfPaymentId: reversalOfPaymentId || null
    },
    retry: {
      safe: true,
      effect: 'Retry posts only missing accounting artifacts for this payment. It does not create a second income line, commission line, journal, tax obligation, or reversal.'
    }
  };
}

export async function listTrustVisibility(companyId: string, limit = 50) {
  const rows = await TrustTransaction.find({ companyId })
    .sort({ createdAt: -1 })
    .limit(Math.min(100, Math.max(1, limit)))
    .lean();
  const paymentIds = rows.map((row) => row.paymentId).filter(Boolean);
  const payments = await Payment.find({ _id: { $in: paymentIds }, companyId })
    .select('_id transactionDomain paymentType referenceNumber')
    .lean();
  const byId = new Map(payments.map((row) => [String(row._id), row]));
  return rows.map((row) => {
    const payment = row.paymentId ? byId.get(String(row.paymentId)) : undefined;
    const domain = payment ? historicalTransactionDomain(payment as any) : undefined;
    return {
      id: String(row._id),
      date: row.createdAt,
      paymentId: row.paymentId ? String(row.paymentId) : undefined,
      reference: row.reference,
      type: row.type,
      credit: Number(row.credit || 0),
      debit: Number(row.debit || 0),
      balance: Number(row.runningBalance || 0),
      domain: domain || null,
      historicalRentalTrust: domain === 'RENTAL',
      saleTrust: domain === 'SALE'
    };
  });
}
