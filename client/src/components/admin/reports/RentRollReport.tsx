import React, { useEffect, useState } from 'react';
import { reportService, RentRollData } from '../../../services/public/reportService';

interface RentRollReportProps {
  isAuthenticated?: boolean;
}

const RentRollReport: React.FC<RentRollReportProps> = ({ isAuthenticated = false }) => {
  const [data, setData] = useState<RentRollData[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    reportService.getRentRoll(isAuthenticated)
      .then(setData)
      .catch(() => setError('Failed to load rent roll report.'))
      .finally(() => setLoading(false));
  }, [isAuthenticated]);

  const exportCSV = () => {
    if (!data) return;
    const rows = [
      ['Property', 'Address', 'Unit', 'Tenant', 'Lease Start', 'Lease End', 'Monthly Rent', 'Current Balance', 'Status', 'Last Payment'],
      ...data.map(r => [
        r.propertyName,
        r.address,
        r.unitNumber,
        r.tenantName,
        r.leaseStartDate,
        r.leaseEndDate,
        r.monthlyRent,
        r.currentBalance,
        r.status,
        r.lastPaymentDate
      ])
    ];
    const csv = rows.map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'rent_roll_report.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) return <div className="flex justify-center items-center h-40"><span className="loader" /> Loading...</div>;
  if (error) return <div className="text-red-500 p-4">{error}</div>;
  if (!data || data.length === 0) return <div className="p-4">No data available.</div>;

  return (
    <div className="p-4 bg-white rounded shadow">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-semibold">Rent Roll Report</h2>
        <button onClick={exportCSV} className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700">Export CSV</button>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full border text-sm">
          <thead>
            <tr className="bg-gray-100">
              <th className="p-2 border">Property</th>
              <th className="p-2 border">Address</th>
              <th className="p-2 border">Unit</th>
              <th className="p-2 border">Tenant</th>
              <th className="p-2 border">Lease Start</th>
              <th className="p-2 border">Lease End</th>
              <th className="p-2 border">Monthly Rent</th>
              <th className="p-2 border">Current Balance</th>
              <th className="p-2 border">Status</th>
              <th className="p-2 border">Last Payment</th>
            </tr>
          </thead>
          <tbody>
            {data.map((r, idx) => (
              <tr key={r.propertyId + r.unitNumber + idx}>
                <td className="p-2 border">{r.propertyName}</td>
                <td className="p-2 border">{r.address}</td>
                <td className="p-2 border">{r.unitNumber}</td>
                <td className="p-2 border">{r.tenantName}</td>
                <td className="p-2 border">{r.leaseStartDate}</td>
                <td className="p-2 border">{r.leaseEndDate}</td>
                <td className="p-2 border">{r.monthlyRent}</td>
                <td className="p-2 border">{r.currentBalance}</td>
                <td className="p-2 border">{r.status}</td>
                <td className="p-2 border">{r.lastPaymentDate}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default RentRollReport; 