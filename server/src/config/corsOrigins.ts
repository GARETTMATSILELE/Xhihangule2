/**
 * Explicit origin allowlist. Never uses "*".
 * Development adds loopback + CRA proxy target because changeOrigin can rewrite Origin to the API host.
 */
export function normalizeOrigin(origin: string): string {
  return String(origin || '').trim().replace(/\/$/, '');
}

export function buildAllowedOrigins(env: NodeJS.ProcessEnv = process.env): string[] {
  const fromEnv = (env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((origin) => normalizeOrigin(origin))
    .filter(Boolean);
  const list = [
    normalizeOrigin(env.CLIENT_URL || 'http://localhost:3000'),
    'http://localhost:5173',
    'http://localhost:3000',
    'https://mantisafrica.com',
    'https://www.mantisafrica.com',
    ...fromEnv
  ];
  if (env.NODE_ENV !== 'production') {
    list.push(
      'http://127.0.0.1:3000',
      'http://127.0.0.1:5173',
      'http://localhost:5000',
      'http://127.0.0.1:5000'
    );
  }
  return Array.from(new Set(list.filter(Boolean)));
}

export function isOriginAllowed(origin: string | undefined, allowed: string[]): boolean {
  if (!origin) return true;
  return allowed.includes(normalizeOrigin(origin));
}
