import React from 'react';
import { TrustMatter, TrustReconciliationPresentation } from '../../services/trustAccountService';

const money = (n: number) =>
  new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(Number(n || 0));

const TrustReconciliationPanel: React.FC<{
  reconciliation?: TrustReconciliationPresentation | null;
  matter?: TrustMatter | null;
}> = ({ reconciliation, matter }) => {
  const custodyType = matter?.custodyType || 'AGENCY_TRUST_BANK';
  if (!reconciliation) return <p className="text-sm text-slate-500">Reconciliation data is not available yet.</p>;

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
      <div className="rounded-lg bg-slate-50 p-3">
        <p className="text-xs text-slate-500">Trust Balance</p>
        <p className="font-semibold">{money(reconciliation.trustBalance)}</p>
      </div>
      {custodyType === 'AGENCY_CASH' && (
        <div className="rounded-lg bg-slate-50 p-3">
          <p className="text-xs text-slate-500">Cash Held</p>
          <p className="font-semibold">{money(Number(reconciliation.cashHeld || 0))}</p>
        </div>
      )}
      {custodyType === 'AGENCY_TRUST_BANK' && (
        <div className="rounded-lg bg-slate-50 p-3">
          <p className="text-xs text-slate-500">Bank Balance</p>
          <p className="font-semibold">{money(Number(reconciliation.bankBalance || 0))}</p>
        </div>
      )}
      {custodyType === 'LAWYER_TRUST_ACCOUNT' && (
        <div className="rounded-lg bg-slate-50 p-3">
          <p className="text-xs text-slate-500">Lawyer Confirmation</p>
          <p className="font-semibold">{reconciliation.lawyerConfirmation || 'Pending'}</p>
        </div>
      )}
      <div className="rounded-lg bg-slate-50 p-3">
        <p className="text-xs text-slate-500">Difference</p>
        <p className={`font-semibold ${Math.abs(reconciliation.difference) < 0.01 ? 'text-emerald-700' : 'text-rose-700'}`}>
          {money(reconciliation.difference)}
        </p>
      </div>
      <div className="rounded-lg bg-slate-50 p-3">
        <p className="text-xs text-slate-500">Status</p>
        <p className="font-semibold">{reconciliation.status}</p>
      </div>
      <div className="rounded-lg bg-slate-50 p-3">
        <p className="text-xs text-slate-500">Last Reconciled</p>
        <p className="font-semibold">{reconciliation.lastReconciled || 'Not recorded'}</p>
        <p className="text-xs text-slate-500">By: {reconciliation.by || '-'}</p>
      </div>
    </div>
  );
};

export default TrustReconciliationPanel;
