import React, { useMemo, useState } from 'react';
import {
  Box, TextField, Checkbox, List, ListItem, ListItemButton, ListItemIcon, ListItemText,
  Typography, Chip, InputAdornment, Paper,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';

export interface SelectableProperty {
  _id: string;
  name: string;
  address: string;
}

interface Props {
  properties: SelectableProperty[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  disabledIds?: Set<string>;
}

export const SearchablePropertySelector: React.FC<Props> = ({
  properties,
  selectedIds,
  onChange,
  disabledIds,
}) => {
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return properties;
    return properties.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.address.toLowerCase().includes(q)
    );
  }, [properties, search]);

  const toggle = (id: string) => {
    if (disabledIds?.has(id) && !selectedIds.includes(id)) return;
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter((x) => x !== id));
    } else {
      onChange([...selectedIds, id]);
    }
  };

  const selectedLabels = properties.filter((p) => selectedIds.includes(p._id));

  return (
    <Box>
      <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
        Assigned Properties ({selectedIds.length})
      </Typography>
      {selectedLabels.length > 0 && (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mb: 2 }}>
          {selectedLabels.map((p) => (
            <Chip
              key={p._id}
              label={`${p.name}${p.address ? ` — ${p.address}` : ''}`}
              size="small"
              onDelete={() => toggle(p._id)}
            />
          ))}
        </Box>
      )}
      <TextField
        fullWidth
        size="small"
        placeholder="Search property"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        sx={{ mb: 1 }}
        InputProps={{
          startAdornment: (
            <InputAdornment position="start">
              <SearchIcon fontSize="small" />
            </InputAdornment>
          ),
        }}
      />
      <Paper variant="outlined" sx={{ maxHeight: 280, overflow: 'auto', borderRadius: 2 }}>
        <List dense disablePadding>
          {filtered.length === 0 ? (
            <ListItem>
              <ListItemText primary="No properties match your search" />
            </ListItem>
          ) : (
            filtered.map((property) => {
              const checked = selectedIds.includes(property._id);
              const disabled = !!disabledIds?.has(property._id) && !checked;
              return (
                <ListItem key={property._id} disablePadding>
                  <ListItemButton onClick={() => toggle(property._id)} disabled={disabled}>
                    <ListItemIcon sx={{ minWidth: 36 }}>
                      <Checkbox edge="start" checked={checked} tabIndex={-1} disableRipple />
                    </ListItemIcon>
                    <ListItemText
                      primary={property.name}
                      secondary={property.address}
                    />
                  </ListItemButton>
                </ListItem>
              );
            })
          )}
        </List>
      </Paper>
    </Box>
  );
};

export default SearchablePropertySelector;
