/**
 * Production startup requirements. Returns variable names only, never values.
 */
export function productionStartupProblems(env: NodeJS.ProcessEnv = process.env): string[] {
  if (env.NODE_ENV !== 'production') return [];
  const missing: string[] = [];
  if (!env.JWT_SECRET || env.JWT_SECRET.trim().length < 32) missing.push('JWT_SECRET (min 32 chars)');
  if (!env.JWT_REFRESH_SECRET || env.JWT_REFRESH_SECRET.trim().length < 32) missing.push('JWT_REFRESH_SECRET (min 32 chars)');
  if (!String(env.MONGODB_URI || '').trim()) missing.push('MONGODB_URI');
  return missing;
}
