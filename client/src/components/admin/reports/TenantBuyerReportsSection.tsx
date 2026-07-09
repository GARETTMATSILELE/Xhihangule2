import React, { useEffect, useMemo, useState } from 'react';
import paymentService from '../../../services/paymentService';
import { Payment } from '../../../types/payment';
import {
  buildBuyerStatements,
  buildTenantStatements,
  formatReportCurrency,
  printBuyerStatement,
  printTenantStatement,
} from '../../../utils/partyStatementReports';

interface TenantBuyerReportsSectionProps {
  companyName?: string;
}

const TenantBuyerReportsSection: React.FC<TenantBuyerReportsSectionProps> = () => {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [partySearch, setPartySearch] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const all = await paymentService.getPayments();
        if (!cancelled) setPayments(Array.isArray(all) ? all : []);
      } catch (e: unknown) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load payment data');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const tenantStatements = useMemo(() => buildTenantStatements(payments), [payments]);
  const buyerStatements = useMemo(() => buildBuyerStatements(payments), [payments]);

  const filteredTenants = useMemo(() => {
    const needle = partySearch.trim().toLowerCase();
    if (!needle) return tenantStatements;
    return tenantStatements.filter(s => s.name.toLowerCase().includes(needle));
  }, [tenantStatements, partySearch]);

  const filteredBuyers = useMemo(() => {
    const needle = partySearch.trim().toLowerCase();
    if (!needle) return buyerStatements;
    return buyerStatements.filter(s => s.name.toLowerCase().includes(needle));
  }, [buyerStatements, partySearch]);

  if (loading) {
    return <div className="p-4 bg-white rounded shadow flex justify-center items-center h-40 text-gray-500">Loading tenant and buyer reports…</div>;
  }

  if (error) {
    return <div className="p-4 bg-white rounded shadow text-red-500">{error}</div>;
  }

  return (
    <div className="p-4 bg-white rounded shadow">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h2 className="text-xl font-semibold">Tenant and Buyer Reports</h2>
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-500">Search</label>
          <input
            value={partySearch}
            onChange={(e) => setPartySearch(e.target.value)}
            placeholder="Search name"
            className="border rounded px-2 py-1 text-sm"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <h3 className="text-sm font-medium mb-2 text-gray-700">Tenants (rental payments)</h3>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm border-collapse">
              <thead className="text-gray-500">
                <tr>
                  <th className="py-2 pr-2">Tenant</th>
                  <th className="text-right py-2 px-2">Count</th>
                  <th className="text-right py-2 px-2">Total Paid</th>
                  <th className="text-right py-2 px-2">Outstanding</th>
                  <th className="text-right py-2 pl-2">Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredTenants.map((s) => (
                  <tr key={`tenant-${s.id}`} className="border-t">
                    <td className="py-2 pr-2">{s.name}</td>
                    <td className="text-right py-2 px-2">{s.count}</td>
                    <td className="text-right py-2 px-2">{formatReportCurrency(s.total)}</td>
                    <td className="text-right py-2 px-2">{formatReportCurrency(s.outstandingTotal || 0)}</td>
                    <td className="text-right py-2 pl-2">
                      <button
                        type="button"
                        onClick={() => printTenantStatement(s)}
                        className="px-2 py-1 rounded border text-xs hover:bg-gray-50"
                      >
                        Print
                      </button>
                    </td>
                  </tr>
                ))}
                {filteredTenants.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-gray-400">No tenant transactions found.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div>
          <h3 className="text-sm font-medium mb-2 text-gray-700">Buyers (sales payments)</h3>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm border-collapse">
              <thead className="text-gray-500">
                <tr>
                  <th className="py-2 pr-2">Buyer</th>
                  <th className="text-right py-2 px-2">Count</th>
                  <th className="text-right py-2 px-2">Total Paid</th>
                  <th className="text-right py-2 px-2">Outstanding</th>
                  <th className="text-right py-2 pl-2">Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredBuyers.map((s) => (
                  <tr key={`buyer-${s.id}`} className="border-t">
                    <td className="py-2 pr-2">{s.name}</td>
                    <td className="text-right py-2 px-2">{s.count}</td>
                    <td className="text-right py-2 px-2">{formatReportCurrency(s.total)}</td>
                    <td className="text-right py-2 px-2">{formatReportCurrency(s.outstandingTotal || 0)}</td>
                    <td className="text-right py-2 pl-2">
                      <button
                        type="button"
                        onClick={() => printBuyerStatement(s)}
                        className="px-2 py-1 rounded border text-xs hover:bg-gray-50"
                      >
                        Print
                      </button>
                    </td>
                  </tr>
                ))}
                {filteredBuyers.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-gray-400">No buyer transactions found.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TenantBuyerReportsSection;
