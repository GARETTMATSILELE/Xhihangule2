export function money(value: number | undefined, currency = 'USD') {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(Number(value || 0));
}

export function percent(value: number | undefined) {
  return `${Math.round(Number(value || 0))}%`;
}

export function greetingName(firstName?: string, lastName?: string) {
  const name = [firstName, lastName].filter(Boolean).join(' ').trim();
  return name || 'Property Owner';
}

export function timeGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good Morning';
  if (hour < 17) return 'Good Afternoon';
  return 'Good Evening';
}

export function daysUntil(date: string | Date | undefined) {
  if (!date) return null;
  const target = new Date(date);
  if (Number.isNaN(target.getTime())) return null;
  return Math.ceil((target.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

export function formatDate(value: string | Date | undefined) {
  if (!value) return '-';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '-' : d.toLocaleDateString();
}
