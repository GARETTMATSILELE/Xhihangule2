import React, { useState, useEffect } from 'react';
import {
  Box,
  Paper,
  Typography,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  MenuItem,
  FormControl,
  InputLabel,
  Select,
  Snackbar,
  Alert,
} from '@mui/material';
import {
  Edit as EditIcon,
  Delete as DeleteIcon,
  Add as AddIcon,
  Print as PrintIcon,
} from '@mui/icons-material';
import { useLeaseService } from '../../services/leaseService';
import paymentService from '../../services/paymentService';
import publicApi from '../../api/publicApi';
import { Payment, PaymentMethod } from '../../types/payment';
import { Tenant } from '../../types/tenant';
import { Lease } from '../../types/lease';
import { Property } from '../../types/property';
import PaymentReceipt from '../../components/payments/PaymentReceipt';

export const PaymentList: React.FC = () => {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [leases, setLeases] = useState<Lease[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [open, setOpen] = useState(false);
  const [editingPayment, setEditingPayment] = useState<Payment | null>(null);
  const [formData, setFormData] = useState({
    leaseId: '',
    amount: 0,
    paymentDate: new Date(),
    paymentMethod: 'cash' as PaymentMethod,
    status: 'pending' as 'pending' | 'completed' | 'failed',
    companyId: '',
  });
  const [message, setMessage] = useState<{ type: string; text: string } | null>(null);
  const [receiptDialog, setReceiptDialog] = useState(false);
  const [selectedReceipt, setSelectedReceipt] = useState<any>(null);
  const [loadingReceipt, setLoadingReceipt] = useState(false);

  const leaseService = useLeaseService();

  useEffect(() => {
    fetchPayments();
    fetchTenants();
    fetchLeases();
    fetchProperties();
  }, []);

  const fetchPayments = async () => {
    try {
      const response = await publicApi.get('/payments/public');
      setPayments(response.data.data || []);
    } catch (error) {
      console.error('Error fetching payments:', error);
    }
  };

  const fetchTenants = async () => {
    try {
      const response = await publicApi.get('/tenants/public');
      setTenants(response.data.tenants || []);
    } catch (error) {
      console.error('Error fetching tenants:', error);
    }
  };

  const fetchLeases = async () => {
    try {
      const leasesData = await leaseService.getAllPublic();
      setLeases(leasesData);
    } catch (error) {
      console.error('Error fetching leases:', error);
    }
  };

  const fetchProperties = async () => {
    try {
      const response = await publicApi.get('/properties/public-filtered');
      setProperties(Array.isArray(response.data) ? response.data : response.data.data || []);
    } catch (error) {
      console.error('Error fetching properties:', error);
    }
  };

  const handleOpen = (payment?: Payment) => {
    if (payment) {
      setEditingPayment(payment);
      setFormData({
        leaseId: payment.leaseId || '',
        amount: payment.amount || 0,
        paymentDate: payment.paymentDate ? new Date(payment.paymentDate) : new Date(),
        paymentMethod: payment.paymentMethod || 'cash',
        status: payment.status || 'pending',
        companyId: payment.companyId || '',
      });
    } else {
      setEditingPayment(null);
      setFormData({
        leaseId: '',
        amount: 0,
        paymentDate: new Date(),
        paymentMethod: 'cash',
        status: 'pending',
        companyId: '',
      });
    }
    setOpen(true);
  };

  const handleClose = () => {
    setOpen(false);
    setEditingPayment(null);
  };

  const handlePrintReceipt = async (payment: Payment) => {
    try {
      setLoadingReceipt(true);
      const receipt = await paymentService.getPaymentReceipt(payment._id);
      setSelectedReceipt(receipt);
      setReceiptDialog(true);
    } catch (error) {
      console.error('Error fetching receipt:', error);
      setMessage({
        type: 'error',
        text: 'Failed to load receipt'
      });
    } finally {
      setLoadingReceipt(false);
    }
  };

  const handleCloseReceipt = () => {
    setReceiptDialog(false);
    setSelectedReceipt(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingPayment) {
        console.warn('Payment updates are not currently supported');
        setMessage({
          type: 'error',
          text: 'Payment updates are not currently supported'
        });
      } else {
        await paymentService.createPaymentPublic(formData);
        setMessage({
          type: 'success',
          text: 'Payment created successfully'
        });
      }
      handleClose();
      fetchPayments();
    } catch (error) {
      console.error('Error saving payment:', error);
      setMessage({
        type: 'error',
        text: 'Failed to save payment'
      });
    }
  };

  const handleDelete = async (id: string) => {
    if (window.confirm('Are you sure you want to delete this payment?')) {
      try {
        console.warn('Payment deletion is not currently supported');
        setMessage({
          type: 'error',
          text: 'Payment deletion is not currently supported'
        });
      } catch (error) {
        console.error('Error deleting payment:', error);
        setMessage({
          type: 'error',
          text: 'Failed to delete payment'
        });
      }
    }
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 3 }}>
        <Typography variant="h4">Payments</Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => handleOpen()}
        >
          Add Payment
        </Button>
      </Box>

      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Tenant</TableCell>
              <TableCell>Property</TableCell>
              <TableCell>Amount</TableCell>
              <TableCell>Date</TableCell>
              <TableCell>Method</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {payments.map((payment) => (
              <TableRow key={payment._id}>
                <TableCell>
                  {`${
                    tenants.find((t) => t._id === leases.find(l => l._id === payment.leaseId)?.tenantId)?.firstName
                  } ${
                    tenants.find((t) => t._id === leases.find(l => l._id === payment.leaseId)?.tenantId)?.lastName
                  }`}
                </TableCell>
                <TableCell>
                  {properties.find(
                    (p) =>
                      p._id ===
                      leases.find((l) => l._id === payment.leaseId)?.propertyId
                  )?.name}
                </TableCell>
                <TableCell>${payment.amount || 0}</TableCell>
                <TableCell>
                  {payment.paymentDate ? new Date(payment.paymentDate).toLocaleDateString() : 'No date'}
                </TableCell>
                <TableCell>{(payment.paymentMethod || 'unknown').replace('_', ' ').toUpperCase()}</TableCell>
                <TableCell>{payment.status || 'unknown'}</TableCell>
                <TableCell>
                  <IconButton 
                    onClick={() => handlePrintReceipt(payment)}
                    disabled={loadingReceipt}
                    title="Print Receipt"
                  >
                    <PrintIcon />
                  </IconButton>
                  <IconButton onClick={() => handleOpen(payment)} title="Edit Payment">
                    <EditIcon />
                  </IconButton>
                  <IconButton onClick={() => handleDelete(payment._id)} title="Delete Payment">
                    <DeleteIcon />
                  </IconButton>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog open={open} onClose={handleClose} maxWidth="md" fullWidth>
        <DialogTitle>
          {editingPayment ? 'Edit Payment' : 'Add Payment'}
        </DialogTitle>
        <DialogContent>
          <Box component="form" onSubmit={handleSubmit} sx={{ mt: 2 }}>
            <TextField
              fullWidth
              select
              label="Lease"
              value={formData.leaseId}
              onChange={e => setFormData({ ...formData, leaseId: e.target.value })}
              margin="normal"
              required
            >
              {leases.map(lease => (
                <MenuItem key={lease._id} value={lease._id}>
                  {properties.find(p => p._id === lease.propertyId)?.name} - {tenants.find(t => t._id === lease.tenantId)?.firstName} {tenants.find(t => t._id === lease.tenantId)?.lastName}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              fullWidth
              type="number"
              label="Amount"
              value={formData.amount}
              onChange={e => setFormData({ ...formData, amount: parseFloat(e.target.value) })}
              margin="normal"
              required
              inputProps={{ min: 0 }}
            />
            <TextField
              fullWidth
              type="date"
              label="Date"
              value={formData.paymentDate.toISOString().split('T')[0]}
              onChange={e => setFormData({ ...formData, paymentDate: new Date(e.target.value) })}
              margin="normal"
              required
              InputLabelProps={{ shrink: true }}
            />
            <TextField
              fullWidth
              select
              label="Payment Method"
              value={formData.paymentMethod}
              onChange={e => setFormData({ ...formData, paymentMethod: e.target.value as PaymentMethod })}
              margin="normal"
              required
            >
              <MenuItem value="cash">Cash</MenuItem>
              <MenuItem value="bank_transfer">Bank Transfer</MenuItem>
              <MenuItem value="credit_card">Credit Card</MenuItem>
              <MenuItem value="mobile_money">Mobile Money</MenuItem>
            </TextField>
            <TextField
              fullWidth
              select
              label="Status"
              value={formData.status}
              onChange={e => setFormData({ ...formData, status: e.target.value as 'pending' | 'completed' | 'failed' })}
              margin="normal"
              required
            >
              <MenuItem value="pending">Pending</MenuItem>
              <MenuItem value="completed">Completed</MenuItem>
              <MenuItem value="failed">Failed</MenuItem>
            </TextField>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClose}>Cancel</Button>
          <Button onClick={handleSubmit} variant="contained">
            {editingPayment ? 'Save' : 'Add'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Receipt Dialog */}
      <Dialog 
        open={receiptDialog} 
        onClose={handleCloseReceipt} 
        maxWidth="md" 
        fullWidth
        PaperProps={{
          sx: { maxHeight: '90vh' }
        }}
      >
        <DialogContent>
          {selectedReceipt && (
            <PaymentReceipt 
              receipt={selectedReceipt} 
              onClose={handleCloseReceipt} 
            />
          )}
        </DialogContent>
      </Dialog>

      <Snackbar
        open={!!message}
        autoHideDuration={6000}
        onClose={() => setMessage(null)}
      >
        <Alert
          onClose={() => setMessage(null)}
          severity={message?.type === 'success' ? 'success' : 'error'}
          sx={{ width: '100%' }}
        >
          {message?.text}
        </Alert>
      </Snackbar>
    </Box>
  );
}; 