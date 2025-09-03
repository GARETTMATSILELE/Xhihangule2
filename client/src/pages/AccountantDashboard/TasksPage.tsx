import React, { useState, useEffect } from 'react';
import {
  Box,
  Container,
  Typography,
  Paper,
  Grid,
  Card,
  CardContent,
  CardActions,
  Button,
  Chip,
  CircularProgress,
  Alert,
  Tabs,
  Tab,
  Badge,
  useTheme,
  useMediaQuery,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Divider,
  List,
  ListItem,
  ListItemText,
  ListItemIcon
} from '@mui/material';
import {
  CheckCircle as ApproveIcon,
  Cancel as RejectIcon,
  Visibility as ViewIcon,
  Assignment as TaskIcon,
  Payment as PaymentIcon,
  Warning as UrgentIcon,
  Schedule as PendingIcon,
  Person as PersonIcon,
  Home as PropertyIcon,
  AccountBalance as BankIcon,
  CalendarToday as DateIcon,
  AttachMoney as MoneyIcon,
  Description as ReasonIcon
} from '@mui/icons-material';
import { useAuth } from '../../contexts/AuthContext';
import paymentRequestService, { PaymentRequest } from '../../services/paymentRequestService';
import { format } from 'date-fns';

interface TasksPageProps {}

interface Task {
  id: string;
  type: 'payment_request' | 'invoice_review' | 'expense_approval' | 'budget_review';
  title: string;
  description: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  status: 'pending' | 'in_progress' | 'completed' | 'rejected';
  dueDate: Date;
  assignedTo?: string;
  createdAt: Date;
  data?: any; // Additional data specific to task type
}

const TasksPage: React.FC<TasksPageProps> = () => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const { user } = useAuth();
  
  const [currentTab, setCurrentTab] = useState<'all' | 'payment_requests' | 'pending' | 'urgent'>('all');
  const [paymentRequests, setPaymentRequests] = useState<PaymentRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedTask, setSelectedTask] = useState<Task | PaymentRequest | null>(null);
  const [actionDialog, setActionDialog] = useState<'approve' | 'reject' | null>(null);
  const [notes, setNotes] = useState('');
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [detailsDialog, setDetailsDialog] = useState(false);

  // Mock tasks for demonstration
  const [tasks] = useState<Task[]>([
    {
      id: '1',
      type: 'invoice_review',
      title: 'Review Monthly Invoice',
      description: 'Review and approve monthly invoice for property maintenance',
      priority: 'high',
      status: 'pending',
      dueDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000), // 2 days from now
      createdAt: new Date(),
      data: { invoiceId: 'INV-001', amount: 2500, property: 'Sunset Apartments' }
    },
    {
      id: '2',
      type: 'expense_approval',
      title: 'Approve Emergency Repairs',
      description: 'Emergency plumbing repairs at Downtown Loft',
      priority: 'urgent',
      status: 'pending',
      dueDate: new Date(Date.now() + 24 * 60 * 60 * 1000), // 1 day from now
      createdAt: new Date(),
      data: { expenseId: 'EXP-001', amount: 800, property: 'Downtown Loft' }
    },
    {
      id: '3',
      type: 'budget_review',
      title: 'Q4 Budget Review',
      description: 'Review and approve Q4 budget for all properties',
      priority: 'medium',
      status: 'pending',
      dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
      createdAt: new Date(),
      data: { budgetId: 'BUD-001', totalAmount: 15000 }
    }
  ]);

  useEffect(() => {
    if (user?.companyId) {
      loadPaymentRequests();
    }
  }, [user?.companyId]);

  const loadPaymentRequests = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await paymentRequestService.getPaymentRequests();
      setPaymentRequests(response.data);
    } catch (err: any) {
      console.error('Error loading payment requests:', err);
      setError('Failed to load payment requests');
    } finally {
      setLoading(false);
    }
  };

  const handleTabChange = (event: React.SyntheticEvent, newValue: 'all' | 'payment_requests' | 'pending' | 'urgent') => {
    setCurrentTab(newValue);
  };

  const handleAction = (action: 'approve' | 'reject', task: PaymentRequest) => {
    setSelectedTask(task);
    setActionDialog(action);
    setNotes('');
  };

  const handleViewDetails = (task: Task | PaymentRequest) => {
    setSelectedTask(task);
    setDetailsDialog(true);
  };

  const confirmAction = async () => {
    if (!selectedTask || !('_id' in selectedTask)) return;

    try {
      if (actionDialog === 'approve') {
        await paymentRequestService.markAsPaid(selectedTask._id, notes);
        setSuccessMessage('Payment request marked as paid');
      } else if (actionDialog === 'reject') {
        await paymentRequestService.markAsRejected(selectedTask._id, notes);
        setSuccessMessage('Payment request rejected');
      }

      await loadPaymentRequests(); // Reload the list
      setActionDialog(null);
      setSelectedTask(null);
      setNotes('');
    } catch (err: any) {
      setError(err.message || 'Failed to update payment request');
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'urgent':
        return 'error';
      case 'high':
        return 'warning';
      case 'medium':
        return 'info';
      case 'low':
        return 'success';
      default:
        return 'default';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'paid':
      case 'completed':
        return 'success';
      case 'rejected':
        return 'error';
      case 'in_progress':
        return 'info';
      case 'pending':
      default:
        return 'warning';
    }
  };

  const getTaskIcon = (type: string) => {
    switch (type) {
      case 'payment_request':
        return <PaymentIcon />;
      case 'invoice_review':
        return <TaskIcon />;
      case 'expense_approval':
        return <TaskIcon />;
      case 'budget_review':
        return <TaskIcon />;
      default:
        return <TaskIcon />;
    }
  };

  const getFilteredTasks = () => {
    let filteredTasks: (Task | PaymentRequest)[] = [];

    // Add payment requests as tasks
    const paymentRequestTasks = paymentRequests.map(req => ({
      ...req,
      type: 'payment_request' as const,
      title: `Payment Request - ${req.payTo.name} ${req.payTo.surname}`,
      description: req.reason,
      priority: req.status === 'pending' ? 'high' as const : 'low' as const,
      dueDate: new Date(req.dueDate),
      createdAt: new Date(req.requestDate)
    }));

    // Add other tasks
    const otherTasks = tasks;

    // Combine and filter based on current tab
    const allTasks = [...paymentRequestTasks, ...otherTasks];

    switch (currentTab) {
      case 'payment_requests':
        filteredTasks = paymentRequestTasks;
        break;
      case 'pending':
        filteredTasks = allTasks.filter(task => {
          return 'status' in task && task.status === 'pending';
        });
        break;
      case 'urgent':
        filteredTasks = allTasks.filter(task => {
          if ('priority' in task && typeof task.priority === 'string') {
            return task.priority === 'urgent';
          }
          return false;
        });
        break;
      default:
        filteredTasks = allTasks;
    }

    return filteredTasks.sort((a, b) => {
      const aDate = 'dueDate' in a && a.dueDate ? new Date(a.dueDate) : new Date();
      const bDate = 'dueDate' in b && b.dueDate ? new Date(b.dueDate) : new Date();
      return aDate.getTime() - bDate.getTime();
    });
  };

  const pendingCount = paymentRequests.filter(req => req.status === 'pending').length;
  const urgentCount = tasks.filter(task => task.priority === 'urgent').length;

  const renderPaymentRequestDetails = (request: PaymentRequest) => (
    <Box>
      <Typography variant="h6" gutterBottom>
        Payment Request Details
      </Typography>
      
      <Grid container spacing={3}>
        {/* Basic Information */}
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 2 }}>
            <Typography variant="subtitle1" gutterBottom>
              Basic Information
            </Typography>
            <List dense>
              <ListItem>
                <ListItemIcon>
                  <MoneyIcon />
                </ListItemIcon>
                <ListItemText
                  primary="Amount"
                  secondary={`${request.currency} ${request.amount.toLocaleString()}`}
                />
              </ListItem>
              <ListItem>
                <ListItemIcon>
                  <ReasonIcon />
                </ListItemIcon>
                <ListItemText
                  primary="Reason"
                  secondary={request.reason}
                />
              </ListItem>
              <ListItem>
                <ListItemIcon>
                  <DateIcon />
                </ListItemIcon>
                <ListItemText
                  primary="Request Date"
                  secondary={format(new Date(request.requestDate), 'MMM dd, yyyy')}
                />
              </ListItem>
              <ListItem>
                <ListItemIcon>
                  <DateIcon />
                </ListItemIcon>
                <ListItemText
                  primary="Due Date"
                  secondary={format(new Date(request.dueDate), 'MMM dd, yyyy')}
                />
              </ListItem>
            </List>
          </Paper>
        </Grid>

        {/* Pay To Information */}
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 2 }}>
            <Typography variant="subtitle1" gutterBottom>
              Pay To Information
            </Typography>
            <List dense>
              <ListItem>
                <ListItemIcon>
                  <PersonIcon />
                </ListItemIcon>
                <ListItemText
                  primary="Name"
                  secondary={`${request.payTo.name} ${request.payTo.surname}`}
                />
              </ListItem>
              {request.payTo.bankDetails && (
                <ListItem>
                  <ListItemIcon>
                    <BankIcon />
                  </ListItemIcon>
                  <ListItemText
                    primary="Bank Details"
                    secondary={request.payTo.bankDetails}
                  />
                </ListItem>
              )}
              {request.payTo.accountNumber && (
                <ListItem>
                  <ListItemIcon>
                    <BankIcon />
                  </ListItemIcon>
                  <ListItemText
                    primary="Account Number"
                    secondary={request.payTo.accountNumber}
                  />
                </ListItem>
              )}
              {request.payTo.address && (
                <ListItem>
                  <ListItemIcon>
                    <PersonIcon />
                  </ListItemIcon>
                  <ListItemText
                    primary="Address"
                    secondary={request.payTo.address}
                  />
                </ListItem>
              )}
            </List>
          </Paper>
        </Grid>

        {/* Property Information */}
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 2 }}>
            <Typography variant="subtitle1" gutterBottom>
              Property Information
            </Typography>
            <List dense>
              <ListItem>
                <ListItemIcon>
                  <PropertyIcon />
                </ListItemIcon>
                <ListItemText
                  primary="Property Name"
                  secondary={request.property?.name || (request as any).propertyId?.name || 'Unknown Property'}
                />
              </ListItem>
              <ListItem>
                <ListItemIcon>
                  <PropertyIcon />
                </ListItemIcon>
                <ListItemText
                  primary="Property Address"
                  secondary={request.property?.address || (request as any).propertyId?.address || 'No address available'}
                />
              </ListItem>
            </List>
          </Paper>
        </Grid>

        {/* Status and Processing Information */}
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 2 }}>
            <Typography variant="subtitle1" gutterBottom>
              Status & Processing
            </Typography>
            <List dense>
              <ListItem>
                <ListItemIcon>
                  <PaymentIcon />
                </ListItemIcon>
                <ListItemText
                  primary="Status"
                  secondary={
                    <Chip
                      label={request.status.toUpperCase()}
                      color={getStatusColor(request.status) as any}
                      size="small"
                    />
                  }
                />
              </ListItem>
              {request.processedByUser && (
                <ListItem>
                  <ListItemIcon>
                    <PersonIcon />
                  </ListItemIcon>
                  <ListItemText
                    primary="Processed By"
                    secondary={`${request.processedByUser.firstName} ${request.processedByUser.lastName}`}
                  />
                </ListItem>
              )}
              {request.processedDate && (
                <ListItem>
                  <ListItemIcon>
                    <DateIcon />
                  </ListItemIcon>
                  <ListItemText
                    primary="Processed Date"
                    secondary={format(new Date(request.processedDate), 'MMM dd, yyyy HH:mm')}
                  />
                </ListItem>
              )}
              {request.notes && (
                <ListItem>
                  <ListItemIcon>
                    <ReasonIcon />
                  </ListItemIcon>
                  <ListItemText
                    primary="Notes"
                    secondary={request.notes}
                  />
                </ListItem>
              )}
            </List>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );

  if (loading) {
    return (
      <Box sx={{ width: '100%' }}>
        <Box display="flex" justifyContent="center" alignItems="center" p={4}>
          <CircularProgress />
        </Box>
      </Box>
    );
  }

  return (
    <Box sx={{ width: '100%' }}>
      <Typography variant="h4" gutterBottom>
        Tasks Dashboard
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {successMessage && (
        <Alert severity="success" sx={{ mb: 3 }} onClose={() => setSuccessMessage(null)}>
          {successMessage}
        </Alert>
      )}

      <Paper sx={{ p: 3, mb: 3 }}>
        <Tabs
          value={currentTab}
          onChange={handleTabChange}
          sx={{ borderBottom: 1, borderColor: 'divider' }}
        >
          <Tab 
            label="All Tasks" 
            value="all"
            icon={<TaskIcon />}
            iconPosition="start"
          />
          <Tab 
            label={
              <Badge badgeContent={pendingCount} color="warning">
                Payment Requests
              </Badge>
            }
            value="payment_requests"
            icon={<PaymentIcon />}
            iconPosition="start"
          />
          <Tab 
            label="Pending" 
            value="pending"
            icon={<PendingIcon />}
            iconPosition="start"
          />
          <Tab 
            label={
              <Badge badgeContent={urgentCount} color="error">
                Urgent
              </Badge>
            }
            value="urgent"
            icon={<UrgentIcon />}
            iconPosition="start"
          />
        </Tabs>
      </Paper>

      <Grid container spacing={3}>
        {getFilteredTasks().map((task) => (
          <Grid item xs={12} md={6} lg={4} key={'id' in task ? task.id : task._id}>
            <Card elevation={2} sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
              <CardContent sx={{ flex: 1 }}>
                <Box display="flex" alignItems="center" mb={2}>
                  {getTaskIcon('type' in task ? task.type : 'payment_request')}
                  <Typography variant="h6" sx={{ ml: 1, flex: 1 }}>
                    {'title' in task ? task.title : `Payment Request - ${task.payTo.name} ${task.payTo.surname}`}
                  </Typography>
                </Box>

                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  {'description' in task ? task.description : task.reason}
                </Typography>

                <Box display="flex" gap={1} mb={2} flexWrap="wrap">
                  <Chip
                    label={'priority' in task ? task.priority.toUpperCase() : 'HIGH'}
                    color={getPriorityColor('priority' in task ? task.priority : 'high') as any}
                    size="small"
                  />
                  <Chip
                    label={'status' in task && task.status ? task.status.replace('_', ' ').toUpperCase() : 'PENDING'}
                    color={getStatusColor('status' in task && task.status ? task.status : 'pending') as any}
                    size="small"
                  />
                </Box>

                <Typography variant="caption" color="text.secondary">
                  Due: {format(new Date('dueDate' in task && task.dueDate ? task.dueDate : new Date()), 'MMM dd, yyyy')}
                </Typography>

                {'amount' in task && (
                  <Typography variant="body2" sx={{ mt: 1, fontWeight: 'medium' }}>
                    Amount: {task.currency} {task.amount.toLocaleString()}
                  </Typography>
                )}
              </CardContent>

              <CardActions sx={{ justifyContent: 'space-between', p: 2 }}>
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<ViewIcon />}
                  onClick={() => handleViewDetails(task)}
                >
                  View Details
                </Button>

                {'status' in task && task.status === 'pending' && '_id' in task && (
                  <Box display="flex" gap={1}>
                    <Button
                      size="small"
                      variant="contained"
                      color="success"
                      startIcon={<ApproveIcon />}
                      onClick={() => handleAction('approve', task as PaymentRequest)}
                    >
                      Paid
                    </Button>
                    <Button
                      size="small"
                      variant="outlined"
                      color="error"
                      startIcon={<RejectIcon />}
                      onClick={() => handleAction('reject', task as PaymentRequest)}
                    >
                      Reject
                    </Button>
                  </Box>
                )}
              </CardActions>
            </Card>
          </Grid>
        ))}
      </Grid>

      {getFilteredTasks().length === 0 && (
        <Box textAlign="center" p={4}>
          <Typography variant="h6" color="text.secondary">
            No tasks found
          </Typography>
          <Typography variant="body2" color="text.secondary" mt={1}>
            {currentTab === 'all' && 'No tasks available'}
            {currentTab === 'payment_requests' && 'No payment requests pending'}
            {currentTab === 'pending' && 'No pending tasks'}
            {currentTab === 'urgent' && 'No urgent tasks'}
          </Typography>
        </Box>
      )}

      {/* Details Dialog */}
      <Dialog
        open={detailsDialog}
        onClose={() => setDetailsDialog(false)}
        maxWidth="lg"
        fullWidth
        PaperProps={{
          sx: { maxHeight: '90vh' }
        }}
      >
        <DialogTitle>
          Payment Request Details
          <Button
            onClick={() => setDetailsDialog(false)}
            sx={{ position: 'absolute', right: 8, top: 8 }}
          >
            ×
          </Button>
        </DialogTitle>
        <DialogContent>
          {selectedTask && '_id' in selectedTask && renderPaymentRequestDetails(selectedTask)}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDetailsDialog(false)}>
            Close
          </Button>
        </DialogActions>
      </Dialog>

      {/* Action Confirmation Dialog */}
      <Dialog
        open={actionDialog !== null}
        onClose={() => setActionDialog(null)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          {actionDialog === 'approve' ? 'Mark as Paid' : 'Reject Payment Request'}
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" mb={2}>
            {actionDialog === 'approve' 
              ? 'Are you sure you want to mark this payment request as paid?'
              : 'Are you sure you want to reject this payment request?'
            }
          </Typography>
          <TextField
            fullWidth
            multiline
            rows={3}
            label="Notes (optional)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Add any additional notes..."
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setActionDialog(null)}>
            Cancel
          </Button>
          <Button
            onClick={confirmAction}
            variant="contained"
            color={actionDialog === 'approve' ? 'success' : 'error'}
          >
            {actionDialog === 'approve' ? 'Mark as Paid' : 'Reject'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default TasksPage; 