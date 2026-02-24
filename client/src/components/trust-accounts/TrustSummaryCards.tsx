import React from 'react';

type Props = {
  runningBalance: number;
  openingBalance: number;
  closingBalance: number;
  status: string;
};

const money = (n: number) =>
  new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(Number(n || 0));

const TrustSummaryCards: React.FC<Props> = ({ runningBalance, openingBalance, closingBalance, status }) => {
  const cards = [
    { label: 'Opening Balance', value: money(openingBalance), tone: 'text-slate-900' },
    { label: 'Running Balance', value: money(runningBalance), tone: runningBalance >= 0 ? 'text-emerald-600' : 'text-rose-600' },
    { label: 'Closing Balance', value: money(closingBalance), tone: 'text-slate-900' },
    { label: 'Status', value: status, tone: 'text-indigo-600' }
  ];

  return (
    <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
      {cards.map((c) => (
        <div key={c.label} className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <p className="text-xs text-slate-500">{c.label}</p>
          <p className={`text-lg font-semibold ${c.tone}`}>{c.value}</p>
        </div>
      ))}
    </section>
  );
};

export default TrustSummaryCards;
