import React, { useEffect } from 'react';
import {
  Box,
  Button,
  Card,
  CardActionArea,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Skeleton,
  Stack,
  TextField,
  Typography
} from '@mui/material';
import {
  AccountBalance,
  ArrowForward,
  Build,
  Description,
  FactCheck,
  History,
  HomeWork,
  MenuBook,
  Payments,
  People,
  Receipt,
  ShowChart,
  SwapVert,
  TrendingDown,
  TrendingUp
} from '@mui/icons-material';
import { ReportDefinition } from './catalog';
import { PERIOD_OPTIONS, ReportPeriod } from './filters';
import { comparisonText, formatReportMoney } from './presentReport';
import { INDIVIDUAL_THEME } from '../theme';

export const REPORT_FONT = 'Inter, "Segoe UI", system-ui, sans-serif';

const ICONS = {
  pnl: AccountBalance,
  statement: Description,
  cashflow: SwapVert,
  expense: Receipt,
  performance: ShowChart,
  ledger: MenuBook,
  occupancy: HomeWork,
  maintenance: Build,
  rent: Payments,
  tenant: People,
  lease: Description,
  tax: AccountBalance,
  obligation: FactCheck,
  history: History
};

export function useReportPrintStyle() {
  useEffect(() => {
    const style = document.createElement('style');
    style.setAttribute('data-mantis-report-print', 'true');
    style.textContent = `
      @media print {
        .MuiDrawer-root, .individual-topbar, .no-print { display: none !important; }
        .report-print { box-shadow: none !important; }
        body { background: #fff !important; }
      }
    `;
    document.head.appendChild(style);
    return () => style.remove();
  }, []);
}

export function ReportSelect({ label, value, onChange, options, id }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  id: string;
}) {
  return (
    <FormControl size="small" sx={{ minWidth: { xs: '100%', sm: 180 }, flex: { xs: '1 1 100%', sm: '0 1 180px' } }}>
      <InputLabel id={`${id}-label`}>{label}</InputLabel>
      <Select
        labelId={`${id}-label`}
        id={id}
        label={label}
        value={value}
        onChange={(event) => onChange(String(event.target.value))}
      >
        {options.map((option) => <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>)}
      </Select>
    </FormControl>
  );
}

export function ReportFilters({ period, propertyId, start, end, section, properties, onChange }: {
  period: ReportPeriod;
  propertyId: string;
  start: string;
  end: string;
  section?: string;
  properties: Array<{ propertyId: string; propertyName: string }>;
  onChange: (patch: Partial<{ period: string; propertyId: string; start: string; end: string; section: string }>) => void;
}) {
  return (
    <Box className="no-print" sx={{ bgcolor: '#fff', border: `1px solid ${INDIVIDUAL_THEME.border}`, borderRadius: 2, p: { xs: 1.5, sm: 2 } }}>
      <Stack direction="row" useFlexGap flexWrap="wrap" spacing={1.5}>
        <ReportSelect
          id="reporting-period"
          label="Reporting period"
          value={period}
          onChange={(value) => onChange({ period: value })}
          options={PERIOD_OPTIONS.map((option) => ({ value: option.value, label: option.label }))}
        />
        <ReportSelect
          id="property-filter"
          label="Property"
          value={propertyId || 'all'}
          onChange={(value) => onChange({ propertyId: value === 'all' ? '' : value })}
          options={[{ value: 'all', label: 'All properties' }, ...properties.map((property) => ({ value: property.propertyId, label: property.propertyName }))]}
        />
        {section != null && (
          <ReportSelect
            id="report-category"
            label="Category"
            value={section || 'all'}
            onChange={(value) => onChange({ section: value })}
            options={[
              { value: 'all', label: 'All categories' },
              { value: 'Financial Performance', label: 'Financial Performance' },
              { value: 'Property Performance', label: 'Property Performance' },
              { value: 'Rental & Tenancy', label: 'Rental & Tenancy' },
              { value: 'Tax & Compliance', label: 'Tax & Compliance' }
            ]}
          />
        )}
        {period === 'custom' && (
          <>
            <TextField
              id="report-start"
              label="Start date"
              type="date"
              size="small"
              value={start}
              onChange={(event) => onChange({ start: event.target.value })}
              InputLabelProps={{ shrink: true }}
              sx={{ minWidth: { xs: '100%', sm: 160 } }}
            />
            <TextField
              id="report-end"
              label="End date"
              type="date"
              size="small"
              value={end}
              onChange={(event) => onChange({ end: event.target.value })}
              InputLabelProps={{ shrink: true }}
              sx={{ minWidth: { xs: '100%', sm: 160 } }}
            />
          </>
        )}
      </Stack>
    </Box>
  );
}

export function OverviewCard({ label, value, currency, caption, current, previous, previousLabel, higherIsWorse }: {
  label: string;
  value: string;
  currency?: string;
  caption?: string;
  current?: number;
  previous?: number | null;
  previousLabel?: string | null;
  higherIsWorse?: boolean;
}) {
  const comparison = current == null ? null : comparisonText(current, previous, previousLabel);
  const tone = !comparison || comparison.direction === 'flat'
    ? '#5c6b73'
    : (comparison.direction === 'up') === !higherIsWorse
      ? '#0d6b52'
      : '#9a4a4a';
  return (
    <Card elevation={0} sx={{ height: '100%', border: `1px solid ${INDIVIDUAL_THEME.border}`, borderRadius: 2, bgcolor: '#fff' }}>
      <Box sx={{ p: 2.25 }}>
        <Typography sx={{ color: '#5c6b73', fontSize: 12, letterSpacing: 0.6, textTransform: 'uppercase', fontWeight: 600 }}>{label}</Typography>
        <Typography sx={{ mt: 1.25, fontSize: { xs: '1.45rem', md: '1.7rem' }, fontWeight: 650, color: '#1c2430', letterSpacing: -0.4, lineHeight: 1.15 }}>{value}</Typography>
        {currency && <Typography sx={{ mt: 0.5, color: '#5c6b73', fontSize: 13 }}>{currency}</Typography>}
        {caption && <Typography sx={{ mt: 1, color: '#5c6b73', fontSize: 13 }}>{caption}</Typography>}
        {comparison && (
          <Stack direction="row" spacing={0.5} alignItems="center" sx={{ mt: 1.25, color: tone }}>
            {comparison.direction === 'up' && <TrendingUp sx={{ fontSize: 16 }} />}
            {comparison.direction === 'down' && <TrendingDown sx={{ fontSize: 16 }} />}
            <Typography sx={{ fontSize: 12.5 }}>
              {comparison.direction === 'flat'
                ? comparison.text
                : `${formatReportMoney(comparison.absolute || 0, currency || 'USD').replace(/^[A-Z]{3}\s/, '')}${comparison.percent == null ? '' : ` (${comparison.percent > 0 ? '+' : ''}${comparison.percent}%)`} ${comparison.text} ${previousLabel}`}
            </Typography>
          </Stack>
        )}
      </Box>
    </Card>
  );
}

export function ReportCardLink({ report, onOpen }: { report: ReportDefinition; onOpen: () => void }) {
  const Icon = ICONS[report.icon];
  return (
    <Card elevation={0} sx={{
      height: '100%',
      border: `1px solid ${INDIVIDUAL_THEME.border}`,
      borderRadius: 2,
      bgcolor: '#fff',
      transition: 'border-color 160ms ease, transform 160ms ease',
      '&:hover': { borderColor: INDIVIDUAL_THEME.primary, transform: 'translateY(-2px)' },
      '&:focus-within': { borderColor: INDIVIDUAL_THEME.primary }
    }}>
      <CardActionArea onClick={onOpen} aria-label={`View ${report.title}`} sx={{ height: '100%', p: 2.25, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'flex-start' }}>
        <Box sx={{ width: 36, height: 36, borderRadius: 1.5, bgcolor: 'rgba(8,71,52,0.08)', color: INDIVIDUAL_THEME.primary, display: 'grid', placeItems: 'center', mb: 1.75 }}>
          <Icon sx={{ fontSize: 18 }} />
        </Box>
        <Typography sx={{ fontWeight: 650, color: '#1c2430', letterSpacing: 0.2 }}>{report.title}</Typography>
        <Typography sx={{ mt: 0.75, color: '#5c6b73', fontSize: 14, lineHeight: 1.5, flex: 1 }}>{report.description}</Typography>
        <Typography sx={{ mt: 2, color: '#8aa39a', fontSize: 12, letterSpacing: 0.3 }}>{report.category}</Typography>
        <Stack direction="row" spacing={0.5} alignItems="center" sx={{ mt: 1.25, color: INDIVIDUAL_THEME.primary }}>
          <Typography sx={{ fontSize: 13, fontWeight: 650, letterSpacing: 0.4 }}>View report</Typography>
          <ArrowForward sx={{ fontSize: 16 }} />
        </Stack>
      </CardActionArea>
    </Card>
  );
}

export function OverviewSkeleton() {
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', lg: 'repeat(4, 1fr)' }, gap: 2 }}>
      {Array.from({ length: 4 }).map((_, index) => (
        <Skeleton key={index} variant="rounded" height={128} sx={{ borderRadius: 2 }} />
      ))}
    </Box>
  );
}

export function CardsSkeleton() {
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', lg: '1fr 1fr 1fr' }, gap: 2 }}>
      {Array.from({ length: 6 }).map((_, index) => (
        <Skeleton key={index} variant="rounded" height={196} sx={{ borderRadius: 2 }} />
      ))}
    </Box>
  );
}

export function QuietButton(props: React.ComponentProps<typeof Button>) {
  return (
    <Button
      variant="outlined"
      {...props}
      sx={{
        borderColor: '#d5ded9',
        color: INDIVIDUAL_THEME.primary,
        textTransform: 'none',
        fontWeight: 600,
        borderRadius: 1.5,
        '&:hover': { borderColor: INDIVIDUAL_THEME.primary, bgcolor: 'rgba(8,71,52,0.04)' },
        '&:focus-visible': { outline: `2px solid ${INDIVIDUAL_THEME.primary}`, outlineOffset: 2 },
        ...((props.sx as object) || {})
      }}
    />
  );
}
