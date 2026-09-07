import React from 'react';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Button,
  Checkbox,
  FormControlLabel,
  Stack,
  Typography,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { ReportField } from '../core/types';

type ReportFieldSelectorProps<T> = {
  fields: Array<ReportField<T>>;
  selectedKeys: string[];
  onChange: (keys: string[]) => void;
};

export function ReportFieldSelector<T>({ fields, selectedKeys, onChange }: ReportFieldSelectorProps<T>) {
  const selected = new Set(selectedKeys);
  const groups = Array.from(new Set(fields.map((field) => field.group)));

  const toggle = (key: string) => {
    if (selected.has(key)) {
      onChange(selectedKeys.filter((item) => item !== key));
      return;
    }
    onChange([...selectedKeys, key]);
  };

  const setGroup = (group: string, checked: boolean) => {
    const groupKeys = fields.filter((field) => field.group === group).map((field) => field.key);
    if (checked) {
      onChange(Array.from(new Set([...selectedKeys, ...groupKeys])));
      return;
    }
    onChange(selectedKeys.filter((key) => !groupKeys.includes(key)));
  };

  return (
    <Box>
      <Stack direction="row" spacing={1} sx={{ mb: 1.5 }}>
        <Button size="small" onClick={() => onChange(fields.map((field) => field.key))} sx={{ textTransform: 'none', fontWeight: 800 }}>
          Select everything
        </Button>
        <Button size="small" onClick={() => onChange([])} sx={{ textTransform: 'none', fontWeight: 800 }}>
          Clear all
        </Button>
      </Stack>
      {groups.map((group) => {
        const groupFields = fields.filter((field) => field.group === group);
        const allChecked = groupFields.every((field) => selected.has(field.key));
        return (
          <Accordion key={group} defaultExpanded disableGutters elevation={0} sx={{ '&:before': { display: 'none' }, border: '1px solid #e2e8f0', borderRadius: '14px !important', mb: 1, overflow: 'hidden' }}>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ width: '100%', pr: 1 }}>
                <Typography sx={{ fontWeight: 800 }}>{group}</Typography>
                <Stack direction="row" spacing={1} onClick={(event) => event.stopPropagation()}>
                  <Button size="small" onClick={() => setGroup(group, true)} sx={{ textTransform: 'none', fontWeight: 700 }}>Select all</Button>
                  <Button size="small" onClick={() => setGroup(group, false)} sx={{ textTransform: 'none', fontWeight: 700 }}>Clear</Button>
                </Stack>
              </Stack>
            </AccordionSummary>
            <AccordionDetails sx={{ pt: 0 }}>
              <FormControlLabel
                control={<Checkbox size="small" checked={allChecked} onChange={(event) => setGroup(group, event.target.checked)} />}
                label={<Typography variant="body2" sx={{ fontWeight: 700 }}>All {group.toLowerCase()} fields</Typography>}
              />
              <Stack>
                {groupFields.map((field) => (
                  <FormControlLabel
                    key={field.key}
                    control={<Checkbox size="small" checked={selected.has(field.key)} onChange={() => toggle(field.key)} />}
                    label={field.label}
                  />
                ))}
              </Stack>
            </AccordionDetails>
          </Accordion>
        );
      })}
    </Box>
  );
}
