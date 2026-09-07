import React, { useEffect, useState } from 'react';
import { TrustMatter } from '../../services/trustAccountService';

const money = (n: number) =>
  new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(Number(n || 0));

type Props = {
  settlement?: any;
  matter?: TrustMatter | null;
  disabled?: boolean;
  onTransfer: (payload: { amount: number; reference?: string }) => Promise<void>;
};

const SellerTransferPanel: React.FC<Props> = ({ settlement, matter, disabled = false, onTransfer }) => {
  const [amount, setAmount] = useState('');
  const [reference, setReference] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('Bank Transfer');
  const [approvedBy, setApprovedBy] = useState('');
  const [supportingDocuments, setSupportingDocuments] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (settlement?.netPayout != null) setAmount(String(Number(settlement.netPayout || 0)));
  }, [settlement?.netPayout]);

  const custodian = matter?.custodyType || 'AGENCY_TRUST_BANK';

  return (
    <div className="space-y-3">
      <div className="rounded-lg bg-slate-50 p-3 text-sm">
        <p className="text-xs text-slate-500">Amount Available for Seller</p>
        <p className="text-lg font-semibold text-slate-900">{money(Number(settlement?.netPayout || 0))}</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
        <label>
          <span className="block text-xs text-slate-500 mb-1">Amount</span>
          <input value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal" className="border rounded-lg px-3 py-2 w-full" />
        </label>
        <label>
          <span className="block text-xs text-slate-500 mb-1">Payment Method</span>
          <input value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)} className="border rounded-lg px-3 py-2 w-full" />
        </label>
        <label>
          <span className="block text-xs text-slate-500 mb-1">Custodian</span>
          <input value={custodian} readOnly className="border rounded-lg px-3 py-2 w-full bg-slate-50" />
        </label>
        <label>
          <span className="block text-xs text-slate-500 mb-1">Reference</span>
          <input value={reference} onChange={(event) => setReference(event.target.value)} className="border rounded-lg px-3 py-2 w-full" />
        </label>
        <label>
          <span className="block text-xs text-slate-500 mb-1">Approved By</span>
          <input value={approvedBy} onChange={(event) => setApprovedBy(event.target.value)} className="border rounded-lg px-3 py-2 w-full" />
        </label>
        <label>
          <span className="block text-xs text-slate-500 mb-1">Supporting Documents</span>
          <input value={supportingDocuments} onChange={(event) => setSupportingDocuments(event.target.value)} className="border rounded-lg px-3 py-2 w-full" />
        </label>
        <label className="md:col-span-3">
          <span className="block text-xs text-slate-500 mb-1">Notes</span>
          <textarea value={notes} onChange={(event) => setNotes(event.target.value)} className="border rounded-lg px-3 py-2 w-full" rows={2} />
        </label>
      </div>
      <p className="text-xs text-slate-500">
        Payment method, approval, supporting document, and notes are captured for the operator before posting. The transfer itself uses the existing seller-transfer API.
      </p>
      <button
        type="button"
        onClick={() => onTransfer({ amount: Number(amount || 0), reference: reference || undefined })}
        disabled={disabled || !settlement || Number(amount || 0) <= 0}
        className="px-4 py-2 rounded-lg bg-emerald-700 text-white text-sm disabled:opacity-60"
      >
        {disabled ? 'Posting...' : 'Transfer to Seller'}
      </button>
    </div>
  );
};

export default SellerTransferPanel;
