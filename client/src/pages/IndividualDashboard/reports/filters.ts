import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ReportQuery } from '../../../services/individualWorkspaceService';

export const PERIOD_OPTIONS = [
  { value: 'this_month', label: 'This Month' },
  { value: 'previous_month', label: 'Previous Month' },
  { value: 'this_quarter', label: 'This Quarter' },
  { value: 'this_year', label: 'This Year' },
  { value: 'previous_year', label: 'Previous Year' },
  { value: 'year_to_date', label: 'Year to Date' },
  { value: 'custom', label: 'Custom Date Range' }
] as const;

export type ReportPeriod = typeof PERIOD_OPTIONS[number]['value'];

const PERIODS = new Set<string>(PERIOD_OPTIONS.map((option) => option.value));

export function isIsoDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export function useReportFilters() {
  const [params, setParams] = useSearchParams();
  const period = (PERIODS.has(params.get('period') || '') ? params.get('period') : 'this_month') as ReportPeriod;
  const propertyId = params.get('property') || '';
  const start = params.get('start') || '';
  const end = params.get('end') || '';
  const section = params.get('section') || 'all';

  const setFilter = (patch: Partial<{ period: string; propertyId: string; start: string; end: string; section: string }>) => {
    const next = new URLSearchParams(params);
    const write = (key: string, value?: string) => {
      if (!value) next.delete(key);
      else next.set(key, value);
    };
    if ('period' in patch) write('period', patch.period);
    if ('propertyId' in patch) write('property', patch.propertyId);
    if ('start' in patch) write('start', patch.start);
    if ('end' in patch) write('end', patch.end);
    if ('section' in patch) write('section', patch.section && patch.section !== 'all' ? patch.section : '');
    setParams(next, { replace: true });
  };

  const ready = period !== 'custom' || (isIsoDate(start) && isIsoDate(end) && start <= end);
  const query = useMemo<ReportQuery>(() => ({
    period,
    start: period === 'custom' ? start : undefined,
    end: period === 'custom' ? end : undefined,
    propertyId: propertyId || undefined,
    timeZone: 'account',
    compare: true,
    series: true
  }), [end, period, propertyId, start]);

  return { period, propertyId, start, end, section, setFilter, query, ready, search: params.toString() };
}
