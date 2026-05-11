import React from 'react';

type Deduction = { type: string; amount: number };
type Settlement = {
  salePrice: number;
  grossProceeds: number;
  deductions: Deduction[];
  netPayout: number;
  locked: boolean;
  settlementDate?: string;
};

const money = (n: number) =>
  new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(Number(n || 0));

type LedgerRow = {
  _id: string;
  type: string;
  debit: number;
  credit: number;
  createdAt: string;
  reference?: string;
};

const toDateLabel = (value?: string): string => {
  const parsed = new Date(String(value || ''));
  return Number.isNaN(parsed.getTime()) ? '-' : parsed.toLocaleDateString();
};

const readableType = (rawType: string): string => {
  const map: Record<string, string> = {
    BUYER_PAYMENT: 'Buyer Payment',
    CGT_DEDUCTION: 'CGT Deduction',
    COMMISSION_DEDUCTION: 'Commission Deduction',
    VAT_DEDUCTION: 'VAT Deduction',
    VAT_ON_COMMISSION: 'VAT on Commission',
    TRANSFER_TO_SELLER: 'Transfer to Seller'
  };
  return map[String(rawType || '').toUpperCase()] || rawType;
};

const SellerSettlementPanel: React.FC<{ settlement?: Settlement | null; ledgerRows?: LedgerRow[] }> = ({
  settlement,
  ledgerRows = []
}) => {
  const settlementRows = ledgerRows
    .filter((row) =>
      [
        'BUYER_PAYMENT',
        'CGT_DEDUCTION',
        'COMMISSION_DEDUCTION',
        'VAT_DEDUCTION',
        'VAT_ON_COMMISSION',
        'TRANSFER_TO_SELLER'
      ].includes(String(row?.type || '').toUpperCase())
    )
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  let runningBalance = 0;
  const displayRows = settlementRows.map((row) => {
    runningBalance = Number((runningBalance + Number(row.credit || 0) - Number(row.debit || 0)).toFixed(2));
    return {
      id: String(row._id || `${row.createdAt}-${row.type}`),
      date: toDateLabel(row.createdAt),
      type: readableType(row.type),
      debit: Number(row.debit || 0),
      credit: Number(row.credit || 0),
      balance: runningBalance,
      reference: String(row.reference || '').trim() || '-'
    };
  });

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
      <h3 className="text-base font-semibold mb-3">Seller Settlement Statement</h3>
      {!settlement ? (
        <p className="text-sm text-slate-500">Settlement not calculated yet.</p>
      ) : (
        <div className="space-y-3 text-sm">
          <div className="flex justify-between"><span>Sale Price</span><span>{money(settlement.salePrice)}</span></div>
          <div className="pt-2 border-t overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-slate-500">
                <tr>
                  <th className="text-left py-2">Date</th>
                  <th className="text-left py-2">Transaction</th>
                  <th className="text-right py-2">Debit</th>
                  <th className="text-right py-2">Credit</th>
                  <th className="text-right py-2">Balance</th>
                </tr>
              </thead>
              <tbody>
                {displayRows.map((row) => (
                  <tr key={row.id} className="border-t">
                    <td className="py-2">{row.date}</td>
                    <td className="py-2">{row.type}</td>
                    <td className="py-2 text-right">{money(row.debit)}</td>
                    <td className="py-2 text-right">{money(row.credit)}</td>
                    <td className="py-2 text-right font-medium">{money(row.balance)}</td>
                  </tr>
                ))}
                {displayRows.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-4 text-center text-slate-500">
                      No settlement transactions yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="pt-2 border-t flex justify-between font-semibold">
            <span>Net Payout</span>
            <span>{money(settlement.netPayout)}</span>
          </div>
          <div className="text-xs text-slate-500">
            Settlement lock: {settlement.locked ? 'Locked' : 'Open'}
            {settlement.settlementDate ? ` • Last updated: ${toDateLabel(settlement.settlementDate)}` : ''}
          </div>
        </div>
      )}
    </div>
  );
};

export default SellerSettlementPanel;
