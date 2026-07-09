import React from 'react';
import { Box } from '@mui/material';
import { Inspections } from '../../Inspections/Inspections';
import { PageShell } from '../components/shared';

export function IndividualInspectionsPage() {
  return (
    <PageShell title="Inspections" subtitle="Move-in, routine, move-out, and maintenance inspections with PDF reports.">
      <Box sx={{ '& .MuiButton-contained': { bgcolor: '#084734' } }}>
        <Inspections />
      </Box>
    </PageShell>
  );
}

export default IndividualInspectionsPage;
