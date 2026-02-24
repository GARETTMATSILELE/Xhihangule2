import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import trustAccountService from '../../services/trustAccountService';
import TrustSummaryCards from '../../components/trust-accounts/TrustSummaryCards';
import BuyerLedgerTable from '../../components/trust-accounts/BuyerLedgerTable';
import SellerSettlementPanel from '../../components/trust-accounts/SellerSettlementPanel';
import TaxSummaryPanel from '../../components/trust-accounts/TaxSummaryPanel';
import AuditTrailViewer from '../../components/trust-accounts/AuditTrailViewer';

const TrustAccountPropertyReportPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { propertyId = '' } = useParams();
  const routeState = (location.state || {}) as {
    trustAccountId?: string;
    propertyName?: string;
    propertyAddress?: string;
    buyer?: string;
    seller?: string;
  };

  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<any>(null);
  const [ledgerRows, setLedgerRows] = useState<any[]>([]);
  const [taxSummary, setTaxSummary] = useState<any>(null);
  const [partyNames, setPartyNames] = useState<{ buyer?: string; seller?: string } | null>(null);
  const [auditRows, setAuditRows] = useState<any[]>([]);
  const [settlement, setSettlement] = useState<any>(null);
  const [manualCgtAmount, setManualCgtAmount] = useState<string>('');
  const [busyAction, setBusyAction] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    let inFlight = false;
    const canBackgroundPoll = () =>
      document.visibilityState === 'visible' && navigator.onLine;

    const load = async (opts?: { background?: boolean }) => {
      if (inFlight || !mounted) return;
      const background = !!opts?.background;
      if (background && !canBackgroundPoll()) return;

      inFlight = true;
      try {
        if (!background) setLoading(true);
        setError(null);
        const data = await trustAccountService.getFullByProperty(propertyId).catch(() => null);
        if (!mounted) return;
        const ledger = Array.isArray(data?.ledger) ? data.ledger : [];
        const trustAccount = data?.trustAccount || {};
        const newestRow = ledger.length ? ledger[0] : null;
        const grossProceedsFromLedger = ledger
          .filter((row: any) => String(row?.type || '') === 'BUYER_PAYMENT')
          .reduce(
            (sum: number, row: any) => sum + Number(row?.credit || 0) - Number(row?.debit || 0),
            0
          );

        setSummary({
          trustAccountId: trustAccount?._id || routeState.trustAccountId,
          runningBalance:
            trustAccount?.runningBalance != null
              ? Number(trustAccount.runningBalance || 0)
              : (newestRow ? Number(newestRow.runningBalance || 0) : 0),
          openingBalance:
            trustAccount?.openingBalance != null
              ? Number(trustAccount.openingBalance || 0)
              : 0,
          closingBalance:
            trustAccount?.closingBalance != null
              ? Number(trustAccount.closingBalance || 0)
              : (newestRow ? Number(newestRow.runningBalance || 0) : 0),
          grossProceeds:
            data?.settlement?.grossProceeds != null && Number(data?.settlement?.grossProceeds || 0) > 0
              ? Number(data?.settlement?.grossProceeds || 0)
              : (
                  trustAccount?.amountReceived != null
                    ? Number(trustAccount.amountReceived || 0)
                    : Number(grossProceedsFromLedger || 0)
                ),
          status: trustAccount?.status || (data?.settlement?.locked ? 'SETTLED' : 'OPEN')
        });
        setLedgerRows(ledger);
        setTaxSummary(data?.taxSummary || null);
        setPartyNames(data?.partyNames || null);
        setAuditRows(Array.isArray(data?.auditLogs) ? data.auditLogs : []);
        setSettlement(data?.settlement || null);
      } catch (e: any) {
        if (!mounted) return;
        setError(e?.message || 'Failed to load trust account property report.');
      } finally {
        inFlight = false;
        if (mounted && !background) setLoading(false);
      }
    };
    void load();
    const intervalId = window.setInterval(() => {
      void load({ background: true });
    }, 20000);
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void load({ background: true });
      }
    };
    const handleOnline = () => {
      void load({ background: true });
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('online', handleOnline);

    return () => {
      mounted = false;
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('online', handleOnline);
    };
  }, [propertyId]);

  const pageTitle = useMemo(() => {
    return routeState.propertyAddress || routeState.propertyName || propertyId;
  }, [routeState.propertyAddress, routeState.propertyName, propertyId]);

  const trustAccountId = routeState.trustAccountId || summary?.trustAccountId;

  const downloadReport = async (reportType: 'buyer-statement' | 'seller-settlement' | 'trust-reconciliation' | 'tax-zimra' | 'audit-log') => {
    if (!trustAccountId) return;
    try {
      setBusyAction(reportType);
      const blob = await trustAccountService.downloadReport(trustAccountId, reportType);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${reportType}-${trustAccountId}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      setError(e?.message || 'Failed to download report');
    } finally {
      setBusyAction('');
    }
  };

  const runSettlement = async () => {
    if (!trustAccountId) return;
    try {
      setBusyAction('settlement');
      const parsedCgt = Number(manualCgtAmount);
      const hasManualCgt = manualCgtAmount.trim().length > 0 && Number.isFinite(parsedCgt) && parsedCgt >= 0;
      await trustAccountService.calculateSettlement(
        trustAccountId,
        hasManualCgt ? { cgtAmount: parsedCgt } : undefined
      );
      const refreshed = await trustAccountService.getFullByProperty(propertyId);
      setSettlement(refreshed?.settlement || null);
      setTaxSummary(refreshed?.taxSummary || null);
      setPartyNames(refreshed?.partyNames || null);
      setLedgerRows(Array.isArray(refreshed?.ledger) ? refreshed.ledger : []);
      setAuditRows(Array.isArray(refreshed?.auditLogs) ? refreshed.auditLogs : []);
    } catch (e: any) {
      setError(e?.message || 'Failed to calculate settlement');
    } finally {
      setBusyAction('');
    }
  };

  const applyTaxes = async () => {
    if (!trustAccountId) return;
    try {
      setBusyAction('taxes');
      await trustAccountService.applyTaxDeductions(trustAccountId);
      const refreshed = await trustAccountService.getFullByProperty(propertyId);
      setTaxSummary(refreshed?.taxSummary || null);
      setPartyNames(refreshed?.partyNames || null);
      setLedgerRows(Array.isArray(refreshed?.ledger) ? refreshed.ledger : []);
      setAuditRows(Array.isArray(refreshed?.auditLogs) ? refreshed.auditLogs : []);
    } catch (e: any) {
      setError(e?.message || 'Failed to apply taxes');
    } finally {
      setBusyAction('');
    }
  };

  const closeAccount = async () => {
    if (!trustAccountId) return;
    try {
      setBusyAction('close');
      await trustAccountService.closeTrustAccount(trustAccountId, { lockReason: 'Closed from Trust A/c property page' });
      const refreshed = await trustAccountService.getFullByProperty(propertyId);
      setSettlement(refreshed?.settlement || null);
      setPartyNames(refreshed?.partyNames || null);
      setAuditRows(Array.isArray(refreshed?.auditLogs) ? refreshed.auditLogs : []);
      setSummary((prev: any) => ({ ...(prev || {}), status: 'CLOSED' }));
    } catch (e: any) {
      setError(e?.message || 'Failed to close trust account');
    } finally {
      setBusyAction('');
    }
  };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <button
          type="button"
          onClick={() => navigate('/accountant-dashboard/trust-account-reports')}
          className="px-3 py-1.5 border rounded-lg text-sm hover:bg-slate-50"
        >
          Back to Trust A/c Reports
        </button>
        <button
          type="button"
          onClick={() => window.print()}
          className="px-3 py-1.5 rounded-lg bg-slate-900 text-white text-sm"
        >
          Print
        </button>
      </div>

      <header className="mb-5">
        <h1 className="text-2xl font-semibold">Trust Account Property Report</h1>
        <p className="text-sm text-slate-500 mt-1">{pageTitle}</p>
      </header>

      {loading && <div className="text-sm text-slate-500">Loading property trust account details...</div>}
      {error && <div className="text-sm text-rose-600">{error}</div>}

      {!loading && !error && (
        <section className="space-y-4">
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
              <p><span className="text-slate-500">Buyer:</span> {partyNames?.buyer || routeState.buyer || 'TBD'}</p>
              <p><span className="text-slate-500">Seller:</span> {partyNames?.seller || routeState.seller || 'TBD'}</p>
              <p><span className="text-slate-500">Gross Proceeds:</span> {Number(settlement?.grossProceeds || summary?.grossProceeds || 0).toLocaleString(undefined, { style: 'currency', currency: 'USD' })}</p>
              <p>
                <span className="text-slate-500">Manual CGT Override (optional):</span>
                <input
                  value={manualCgtAmount}
                  onChange={(e) => setManualCgtAmount(e.target.value)}
                  placeholder="Auto if blank"
                  inputMode="decimal"
                  className="border rounded px-2 py-1 ml-2 w-36"
                />
              </p>
              <p className="md:col-span-2 text-xs text-slate-500">
                Settlement, commission, and VAT figures are sourced from completed sale payments for this property. Leave CGT blank for auto-calculation.
              </p>
            </div>
            <div className="flex flex-wrap gap-2 mt-3">
              <button onClick={runSettlement} className="px-3 py-1.5 rounded bg-indigo-600 text-white text-sm" disabled={busyAction !== ''}>
                {busyAction === 'settlement' ? 'Calculating...' : 'Calculate Settlement'}
              </button>
              <button onClick={applyTaxes} className="px-3 py-1.5 rounded bg-amber-600 text-white text-sm" disabled={busyAction !== ''}>
                {busyAction === 'taxes' ? 'Applying...' : 'Apply Tax Deductions'}
              </button>
              <button onClick={closeAccount} className="px-3 py-1.5 rounded bg-rose-700 text-white text-sm" disabled={busyAction !== ''}>
                {busyAction === 'close' ? 'Closing...' : 'Close Trust Account'}
              </button>
              <button onClick={() => downloadReport('buyer-statement')} className="px-3 py-1.5 rounded border text-sm" disabled={busyAction !== ''}>Buyer PDF</button>
              <button onClick={() => downloadReport('seller-settlement')} className="px-3 py-1.5 rounded border text-sm" disabled={busyAction !== ''}>Seller PDF</button>
              <button onClick={() => downloadReport('tax-zimra')} className="px-3 py-1.5 rounded border text-sm" disabled={busyAction !== ''}>Tax PDF</button>
              <button onClick={() => downloadReport('audit-log')} className="px-3 py-1.5 rounded border text-sm" disabled={busyAction !== ''}>Audit PDF</button>
            </div>
          </div>

          <TrustSummaryCards
            runningBalance={Number(summary?.runningBalance || 0)}
            openingBalance={Number(summary?.openingBalance || 0)}
            closingBalance={Number(summary?.closingBalance || 0)}
            status={summary?.status || 'OPEN'}
          />

          <BuyerLedgerTable rows={ledgerRows as any} />

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <SellerSettlementPanel settlement={settlement} />
            <TaxSummaryPanel summary={taxSummary} />
          </div>

          <AuditTrailViewer rows={auditRows as any} />
        </section>
      )}
    </div>
  );
};

export default TrustAccountPropertyReportPage;
