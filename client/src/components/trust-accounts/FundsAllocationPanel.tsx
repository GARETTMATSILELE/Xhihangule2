import React from 'react';
import { TrustFundsAllocation } from '../../services/trustAccountService';

const money = (n: number) =>
  new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(Number(n || 0));

const FundsAllocationPanel: React.FC<{ allocation?: TrustFundsAllocation | null }> = ({ allocation }) => {
  const rows = [
    ['Funds Currently Held', allocation?.fundsCurrentlyHeld],
    ['Seller Funds', allocation?.sellerFunds],
    ['Agency Commission', allocation?.agencyCommission],
    ['VAT Liability', allocation?.vatLiability],
    ['VAT on Commission', allocation?.vatOnCommission],
    ['CGT Liability', allocation?.cgtLiability],
    ['Other Adjustments', allocation?.otherAdjustments],
    ['Remaining Unallocated', allocation?.remainingUnallocated],
    ['Total Trust Balance', allocation?.totalTrustBalance]
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
      {rows.map(([label, value]) => (
        <div key={String(label)} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
          <p className="text-xs text-slate-500">{label}</p>
          <p className="text-base font-semibold text-slate-900">{money(Number(value || 0))}</p>
        </div>
      ))}
    </div>
  );
};

export default FundsAllocationPanel;
