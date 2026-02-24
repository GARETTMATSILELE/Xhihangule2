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

const money = (n: number) =>
  new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(Number(n || 0));

const BuyerLedgerTable: React.FC<{ rows: LedgerRow[] }> = ({ rows }) => {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
      <h3 className="text-base font-semibold mb-3">Buyer Ledger</h3>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="text-slate-500">
            <tr>
              <th className="text-left py-2">Date</th>
              <th className="text-left py-2">Type</th>
              <th className="text-right py-2">Debit</th>
              <th className="text-right py-2">Credit</th>
              <th className="text-right py-2">Running Balance</th>
              <th className="text-left py-2">Reference</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r._id} className="border-t">
                <td className="py-2">{new Date(r.createdAt).toLocaleDateString()}</td>
                <td className="py-2">{r.type}</td>
                <td className="py-2 text-right">{money(r.debit)}</td>
                <td className="py-2 text-right">{money(r.credit)}</td>
                <td className="py-2 text-right font-medium">{money(r.runningBalance)}</td>
                <td className="py-2">{r.reference || '-'}</td>
              </tr>
            ))}
            {rows.length === 0 && (
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
