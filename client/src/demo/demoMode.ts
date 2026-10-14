const DEMO_PREFIX = '/demo';

export const DEMO_BLOCKED_MESSAGE = 'Demo mode — this action is disabled.';

export function isDemoPath(pathname: string = typeof window !== 'undefined' ? window.location.pathname : ''): boolean {
  return pathname === DEMO_PREFIX || pathname.startsWith(`${DEMO_PREFIX}/`);
}

export function isDemoMode(): boolean {
  return isDemoPath();
}

export function isDemoAgencyPath(pathname: string = typeof window !== 'undefined' ? window.location.pathname : ''): boolean {
  return pathname.startsWith(`${DEMO_PREFIX}/enterprise`);
}

export function getWorkspaceBasePath(pathname: string = typeof window !== 'undefined' ? window.location.pathname : ''): string {
  return isDemoPath(pathname) ? DEMO_PREFIX : '/individual-dashboard';
}

export function workspacePath(path: string, pathname?: string): string {
  const base = getWorkspaceBasePath(pathname);
  if (base === '/individual-dashboard') return path;
  return path.replace('/individual-dashboard', base);
}

export function notifyDemoBlocked(message: string = DEMO_BLOCKED_MESSAGE) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('mantis:demo-blocked', { detail: { message } }));
}
