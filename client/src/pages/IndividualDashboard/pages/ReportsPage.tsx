import React, { useState } from 'react';
import { Box, Button, Card, CardContent, Grid, Stack, Typography } from '@mui/material';
import individualWorkspaceService from '../../../services/individualWorkspaceService';
import { reportGroups } from '../constants';
import { PageShell } from '../components/shared';
import { INDIVIDUAL_THEME } from '../theme';

export function ReportsPage() {
  const [preview, setPreview] = useState<any>(null);

  const openExport = (type: string, format: 'csv' | 'excel' | 'pdf') => {
    window.open(individualWorkspaceService.getReportUrl(type, format), '_blank', 'noopener,noreferrer');
  };

  return (
    <PageShell title="Reports" subtitle="Financial, property, and tenant reports — preview or export.">
      {reportGroups.map((group) => (
        <Box key={group.title} sx={{ mb: 3 }}>
          <Typography variant="h6" sx={{ fontWeight: 700, mb: 2 }}>{group.title}</Typography>
          <Grid container spacing={2}>
            {group.reports.map(([type, label]) => (
              <Grid item xs={12} md={6} lg={4} key={`${group.title}-${label}`}>
                <Card elevation={0} sx={{ border: `1px solid ${INDIVIDUAL_THEME.border}`, height: '100%' }}>
                  <CardContent>
                    <Typography variant="subtitle1" fontWeight={600}>{label}</Typography>
                    <Stack direction="row" spacing={1} sx={{ mt: 2 }} flexWrap="wrap" useFlexGap>
                      <Button size="small" onClick={async () => setPreview(await individualWorkspaceService.getReport(type))}>Preview</Button>
                      <Button size="small" onClick={() => openExport(type, 'pdf')}>PDF</Button>
                      <Button size="small" onClick={() => openExport(type, 'excel')}>Excel</Button>
                      <Button size="small" onClick={() => openExport(type, 'csv')}>CSV</Button>
                    </Stack>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
        </Box>
      ))}
      {preview && (
        <Card elevation={0} sx={{ border: `1px solid ${INDIVIDUAL_THEME.border}` }}>
          <CardContent>
            <Typography variant="h6" gutterBottom>Report Preview</Typography>
            <Box component="pre" sx={{ overflow: 'auto', maxHeight: 360, whiteSpace: 'pre-wrap', fontSize: '0.8rem' }}>{JSON.stringify(preview, null, 2)}</Box>
          </CardContent>
        </Card>
      )}
    </PageShell>
  );
}

export default ReportsPage;
