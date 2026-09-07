import React from 'react';
import { Box, Typography } from '@mui/material';
import { ReportPrintLayout, ReportPrintLayoutProps } from './ReportPrintLayout';

export function ReportPreview<T>(props: ReportPrintLayoutProps<T>) {
  const { report } = props;
  if (!report.selectedFields.length) {
    return <Typography color="text.secondary">Select at least one field to preview the report.</Typography>;
  }
  if (!report.totalCount) {
    return <Typography color="text.secondary">No properties match the current selection and filters.</Typography>;
  }

  return (
    <Box
      className="report-print-surface"
      sx={{
        overflowX: 'auto',
        border: '1px solid #e2e8f0',
        borderRadius: '14px',
        bgcolor: '#fff',
        p: 2,
        '@media print': {
          overflow: 'visible',
          border: 'none',
          borderRadius: 0,
          p: 0,
          boxShadow: 'none',
        },
      }}
    >
      <ReportPrintLayout {...props} />
    </Box>
  );
}
