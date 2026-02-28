const pending = new Map<string, NodeJS.Timeout>();
const debounceMs = Math.max(250, Number(process.env.DASHBOARD_KPI_REFRESH_DEBOUNCE_MS || 1200));

export function triggerDashboardKpiRefresh(companyId?: string | null): void {
  if (!companyId) return;
  const key = String(companyId);
  if (!key) return;

  const existing = pending.get(key);
  if (existing) clearTimeout(existing);

  const handle = setTimeout(async () => {
    pending.delete(key);
    try {
      const service = await import('./dashboardKpiService');
      await service.default.refreshCompanySnapshot(key);
    } catch (error) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn('[dashboard-kpi] refresh trigger failed', { companyId: key, error });
      }
    }
  }, debounceMs);

  pending.set(key, handle);
}

