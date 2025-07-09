import React, { useEffect, useState } from 'react';
import { reportService, OwnerStatementData } from '../../../services/public/reportService';

interface OwnerStatementReportProps {
  isAuthenticated?: boolean;
}

const OwnerStatementReport: React.FC<OwnerStatementReportProps> = ({ isAuthenticated = false }) => {
  const [data, setData] = useState<OwnerStatementData[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    reportService.getOwnerStatement(isAuthenticated)
      .then(setData)
      .catch(() => setError('Failed to load owner statement report.'))
      .finally(() => setLoading(false));
  }, [isAuthenticated]);

  const exportCSV = () => {
    if (!data) return;
    const rows = [
      ['Owner', 'Property', 'Address', 'Rent Collected', 'Expenses', 'Net Income', 'Period'],
      ...data.flatMap(owner => owner.properties.map(prop => [
        owner.ownerName,
        prop.propertyName,
        prop.address,
        prop.rentCollected,
        prop.expenses,
        prop.netIncome,
        prop.period
      ]))
    ];
    const csv = rows.map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'owner_statement_report.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) return <div className="flex justify-center items-center h-40"><span className="loader" /> Loading...</div>;
  if (error) return <div className="text-red-500 p-4">{error}</div>;
  if (!data || data.length === 0) return <div className="p-4">No data available.</div>;

  return (
    <div className="p-4 bg-white rounded shadow">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-semibold">Owner Statement Report</h2>
        <button onClick={exportCSV} className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700">Export CSV</button>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full border text-sm">
          <thead>
            <tr className="bg-gray-100">
              <th className="p-2 border">Owner</th>
              <th className="p-2 border">Property</th>
              <th className="p-2 border">Address</th>
              <th className="p-2 border">Rent Collected</th>
              <th className="p-2 border">Expenses</th>
              <th className="p-2 border">Net Income</th>
              <th className="p-2 border">Period</th>
            </tr>
          </thead>
          <tbody>
            {data.map(owner => owner.properties.map((prop, idx) => (
              <tr key={owner.ownerId + prop.propertyId + idx}>
                <td className="p-2 border">{owner.ownerName}</td>
                <td className="p-2 border">{prop.propertyName}</td>
                <td className="p-2 border">{prop.address}</td>
                <td className="p-2 border">{prop.rentCollected}</td>
                <td className="p-2 border">{prop.expenses}</td>
                <td className="p-2 border">{prop.netIncome}</td>
                <td className="p-2 border">{prop.period}</td>
              </tr>
            )))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default OwnerStatementReport; 