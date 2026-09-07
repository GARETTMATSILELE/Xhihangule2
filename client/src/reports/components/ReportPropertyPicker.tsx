import React, { useMemo } from 'react';
import {
  Box,
  Button,
  Checkbox,
  FormControlLabel,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { applySearch } from '../core/engine';
import { ReportDefinition } from '../core/types';

type ReportPropertyPickerProps<T> = {
  rows: T[];
  definition: ReportDefinition<T>;
  getId: (row: T) => string;
  getPrimaryLabel: (row: T) => string;
  getSecondaryLabel: (row: T) => string;
  allSelected: boolean;
  selectedIds: string[];
  onAllSelectedChange: (value: boolean) => void;
  onSelectedIdsChange: (ids: string[]) => void;
};

export function ReportPropertyPicker<T>({
  rows,
  definition,
  getId,
  getPrimaryLabel,
  getSecondaryLabel,
  allSelected,
  selectedIds,
  onAllSelectedChange,
  onSelectedIdsChange,
}: ReportPropertyPickerProps<T>) {
  const [query, setQuery] = React.useState('');
  const visible = useMemo(() => applySearch(rows, definition, query), [rows, definition, query]);
  const selected = new Set(selectedIds);

  const toggle = (id: string) => {
    onAllSelectedChange(false);
    if (selected.has(id)) {
      onSelectedIdsChange(selectedIds.filter((item) => item !== id));
      return;
    }
    onSelectedIdsChange([...selectedIds, id]);
  };

  return (
    <Box>
      <TextField
        fullWidth
        size="small"
        placeholder="Search properties, owners, agents or tenants..."
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        sx={{ mb: 1.5, bgcolor: '#fff' }}
      />
      <FormControlLabel
        control={(
          <Checkbox
            checked={allSelected}
            onChange={(event) => {
              onAllSelectedChange(event.target.checked);
              if (event.target.checked) onSelectedIdsChange([]);
            }}
          />
        )}
        label={<Typography sx={{ fontWeight: 800 }}>All properties</Typography>}
      />
      <Stack direction="row" spacing={1} sx={{ mb: 1 }}>
        <Button
          size="small"
          disabled={allSelected}
          onClick={() => onSelectedIdsChange(visible.map(getId))}
          sx={{ textTransform: 'none', fontWeight: 700 }}
        >
          Select all
        </Button>
        <Button
          size="small"
          disabled={allSelected}
          onClick={() => onSelectedIdsChange([])}
          sx={{ textTransform: 'none', fontWeight: 700 }}
        >
          Clear all
        </Button>
      </Stack>
      <Box sx={{ maxHeight: 280, overflow: 'auto', border: '1px solid #e2e8f0', borderRadius: '14px', bgcolor: '#fff' }}>
        <List dense disablePadding>
          {visible.map((row) => {
            const id = getId(row);
            return (
              <ListItemButton key={id} disabled={allSelected} onClick={() => toggle(id)} sx={{ py: 0.75 }}>
                <ListItemIcon sx={{ minWidth: 36 }}>
                  <Checkbox edge="start" checked={allSelected || selected.has(id)} tabIndex={-1} disableRipple />
                </ListItemIcon>
                <ListItemText
                  primary={getPrimaryLabel(row) || 'Unnamed property'}
                  secondary={getSecondaryLabel(row)}
                  primaryTypographyProps={{ fontWeight: 700 }}
                />
              </ListItemButton>
            );
          })}
          {!visible.length && (
            <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>
              No properties match this search.
            </Typography>
          )}
        </List>
      </Box>
    </Box>
  );
}
