import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Box, Skeleton, Stack, Typography } from '@mui/material';
import { ArrowBack, Print } from '@mui/icons-material';
import { useNavigate, useParams } from 'react-router-dom';
import api from '../../../api/axios';
import individualWorkspaceService, { IndividualSummary } from '../../../services/individualWorkspaceService';
import { workspacePath } from '../../../demo/demoMode';
import { reportByKey } from './catalog';
import { downloadApiFile, downloadIndividualReport } from './downloadReport';
import { useReportFilters } from './filters';
import { buildReportCharts, formatReportDate, formatReportMoney, presentRows } from './presentReport';
import { OverviewCard, OverviewSkeleton, QuietButton, REPORT_FONT, ReportFilters, useReportPrintStyle } from './reportChrome';
import { ReportChart, ReportDataTable } from './ReportTable';

function friendlyError(error: any) {
  const message = error?.response?.data?.message;
  if (typeof message === 'string' && message.length < 180 && !/stack|exception/i.test(message)) return message;
  return 'This report could not be loaded. Please try again.';
}

function readableStatus(value: unknown) {
  if (value == null || value === '') return null;
  const text = String(value).replace(/_/g, ' ').toLowerCase();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function taxValue(value: unknown, currency: string) {
  if (value == null || value === '') return 'Not calculated';
  const amount = Number(value);
  if (Number.isNaN(amount)) return readableStatus(value) || 'Not calculated';
  return formatReportMoney(amount, currency);
}

export function ReportViewerPage() {
  const { reportKey = '' } = useParams();
  const report = reportByKey(reportKey);
  const navigate = useNavigate();
  const filters = useReportFilters();
  const [accounting, setAccounting] = useState<IndividualSummary | null>(null);
  const [payload, setPayload] = useState<any>(null);
  const [tax, setTax] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState<string | null>(null);
  useReportPrintStyle();

  const load = () => {
    if (!report) return undefined;
    if (!filters.ready) {
      setLoading(false);
      return undefined;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    const accountingCall = individualWorkspaceService.getAccounting(filters.query);
    const reportCall = report.source === 'report' && report.reportType
      ? individualWorkspaceService.getReport(report.reportType, {
        ...filters.query,
        reportKey: report.key,
        category: report.categoryFilter,
        compare: false
      })
      : Promise.resolve(null);
    Promise.all([accountingCall, reportCall])
      .then(async ([nextAccounting, nextReport]) => {
        if (cancelled) return;
        setAccounting(nextAccounting);
        setPayload(nextReport);
        if (report.source !== 'tax') {
          setTax(null);
          return;
        }
        const scope = nextAccounting.period?.taxScope;
        if (!scope || scope.kind === 'unsupported') {
          setTax({ scope });
          return;
        }
        if (scope.kind === 'year' && scope.year) {
          const [rental, income] = await Promise.all([
            individualWorkspaceService.getRentalTaxAnnual(scope.year).catch((err) => ({ error: friendlyError(err) })),
            individualWorkspaceService.getIncomeTaxAnnual(scope.year).catch((err) => ({ error: friendlyError(err) }))
          ]);
          if (!cancelled) setTax({ scope, rental, income });
          return;
        }
        const monthKey = scope.monthKey || undefined;
        const [rentalOverview, incomeOverview, vatOverview, rentalPaper, incomePaper] = await Promise.all([
          individualWorkspaceService.getRentalTaxOverview(monthKey).catch((err) => ({ error: friendlyError(err) })),
          individualWorkspaceService.getIncomeTaxOverview(monthKey).catch((err) => ({ error: friendlyError(err) })),
          individualWorkspaceService.getVatOverview(monthKey).catch((err) => ({ error: friendlyError(err) })),
          individualWorkspaceService.getRentalTaxWorkingPaper(monthKey).catch((err) => ({ error: friendlyError(err) })),
          individualWorkspaceService.getIncomeTaxWorkingPaper(monthKey).catch((err) => ({ error: friendlyError(err) }))
        ]);
        if (!cancelled) setTax({ scope, rentalOverview, incomeOverview, vatOverview, rentalPaper, incomePaper });
      })
      .catch((err) => { if (!cancelled) setError(friendlyError(err)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  };

  useEffect(() => {
    return load();
  }, [reportKey, filters.ready, filters.query.period, filters.query.start, filters.query.end, filters.query.propertyId]);

  const currency = payload?.currency || accounting?.account?.currency || 'USD';
  const presented = useMemo(() => presentRows(payload?.rows || []), [payload]);
  const charts = useMemo(() => buildReportCharts(reportKey, payload?.rows || [], payload?.series || accounting?.periodSeries), [accounting, payload, reportKey]);
  const propertyName = filters.propertyId
    ? (accounting?.propertyChoices || accounting?.properties || []).find((property) => property.propertyId === filters.propertyId)?.propertyName || payload?.propertyName || 'Selected property'
    : 'All properties';

  const back = () => navigate(`${workspacePath('/individual-dashboard/reports')}${filters.search ? `?${filters.search}` : ''}`);

  const runExport = async (format: 'pdf' | 'excel' | 'csv') => {
    if (!report?.reportType) return;
    setExporting(format);
    setError(null);
    try {
      await downloadIndividualReport(report.reportType, format, { ...filters.query, reportKey: report.key, category: report.categoryFilter, compare: false, series: false });
    } catch (err: any) {
      setError(err?.message || 'The export could not be prepared.');
    } finally {
      setExporting(null);
    }
  };

  const runTaxExport = async (which: 'rental' | 'income' | 'vat', format: 'pdf' | 'csv' | 'xlsx') => {
    const monthKey = accounting?.period?.taxScope?.monthKey || undefined;
    if (!monthKey) return;
    const url = which === 'rental'
      ? individualWorkspaceService.getRentalTaxWorkingPaperUrl(format, monthKey)
      : which === 'income'
        ? individualWorkspaceService.getIncomeTaxWorkingPaperUrl(format, monthKey)
        : individualWorkspaceService.getVatWorkingPaperUrl(format, monthKey);
    setExporting(`${which}-${format}`);
    try {
      await downloadApiFile(url, `${which}-tax-${monthKey}.${format === 'xlsx' ? 'xlsx' : format}`);
    } catch (err: any) {
      setError(err?.message || 'The export could not be prepared.');
    } finally {
      setExporting(null);
    }
  };

  if (!report) {
    return (
      <Box sx={{ fontFamily: REPORT_FONT }}>
        <Alert severity="warning" action={<QuietButton onClick={back}>Back to reports</QuietButton>}>This report is not available.</Alert>
      </Box>
    );
  }

  return (
    <Box className="report-print" sx={{ fontFamily: REPORT_FONT, color: '#1c2430' }}>
      <Stack spacing={2.5}>
        <QuietButton className="no-print" startIcon={<ArrowBack />} onClick={back} sx={{ alignSelf: 'flex-start' }}>Back to reports</QuietButton>
        <Stack direction={{ xs: 'column', lg: 'row' }} spacing={2} justifyContent="space-between" alignItems={{ lg: 'flex-end' }}>
          <Box>
            <Typography sx={{ fontSize: { xs: '1.6rem', md: '2rem' }, fontWeight: 650, letterSpacing: -0.4 }}>{report.title}</Typography>
            <Typography sx={{ mt: 0.75, color: '#5c6b73', maxWidth: 640 }}>{report.description}</Typography>
            <Typography sx={{ mt: 1, color: '#1c2430', fontSize: 14 }}>
              {accounting?.period?.label || 'Reporting period'} · {propertyName}
              {currency ? ` · ${currency}` : ''} · Generated {formatReportDate(payload?.generatedAt || new Date().toISOString())}
            </Typography>
          </Box>
          <Stack className="no-print" direction="row" useFlexGap flexWrap="wrap" spacing={1}>
            {report.source === 'report' && (
              <>
                <QuietButton disabled={Boolean(exporting)} onClick={() => runExport('pdf')}>{exporting === 'pdf' ? 'Preparing…' : 'Download PDF'}</QuietButton>
                <QuietButton disabled={Boolean(exporting)} onClick={() => runExport('excel')}>{exporting === 'excel' ? 'Preparing…' : 'Export Excel'}</QuietButton>
                <QuietButton disabled={Boolean(exporting)} onClick={() => runExport('csv')}>{exporting === 'csv' ? 'Preparing…' : 'Export CSV'}</QuietButton>
              </>
            )}
            <QuietButton startIcon={<Print />} onClick={() => window.print()}>Print</QuietButton>
          </Stack>
        </Stack>

        <ReportFilters
          period={filters.period}
          propertyId={filters.propertyId}
          start={filters.start}
          end={filters.end}
          properties={accounting?.propertyChoices || (accounting?.properties || []).map((property) => ({ propertyId: property.propertyId, propertyName: property.propertyName }))}
          onChange={filters.setFilter}
        />

        {!filters.ready && <Alert severity="info">Choose a start date and an end date.</Alert>}
        {error && <Alert severity="error" action={<QuietButton onClick={() => load()}>Retry</QuietButton>}>{error}</Alert>}
        {(report.note || payload?.note) && <Alert severity="info">{payload?.note || report.note}</Alert>}
        {payload?.currencyNotice && <Alert severity="info">{payload.currencyNotice}</Alert>}

        {loading && (
          <Stack spacing={2}>
            <OverviewSkeleton />
            <Skeleton variant="rounded" height={320} />
          </Stack>
        )}

        {!loading && report.source === 'report' && (
          <>
            {presented.totals.length > 0 && (
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', lg: 'repeat(3, 1fr)' }, gap: 2 }}>
                {presented.totals.flatMap((group) => Object.entries(group.values).slice(0, 3).map(([key, value]) => (
                  <OverviewCard
                    key={`${group.currency}-${key}`}
                    label={presented.columns.find((column) => column.key === key)?.label || key}
                    value={formatReportMoney(value, group.currency)}
                    currency={group.currency}
                  />
                )))}
              </Box>
            )}
            {charts.map((chart) => <ReportChart key={chart.title} {...chart} />)}
            {presented.rows.length === 0 ? (
              <Box sx={{ bgcolor: '#fff', border: '1px solid #e6ebe8', borderRadius: 2, p: 4 }}>
                <Typography sx={{ fontWeight: 650 }}>{report.emptyMessage}</Typography>
                <Typography sx={{ mt: 1, color: '#5c6b73' }}>Try another reporting period or property.</Typography>
              </Box>
            ) : (
              <ReportDataTable
                columns={presented.columns}
                rows={presented.rows}
                currency={currency}
                totals={presented.totals.length === 1 ? presented.totals[0].values : undefined}
              />
            )}
          </>
        )}

        {!loading && report.source === 'leases' && (
          <LeaseView propertyId={filters.propertyId} currency={currency} choices={accounting?.propertyChoices} />
        )}

        {!loading && report.source === 'tax' && (
          <TaxView
            reportKey={report.key}
            tax={tax}
            currency={currency}
            propertyId={filters.propertyId}
            propertyName={propertyName}
            exporting={exporting}
            onExport={runTaxExport}
          />
        )}
      </Stack>
    </Box>
  );
}

function unwrapList(raw: any): any[] {
  if (Array.isArray(raw)) return raw;
  if (Array.isArray(raw?.data)) return raw.data;
  if (Array.isArray(raw?.leases)) return raw.leases;
  if (Array.isArray(raw?.tenants)) return raw.tenants;
  if (Array.isArray(raw?.data?.tenants)) return raw.data.tenants;
  return [];
}

function LeaseView({ propertyId, currency, choices }: { propertyId: string; currency: string; choices?: Array<{ propertyId: string; propertyName: string }> }) {
  const [rows, setRows] = useState<any[]>([]);
  const [loadingRows, setLoadingRows] = useState(true);
  const [leaseError, setLeaseError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoadingRows(true);
    Promise.all([
      api.get('/leases').catch(() => ({ data: [] })),
      api.get('/tenants', { params: { page: 1, limit: 10000 } }).catch(() => ({ data: [] }))
    ]).then(([leaseRes, tenantRes]) => {
      if (cancelled) return;
      const tenants = unwrapList(tenantRes.data);
      const leases = unwrapList(leaseRes.data).filter((lease: any) => {
        const id = String(lease.propertyId?._id || lease.propertyId || '');
        return !propertyId || id === propertyId;
      }).map((lease: any) => {
        const id = String(lease.propertyId?._id || lease.propertyId || '');
        const tenantId = String(lease.tenantId?._id || lease.tenantId || '');
        const tenant = tenants.find((item: any) => String(item._id) === tenantId);
        return {
          property: lease.propertyId?.name || (choices || []).find((item) => item.propertyId === id)?.propertyName || 'Property',
          tenant: [tenant?.firstName, tenant?.lastName].filter(Boolean).join(' ') || lease.tenantId?.name || 'Tenant',
          status: readableStatus(lease.status) || '—',
          start: formatReportDate(lease.startDate),
          end: formatReportDate(lease.endDate),
          rent: lease.rentAmount ?? lease.rent ?? null,
          currency: lease.currency || currency
        };
      });
      setRows(leases);
    }).catch(() => {
      if (!cancelled) setLeaseError('Leases could not be loaded. Please try again.');
    }).finally(() => { if (!cancelled) setLoadingRows(false); });
    return () => { cancelled = true; };
  }, [currency, propertyId, choices]);

  if (loadingRows) return <Skeleton variant="rounded" height={240} />;
  if (leaseError) return <Alert severity="error">{leaseError}</Alert>;
  const presented = presentRows(rows.map((row) => ({
    property: row.property,
    tenant: row.tenant,
    status: row.status,
    start: row.start,
    end: row.end,
    rent: row.rent,
    currency: row.currency || currency
  })));
  return (
    <Stack spacing={2}>
      <Alert severity="info">A lease file export is not provided by the reporting service. You can print this summary.</Alert>
      {presented.rows.length === 0 ? (
        <Box sx={{ bgcolor: '#fff', border: '1px solid #e6ebe8', borderRadius: 2, p: 4 }}>
          <Typography sx={{ fontWeight: 650 }}>No leases found for this selection.</Typography>
        </Box>
      ) : (
        <ReportDataTable columns={presented.columns} rows={presented.rows} currency={currency} />
      )}
    </Stack>
  );
}

function TaxView({ reportKey, tax, currency, propertyId, propertyName, exporting, onExport }: {
  reportKey: string;
  tax: any;
  currency: string;
  propertyId: string;
  propertyName: string;
  exporting: string | null;
  onExport: (which: 'rental' | 'income' | 'vat', format: 'pdf' | 'csv' | 'xlsx') => void;
}) {
  if (!tax?.scope || tax.scope.kind === 'unsupported') {
    return <Alert severity="info">{tax?.scope?.message || 'Tax working papers are prepared by calendar month or full year.'}</Alert>;
  }
  const month = tax.scope.kind === 'month';
  const propertyScoped = Boolean(propertyId);
  const rentalProperty = propertyScoped
    ? (tax.rentalPaper?.properties || tax.rental?.properties || []).find((row: any) => String(row.propertyId) === propertyId)
    : null;
  const payments = [
    ...((tax.rentalPaper?.payments || []).map((row: any) => ({ ...row, tax: 'Rental tax' }))),
    ...((tax.incomePaper?.payments || []).map((row: any) => ({ ...row, tax: 'Income tax' })))
  ].filter((row) => !propertyScoped || String(row.propertyId || '') === propertyId);
  const annualSchedule = !month && Array.isArray(tax.rental?.properties)
    ? presentRows((tax.rental.properties as any[]).filter((row) => !propertyScoped || String(row.propertyId) === propertyId).map((row) => ({
      property: row.propertyName || 'Property',
      currency: row.currency || currency,
      grossRentalReceipts: row.grossRentalReceipts,
      rentalTaxBase: row.rentalTaxBase,
      calculatedRentalTax: row.calculatedRentalTax,
      taxPayments: row.taxPayments,
      balance: row.balance
    })))
    : null;
  const hiddenPortfolioPayments = propertyScoped
    ? [...(tax.rentalPaper?.payments || []), ...(tax.incomePaper?.payments || [])].filter((row) => !row.propertyId).length
    : 0;

  return (
    <Stack spacing={2}>
      {tax.rentalPaper?.disclaimer && <Alert severity="info">{tax.rentalPaper.disclaimer}</Alert>}
      {!tax.rentalPaper?.disclaimer && tax.incomeOverview?.disclaimer && <Alert severity="info">{tax.incomeOverview.disclaimer}</Alert>}
      {propertyScoped && <Alert severity="info">Income tax and VAT working papers are prepared for the portfolio. While {propertyName} is selected, only rental tax calculated for that property is shown.</Alert>}
      {month && (
        <Stack className="no-print" direction="row" useFlexGap flexWrap="wrap" spacing={1}>
          <QuietButton disabled={Boolean(exporting)} onClick={() => onExport('rental', 'pdf')}>{exporting === 'rental-pdf' ? 'Preparing…' : 'Rental tax PDF'}</QuietButton>
          <QuietButton disabled={Boolean(exporting)} onClick={() => onExport('rental', 'xlsx')}>Rental tax Excel</QuietButton>
          <QuietButton disabled={Boolean(exporting)} onClick={() => onExport('income', 'pdf')}>Income tax PDF</QuietButton>
          <QuietButton disabled={Boolean(exporting)} onClick={() => onExport('vat', 'pdf')}>VAT PDF</QuietButton>
        </Stack>
      )}
      {!month && <Alert severity="info">The annual schedule does not have a separate download. Choose a single month to export that working paper. VAT is prepared monthly.</Alert>}

      {reportKey !== 'tax-payment-history' && (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2 }}>
          <TaxCard title="Rental tax" error={tax.rentalOverview?.error || tax.rental?.error || tax.rentalPaper?.error}>
            {propertyScoped && !rentalProperty && <Typography color="text.secondary">No rental tax has been calculated for this property in the selected period.</Typography>}
            {(!propertyScoped || rentalProperty) && (
              <Stack spacing={0.75}>
                <Line label="Regime" value={readableStatus(tax.rentalOverview?.rentalTaxRegime || tax.rentalPaper?.rentalTaxRegime) || '—'} />
                <Line label="Calculated rental tax" value={month ? taxValue(propertyScoped ? rentalProperty?.calculatedRentalTax : (tax.rentalOverview?.calculatedRentalTax ?? tax.rentalPaper?.calculatedRentalTax), currency) : 'See the annual schedule'} />
                {reportKey === 'tax-summary' && <Line label="Rental tax base" value={taxValue(propertyScoped ? rentalProperty?.rentalTaxBase : tax.rentalPaper?.rentalTaxBase, currency)} />}
                <Line label="Recorded payments" value={taxValue(propertyScoped ? rentalProperty?.taxPayments : (tax.rentalOverview?.taxPayments ?? tax.rentalPaper?.taxPayments), currency)} />
                {!propertyScoped && <Line label="Calculated balance" value={taxValue(tax.rentalOverview?.calculatedBalance ?? tax.rentalPaper?.calculatedBalance, currency)} />}
              </Stack>
            )}
          </TaxCard>
          {!propertyScoped && (
            <TaxCard title="Income tax" error={tax.incomeOverview?.error || tax.income?.error}>
              <Stack spacing={0.75}>
                <Line label="Status" value={readableStatus(tax.incomeOverview?.calculationStatus) || '—'} />
                <Line label="Taxable income" value={taxValue(tax.incomeOverview?.taxableIncome ?? tax.income?.taxableIncome, currency)} />
                <Line label="Calculated income tax" value={taxValue(tax.incomeOverview?.calculatedIncomeTax ?? tax.income?.calculatedIncomeTax, currency)} />
                <Line label="Recorded payments" value={taxValue(tax.incomeOverview?.taxPayments ?? tax.income?.taxPayments, currency)} />
                {tax.income?.incompleteMonths?.length ? <Line label="Incomplete months" value={tax.income.incompleteMonths.join(', ')} /> : null}
              </Stack>
            </TaxCard>
          )}
          {!propertyScoped && month && (
            <TaxCard title="VAT" error={tax.vatOverview?.error}>
              <Stack spacing={0.75}>
                <Line label="Registration" value={readableStatus(tax.vatOverview?.vatRegistered || tax.vatOverview?.vatRegistrationStatus) || '—'} />
                <Line label="Output VAT" value={taxValue(tax.vatOverview?.outputVat, currency)} />
                <Line label="Input VAT" value={taxValue(tax.vatOverview?.inputVat, currency)} />
                <Line label="Net VAT position" value={taxValue(tax.vatOverview?.netVatPosition, currency)} />
              </Stack>
            </TaxCard>
          )}
        </Box>
      )}

      {annualSchedule && reportKey !== 'tax-payment-history' && annualSchedule.rows.length > 0 && (
        <ReportDataTable columns={annualSchedule.columns} rows={annualSchedule.rows} currency={currency} />
      )}

      {reportKey === 'tax-payment-history' && (
        <Stack spacing={1.5}>
          {month ? null : <Alert severity="info">Payment lines are stored on the monthly working paper. The annual view shows payment totals only.</Alert>}
          {hiddenPortfolioPayments > 0 && <Alert severity="info">Some tax payments are recorded for the portfolio and stay hidden while one property is selected.</Alert>}
          {payments.length === 0 && <Box sx={{ bgcolor: '#fff', border: '1px solid #e6ebe8', borderRadius: 2, p: 4 }}><Typography sx={{ fontWeight: 650 }}>No tax payments recorded for this reporting period.</Typography></Box>}
          {payments.map((payment: any) => (
            <Box key={payment.id || `${payment.tax}-${payment.paymentDate}-${payment.amount}`} sx={{ bgcolor: '#fff', border: '1px solid #e6ebe8', borderRadius: 2, p: 2 }}>
              <Typography sx={{ fontWeight: 650 }}>{payment.tax} · {formatReportMoney(Number(payment.amount || 0), payment.currency || currency)}</Typography>
              <Typography sx={{ color: '#5c6b73', fontSize: 14 }}>{formatReportDate(payment.paymentDate)} · Ref {payment.paymentReference || '—'} · Authority ref {payment.zimraReference || 'Not confirmed'}</Typography>
            </Box>
          ))}
          <Typography sx={{ color: '#5c6b73', fontSize: 13 }}>These are payments recorded in Mantis. They are not confirmation that the tax authority accepted them.</Typography>
        </Stack>
      )}
    </Stack>
  );
}

function TaxCard({ title, error, children }: { title: string; error?: string; children: React.ReactNode }) {
  return (
    <Box sx={{ bgcolor: '#fff', border: '1px solid #e6ebe8', borderRadius: 2, p: 2.25 }}>
      <Typography sx={{ fontWeight: 650, mb: 1.25 }}>{title}</Typography>
      {error ? <Typography color="error">{error}</Typography> : children}
    </Box>
  );
}

function Line({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <Stack direction="row" justifyContent="space-between" spacing={2}>
      <Typography sx={{ color: '#5c6b73', fontSize: 14 }}>{label}</Typography>
      <Typography sx={{ fontSize: 14, fontWeight: 600, textAlign: 'right' }}>{value}</Typography>
    </Stack>
  );
}

export default ReportViewerPage;
