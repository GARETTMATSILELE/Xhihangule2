import React from 'react';
import { TrustPaymentAllocation } from '../../services/trustAccountService';

const money = (n: number) =>
  new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(Number(n || 0));

const PaymentAllocationPanel: React.FC<{ allocation?: TrustPaymentAllocation | null }> = ({ allocation }) => {
  if (!allocation) return <p className="text-sm text-slate-500">Payment allocation will appear after settlement is calculated.</p>;

  const rows = [
    ['Seller', allocation.allocated.seller],
    ['Commission', allocation.allocated.commission],
    ['VAT Commission', allocation.allocated.vatCommission],
    ['VAT', allocation.allocated.vat],
    ['CGT', allocation.allocated.cgt],
    ['Other', allocation.allocated.other]
  ];

  return (
    <div className="space-y-3 text-sm">
      <div className="flex justify-between rounded-lg bg-slate-50 p-3">
        <span>Purchase Price</span>
        <span className="font-semibold">{money(allocation.purchasePrice)}</span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {rows.map(([label, value]) => (
          <div key={String(label)} className="flex justify-between border rounded-lg p-3">
            <span>{label}</span>
            <span className="font-medium">{money(Number(value || 0))}</span>
          </div>
        ))}
      </div>
      <div className="flex justify-between border-t pt-3 font-semibold">
        <span>Balance Remaining</span>
        <span>{money(allocation.balanceRemaining)}</span>
      </div>
    </div>
  );
};

export default PaymentAllocationPanel;
