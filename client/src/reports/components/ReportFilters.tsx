import React from 'react';
import { FormControl, InputLabel, MenuItem, Select, Stack } from '@mui/material';
import { ReportFilterOption } from '../core/types';
import { resolveFilterOptions } from '../core/engine';

type ReportFiltersProps<T> = {
  filters: Array<ReportFilterOption<T>>;
  values: Record<string, string>;
  rows: T[];
  onChange: (values: Record<string, string>) => void;
};

export function ReportFilters<T>({ filters, values, rows, onChange }: ReportFiltersProps<T>) {
  return (
    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} flexWrap="wrap" useFlexGap>
      {filters.map((filter) => {
        const options = resolveFilterOptions(filter, rows);
        const selectedValue = values[filter.key] || 'all';
        const value = options.some((option) => option.value === selectedValue) ? selectedValue : 'all';
        return (
          <FormControl key={filter.key} size="small" sx={{ minWidth: 200, bgcolor: '#fff' }}>
            <InputLabel>{filter.label}</InputLabel>
            <Select
              label={filter.label}
              value={value}
              onChange={(event) => onChange({ ...values, [filter.key]: String(event.target.value) })}
            >
              {options.map((option) => (
                <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>
              ))}
            </Select>
          </FormControl>
        );
      })}
    </Stack>
  );
}
