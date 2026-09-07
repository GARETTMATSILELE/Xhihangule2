import React from 'react';

type AuditRow = {
  _id?: string;
  id?: string;
  timestamp: string;
  date?: string | null;
  entityType: string;
  title?: string;
  action: string;
  entityId: string;
  performedBy?: string | null;
  reference?: string | null;
  triggeredAutomatically?: boolean;
  technicalDetails?: Record<string, unknown>;
};

const AuditTrailViewer: React.FC<{ rows: AuditRow[] }> = ({ rows }) => {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
      <h3 className="text-base font-semibold mb-3">Audit Trail</h3>
      <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
        {rows.map((r, idx) => (
          <div key={r.id || r._id || `${r.entityId}-${idx}`} className="border rounded-lg p-3">
            <p className="text-xs text-slate-500">{new Date(r.date || r.timestamp).toLocaleString()}</p>
            <p className="text-sm font-medium">{r.title || r.action}</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-1 mt-1 text-xs text-slate-500">
              <p>Performed By: {r.performedBy || 'System'}</p>
              <p>Reference: {r.reference || '-'}</p>
              <p>{r.triggeredAutomatically ? 'Triggered Automatically' : 'Manual Action'}</p>
            </div>
            <details className="mt-2">
              <summary className="cursor-pointer text-xs text-slate-500">Technical Details</summary>
              <pre className="mt-2 max-h-44 overflow-auto rounded bg-slate-50 p-2 text-xs text-slate-600">
                {JSON.stringify(r.technicalDetails || { action: r.action, entityType: r.entityType, entityId: r.entityId }, null, 2)}
              </pre>
            </details>
          </div>
        ))}
        {rows.length === 0 && <p className="text-sm text-slate-500">No audit entries yet.</p>}
      </div>
    </div>
  );
};

export default AuditTrailViewer;
