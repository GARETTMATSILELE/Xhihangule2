import React, { useMemo, useState } from 'react';
import {
  Box,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  TableSortLabel,
  Typography
} from '@mui/material';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ReportColumn, displayCell } from './presentReport';
import { INDIVIDUAL_THEME } from '../theme';

function compareValues(a: string | number | null, b: string | number | null) {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b));
}

export function ReportDataTable({ columns, rows, currency, totals }: {
  columns: ReportColumn[];
  rows: Array<Record<string, string | number | null>>;
  currency: string;
  totals?: Record<string, number>;
}) {
  const [orderBy, setOrderBy] = useState(columns[0]?.key || '');
  const [order, setOrder] = useState<'asc' | 'desc'>('asc');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  const sorted = useMemo(() => {
    const next = [...rows];
    next.sort((left, right) => {
      const result = compareValues(left[orderBy], right[orderBy]);
      return order === 'asc' ? result : -result;
    });
    return next;
  }, [order, orderBy, rows]);
  const visible = sorted.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage);

  return (
    <TableContainer sx={{ maxWidth: '100%', overflowX: 'auto', border: `1px solid ${INDIVIDUAL_THEME.border}`, borderRadius: 2, bgcolor: '#fff' }}>
      <Table size="small" sx={{ minWidth: Math.max(640, columns.length * 120) }} aria-label="Report lines">
        <TableHead>
          <TableRow>
            {columns.map((column) => (
              <TableCell key={column.key} align={column.align} sortDirection={orderBy === column.key ? order : false} sx={{ color: '#5c6b73', fontWeight: 650, whiteSpace: 'nowrap', bgcolor: '#f7faf8' }}>
                <TableSortLabel
                  active={orderBy === column.key}
                  direction={orderBy === column.key ? order : 'asc'}
                  onClick={() => {
                    setOrder(orderBy === column.key && order === 'asc' ? 'desc' : 'asc');
                    setOrderBy(column.key);
                  }}
                >
                  {column.label}
                </TableSortLabel>
              </TableCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {visible.map((row, index) => (
            <TableRow key={`${page}-${index}`} hover sx={{ '& td': { borderColor: '#eef2f0' } }}>
              {columns.map((column) => {
                const value = row[column.key];
                const negative = column.kind === 'money' && typeof value === 'number' && value < 0;
                const rowCurrency = String(row.currency || currency);
                return (
                  <TableCell key={column.key} align={column.align} sx={{ color: negative ? '#9a4a4a' : '#1c2430', fontVariantNumeric: 'tabular-nums', whiteSpace: column.key === 'description' ? 'normal' : 'nowrap' }}>
                    {displayCell(column, value, rowCurrency)}
                  </TableCell>
                );
              })}
            </TableRow>
          ))}
          {totals && rows.length > 0 && (
            <TableRow sx={{ bgcolor: '#f4f7f5' }}>
              {columns.map((column, index) => (
                <TableCell key={column.key} align={column.align} sx={{ fontWeight: 700, color: '#1c2430' }}>
                  {index === 0 ? 'Total' : typeof totals[column.key] === 'number' ? displayCell(column, totals[column.key], currency) : ''}
                </TableCell>
              ))}
            </TableRow>
          )}
        </TableBody>
      </Table>
      {rows.length > 8 && (
        <TablePagination
          component="div"
          count={rows.length}
          page={page}
          onPageChange={(_, next) => setPage(next)}
          rowsPerPage={rowsPerPage}
          onRowsPerPageChange={(event) => { setRowsPerPage(Number(event.target.value)); setPage(0); }}
          rowsPerPageOptions={[10, 25, 50]}
        />
      )}
      {!rows.length && <Typography sx={{ p: 3, color: '#5c6b73' }}>No financial activity found for this reporting period.</Typography>}
    </TableContainer>
  );
}

export function ReportChart({ title, data, bars, xKey }: { title: string; data: Array<Record<string, string | number>>; bars: Array<[string, string]>; xKey: string }) {
  return (
    <Box sx={{ bgcolor: '#fff', border: `1px solid ${INDIVIDUAL_THEME.border}`, borderRadius: 2, p: 2 }}>
      <Typography sx={{ mb: 1, fontWeight: 650 }}>{title}</Typography>
      <Box sx={{ width: '100%', height: 260 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="#eef2f0" vertical={false} />
            <XAxis dataKey={xKey} tick={{ fontSize: 12, fill: '#5c6b73' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 12, fill: '#5c6b73' }} axisLine={false} tickLine={false} width={48} />
            <Tooltip />
            {bars.map(([key, color]) => <Bar key={key} dataKey={key} fill={color} radius={[3, 3, 0, 0]} maxBarSize={28} />)}
          </BarChart>
        </ResponsiveContainer>
      </Box>
    </Box>
  );
}
