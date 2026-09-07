import React, { useEffect, useState } from 'react';
import { TrustMatterDocument } from '../../services/trustAccountService';

type Props = {
  documents?: TrustMatterDocument[];
  onSave: (documents: TrustMatterDocument[]) => Promise<void>;
  saving?: boolean;
};

const SupportingDocumentsPanel: React.FC<Props> = ({ documents = [], onSave, saving = false }) => {
  const [drafts, setDrafts] = useState<TrustMatterDocument[]>([]);

  useEffect(() => {
    setDrafts(documents);
  }, [documents]);

  const updateDraft = (index: number, patch: Partial<TrustMatterDocument>) => {
    setDrafts((prev) => prev.map((document, currentIndex) => (currentIndex === index ? { ...document, ...patch } : document)));
  };

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="text-slate-500">
            <tr>
              <th className="text-left py-2">Document</th>
              <th className="text-left py-2">Status</th>
              <th className="text-left py-2">Reference</th>
              <th className="text-left py-2">Notes</th>
              <th className="text-left py-2">File</th>
            </tr>
          </thead>
          <tbody>
            {drafts.map((document, index) => (
              <tr key={document.type} className="border-t">
                <td className="py-2 font-medium">{document.label}</td>
                <td className="py-2">
                  <select
                    value={document.status}
                    onChange={(event) => updateDraft(index, { status: event.target.value as TrustMatterDocument['status'] })}
                    className="border rounded px-2 py-1"
                  >
                    <option value="MISSING">Missing</option>
                    <option value="REQUESTED">Requested</option>
                    <option value="RECEIVED">Received</option>
                    <option value="APPROVED">Approved</option>
                    <option value="WAIVED">Waived</option>
                  </select>
                </td>
                <td className="py-2">
                  <input
                    value={document.reference || ''}
                    onChange={(event) => updateDraft(index, { reference: event.target.value })}
                    className="border rounded px-2 py-1 w-40"
                  />
                </td>
                <td className="py-2">
                  <input
                    value={document.notes || ''}
                    onChange={(event) => updateDraft(index, { notes: event.target.value })}
                    className="border rounded px-2 py-1 w-56"
                  />
                </td>
                <td className="py-2 text-slate-500">{document.fileName || '-'}</td>
              </tr>
            ))}
            {drafts.length === 0 && (
              <tr>
                <td colSpan={5} className="py-4 text-center text-slate-500">No document checklist is available yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <button
        type="button"
        onClick={() => onSave(drafts)}
        disabled={saving || drafts.length === 0}
        className="px-4 py-2 rounded-lg bg-slate-900 text-white text-sm disabled:opacity-60"
      >
        {saving ? 'Saving...' : 'Save Document Metadata'}
      </button>
    </div>
  );
};

export default SupportingDocumentsPanel;
