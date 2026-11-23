import React, { useEffect, useState } from 'react';
import { Alert, Box, Menu, MenuItem, Stack, Typography } from '@mui/material';
import { FileDownload } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import individualWorkspaceService, { IndividualSummary } from '../../../services/individualWorkspaceService';
import { isDemoMode, workspacePath } from '../../../demo/demoMode';
import { TAX_CENTRE_LINKS } from '../constants';
import { TAX_DISCLAIMER } from '../tax/types';
import { REPORT_CATALOG, REPORT_SECTIONS } from './catalog';
import { downloadIndividualReport } from './downloadReport';
import { useReportFilters } from './filters';
import { formatReportMoney } from './presentReport';
import { CardsSkeleton, OverviewCard, OverviewSkeleton, QuietButton, REPORT_FONT, ReportCardLink, ReportFilters, useReportPrintStyle } from './reportChrome';

function TaxEstimatePanel() {
  const navigate = useNavigate();
  const demo = isDemoMode();
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      setResult(await individualWorkspaceService.getTaxEstimate());
    } catch (err: any) {
      setError(err?.message || 'The tax estimate could not be loaded.');
    } finally {
      setLoading(false);
    }
  };

  const blocks = result?.combined ? [{ propertyName: 'Selected records', ...result.combined }] : (result?.properties || []);

  return (
    <Box sx={{ p: 2, border: '1px solid #d7e3df', borderRadius: 2 }}>
      <Stack spacing={1.5}>
        <Typography sx={{ fontWeight: 700 }}>Tax summaries</Typography>
        <Alert severity="info">{result?.disclaimer || TAX_DISCLAIMER} These figures are estimates. Mantis does not submit returns or make tax payments.</Alert>
        {demo ? (
          <Typography sx={{ color: '#5c6b73', fontSize: 13 }}>The sample workspace does not calculate tax. A live account can refresh an estimate from its own records.</Typography>
        ) : (
          <QuietButton onClick={refresh} disabled={loading}>{loading ? 'Calculating…' : 'Refresh tax estimate'}</QuietButton>
        )}
        {error && <Alert severity="error">{error}</Alert>}
        {result?.portfolioSeparated && (
          <Alert severity="warning">These properties use different currencies or tax profiles, so the estimates stay separate and are not added together.</Alert>
        )}
        {blocks.map((block: any) => (
          <Box key={block.propertyId || block.propertyName}>
            <Typography sx={{ fontWeight: 650 }}>{block.propertyName} · {block.currency} · {block.taxJurisdiction}</Typography>
            {(block.lines || []).map((line: any) => (
              <Typography key={`${block.propertyId}-${line.code}`} sx={{ fontSize: 14, color: '#334047' }}>
                {line.name}: {line.amount == null ? String(line.status || 'estimate').replace(/_/g, ' ').toLowerCase() : `${line.currency} ${Number(line.amount).toLocaleString()}`}
                {line.verified === false ? ' · estimate' : ''}
              </Typography>
            ))}
          </Box>
        ))}
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
          {TAX_CENTRE_LINKS.map(([path, label]) => (
            <QuietButton key={path} onClick={() => navigate(workspacePath(`/individual-dashboard/${path}`))}>{label}</QuietButton>
          ))}
        </Stack>
      </Stack>
    </Box>
  );
}

function friendlyError(error: any) {
  const message = error?.response?.data?.message;
  if (typeof message === 'string' && message.length < 180 && !message.includes('Error:')) return message;
  return 'Reports could not be loaded. Please try again.';
}

export function ReportsHome() {
  const navigate = useNavigate();
  const filters = useReportFilters();
  const [data, setData] = useState<IndividualSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [menu, setMenu] = useState<null | HTMLElement>(null);
  useReportPrintStyle();

  const load = () => {
    if (!filters.ready) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    individualWorkspaceService.getAccounting(filters.query)
      .then((next) => { if (!cancelled) setData(next); })
      .catch((err) => { if (!cancelled) setError(friendlyError(err)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  };

  useEffect(() => {
    const cancel = load();
    return cancel;
  }, [filters.ready, filters.query.period, filters.query.start, filters.query.end, filters.query.propertyId]);

  const openReport = (key: string) => {
    const params = new URLSearchParams(filters.search);
    navigate(`${workspacePath('/individual-dashboard/reports')}/${key}${params.toString() ? `?${params}` : ''}`);
  };

  const exportPnl = async (format: 'pdf' | 'excel' | 'csv') => {
    setMenu(null);
    setExporting(true);
    try {
      await downloadIndividualReport('profit-loss', format, { ...filters.query, reportKey: 'profit-loss', compare: false, series: false });
    } catch (err: any) {
      setError(err?.message || 'The export could not be prepared.');
    } finally {
      setExporting(false);
    }
  };

  const currency = data?.account?.currency || 'USD';
  const split = (data?.currencyTotals?.length || 0) > 1;
  const bills = data?.unpaidBills || [];
  const billCaption = bills.length
    ? bills.map((bill) => `Unpaid bills ${formatReportMoney(bill.amount, bill.currency)}`).join(' · ')
    : 'No unpaid bills recorded';
  const sections = REPORT_SECTIONS.filter((section) => filters.section === 'all' || filters.section === section);

  return (
    <Box sx={{ fontFamily: REPORT_FONT, color: '#1c2430' }}>
      <Stack spacing={3}>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} justifyContent="space-between" alignItems={{ md: 'flex-end' }}>
          <Box>
            <Typography sx={{ fontSize: { xs: '1.7rem', md: '2rem' }, fontWeight: 650, letterSpacing: -0.5, lineHeight: 1.15 }}>Reports & Insights</Typography>
            <Typography sx={{ mt: 0.75, color: '#5c6b73' }}>Understand your property portfolio&apos;s financial performance.</Typography>
          </Box>
          <QuietButton className="no-print" startIcon={<FileDownload />} disabled={exporting || !filters.ready} aria-busy={exporting} onClick={(event) => setMenu(event.currentTarget)}>
            {exporting ? 'Preparing export…' : 'Export'}
          </QuietButton>
          <Menu anchorEl={menu} open={Boolean(menu)} onClose={() => setMenu(null)}>
            <MenuItem onClick={() => exportPnl('pdf')}>Profit & Loss PDF</MenuItem>
            <MenuItem onClick={() => exportPnl('excel')}>Profit & Loss Excel</MenuItem>
            <MenuItem onClick={() => exportPnl('csv')}>Profit & Loss CSV</MenuItem>
          </Menu>
        </Stack>

        <ReportFilters
          period={filters.period}
          propertyId={filters.propertyId}
          start={filters.start}
          end={filters.end}
          section={filters.section}
          properties={data?.propertyChoices?.length ? data.propertyChoices : (data?.properties || []).map((property) => ({ propertyId: property.propertyId, propertyName: property.propertyName }))}
          onChange={filters.setFilter}
        />

        {!filters.ready && <Alert severity="info">Choose a start date and an end date to update these figures.</Alert>}
        {isDemoMode() && <Typography sx={{ color: '#5c6b73', fontSize: 13 }}>Sample workspace figures illustrate the layout. They do not recalculate when the period changes, and file exports are turned off.</Typography>}
        <TaxEstimatePanel />
        {error && (
          <Alert severity="error" action={<QuietButton onClick={load}>Retry</QuietButton>}>{error}</Alert>
        )}
        {filters.ready && loading && (
          <>
            <OverviewSkeleton />
            <CardsSkeleton />
          </>
        )}
        {filters.ready && !loading && !error && data && (
          <>
            {split ? (
              <Stack spacing={2}>
                {data.currencyTotals!.map((bucket) => (
                  <Box key={bucket.currency} sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', lg: '1fr 1fr 1fr' }, gap: 2 }}>
                    <OverviewCard label="Total income" value={formatReportMoney(bucket.income, bucket.currency)} currency={bucket.currency} />
                    <OverviewCard label="Total expenses" value={formatReportMoney(bucket.expenses, bucket.currency)} currency={bucket.currency} />
                    <OverviewCard label="Net operating income" value={formatReportMoney(bucket.net, bucket.currency)} currency={bucket.currency} />
                  </Box>
                ))}
                <OverviewCard
                  label="Outstanding payments"
                  value={data.outstandingRentReliable === false ? 'Not combined' : formatReportMoney(data.summary.outstandingRent, currency)}
                  currency={data.outstandingRentReliable === false ? undefined : currency}
                  caption={data.outstandingRentReliable === false ? `${data.currencyNotice || 'Outstanding rent uses more than one currency.'} ${billCaption}` : billCaption}
                />
              </Stack>
            ) : (
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', lg: 'repeat(4, 1fr)' }, gap: 2 }}>
                <OverviewCard label="Total income" value={formatReportMoney(data.summary.monthlyIncome, currency)} currency={currency} current={data.summary.monthlyIncome} previous={data.comparison?.monthlyIncome} previousLabel={data.comparison?.label} />
                <OverviewCard label="Total expenses" value={formatReportMoney(data.summary.monthlyExpenses, currency)} currency={currency} current={data.summary.monthlyExpenses} previous={data.comparison?.monthlyExpenses} previousLabel={data.comparison?.label} higherIsWorse />
                <OverviewCard label="Net operating income" value={formatReportMoney(data.summary.netProfit, currency)} currency={currency} current={data.summary.netProfit} previous={data.comparison?.netProfit} previousLabel={data.comparison?.label} />
                <OverviewCard
                  label="Outstanding payments"
                  value={data.outstandingRentReliable === false ? 'Not combined' : formatReportMoney(data.summary.outstandingRent, currency)}
                  currency={data.outstandingRentReliable === false ? undefined : currency}
                  caption={data.outstandingRentReliable === false ? data.currencyNotice || 'Outstanding rent uses more than one currency.' : `Outstanding rent · ${billCaption}`}
                  current={data.outstandingRentReliable === false ? undefined : data.summary.outstandingRent}
                  previous={data.outstandingRentReliable === false ? undefined : data.comparison?.outstandingRent}
                  previousLabel={data.comparison?.label}
                  higherIsWorse
                />
              </Box>
            )}
            {data.currencyNotice && !split && data.outstandingRentReliable !== false && (
              <Typography sx={{ color: '#5c6b73', fontSize: 13 }}>{data.currencyNotice}</Typography>
            )}
            {data.period?.label && (
              <Typography sx={{ color: '#8aa39a', fontSize: 12 }}>{data.period.label}{filters.propertyId ? ` · ${data.properties[0]?.propertyName || 'Selected property'}` : ' · All properties'}</Typography>
            )}
            {sections.map((section) => {
              const reports = REPORT_CATALOG.filter((report) => report.category === section);
              return (
                <Box key={section}>
                  <Typography sx={{ mb: 1.5, color: '#084734', fontSize: 13, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase' }}>{section}</Typography>
                  <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', lg: '1fr 1fr 1fr' }, gap: 2, alignItems: 'stretch' }}>
                    {reports.map((report) => (
                      <ReportCardLink key={report.key} report={report} onOpen={() => openReport(report.key)} />
                    ))}
                  </Box>
                </Box>
              );
            })}
          </>
        )}
      </Stack>
    </Box>
  );
}

export default ReportsHome;
