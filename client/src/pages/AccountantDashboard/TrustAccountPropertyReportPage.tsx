import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import trustAccountService, { TrustAccountFullResponse, TrustMatterDocument } from '../../services/trustAccountService';
import BuyerLedgerTable from '../../components/trust-accounts/BuyerLedgerTable';
import SellerSettlementPanel from '../../components/trust-accounts/SellerSettlementPanel';
import TaxSummaryPanel from '../../components/trust-accounts/TaxSummaryPanel';
import AuditTrailViewer from '../../components/trust-accounts/AuditTrailViewer';
import ExpandableSection from '../../components/trust-accounts/ExpandableSection';
import TrustMatterSummary from '../../components/trust-accounts/TrustMatterSummary';
import TrustWorkflowTimeline from '../../components/trust-accounts/TrustWorkflowTimeline';
import FundsAllocationPanel from '../../components/trust-accounts/FundsAllocationPanel';
import PaymentAllocationPanel from '../../components/trust-accounts/PaymentAllocationPanel';
import TrustLedgerPanel from '../../components/trust-accounts/TrustLedgerPanel';
import SellerTransferPanel from '../../components/trust-accounts/SellerTransferPanel';
import SupportingDocumentsPanel from '../../components/trust-accounts/SupportingDocumentsPanel';
import TrustReconciliationPanel from '../../components/trust-accounts/TrustReconciliationPanel';

const currency = (value: number) =>
  Number(value || 0).toLocaleString(undefined, { style: 'currency', currency: 'USD' });

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
  const [detail, setDetail] = useState<TrustAccountFullResponse | null>(null);
  const [manualCgtAmount, setManualCgtAmount] = useState<string>('');
  const [busyAction, setBusyAction] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (opts?: { background?: boolean }) => {
    if (opts?.background && (document.visibilityState !== 'visible' || !navigator.onLine)) return null;
    try {
      if (!opts?.background) setLoading(true);
      setError(null);
      const refreshed = await trustAccountService.getFullByProperty(propertyId);
      setDetail(refreshed);
      return refreshed;
    } catch (e: any) {
      if (!opts?.background) {
        setError(e?.message || 'Failed to load trust matter report.');
      }
      return null;
    } finally {
      if (!opts?.background) setLoading(false);
    }
  }, [propertyId]);

  useEffect(() => {
    let mounted = true;
    let inFlight = false;
    const load = async (opts?: { background?: boolean }) => {
      if (inFlight || !mounted) return;
      inFlight = true;
      await refresh(opts);
      inFlight = false;
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
  }, [refresh]);

  const pageTitle = useMemo(() => {
    return routeState.propertyAddress || routeState.propertyName || propertyId;
  }, [routeState.propertyAddress, routeState.propertyName, propertyId]);

  const currentDetail: TrustAccountFullResponse = detail || {};
  const ledgerRows = Array.isArray(currentDetail.ledger) ? currentDetail.ledger : [];
  const buyerPayments = Array.isArray(currentDetail.buyerPayments) ? currentDetail.buyerPayments : [];
  const auditRows = Array.isArray(currentDetail.auditPresentation) && currentDetail.auditPresentation.length > 0
    ? currentDetail.auditPresentation
    : (Array.isArray(currentDetail.auditLogs) ? currentDetail.auditLogs : []);
  const trustAccount = currentDetail.trustAccount || {};
  const settlement = currentDetail.settlement || null;
  const partyNames = currentDetail.partyNames || null;
  const propertySummary = currentDetail.propertySummary || null;
  const trustMatter = currentDetail.trustMatter || null;
  const grossProceedsFromLedger = ledgerRows
    .filter((row: any) => String(row?.type || '') === 'BUYER_PAYMENT')
    .reduce((sum: number, row: any) => sum + Number(row?.credit || 0) - Number(row?.debit || 0), 0);
  const runningBalance = Number(trustAccount?.runningBalance ?? (ledgerRows[0]?.runningBalance || 0));
  const grossProceeds =
    Number(settlement?.grossProceeds || 0) > 0
      ? Number(settlement?.grossProceeds || 0)
      : Number(trustAccount?.amountReceived || grossProceedsFromLedger || 0);
  const trustAccountId = routeState.trustAccountId || trustAccount?._id;

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
      await refresh();
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
      await refresh();
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
      await refresh();
    } catch (e: any) {
      setError(e?.message || 'Failed to close trust account');
    } finally {
      setBusyAction('');
    }
  };

  const transferToSeller = async (payload: { amount: number; reference?: string }) => {
    if (!trustAccountId) return;
    try {
      setBusyAction('seller-transfer');
      await trustAccountService.transferToSeller(trustAccountId, payload);
      await refresh();
    } catch (e: any) {
      setError(e?.message || 'Failed to transfer to seller');
    } finally {
      setBusyAction('');
    }
  };

  const saveCustody = async (payload: { custodyType: any; custodyDetails: Record<string, unknown> }) => {
    if (!trustAccountId) return;
    try {
      setBusyAction('custody');
      await trustAccountService.updateMatterCustody(trustAccountId, payload);
      await refresh();
    } catch (e: any) {
      setError(e?.message || 'Failed to update custody');
    } finally {
      setBusyAction('');
    }
  };

  const saveDocuments = async (documents: TrustMatterDocument[]) => {
    if (!trustAccountId) return;
    try {
      setBusyAction('documents');
      await trustAccountService.updateMatterDocuments(trustAccountId, { documents });
      await refresh();
    } catch (e: any) {
      setError(e?.message || 'Failed to update supporting documents');
    } finally {
      setBusyAction('');
    }
  };

  return (
    <div className="w-full p-6">
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
        <h1 className="text-2xl font-semibold">Trust Matter Management</h1>
        <p className="text-sm text-slate-500 mt-1">Enterprise trust accounting workflow for {pageTitle}</p>
      </header>

      {loading && <div className="text-sm text-slate-500">Loading trust matter details...</div>}
      {error && <div className="text-sm text-rose-600">{error}</div>}

      {!loading && !error && (
        <section className="space-y-4">
          <TrustMatterSummary
            matter={trustMatter}
            title={pageTitle}
            buyer={partyNames?.buyer || routeState.buyer || ''}
            seller={partyNames?.seller || routeState.seller || ''}
            grossProceeds={grossProceeds}
            runningBalance={runningBalance}
            onSaveCustody={saveCustody}
            saving={busyAction === 'custody'}
          />

          <ExpandableSection title="Workflow" subtitle="Matter lifecycle from deposit through final trust closure">
            <div className="space-y-4">
              <TrustWorkflowTimeline items={detail?.workflowTimeline || []} />
              <div className="flex flex-wrap items-end gap-2 border-t pt-4">
                <label className="text-sm">
                  <span className="block text-xs text-slate-500 mb-1">Manual CGT Override</span>
                  <input
                    value={manualCgtAmount}
                    onChange={(e) => setManualCgtAmount(e.target.value)}
                    placeholder="Auto if blank"
                    inputMode="decimal"
                    className="border rounded-lg px-3 py-2 w-40"
                  />
                </label>
                <button onClick={runSettlement} className="px-3 py-2 rounded bg-indigo-600 text-white text-sm" disabled={busyAction !== ''}>
                  {busyAction === 'settlement' ? 'Calculating...' : 'Calculate Settlement'}
                </button>
                <button onClick={applyTaxes} className="px-3 py-2 rounded bg-amber-600 text-white text-sm" disabled={busyAction !== ''}>
                  {busyAction === 'taxes' ? 'Applying...' : 'Apply Tax Deductions'}
                </button>
                <button onClick={closeAccount} className="px-3 py-2 rounded bg-rose-700 text-white text-sm" disabled={busyAction !== ''}>
                  {busyAction === 'close' ? 'Closing...' : 'Close Trust Account'}
                </button>
              </div>
            </div>
          </ExpandableSection>

          <ExpandableSection title="Funds Allocation" subtitle="All values are derived from existing settlement calculations">
            <FundsAllocationPanel allocation={detail?.fundsAllocation || null} />
          </ExpandableSection>

          <ExpandableSection title="Trust Ledger" subtitle="Immutable transaction ledger with extended presentation fields">
            <div className="space-y-4">
              <TrustLedgerPanel rows={detail?.ledgerPresentation || []} />
              <BuyerLedgerTable
                rows={ledgerRows as any}
                buyerPayments={buyerPayments as any}
                buyerName={partyNames?.buyer || routeState.buyer || ''}
                sellerName={partyNames?.seller || routeState.seller || ''}
                purchasePrice={Number(propertySummary?.purchasePrice || grossProceeds || 0)}
              />
            </div>
          </ExpandableSection>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <ExpandableSection title="Seller Settlement" subtitle="Seller entitlement and transfer workflow">
              <div className="space-y-4">
                <SellerSettlementPanel settlement={settlement} ledgerRows={ledgerRows as any} />
                <SellerTransferPanel
                  settlement={settlement}
                  matter={trustMatter}
                  disabled={busyAction === 'seller-transfer'}
                  onTransfer={transferToSeller}
                />
              </div>
            </ExpandableSection>
            <ExpandableSection title="Tax Summary" subtitle="CGT, VAT, and VAT on commission from existing tax records">
              <TaxSummaryPanel summary={detail?.taxSummary || null} />
            </ExpandableSection>
          </div>

          <ExpandableSection title="Payment Allocation" subtitle={`Purchase price allocation, balance remaining: ${currency(Number(detail?.paymentAllocation?.balanceRemaining || 0))}`}>
            <PaymentAllocationPanel allocation={detail?.paymentAllocation || null} />
          </ExpandableSection>

          <ExpandableSection title="Supporting Documents" subtitle="Matter document checklist and references">
            <SupportingDocumentsPanel
              documents={trustMatter?.documents || []}
              onSave={saveDocuments}
              saving={busyAction === 'documents'}
            />
          </ExpandableSection>

          <ExpandableSection title="Audit Trail" subtitle="Human-readable events with technical details available">
            <AuditTrailViewer rows={auditRows as any} />
          </ExpandableSection>

          <ExpandableSection title="Reconciliation" subtitle="Custody-aware trust balancing summary">
            <TrustReconciliationPanel reconciliation={detail?.reconciliationPresentation || null} matter={trustMatter} />
          </ExpandableSection>

          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
            <h3 className="text-base font-semibold mb-3">Reports</h3>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => downloadReport('buyer-statement')} className="px-3 py-1.5 rounded border text-sm" disabled={busyAction !== ''}>Buyer PDF</button>
              <button onClick={() => downloadReport('seller-settlement')} className="px-3 py-1.5 rounded border text-sm" disabled={busyAction !== ''}>Seller PDF</button>
              <button onClick={() => downloadReport('trust-reconciliation')} className="px-3 py-1.5 rounded border text-sm" disabled={busyAction !== ''}>Reconciliation PDF</button>
              <button onClick={() => downloadReport('tax-zimra')} className="px-3 py-1.5 rounded border text-sm" disabled={busyAction !== ''}>Tax PDF</button>
              <button onClick={() => downloadReport('audit-log')} className="px-3 py-1.5 rounded border text-sm" disabled={busyAction !== ''}>Audit PDF</button>
            </div>
          </div>
        </section>
      )}
    </div>
  );
};

export default TrustAccountPropertyReportPage;
