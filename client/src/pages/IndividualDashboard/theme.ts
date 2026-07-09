export const INDIVIDUAL_THEME = {
  primary: '#084734',
  primaryLight: '#0d6b52',
  primaryDark: '#063528',
  success: '#16a34a',
  warning: '#ea580c',
  danger: '#dc2626',
  neutral: '#6b7280',
  background: '#f4f7f5',
  surface: '#ffffff',
  sidebarBg: '#084734',
  sidebarText: '#ffffff',
  sidebarMuted: 'rgba(255,255,255,0.65)',
  sidebarActive: 'rgba(255,255,255,0.15)',
  border: '#e5e7eb'
} as const;

export function healthScoreColor(score: number): string {
  if (score >= 90) return INDIVIDUAL_THEME.success;
  if (score >= 75) return INDIVIDUAL_THEME.primary;
  if (score >= 50) return INDIVIDUAL_THEME.warning;
  return INDIVIDUAL_THEME.danger;
}

export function healthScoreLabel(score: number): string {
  if (score >= 90) return 'Excellent';
  if (score >= 75) return 'Good';
  if (score >= 50) return 'Needs Attention';
  return 'Critical';
}

export function leaseCountdownColor(days: number): 'success' | 'warning' | 'error' {
  if (days >= 90) return 'success';
  if (days >= 30) return 'warning';
  return 'error';
}
