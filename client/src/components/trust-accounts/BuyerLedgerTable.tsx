import React from 'react';

type LedgerRow = {
  _id: string;
  type: string;
  debit: number;
  credit: number;
  runningBalance: number;
  reference?: string;
  createdAt: string;
};

type BuyerPaymentRow = {
  paymentId?: string;
  amount?: number;
  paymentDate?: string;
  referenceNumber?: string;
  buyerName?: string;
  sellerName?: string;
};

const money = (n: number) =>
  new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(Number(n || 0));

const formatDate = (value: string): string => {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? '-' : parsed.toLocaleDateString();
};

const BuyerLedgerTable: React.FC<{
  rows: LedgerRow[];
  buyerPayments?: BuyerPaymentRow[];
  buyerName?: string;
  sellerName?: string;
  purchasePrice?: number;
}> = ({ rows, buyerPayments = [], buyerName = '', sellerName = '', purchasePrice = 0 }) => {
  const resolvedBuyerName = String(buyerName || '').trim() || 'Buyer';
  const resolvedSellerName = String(sellerName || '').trim() || 'Seller';

  const paymentRows =
    buyerPayments.length > 0
      ? buyerPayments
          .filter((payment) => Number(payment?.amount || 0) > 0)
          .map((payment) => ({
            id: String(payment.paymentId || `${payment.paymentDate || ''}-${payment.referenceNumber || ''}`),
            createdAt: String(payment.paymentDate || ''),
            reference: String(payment.referenceNumber || '').trim(),
            credit: Number(payment.amount || 0)
          }))
      : rows
          .filter((row) => String(row?.type || '') === 'BUYER_PAYMENT' && Number(row?.credit || 0) > 0)
          .map((row) => ({
            id: String(row._id || ''),
            createdAt: String(row.createdAt || ''),
            reference: String(row.reference || '').trim(),
            credit: Number(row.credit || 0)
          }));

  let runningBalance = Number(purchasePrice || 0);
  const displayRows = [
    {
      id: 'opening-debit-balance',
      createdAt: paymentRows[0]?.createdAt || new Date().toISOString(),
      description: `Opening debit balance of purchase price (${resolvedBuyerName})`,
      debit: Number(purchasePrice || 0),
      credit: 0,
      runningBalance,
      reference: '-'
    },
    ...paymentRows.map((payment, index) => {
      runningBalance = Number((runningBalance - payment.credit).toFixed(2));
      return {
        id: payment.id || `payment-${index + 1}`,
        createdAt: payment.createdAt,
        description: `Amount paid by ${resolvedBuyerName} paid to ${resolvedSellerName}`,
        debit: 0,
        credit: payment.credit,
        runningBalance,
        reference: payment.reference || '-'
      };
    })
  ];

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
      <h3 className="text-base font-semibold mb-3">Buyer Ledger</h3>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="text-slate-500">
            <tr>
              <th className="text-left py-2">Date</th>
              <th className="text-left py-2">Description</th>
              <th className="text-right py-2 px-3">Debit</th>
              <th className="text-right py-2 px-3">Credit</th>
              <th className="text-right py-2 px-3">Balance</th>
              <th className="text-left py-2 pl-4">Reference</th>
            </tr>
          </thead>
          <tbody>
            {displayRows.map((r) => (
              <tr key={r.id} className="border-t">
                <td className="py-2">{formatDate(r.createdAt)}</td>
                <td className="py-2">{r.description}</td>
                <td className="py-2 px-3 text-right">{money(r.debit)}</td>
                <td className="py-2 px-3 text-right">{money(r.credit)}</td>
                <td className="py-2 px-3 text-right font-medium">{money(r.runningBalance)}</td>
                <td className="py-2 pl-4">{r.reference || '-'}</td>
              </tr>
            ))}
            {displayRows.length === 0 && (
              <tr>
                <td colSpan={6} className="py-6 text-center text-slate-500">
                  No ledger transactions found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default BuyerLedgerTable;
