import React from 'react';
import {
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  FormControl,
  FormControlLabel,
  Grid,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Typography,
} from '@mui/material';
import PrintIcon from '@mui/icons-material/Print';
import VisibilityIcon from '@mui/icons-material/Visibility';
import { buildReport, defaultSelectedKeys, resolveFilterOptions } from '../core/engine';
import { ReportDefinition } from '../core/types';
import { ReportFieldSelector } from './ReportFieldSelector';
import { ReportFilters } from './ReportFilters';
import { ReportPreview } from './ReportPreview';
import { ReportPropertyPicker } from './ReportPropertyPicker';

type ReportBuilderProps<T> = {
  definition: ReportDefinition<T>;
  rows: T[];
  getId: (row: T) => string;
  getPrimaryLabel: (row: T) => string;
  getSecondaryLabel: (row: T) => string;
  companyName: string;
  companyLogo?: string;
  generatedAt: string;
};

export function ReportBuilder<T>({
  definition,
  rows,
  getId,
  getPrimaryLabel,
  getSecondaryLabel,
  companyName,
  companyLogo,
  generatedAt,
}: ReportBuilderProps<T>) {
  const previewRef = React.useRef<HTMLDivElement | null>(null);
  const [allSelected, setAllSelected] = React.useState(true);
  const [selectedIds, setSelectedIds] = React.useState<string[]>([]);
  const [selectedKeys, setSelectedKeys] = React.useState<string[]>(() => defaultSelectedKeys(definition));
  const [filters, setFilters] = React.useState<Record<string, string>>(() =>
    Object.fromEntries(definition.filters.map((filter) => [filter.key, 'all']))
  );
  const [sortKey, setSortKey] = React.useState(definition.defaultSort);
  const [groupEnabled, setGroupEnabled] = React.useState(Boolean(definition.defaultGroup));

  const report = React.useMemo(
    () =>
      buildReport(rows, definition, {
        selectedKeys,
        filters,
        sortKey,
        groupKey: groupEnabled ? definition.defaultGroup : null,
        selectedIds: allSelected ? null : selectedIds,
        getId,
      }),
    [rows, definition, selectedKeys, filters, sortKey, groupEnabled, allSelected, selectedIds, getId]
  );

  const filterLabels = definition.filters
    .map((filter) => {
      const value = filters[filter.key];
      if (!value || value === 'all') return '';
      return resolveFilterOptions(filter, rows).find((option) => option.value === value)?.label || '';
    })
    .filter(Boolean);

  const handlePrint = () => {
    window.print();
  };

  const handlePreview = () => {
    previewRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <Box>
      <Grid container spacing={2.5} sx={{ '@media print': { display: 'block' } }}>
        <Grid item xs={12} md={5} className="no-print">
          <Stack spacing={2}>
            <Card sx={cardSx}>
              <CardContent>
                <Typography variant="subtitle2" sx={sectionTitleSx}>1. Properties</Typography>
                <ReportPropertyPicker
                  rows={rows}
                  definition={definition}
                  getId={getId}
                  getPrimaryLabel={getPrimaryLabel}
                  getSecondaryLabel={getSecondaryLabel}
                  allSelected={allSelected}
                  selectedIds={selectedIds}
                  onAllSelectedChange={setAllSelected}
                  onSelectedIdsChange={setSelectedIds}
                />
              </CardContent>
            </Card>
            <Card sx={cardSx}>
              <CardContent>
                <Typography variant="subtitle2" sx={sectionTitleSx}>2. Filters</Typography>
                <ReportFilters filters={definition.filters} values={filters} rows={rows} onChange={setFilters} />
              </CardContent>
            </Card>
            <Card sx={cardSx}>
              <CardContent>
                <Typography variant="subtitle2" sx={sectionTitleSx}>3. Information to include</Typography>
                <ReportFieldSelector fields={definition.fields} selectedKeys={selectedKeys} onChange={setSelectedKeys} />
              </CardContent>
            </Card>
            <Card sx={cardSx}>
              <CardContent>
                <Typography variant="subtitle2" sx={sectionTitleSx}>4. Sort & group</Typography>
                {definition.groups[0] ? (
                  <FormControlLabel
                    control={<Checkbox checked={groupEnabled} onChange={(event) => setGroupEnabled(event.target.checked)} />}
                    label={definition.groups[0].label}
                    sx={{ mb: 1.5, display: 'block' }}
                  />
                ) : null}
                <FormControl size="small" fullWidth sx={{ bgcolor: '#fff' }}>
                  <InputLabel>Sort</InputLabel>
                  <Select label="Sort" value={sortKey} onChange={(event) => setSortKey(String(event.target.value))}>
                    {definition.sorts.map((option) => (
                      <MenuItem key={option.key} value={option.key}>{option.label}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </CardContent>
            </Card>
          </Stack>
        </Grid>
        <Grid item xs={12} md={7} sx={{ '@media print': { maxWidth: '100%', flexBasis: '100%', width: '100%' } }}>
          <Card sx={{ ...cardSx, '@media print': { boxShadow: 'none', border: 'none', background: 'transparent' } }}>
            <CardContent>
              <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" spacing={1.5} sx={{ mb: 2 }} className="no-print">
                <Box>
                  <Typography variant="subtitle2" sx={sectionTitleSx}>5. Report preview</Typography>
                  <Typography variant="body2" color="text.secondary">
                    {report.totalCount} propert{report.totalCount === 1 ? 'y' : 'ies'} · {report.selectedFields.length} field{report.selectedFields.length === 1 ? '' : 's'}
                  </Typography>
                </Box>
                <Stack direction="row" spacing={1}>
                  <Button variant="outlined" startIcon={<VisibilityIcon />} onClick={handlePreview} sx={buttonSx}>
                    Preview
                  </Button>
                  <Button variant="contained" startIcon={<PrintIcon />} onClick={handlePrint} disabled={!report.totalCount || !report.selectedFields.length} sx={buttonSx}>
                    Print Report
                  </Button>
                </Stack>
              </Stack>
              <Box ref={previewRef}>
                <ReportPreview
                  title={definition.title}
                  companyName={companyName}
                  companyLogo={companyLogo}
                  generatedAt={generatedAt}
                  report={report}
                  getRowKey={getId}
                  filterLabels={filterLabels}
                />
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
}

const cardSx = {
  borderRadius: '20px',
  border: '1px solid rgba(148, 163, 184, 0.18)',
  background: 'rgba(255, 255, 255, 0.92)',
  boxShadow: '0 18px 45px rgba(15, 23, 42, 0.06)',
};

const sectionTitleSx = {
  fontWeight: 900,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  mb: 1.5,
  color: '#0f172a',
};

const buttonSx = {
  borderRadius: '14px',
  px: 2.2,
  py: 1.1,
  textTransform: 'none',
  fontWeight: 900,
};
