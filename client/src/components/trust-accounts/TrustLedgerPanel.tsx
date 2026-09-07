import React from 'react';
import { TrustLedgerPresentationRow } from '../../services/trustAccountService';

const money = (n: number) =>
  new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(Number(n || 0));

const formatDate = (value?: string | null): string => {
  if (!value) return '-';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? '-' : parsed.toLocaleDateString();
};

const TrustLedgerPanel: React.FC<{ rows?: TrustLedgerPresentationRow[] }> = ({ rows = [] }) => {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead className="text-slate-500">
          <tr>
            <th className="text-left py-2">Date</th>
            <th className="text-left py-2">Transaction</th>
            <th className="text-left py-2">Receipt</th>
            <th className="text-left py-2">Reference</th>
            <th className="text-right py-2 px-3">Debit</th>
            <th className="text-right py-2 px-3">Credit</th>
            <th className="text-right py-2 px-3">Running Balance</th>
            <th className="text-left py-2">Performed By</th>
            <th className="text-left py-2">Approval</th>
            <th className="text-left py-2">Supporting Document</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-t">
              <td className="py-2">{formatDate(row.date)}</td>
              <td className="py-2">{row.transaction}</td>
              <td className="py-2">{row.receipt || '-'}</td>
              <td className="py-2">{row.reference || '-'}</td>
              <td className="py-2 px-3 text-right">{money(row.debit)}</td>
              <td className="py-2 px-3 text-right">{money(row.credit)}</td>
              <td className="py-2 px-3 text-right font-medium">{money(row.runningBalance)}</td>
              <td className="py-2">{row.performedBy || '-'}</td>
              <td className="py-2">{row.approval || '-'}</td>
              <td className="py-2">{row.supportingDocument || '-'}</td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={10} className="py-6 text-center text-slate-500">No trust ledger transactions yet.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
};

export default TrustLedgerPanel;
