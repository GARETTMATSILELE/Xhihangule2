import React from 'react';

type TaxSummary = {
  cgt: number;
  vat: number;
  vatOnCommission: number;
  total: number;
  paidToZimraCount: number;
};

const money = (n: number) =>
  new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(Number(n || 0));

const TaxSummaryPanel: React.FC<{ summary?: TaxSummary | null }> = ({ summary }) => {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
      <h3 className="text-base font-semibold mb-3">Tax Summary</h3>
      {!summary ? (
        <p className="text-sm text-slate-500">No tax records yet.</p>
      ) : (
        <div className="space-y-2 text-sm">
          <div className="flex justify-between"><span>CGT</span><span>{money(summary.cgt)}</span></div>
          <div className="flex justify-between"><span>VAT</span><span>{money(summary.vat)}</span></div>
          <div className="flex justify-between"><span>VAT on Commission</span><span>{money(summary.vatOnCommission)}</span></div>
          <div className="pt-2 border-t flex justify-between font-semibold"><span>Total Tax</span><span>{money(summary.total)}</span></div>
          <p className="text-xs text-slate-500">ZIMRA paid records: {summary.paidToZimraCount}</p>
        </div>
      )}
    </div>
  );
};

export default TaxSummaryPanel;
