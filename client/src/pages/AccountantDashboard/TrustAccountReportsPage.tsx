import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import trustAccountService, { TrustAccountListItem } from '../../services/trustAccountService';

function currency(amount: number) {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2
  }).format(amount || 0);
}

const TrustAccountReportsPage: React.FC = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState<string>('');
  const [trustAccounts, setTrustAccounts] = useState<TrustAccountListItem[]>([]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        setError(null);

        const payload = await trustAccountService.list({ page: 1, limit: 200 });

        if (!mounted) return;

        setTrustAccounts(Array.isArray(payload.data) ? payload.data : []);
      } catch (e: any) {
        if (!mounted) return;
        setError(e?.message || 'Failed to load trust account reports.');
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  const filteredAccounts = useMemo(() => {
    if (!search.trim()) return trustAccounts;
    const needle = search.trim().toLowerCase();
    return trustAccounts.filter((row) => {
      const property = typeof row.propertyId === 'object' ? row.propertyId : undefined;
      return (
        String(property?.name || '').toLowerCase().includes(needle) ||
        String(property?.address || '').toLowerCase().includes(needle)
      );
    });
  }, [search, trustAccounts]);

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-semibold">Trust A/c Reports</h1>
          <p className="text-sm text-slate-500">
            Trust account report tiles by property. Click a property to open its individual trust report page.
          </p>
        </div>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search property/address"
          className="border rounded-lg px-3 py-2 w-full md:w-72"
        />
      </header>

      {loading && <div className="text-sm text-slate-500">Loading trust account reports...</div>}
      {error && <div className="text-sm text-rose-600">{error}</div>}

      {!loading && !error && (
        <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredAccounts.map((row) => {
            const property = typeof row.propertyId === 'object' ? row.propertyId : undefined;
            const propertyId = property?._id || String(row.propertyId || '');
            const buyer =
              row.partyNames?.buyer ||
              (typeof row.buyerId === 'object'
                ? `${row.buyerId.firstName || ''} ${row.buyerId.lastName || ''}`.trim()
                : '') ||
              'TBD';
            const seller =
              row.partyNames?.seller ||
              (typeof row.sellerId === 'object'
                ? `${row.sellerId.firstName || ''} ${row.sellerId.lastName || ''}`.trim()
                : '') ||
              'TBD';
            return (
              <button
                key={row._id}
                type="button"
                onClick={() =>
                  navigate(`/accountant-dashboard/trust-account-reports/${propertyId}`, {
                    state: {
                      trustAccountId: row._id,
                      propertyId,
                      propertyName: property?.name,
                      propertyAddress: property?.address,
                      buyer,
                      seller
                    }
                  })
                }
                className="text-left bg-white rounded-2xl border border-slate-200 p-4 shadow-sm hover:shadow-md transition"
              >
                <h2 className="text-base font-semibold mb-1">{property?.address || property?.name || propertyId}</h2>
                <p className="text-xs text-slate-500 mb-3">{property?.name || 'Property trust account'}</p>

                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Held</span>
                    <span className="font-medium">{currency(row.runningBalance)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Opening</span>
                    <span>{currency(row.openingBalance)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Closing</span>
                    <span>{currency(row.closingBalance)}</span>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t text-sm">
                  <p>
                    <span className="text-slate-500">Buyer:</span> {buyer || 'TBD'}
                  </p>
                  <p>
                    <span className="text-slate-500">Seller:</span> {seller || 'TBD'}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">Workflow: {row.workflowState}</p>
                </div>
              </button>
            );
          })}
        </section>
      )}

      {!loading && !error && filteredAccounts.length === 0 && (
        <div className="text-sm text-slate-500">No properties found for the current search.</div>
      )}
    </div>
  );
};

export default TrustAccountReportsPage;
