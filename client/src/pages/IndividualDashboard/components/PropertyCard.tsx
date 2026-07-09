import React from 'react';
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Grid,
  Stack,
  Typography
} from '@mui/material';
import {
  AttachMoney,
  Build,
  Folder,
  TrendingDown,
  Visibility
} from '@mui/icons-material';
import { Link as RouterLink } from 'react-router-dom';
import { IndividualPropertyPerformance } from '../../../services/individualWorkspaceService';
import { occupancyChipProps, PropertyOccupancyDisplayStatus } from '../utils/propertyOccupancy';
import { INDIVIDUAL_THEME, leaseCountdownColor } from '../theme';
import { money, daysUntil, formatDate } from '../utils/formatters';
import { HealthScoreBadge } from './shared';

type EnrichedProperty = IndividualPropertyPerformance & {
  healthScore: number;
  occupancyDisplayStatus?: PropertyOccupancyDisplayStatus;
  displayLease?: any;
  leaseEndDate?: string;
  openMaintenance?: number;
  outstandingBills?: number;
};

export function PropertyCard({ property, onView }: { property: EnrichedProperty; onView: () => void }) {
  const occupancyStatus = property.occupancyDisplayStatus
    || (property.occupancyStatus === 'Occupied' ? 'Occupied' : 'Vacant');
  const occupancyChip = occupancyChipProps(occupancyStatus);
  const leaseDays = property.leaseEndDate ? daysUntil(property.leaseEndDate) : null;
  const rentStatusLabel = property.rentCollectionStatus === 'green'
    ? 'Paid'
    : property.rentCollectionStatus === 'amber'
      ? 'Partially Paid'
      : 'Overdue';

  return (
    <Card elevation={0} sx={{ height: '100%', border: `1px solid ${INDIVIDUAL_THEME.border}`, borderRadius: 2, overflow: 'hidden' }}>
      {property.image && (
        <Box component="img" src={property.image} alt={property.propertyName} sx={{ width: '100%', height: 140, objectFit: 'cover' }} />
      )}
      <CardContent>
        <Stack spacing={2}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, alignItems: 'flex-start' }}>
            <Box>
              <Typography variant="h6" sx={{ fontWeight: 700 }}>{property.propertyName}</Typography>
              <Typography variant="body2" color="text.secondary">{property.address}</Typography>
            </Box>
            <HealthScoreBadge score={property.healthScore} size="small" />
          </Box>

          <Stack direction="row" spacing={1} flexWrap="wrap">
            <Chip size="small" label={occupancyStatus} color={occupancyChip.color} sx={occupancyChip.sx} />
            <Chip
              size="small"
              label={rentStatusLabel}
              sx={{
                bgcolor: property.rentCollectionStatus === 'green' ? `${INDIVIDUAL_THEME.success}20` : property.rentCollectionStatus === 'amber' ? `${INDIVIDUAL_THEME.warning}20` : `${INDIVIDUAL_THEME.danger}20`,
                color: property.rentCollectionStatus === 'green' ? INDIVIDUAL_THEME.success : property.rentCollectionStatus === 'amber' ? INDIVIDUAL_THEME.warning : INDIVIDUAL_THEME.danger
              }}
            />
            {leaseDays !== null && leaseDays >= 0 && (
              <Chip size="small" label={`Lease: ${leaseDays}d`} color={leaseCountdownColor(leaseDays)} variant="outlined" />
            )}
          </Stack>

          <Grid container spacing={1}>
            <Grid item xs={6}><Typography variant="caption" color="text.secondary">Monthly Rent</Typography><Typography fontWeight={600}>{money(property.monthlyRent)}</Typography></Grid>
            <Grid item xs={6}><Typography variant="caption" color="text.secondary">Net Profit</Typography><Typography fontWeight={600} color={property.netProfit >= 0 ? 'success.main' : 'error.main'}>{money(property.netProfit)}</Typography></Grid>
            <Grid item xs={6}><Typography variant="caption" color="text.secondary">Outstanding Bills</Typography><Typography fontWeight={600}>{money(property.outstandingBills)}</Typography></Grid>
            <Grid item xs={6}><Typography variant="caption" color="text.secondary">Open Maintenance</Typography><Typography fontWeight={600}>{property.openMaintenance || 0}</Typography></Grid>
            {property.leaseEndDate && (
              <Grid item xs={12}><Typography variant="caption" color="text.secondary">Lease Expiry</Typography><Typography fontWeight={600}>{formatDate(property.leaseEndDate)}</Typography></Grid>
            )}
          </Grid>

          <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
            <Button size="small" startIcon={<Visibility />} onClick={onView}>View</Button>
            <Button size="small" startIcon={<AttachMoney />} component={RouterLink} to={`/individual-dashboard/rent-collection?propertyId=${property.propertyId}`}>Record Rent</Button>
            <Button size="small" startIcon={<TrendingDown />} component={RouterLink} to={`/individual-dashboard/expenses?propertyId=${property.propertyId}`}>Add Expense</Button>
            <Button size="small" startIcon={<Build />} component={RouterLink} to="/individual-dashboard/maintenance">Maintenance</Button>
            <Button size="small" startIcon={<Folder />} component={RouterLink} to="/individual-dashboard/files">Files</Button>
          </Stack>
        </Stack>
      </CardContent>
    </Card>
  );
}

export default PropertyCard;
