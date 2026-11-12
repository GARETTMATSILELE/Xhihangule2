import mongoose from 'mongoose';
import { TaxObligation } from '../../models/TaxObligation';
import { TaxPayment } from '../../models/TaxPayment';
import { TaxRecord } from '../../models/TaxRecord';
import { TaxPayout } from '../../models/TaxPayout';
import { TrustAccount } from '../../models/TrustAccount';
import { Property } from '../../models/Property';
import { Payment } from '../../models/Payment';
import { formatPropertyAddress, resolveLinkedPropertyId } from './taxDashboard';
import { ChartOfAccount } from '../../models/ChartOfAccount';
import { GL } from './chartAccounts';
import { buildTaxPosition, type TaxPosition } from './taxPosition';

const toId = (value: string) => new mongoose.Types.ObjectId(value);

/**
 * Read-only company tax position. Does not create obligations, post journals, or edit ledgers.
 */
export async function loadCompanyTaxPosition(companyId: string, asOf?: Date): Promise<TaxPosition> {
  const company = toId(companyId);
  const [obligations, payments, records, payouts, glRows] = await Promise.all([
    TaxObligation.find({ companyId: company }).select('taxType propertyId paymentId taxPeriod taxAmount status reversalOf transactionDate').lean(),
    TaxPayment.find({ companyId: company }).select('status amount paymentDate unallocatedAmount allocations').lean(),
    TaxRecord.find({ companyId: company }).select('trustAccountId taxType amount createdAt').lean(),
    TaxPayout.find({ companyId: company }).select('trustAccountId taxType amount createdAt payoutDate').lean(),
    ChartOfAccount.find({
      companyId: company,
      code: { $in: [GL.VAT_PAYABLE, GL.ZIMRA_WITHHOLDING] },
      isDeleted: { $ne: true }
    }).select('code balance').lean()
  ]);

  const trustIds = [...records, ...payouts].map((row: any) => row.trustAccountId).filter(Boolean);
  const missingPropertyPaymentIds = obligations
    .filter((row: any) => !row.propertyId && row.paymentId)
    .map((row: any) => row.paymentId);
  const [trusts, sourcePayments] = await Promise.all([
    trustIds.length
      ? TrustAccount.find({ _id: { $in: trustIds }, companyId: company }).select('propertyId').lean()
      : [],
    missingPropertyPaymentIds.length
      ? Payment.find({ _id: { $in: missingPropertyPaymentIds }, companyId: company }).select('propertyId').lean()
      : []
  ]);
  const trustProperty = new Map(trusts.map((row: any) => [String(row._id), row.propertyId ? String(row.propertyId) : '']));
  const paymentProperty = new Map(sourcePayments.map((row: any) => [String(row._id), row.propertyId ? String(row.propertyId) : '']));
  const propertyIdOf = (row: any) => resolveLinkedPropertyId({
    obligationPropertyId: row.propertyId ? String(row.propertyId) : null,
    paymentPropertyId: row.paymentId ? paymentProperty.get(String(row.paymentId)) : null
  });
  const propertyIds = [
    ...obligations.map((row: any) => propertyIdOf(row)),
    ...trusts.map((row: any) => row.propertyId)
  ].filter(Boolean);
  const properties = propertyIds.length
    ? await Property.find({ _id: { $in: propertyIds }, companyId: company }).select('name address').lean()
    : [];
  const propertyById = new Map(properties.map((row: any) => [String(row._id), row]));
  const nameOf = (id?: unknown) => {
    if (!id) return undefined;
    const property = propertyById.get(String(id));
    const name = String(property?.name || '').trim();
    const address = formatPropertyAddress(property?.address);
    return name || address || String(id);
  };
  const addressOf = (id?: unknown) => (id ? formatPropertyAddress(propertyById.get(String(id))?.address) : '');

  return buildTaxPosition({
    asOf,
    obligations: obligations.map((row: any) => {
      const propertyId = propertyIdOf(row);
      return {
      id: String(row._id),
      taxType: String(row.taxType),
      propertyId,
      propertyName: nameOf(propertyId),
      propertyAddress: addressOf(propertyId),
      paymentId: row.paymentId ? String(row.paymentId) : null,
      taxPeriod: String(row.taxPeriod || ''),
      taxAmount: Number(row.taxAmount || 0),
      status: String(row.status || ''),
      reversalOf: row.reversalOf ? String(row.reversalOf) : null,
      transactionDate: row.transactionDate
    };
    }),
    payments: payments.map((row: any) => ({
      id: String(row._id),
      status: String(row.status || ''),
      amount: Number(row.amount || 0),
      paymentDate: row.paymentDate,
      unallocatedAmount: Number(row.unallocatedAmount || 0),
      allocations: (row.allocations || []).map((allocation: any) => ({
        taxObligationId: String(allocation.taxObligationId),
        taxType: allocation.taxType ? String(allocation.taxType) : undefined,
        amount: Number(allocation.amount || 0)
      }))
    })),
    legacyRecords: records.map((row: any) => {
      const propertyId = trustProperty.get(String(row.trustAccountId)) || (row.propertyId ? String(row.propertyId) : null);
      return {
        id: String(row._id),
        taxType: String(row.taxType),
        propertyId,
        propertyName: nameOf(propertyId),
        propertyAddress: addressOf(propertyId),
        amount: Number(row.amount || 0),
        createdAt: row.createdAt
      };
    }),
    legacyPayouts: payouts.map((row: any) => {
      const propertyId = trustProperty.get(String(row.trustAccountId)) || (row.propertyId ? String(row.propertyId) : null);
      return {
        id: String(row._id),
        taxType: String(row.taxType),
        propertyId,
        propertyName: nameOf(propertyId),
        propertyAddress: addressOf(propertyId),
        amount: Number(row.amount || 0),
        createdAt: row.payoutDate || row.createdAt
      };
    }),
    glBalances: glRows.map((row: any) => ({ code: String(row.code), balance: Number(row.balance || 0) }))
  });
}
