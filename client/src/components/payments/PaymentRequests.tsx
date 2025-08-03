import React, { useState } from 'react';
import {
  Box,
  Typography,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Button,
  Chip,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  CircularProgress,
  Alert,
  useTheme,
  useMediaQuery
} from '@mui/material';
import {
  Visibility as ViewIcon,
  Edit as EditIcon,
  CheckCircle as ApproveIcon,
  Cancel as RejectIcon,
  Delete as DeleteIcon
} from '@mui/icons-material';
import { PaymentRequest } from '../../services/paymentRequestService';
import { format } from 'date-fns';

interface PaymentRequestsProps {
  requests: PaymentRequest[];
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onView: (request: PaymentRequest) => void;
  onEdit: (request: PaymentRequest) => void;
  loading: boolean;
  error: string | null;
  isMobile: boolean;
}

const PaymentRequests: React.FC<PaymentRequestsProps> = ({
  requests,
  onApprove,
  onReject,
  onView,
  onEdit,
  loading,
  error,
  isMobile
}) => {
  const theme = useTheme();
  const [selectedRequest, setSelectedRequest] = useState<PaymentRequest | null>(null);
  const [actionDialog, setActionDialog] = useState<'approve' | 'reject' | null>(null);
  const [notes, setNotes] = useState('');

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'paid':
        return 'success';
      case 'rejected':
        return 'error';
      case 'pending':
      default:
        return 'warning';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'paid':
        return 'Paid';
      case 'rejected':
        return 'Rejected';
      case 'pending':
      default:
        return 'Pending';
    }
  };

  const handleAction = (action: 'approve' | 'reject', request: PaymentRequest) => {
    setSelectedRequest(request);
    setActionDialog(action);
    setNotes('');
  };

  const confirmAction = () => {
    if (!selectedRequest) return;

    if (actionDialog === 'approve') {
      onApprove(selectedRequest._id);
    } else if (actionDialog === 'reject') {
      onReject(selectedRequest._id);
    }

    setActionDialog(null);
    setSelectedRequest(null);
    setNotes('');
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" p={4}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Box p={2}>
        <Alert severity="error">{error}</Alert>
      </Box>
    );
  }

  if (requests.length === 0) {
    return (
      <Box p={4} textAlign="center">
        <Typography variant="h6" color="text.secondary">
          No payment requests found
        </Typography>
        <Typography variant="body2" color="text.secondary" mt={1}>
          Payment requests will appear here when created
        </Typography>
      </Box>
    );
  }

  if (isMobile) {
    return (
      <Box>
        {requests.map((request) => (
          <Paper key={request._id} sx={{ p: 2, mb: 2 }}>
            <Box display="flex" justifyContent="space-between" alignItems="flex-start" mb={1}>
              <Typography variant="h6">
                {request.payTo.name} {request.payTo.surname}
              </Typography>
              <Chip
                label={getStatusLabel(request.status)}
                color={getStatusColor(request.status) as any}
                size="small"
              />
            </Box>
            
            <Typography variant="body2" color="text.secondary" mb={1}>
              {request.property?.name || 'Unknown Property'}
            </Typography>
            
            <Typography variant="body2" mb={1}>
              {request.currency} {request.amount.toLocaleString()}
            </Typography>
            
            <Typography variant="body2" color="text.secondary" mb={2}>
              {request.reason}
            </Typography>

            <Box display="flex" gap={1} flexWrap="wrap">
              {request.status === 'pending' && (
                <>
                  <Button
                    size="small"
                    variant="contained"
                    color="success"
                    startIcon={<ApproveIcon />}
                    onClick={() => handleAction('approve', request)}
                  >
                    Mark Paid
                  </Button>
                  <Button
                    size="small"
                    variant="outlined"
                    color="error"
                    startIcon={<RejectIcon />}
                    onClick={() => handleAction('reject', request)}
                  >
                    Reject
                  </Button>
                </>
              )}
              <Button
                size="small"
                variant="outlined"
                startIcon={<ViewIcon />}
                onClick={() => onView(request)}
              >
                View
              </Button>
            </Box>
          </Paper>
        ))}
      </Box>
    );
  }

  return (
    <Box>
      <TableContainer component={Paper} elevation={0} sx={{ flex: 1, overflow: 'auto' }}>
        <Table stickyHeader>
          <TableHead>
            <TableRow>
              <TableCell>Date</TableCell>
              <TableCell>Pay To</TableCell>
              <TableCell>Property</TableCell>
              <TableCell>Amount</TableCell>
              <TableCell>Reason</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Requested By</TableCell>
              <TableCell>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {requests.map((request) => (
              <TableRow key={request._id} hover>
                <TableCell>
                  {format(new Date(request.requestDate), 'MMM dd, yyyy')}
                </TableCell>
                <TableCell>
                  <Typography variant="body2">
                    {request.payTo.name} {request.payTo.surname}
                  </Typography>
                </TableCell>
                <TableCell>
                  <Typography variant="body2">
                    {request.property?.name || 'Unknown Property'}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {request.property?.address}
                  </Typography>
                </TableCell>
                <TableCell>
                  <Typography variant="body2" fontWeight="medium">
                    {request.currency} {request.amount.toLocaleString()}
                  </Typography>
                </TableCell>
                <TableCell>
                  <Typography variant="body2" sx={{ maxWidth: 200 }}>
                    {request.reason}
                  </Typography>
                </TableCell>
                <TableCell>
                  <Chip
                    label={getStatusLabel(request.status)}
                    color={getStatusColor(request.status) as any}
                    size="small"
                  />
                </TableCell>
                <TableCell>
                  <Typography variant="body2">
                    {request.requestedBy}
                  </Typography>
                </TableCell>
                <TableCell>
                  <Box display="flex" gap={1}>
                    {request.status === 'pending' && (
                      <>
                        <IconButton
                          size="small"
                          color="success"
                          onClick={() => handleAction('approve', request)}
                          title="Mark as Paid"
                        >
                          <ApproveIcon />
                        </IconButton>
                        <IconButton
                          size="small"
                          color="error"
                          onClick={() => handleAction('reject', request)}
                          title="Reject"
                        >
                          <RejectIcon />
                        </IconButton>
                      </>
                    )}
                    <IconButton
                      size="small"
                      onClick={() => onView(request)}
                      title="View Details"
                    >
                      <ViewIcon />
                    </IconButton>
                    <IconButton
                      size="small"
                      onClick={() => onEdit(request)}
                      title="Edit"
                    >
                      <EditIcon />
                    </IconButton>
                  </Box>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

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

export default PaymentRequests; 