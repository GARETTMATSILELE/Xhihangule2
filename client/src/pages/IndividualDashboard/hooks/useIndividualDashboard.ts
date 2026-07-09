import { useCallback, useEffect, useState } from 'react';
import individualWorkspaceService, { IndividualSummary } from '../../../services/individualWorkspaceService';

export function useIndividualDashboard() {
  const [data, setData] = useState<IndividualSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      setData(await individualWorkspaceService.getDashboard());
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Failed to load individual dashboard');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  return { data, loading, error, reload };
}

export default useIndividualDashboard;
