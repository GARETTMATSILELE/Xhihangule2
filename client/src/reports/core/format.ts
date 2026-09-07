const EMPTY = '—';

export function isBlank(value: unknown): boolean {
  if (value == null) return true;
  if (typeof value === 'number') return !Number.isFinite(value);
  if (typeof value === 'string') return value.trim() === '';
  return false;
}

export function displayValue(value: unknown): string {
  if (isBlank(value)) return EMPTY;
  if (typeof value === 'number') return String(value);
  return String(value).trim() || EMPTY;
}

export function formatDateValue(value: unknown): string {
  if (isBlank(value)) return EMPTY;
  const raw = String(value);
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
  const date = iso
    ? new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]))
    : new Date(raw);
  if (Number.isNaN(date.getTime())) return EMPTY;
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function formatLongDateValue(value: unknown): string {
  if (isBlank(value)) return EMPTY;
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return EMPTY;
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

export function formatMoneyValue(value: unknown, currency = 'USD'): string {
  if (isBlank(value)) return EMPTY;
  const amount = Number(value);
  if (!Number.isFinite(amount)) return EMPTY;
  if (currency === 'ZiG' || currency === 'ZWL') {
    return `${currency} ${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
}

export function formatPercentValue(value: unknown): string {
  if (isBlank(value)) return EMPTY;
  const amount = Number(value);
  if (!Number.isFinite(amount)) return EMPTY;
  return `${amount}%`;
}

export function formatFieldValue<T>(
  field: { getValue: (row: T) => unknown; format?: (value: unknown, row: T) => string },
  row: T
): string {
  const value = field.getValue(row);
  if (field.format) {
    const formatted = field.format(value, row);
    return isBlank(formatted) ? EMPTY : formatted;
  }
  return displayValue(value);
}
