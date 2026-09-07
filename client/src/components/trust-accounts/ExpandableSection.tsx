import React, { useState } from 'react';

type Props = {
  title: string;
  subtitle?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
};

const ExpandableSection: React.FC<Props> = ({ title, subtitle, defaultOpen = true, children }) => {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-slate-50"
      >
        <span>
          <span className="block text-base font-semibold text-slate-900">{title}</span>
          {subtitle && <span className="block text-xs text-slate-500 mt-0.5">{subtitle}</span>}
        </span>
        <span className="text-sm text-slate-500">{open ? 'Hide' : 'Show'}</span>
      </button>
      {open && <div className="p-4 border-t border-slate-100">{children}</div>}
    </section>
  );
};

export default ExpandableSection;
