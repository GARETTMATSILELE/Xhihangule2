export type ReportField<T> = {
  key: string;
  label: string;
  group: string;
  getValue: (row: T) => unknown;
  format?: (value: unknown, row: T) => string;
  defaultSelected?: boolean;
};

export type ReportSortOption<T> = {
  key: string;
  label: string;
  compare: (a: T, b: T) => number;
};

export type ReportGroupOption<T> = {
  key: string;
  label: string;
  getGroupKey: (row: T) => string;
  groupOrder: string[];
  groupLabels: Record<string, string>;
};

export type ReportFilterChoice = {
  value: string;
  label: string;
};

export type ReportFilterOption<T> = {
  key: string;
  label: string;
  options: Array<ReportFilterChoice>;
  getOptions?: (rows: T[]) => Array<ReportFilterChoice>;
  match: (row: T, value: string) => boolean;
};

export type ReportDefinition<T> = {
  type: string;
  title: string;
  fields: Array<ReportField<T>>;
  filters: Array<ReportFilterOption<T>>;
  sorts: Array<ReportSortOption<T>>;
  groups: Array<ReportGroupOption<T>>;
  defaultSort: string;
  defaultGroup: string | null;
  search: (row: T, query: string) => boolean;
};

export type ReportSection<T> = {
  key: string;
  label: string;
  rows: T[];
};

export type BuiltReport<T> = {
  sections: Array<ReportSection<T>>;
  selectedFields: Array<ReportField<T>>;
  totalCount: number;
};
