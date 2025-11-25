import React, { useEffect, useState } from 'react';
import { reportService, IncomeExpenseData } from '../../../services/public/reportService';

interface IncomeExpenseReportProps {
  isAuthenticated?: boolean;
}

const IncomeExpenseReport: React.FC<IncomeExpenseReportProps> = ({ isAuthenticated = true }) => {
  const [data, setData] = useState<IncomeExpenseData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    reportService.getIncomeExpense(isAuthenticated)
      .then(setData)
      .catch(() => setError('Failed to load income & expense report.'))
      .finally(() => setLoading(false));
  }, [isAuthenticated]);

  const exportCSV = () => {
    if (!data) return;
    const rows = [
      ['Period', 'Income (Total)', 'Expenses (Total)', 'Net Income'],
      [data.period, data.income.total, data.expenses.total, data.netIncome],
      [],
      ['Property', 'Income', 'Expenses', 'Net Income'],
      ...data.properties.map(p => [p.propertyName, p.income, p.expenses, p.netIncome])
    ];
    const csv = rows.map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'income_expense_report.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) return <div className="flex justify-center items-center h-40"><span className="loader" /> Loading...</div>;
  if (error) return <div className="text-red-500 p-4">{error}</div>;
  if (!data) return <div className="p-4">No data available.</div>;

  return (
    <div className="p-4 bg-white rounded shadow">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-semibold">Income & Expense Report</h2>
        <button onClick={exportCSV} className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700">Export CSV</button>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full border text-sm mb-4">
          <thead>
            <tr className="bg-gray-100">
              <th className="p-2 border">Period</th>
              <th className="p-2 border">Income (Total)</th>
              <th className="p-2 border">Expenses (Total)</th>
              <th className="p-2 border">Net Income</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="p-2 border">{data.period}</td>
              <td className="p-2 border">{data.income.total}</td>
              <td className="p-2 border">{data.expenses.total}</td>
              <td className="p-2 border">{data.netIncome}</td>
            </tr>
          </tbody>
        </table>
        <h3 className="font-semibold mb-2">By Property</h3>
        <table className="min-w-full border text-sm">
          <thead>
            <tr className="bg-gray-100">
              <th className="p-2 border">Property</th>
              <th className="p-2 border">Income</th>
              <th className="p-2 border">Expenses</th>
              <th className="p-2 border">Net Income</th>
            </tr>
          </thead>
          <tbody>
            {data.properties.map((p, idx) => (
              <tr key={p.propertyId + idx}>
                <td className="p-2 border">{p.propertyName}</td>
                <td className="p-2 border">{p.income}</td>
                <td className="p-2 border">{p.expenses}</td>
                <td className="p-2 border">{p.netIncome}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default IncomeExpenseReport; 