import React from 'react';

type Deduction = { type: string; amount: number };
type Settlement = {
  salePrice: number;
  grossProceeds: number;
  deductions: Deduction[];
  netPayout: number;
  locked: boolean;
};

const money = (n: number) =>
  new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(Number(n || 0));

const SellerSettlementPanel: React.FC<{ settlement?: Settlement | null }> = ({ settlement }) => {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
      <h3 className="text-base font-semibold mb-3">Seller Settlement Statement</h3>
      {!settlement ? (
        <p className="text-sm text-slate-500">Settlement not calculated yet.</p>
      ) : (
        <div className="space-y-2 text-sm">
          <div className="flex justify-between"><span>Sale Price</span><span>{money(settlement.salePrice)}</span></div>
          <div className="flex justify-between"><span>Gross Proceeds</span><span>{money(settlement.grossProceeds)}</span></div>
          <div className="pt-2 border-t">
            {settlement.deductions.map((d, idx) => (
              <div key={`${d.type}-${idx}`} className="flex justify-between text-slate-700">
                <span>{d.type}</span>
                <span>- {money(d.amount)}</span>
              </div>
            ))}
          </div>
          <div className="pt-2 border-t flex justify-between font-semibold">
            <span>Net Payout</span>
            <span>{money(settlement.netPayout)}</span>
          </div>
          <div className="text-xs text-slate-500">Settlement lock: {settlement.locked ? 'Locked' : 'Open'}</div>
        </div>
      )}
    </div>
  );
};

export default SellerSettlementPanel;
