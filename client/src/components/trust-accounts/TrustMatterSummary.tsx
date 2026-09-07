import React, { useEffect, useMemo, useState } from 'react';
import { TrustCustodyType, TrustMatter } from '../../services/trustAccountService';

const custodyLabels: Record<TrustCustodyType, string> = {
  AGENCY_CASH: 'Agency Cash',
  AGENCY_TRUST_BANK: 'Agency Trust Bank',
  LAWYER_TRUST_ACCOUNT: 'Lawyer Trust Account',
  ESCROW: 'Escrow',
  DEVELOPER: 'Developer',
  OTHER: 'Other'
};

const money = (n: number) =>
  new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(Number(n || 0));

type Props = {
  matter?: TrustMatter | null;
  title: string;
  buyer?: string;
  seller?: string;
  grossProceeds?: number;
  runningBalance?: number;
  onSaveCustody: (payload: { custodyType: TrustCustodyType; custodyDetails: Record<string, unknown> }) => Promise<void>;
  saving?: boolean;
};

const detailFieldsFor = (custodyType: TrustCustodyType) => {
  if (custodyType === 'AGENCY_CASH') return ['cashReceipt', 'receiptBook', 'cashier', 'safe', 'cashCountReference'];
  if (custodyType === 'AGENCY_TRUST_BANK') return ['bank', 'branch', 'account', 'depositReference', 'depositSlip'];
  if (custodyType === 'LAWYER_TRUST_ACCOUNT') return ['lawFirm', 'attorney', 'trustReference', 'confirmationDate'];
  return ['custodian', 'reference', 'notes'];
};

const fieldLabel = (field: string): string =>
  field
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (value) => value.toUpperCase());

const TrustMatterSummary: React.FC<Props> = ({
  matter,
  title,
  buyer,
  seller,
  grossProceeds = 0,
  runningBalance = 0,
  onSaveCustody,
  saving = false
}) => {
  const [custodyType, setCustodyType] = useState<TrustCustodyType>('AGENCY_TRUST_BANK');
  const [custodyDetails, setCustodyDetails] = useState<Record<string, string>>({});

  useEffect(() => {
    setCustodyType((matter?.custodyType || 'AGENCY_TRUST_BANK') as TrustCustodyType);
    const nextDetails: Record<string, string> = {};
    Object.entries((matter?.custodyDetails || {}) as Record<string, unknown>).forEach(([key, value]) => {
      nextDetails[key] = String(value ?? '');
    });
    setCustodyDetails(nextDetails);
  }, [matter]);

  const fields = useMemo(() => detailFieldsFor(custodyType), [custodyType]);

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500">Trust Matter</p>
          <h2 className="text-xl font-semibold text-slate-900">{matter?.matterNumber || 'Pending matter number'}</h2>
          <p className="text-sm text-slate-500 mt-1">{title}</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-slate-500">Status</p>
          <p className="text-sm font-semibold text-indigo-700">{matter?.status || 'OPEN'} / {matter?.settlementStatus || 'PENDING'}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-sm">
        <div className="rounded-lg bg-slate-50 p-3">
          <p className="text-xs text-slate-500">Buyer</p>
          <p className="font-medium text-slate-900">{buyer || 'TBD'}</p>
        </div>
        <div className="rounded-lg bg-slate-50 p-3">
          <p className="text-xs text-slate-500">Seller</p>
          <p className="font-medium text-slate-900">{seller || 'TBD'}</p>
        </div>
        <div className="rounded-lg bg-slate-50 p-3">
          <p className="text-xs text-slate-500">Purchase Price</p>
          <p className="font-medium text-slate-900">{money(grossProceeds || matter?.purchasePrice || 0)}</p>
        </div>
        <div className="rounded-lg bg-slate-50 p-3">
          <p className="text-xs text-slate-500">Funds Held</p>
          <p className="font-medium text-emerald-700">{money(runningBalance)}</p>
        </div>
      </div>

      <div className="border-t pt-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm">
            <span className="block text-xs text-slate-500 mb-1">Custody Type</span>
            <select
              value={custodyType}
              onChange={(event) => setCustodyType(event.target.value as TrustCustodyType)}
              className="border rounded-lg px-3 py-2 min-w-[220px]"
            >
              {Object.entries(custodyLabels).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>
          {fields.map((field) => (
            <label key={field} className="text-sm">
              <span className="block text-xs text-slate-500 mb-1">{fieldLabel(field)}</span>
              <input
                type={field.toLowerCase().includes('date') ? 'date' : 'text'}
                value={custodyDetails[field] || ''}
                onChange={(event) => setCustodyDetails((prev) => ({ ...prev, [field]: event.target.value }))}
                className="border rounded-lg px-3 py-2 w-44"
              />
            </label>
          ))}
          <button
            type="button"
            onClick={() => onSaveCustody({ custodyType, custodyDetails })}
            disabled={saving}
            className="px-4 py-2 rounded-lg bg-slate-900 text-white text-sm disabled:opacity-60"
          >
            {saving ? 'Saving...' : 'Save Custody'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default TrustMatterSummary;
