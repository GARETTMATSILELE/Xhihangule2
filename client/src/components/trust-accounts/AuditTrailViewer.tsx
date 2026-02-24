import React from 'react';

type AuditRow = {
  _id?: string;
  timestamp: string;
  entityType: string;
  action: string;
  entityId: string;
};

const AuditTrailViewer: React.FC<{ rows: AuditRow[] }> = ({ rows }) => {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
      <h3 className="text-base font-semibold mb-3">Audit Trail</h3>
      <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
        {rows.map((r, idx) => (
          <div key={r._id || `${r.entityId}-${idx}`} className="border rounded-lg p-2">
            <p className="text-xs text-slate-500">{new Date(r.timestamp).toLocaleString()}</p>
            <p className="text-sm font-medium">{r.action}</p>
            <p className="text-xs text-slate-500">{r.entityType} - {r.entityId}</p>
          </div>
        ))}
        {rows.length === 0 && <p className="text-sm text-slate-500">No audit entries yet.</p>}
      </div>
    </div>
  );
};

export default AuditTrailViewer;
