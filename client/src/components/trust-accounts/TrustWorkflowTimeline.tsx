import React from 'react';
import { TrustWorkflowTimelineItem } from '../../services/trustAccountService';

const formatDate = (value?: string | null): string => {
  if (!value) return '-';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? '-' : parsed.toLocaleString();
};

const TrustWorkflowTimeline: React.FC<{ items?: TrustWorkflowTimelineItem[] }> = ({ items = [] }) => {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
      {items.map((item) => (
        <div key={item.key} className="flex gap-3 rounded-lg border border-slate-200 p-3">
          <div className={`mt-1 h-5 w-5 rounded-full border flex items-center justify-center text-xs ${item.complete ? 'bg-emerald-600 border-emerald-600 text-white' : 'bg-white border-slate-300 text-slate-400'}`}>
            {item.complete ? '✓' : ''}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-900">{item.label}</p>
            <p className="text-xs text-slate-500">Date: {formatDate(item.date)}</p>
            <p className="text-xs text-slate-500">User: {item.user || '-'}</p>
            <p className="text-xs text-slate-500 truncate">Audit reference: {item.auditReference || '-'}</p>
          </div>
        </div>
      ))}
      {items.length === 0 && <p className="text-sm text-slate-500">Workflow timeline is not available yet.</p>}
    </div>
  );
};

export default TrustWorkflowTimeline;
