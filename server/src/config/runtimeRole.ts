type RuntimeRole = 'api' | 'worker' | 'all';

const toBool = (value: string | undefined, fallback: boolean): boolean => {
  if (typeof value !== 'string') return fallback;
  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
};

const roleFromEnv = (): RuntimeRole => {
  const role = (process.env.APP_ROLE || 'api').trim().toLowerCase();
  if (role === 'worker' || role === 'all') return role;
  return 'api';
};

export interface RuntimeFeatures {
  role: RuntimeRole;
  runHttpServer: boolean;
  runSyncSchedules: boolean;
  runTrustBackground: boolean;
  runStartupMaintenance: boolean;
}

export const getRuntimeFeatures = (): RuntimeFeatures => {
  const role = roleFromEnv();
  const isWorker = role === 'worker' || role === 'all';
  const defaultBackgroundOn = process.env.NODE_ENV !== 'production' || isWorker;

  return {
    role,
    runHttpServer: role !== 'worker',
    runSyncSchedules: toBool(process.env.ENABLE_SYNC_SCHEDULES, defaultBackgroundOn),
    runTrustBackground: toBool(process.env.ENABLE_TRUST_BACKGROUND, defaultBackgroundOn),
    runStartupMaintenance: toBool(process.env.ENABLE_STARTUP_MAINTENANCE, isWorker)
  };
};
