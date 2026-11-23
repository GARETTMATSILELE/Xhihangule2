import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { getDemoIndividualSummary } from '../../../demo/demoData';
import { isDemoMode } from '../../../demo/demoMode';
import individualWorkspaceService, { IndividualSummary } from '../../../services/individualWorkspaceService';

const PERIODS = new Set(['this_month', 'previous_month', 'this_quarter', 'this_year', 'previous_year', 'year_to_date', 'custom']);

function isIsoDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export function useIndividualDashboard() {
  const [params] = useSearchParams();
  const period = PERIODS.has(params.get('period') || '') ? String(params.get('period')) : 'this_month';
  const start = params.get('start') || '';
  const end = params.get('end') || '';
  const ready = period !== 'custom' || (isIsoDate(start) && isIsoDate(end) && start <= end);
  const [data, setData] = useState<IndividualSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const hasData = useRef(false);

  const reload = useCallback(async () => {
    if (!ready) {
      setLoading(false);
      return;
    }
    try {
      setError(null);
      if (!hasData.current) setLoading(true);
      const next = isDemoMode()
        ? getDemoIndividualSummary()
        : await individualWorkspaceService.getDashboard({
          period,
          start: period === 'custom' ? start : undefined,
          end: period === 'custom' ? end : undefined,
          compare: true,
          series: true
        });
      hasData.current = true;
      setData(next);
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Failed to load individual dashboard');
    } finally {
      setLoading(false);
    }
  }, [end, period, ready, start]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { data, loading, error, reload };
}

export default useIndividualDashboard;
