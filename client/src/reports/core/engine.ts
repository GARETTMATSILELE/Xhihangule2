import { BuiltReport, ReportDefinition, ReportField, ReportFilterOption, ReportSection } from './types';
import { formatFieldValue } from './format';

export function getFieldsByKey<T>(definition: ReportDefinition<T>): Map<string, ReportField<T>> {
  return new Map(definition.fields.map((field) => [field.key, field]));
}

export function defaultSelectedKeys<T>(definition: ReportDefinition<T>): string[] {
  const selected = definition.fields.filter((field) => field.defaultSelected).map((field) => field.key);
  return selected.length ? selected : definition.fields.slice(0, 1).map((field) => field.key);
}

export function selectedFields<T>(definition: ReportDefinition<T>, keys: string[]): Array<ReportField<T>> {
  const allowed = new Set(keys);
  return definition.fields.filter((field) => allowed.has(field.key));
}

export function applySearch<T>(rows: T[], definition: ReportDefinition<T>, query: string): T[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return rows;
  return rows.filter((row) => definition.search(row, needle));
}

export function resolveFilterOptions<T>(
  filter: ReportFilterOption<T>,
  rows: T[]
): Array<{ value: string; label: string }> {
  const dynamic = filter.getOptions?.(rows);
  const options = dynamic?.length ? dynamic : filter.options;
  if (options.some((option) => option.value === 'all')) return options;
  return [{ value: 'all', label: 'All' }, ...options];
}

export function applyFilters<T>(
  rows: T[],
  definition: ReportDefinition<T>,
  values: Record<string, string>
): T[] {
  return rows.filter((row) =>
    definition.filters.every((filter) => {
      const value = values[filter.key] || 'all';
      if (!value || value === 'all') return true;
      return filter.match(row, value);
    })
  );
}

export function applySort<T>(rows: T[], definition: ReportDefinition<T>, sortKey: string): T[] {
  const sort = definition.sorts.find((option) => option.key === sortKey) || definition.sorts.find((option) => option.key === definition.defaultSort);
  if (!sort) return [...rows];
  return [...rows].sort(sort.compare);
}

export function buildReport<T>(
  rows: T[],
  definition: ReportDefinition<T>,
  options: {
    selectedKeys: string[];
    filters: Record<string, string>;
    sortKey: string;
    groupKey: string | null;
    selectedIds?: string[] | null;
    getId: (row: T) => string;
  }
): BuiltReport<T> {
  const selectedIdSet = options.selectedIds ? new Set(options.selectedIds) : null;
  const scoped = selectedIdSet ? rows.filter((row) => selectedIdSet.has(options.getId(row))) : rows;
  const filtered = applyFilters(scoped, definition, options.filters);
  const sorted = applySort(filtered, definition, options.sortKey);
  const fields = selectedFields(definition, options.selectedKeys);
  const group = options.groupKey
    ? definition.groups.find((item) => item.key === options.groupKey)
    : undefined;

  if (!group) {
    return {
      sections: sorted.length ? [{ key: 'all', label: '', rows: sorted }] : [],
      selectedFields: fields,
      totalCount: sorted.length,
    };
  }

  const buckets = new Map<string, T[]>();
  for (const row of sorted) {
    const key = group.getGroupKey(row);
    const list = buckets.get(key) || [];
    list.push(row);
    buckets.set(key, list);
  }

  const sections: Array<ReportSection<T>> = group.groupOrder
    .filter((key) => (buckets.get(key) || []).length > 0)
    .map((key) => ({
      key,
      label: group.groupLabels[key] || key,
      rows: buckets.get(key) || [],
    }));

  return {
    sections,
    selectedFields: fields,
    totalCount: sorted.length,
  };
}

export function cellValue<T>(field: ReportField<T>, row: T): string {
  return formatFieldValue(field, row);
}

export function compareText(a: unknown, b: unknown): number {
  return String(a || '').localeCompare(String(b || ''), undefined, { sensitivity: 'base' });
}
