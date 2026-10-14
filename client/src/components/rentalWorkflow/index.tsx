import React from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Divider,
  Grid,
  LinearProgress,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Stack,
  Typography,
} from '@mui/material';
import {
  CheckCircle as CheckCircleIcon,
  CircleOutlined as CircleOutlinedIcon,
  ErrorOutline as ErrorOutlineIcon,
  HomeWork as HomeWorkIcon,
  LightbulbOutlined as LightbulbOutlinedIcon,
  Timeline as TimelineIcon,
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import {
  PortfolioWorkflowSummary,
  PropertyWorkflowState,
  WorkflowAction,
  WorkflowAlert,
  WorkflowStatus,
} from '../../utils/rentalWorkflow';

const statusColors: Record<WorkflowStatus, 'default' | 'primary' | 'secondary' | 'error' | 'info' | 'success' | 'warning'> = {
  'Setup Incomplete': 'warning',
  Vacant: 'info',
  'Awaiting Lease': 'warning',
  'Billing Missing': 'error',
  'Inspection Due': 'warning',
  'Active Occupancy': 'success',
  'Lease Expiring': 'warning',
};

export const WorkflowStatusChip: React.FC<{ status: WorkflowStatus; size?: 'small' | 'medium' }> = ({ status, size = 'small' }) => (
  <Chip
    label={status}
    color={statusColors[status]}
    size={size}
    variant={status === 'Active Occupancy' ? 'filled' : 'outlined'}
    sx={{ borderRadius: 999, fontWeight: 700 }}
  />
);

const premiumCardSx = {
  borderRadius: 5,
  border: '1px solid rgba(15, 23, 42, 0.07)',
  boxShadow: '0 18px 45px rgba(15, 23, 42, 0.06)',
  background: 'rgba(255,255,255,0.94)',
  transition: 'transform 180ms ease, box-shadow 180ms ease, border-color 180ms ease',
  '&:hover': {
    transform: 'translateY(-2px)',
    boxShadow: '0 24px 60px rgba(15, 23, 42, 0.09)',
    borderColor: 'rgba(59, 130, 246, 0.18)',
  },
};

export const PropertyWorkflowSummary: React.FC<{
  state: PropertyWorkflowState;
  compact?: boolean;
  onAction?: (action: WorkflowAction) => void;
}> = ({ state, compact = false, onAction }) => {
  const navigate = useNavigate();
  const handleAction = (action: WorkflowAction) => {
    if (onAction) onAction(action);
    else navigate(action.path);
  };

  return (
    <Card variant="outlined" sx={premiumCardSx}>
      <CardContent sx={{ p: compact ? 2.5 : 3 }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={2} sx={{ mb: 2 }}>
          <Box>
            <Typography variant={compact ? 'subtitle1' : 'h6'} sx={{ fontWeight: 700 }}>
              Property Setup Status
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {state.completion}% complete
            </Typography>
          </Box>
          <WorkflowStatusChip status={state.status} />
        </Stack>

        <LinearProgress variant="determinate" value={state.completion} sx={{ height: 8, borderRadius: 4, mb: 2 }} />

        <Grid container spacing={compact ? 1 : 1.5}>
          {state.steps.map((step) => (
            <Grid item xs={12} sm={compact ? 12 : 6} key={step.key}>
              <Stack direction="row" spacing={1} alignItems="center">
                {step.complete ? (
                  <CheckCircleIcon color="success" fontSize="small" />
                ) : (
                  <CircleOutlinedIcon color="disabled" fontSize="small" />
                )}
                <Typography variant="body2" color={step.complete ? 'text.primary' : 'text.secondary'}>
                  {step.complete ? step.label : step.missingLabel}
                </Typography>
              </Stack>
            </Grid>
          ))}
        </Grid>

        {!compact && state.recommendations.length > 0 && (
          <>
            <Divider sx={{ my: 2 }} />
            <Stack spacing={1}>
              {state.recommendations.slice(0, 3).map((recommendation) => (
                <Stack direction="row" spacing={1} key={recommendation} alignItems="flex-start">
                  <LightbulbOutlinedIcon color="warning" fontSize="small" />
                  <Typography variant="body2">{recommendation}</Typography>
                </Stack>
              ))}
            </Stack>
          </>
        )}

        {state.quickActions.length > 0 && (
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mt: 2 }}>
            {state.quickActions.slice(0, compact ? 2 : 4).map((action) => (
              <Button
                key={`${state.propertyId}-${action.label}`}
                size="small"
                variant={action.intent === 'primary' ? 'contained' : 'outlined'}
                onClick={() => handleAction(action)}
              >
                {action.label}
              </Button>
            ))}
          </Stack>
        )}
      </CardContent>
    </Card>
  );
};

export const OperationalEmptyState: React.FC<{
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
  tertiaryLabel?: string;
  onTertiary?: () => void;
}> = ({ title, description, actionLabel, onAction, secondaryLabel, onSecondary, tertiaryLabel, onTertiary }) => (
  <Box
    sx={{
      border: '1px dashed',
      borderColor: 'divider',
      borderRadius: 2,
      p: 3,
      textAlign: 'center',
      backgroundColor: 'background.default',
    }}
  >
    <HomeWorkIcon color="disabled" sx={{ fontSize: 38, mb: 1 }} />
    <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
      {title}
    </Typography>
    <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 520, mx: 'auto', my: 1 }}>
      {description}
    </Typography>
    <Stack direction="row" spacing={1} justifyContent="center" flexWrap="wrap" useFlexGap sx={{ mt: 1 }}>
      {actionLabel && onAction && (
        <Button variant="contained" size="small" onClick={onAction}>
          {actionLabel}
        </Button>
      )}
      {secondaryLabel && onSecondary && (
        <Button variant="outlined" size="small" onClick={onSecondary}>
          {secondaryLabel}
        </Button>
      )}
      {tertiaryLabel && onTertiary && (
        <Button variant="text" size="small" onClick={onTertiary}>
          {tertiaryLabel}
        </Button>
      )}
    </Stack>
  </Box>
);

export const PropertyCreationSuccess: React.FC<{
  propertyName?: string;
  onAction: (path: string) => void;
  onDismiss?: () => void;
}> = ({ propertyName, onAction, onDismiss }) => {
  const primaryActions = [
    { label: 'Assign Property Owner', path: '/agent-dashboard/property-owners' },
    { label: 'Add Tenant', path: '/agent-dashboard/tenants' },
    { label: 'Create Lease', path: '/agent-dashboard/leases' },
  ];
  const secondaryActions = [
    { label: 'Upload Property Files', path: '/agent-dashboard/files' },
    { label: 'Add Maintenance Record', path: '/agent-dashboard/maintenance' },
    { label: 'Return to Dashboard', path: '/agent-dashboard' },
    { label: 'Return to Properties', path: '/agent-dashboard/properties' },
  ];

  return (
    <Alert severity="success" sx={{ mb: 3, alignItems: 'flex-start' }} onClose={onDismiss}>
      <Typography variant="h6" sx={{ fontWeight: 700 }}>
        Property Added Successfully
      </Typography>
      <Typography variant="body2" sx={{ mt: 0.5 }}>
        {propertyName ? `${propertyName} is ready for the next rental operations step.` : 'The property is ready for the next rental operations step.'}
      </Typography>
      <Typography variant="subtitle2" sx={{ mt: 2, mb: 1 }}>
        Recommended Next Steps
      </Typography>
      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
        {primaryActions.map((action) => (
          <Button key={action.label} variant="contained" size="small" onClick={() => onAction(action.path)}>
            {action.label}
          </Button>
        ))}
      </Stack>
      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mt: 1 }}>
        {secondaryActions.map((action) => (
          <Button key={action.label} variant="outlined" size="small" color="inherit" onClick={() => onAction(action.path)}>
            {action.label}
          </Button>
        ))}
      </Stack>
    </Alert>
  );
};

const WorkflowAlertCard: React.FC<{ alert: WorkflowAlert; onOpen: (path: string) => void }> = ({ alert, onOpen }) => (
  <Alert
    severity={alert.severity}
    icon={<ErrorOutlineIcon />}
    sx={{
      borderRadius: 4,
      border: 0,
      alignItems: 'center',
      '& .MuiAlert-message': { width: '100%' },
    }}
    action={
      <Button color="inherit" size="small" onClick={() => onOpen(alert.path)} sx={{ borderRadius: 99, textTransform: 'none', fontWeight: 800 }}>
        Review
      </Button>
    }
  >
    <Typography variant="subtitle2">{alert.count} {alert.title.toLowerCase()}</Typography>
    <Typography variant="body2">{alert.description}</Typography>
  </Alert>
);

export const RentalWorkflowCenter: React.FC<{
  summary: PortfolioWorkflowSummary;
  title?: string;
  compact?: boolean;
  basePath?: string;
}> = ({ summary, title = 'Rental Workflow Center', compact = false, basePath = '/agent-dashboard' }) => {
  const navigate = useNavigate();
  const needsAttention = summary.states
    .filter((state) => state.status !== 'Active Occupancy' || state.completion < 100)
    .sort((a, b) => a.completion - b.completion)
    .slice(0, compact ? 3 : 6);

  return (
    <Box sx={{ width: '100%' }}>
      <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" spacing={2} sx={{ mb: 2 }}>
        <Box>
          <Typography variant={compact ? 'h6' : 'h4'} sx={{ fontWeight: 850, letterSpacing: '-0.04em', color: '#0f172a' }}>
            {title}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Guided tasks, alerts, and recent rental activity across the portfolio.
          </Typography>
        </Box>
        <Box sx={{ minWidth: 220 }}>
          <Typography variant="body2" color="text.secondary">
            Portfolio readiness
          </Typography>
          <Stack direction="row" spacing={1} alignItems="center">
            <LinearProgress
              variant="determinate"
              value={summary.completionAverage}
              sx={{ height: 8, borderRadius: 99, flex: 1, bgcolor: 'rgba(37,99,235,0.10)', '& .MuiLinearProgress-bar': { borderRadius: 99 } }}
            />
            <Typography variant="subtitle2">{summary.completionAverage}%</Typography>
          </Stack>
        </Box>
      </Stack>

      <Grid container spacing={2}>
        <Grid item xs={12} md={compact ? 12 : 5}>
          <Card variant="outlined" sx={premiumCardSx}>
            <CardContent sx={{ p: 3 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 850, mb: 1 }}>
                Needs Attention
              </Typography>
              <Stack spacing={1.5}>
                {summary.alerts.length ? (
                  summary.alerts.slice(0, compact ? 3 : 5).map((alert) => (
                    <WorkflowAlertCard key={alert.key} alert={alert} onOpen={navigate} />
                  ))
                ) : (
                  <Alert severity="success">All core rental workflows are currently healthy.</Alert>
                )}
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={compact ? 12 : 4}>
          <Card variant="outlined" sx={premiumCardSx}>
            <CardContent sx={{ p: 3 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 850, mb: 1 }}>
                Operational Queue
              </Typography>
              {needsAttention.length ? (
                <Stack spacing={1.5}>
                  {needsAttention.map((state) => (
                    <Box
                      key={state.propertyId}
                      sx={{
                        p: 2,
                        borderRadius: 4,
                        bgcolor: '#f8fafc',
                        transition: 'transform 180ms ease, background-color 180ms ease',
                        '&:hover': { transform: 'translateY(-2px)', bgcolor: '#f1f5f9' },
                      }}
                    >
                      <Stack direction="row" justifyContent="space-between" spacing={1} alignItems="center">
                        <Typography variant="subtitle2">{state.property.name}</Typography>
                        <WorkflowStatusChip status={state.status} />
                      </Stack>
                      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                        Next: {state.missingSteps[0]?.missingLabel || 'Review property'}
                      </Typography>
                      <Button size="small" sx={{ mt: 1 }} onClick={() => navigate(`${basePath}/properties/${state.propertyId}`)}>
                        Open hub
                      </Button>
                    </Box>
                  ))}
                </Stack>
              ) : (
                <OperationalEmptyState
                  title="No operational blockers"
                  description="Properties with complete owner, tenant, lease, billing, and occupancy context will stay out of this queue."
                />
              )}
            </CardContent>
          </Card>
        </Grid>

        {!compact && (
          <Grid item xs={12} md={3}>
            <Card variant="outlined" sx={premiumCardSx}>
              <CardContent sx={{ p: 3 }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 850, mb: 1 }}>
                  Quick Actions
                </Typography>
                <Stack spacing={1}>
                  <Button variant="contained" onClick={() => navigate(`${basePath}/tenants`)} sx={{ borderRadius: 3, textTransform: 'none', fontWeight: 800 }}>Add Tenant</Button>
                  <Button variant="outlined" onClick={() => navigate(`${basePath}/leases`)} sx={{ borderRadius: 3, textTransform: 'none', fontWeight: 800 }}>Create Lease</Button>
                  <Button variant="outlined" onClick={() => navigate(`${basePath}/property-owners`)} sx={{ borderRadius: 3, textTransform: 'none', fontWeight: 800 }}>Assign Owner</Button>
                  <Button variant="outlined" onClick={() => navigate(`${basePath}/files`)} sx={{ borderRadius: 3, textTransform: 'none', fontWeight: 800 }}>Upload Documents</Button>
                </Stack>
              </CardContent>
            </Card>
          </Grid>
        )}

        {!compact && (
          <Grid item xs={12}>
            <Card variant="outlined" sx={premiumCardSx}>
              <CardContent sx={{ p: 3 }}>
                <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                  <TimelineIcon color="primary" />
                  <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                    Recent Activity
                  </Typography>
                </Stack>
                {summary.activity.length ? (
                  <List dense>
                    {summary.activity.map((item) => (
                      <ListItem key={item.id} disableGutters secondaryAction={<Button size="small" onClick={() => navigate(item.path)}>Open</Button>}>
                        <ListItemIcon>
                          <CheckCircleIcon color="success" fontSize="small" />
                        </ListItemIcon>
                        <ListItemText
                          primary={item.label}
                          secondary={`${item.description}${item.date ? ` - ${item.date.toLocaleDateString()}` : ''}`}
                        />
                      </ListItem>
                    ))}
                  </List>
                ) : (
                  <OperationalEmptyState
                    title="No rental activity yet"
                    description="Activity appears here as properties, tenants, leases, payments, and files are created."
                  />
                )}
              </CardContent>
            </Card>
          </Grid>
        )}
      </Grid>
    </Box>
  );
};
