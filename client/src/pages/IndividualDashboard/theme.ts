export const INDIVIDUAL_THEME = {
  primary: '#084734',
  primaryLight: '#0d6b52',
  primaryDark: '#063528',
  success: '#16a34a',
  warning: '#ea580c',
  danger: '#dc2626',
  neutral: '#6b7280',
  background: '#F4F5F2',
  surface: '#ffffff',
  sidebarBg: '#00452F',
  sidebarText: '#ffffff',
  sidebarMuted: 'rgba(255,255,255,0.62)',
  sidebarActive: '#0F6E49',
  border: '#E6EBE8'
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
