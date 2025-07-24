import React, { useState, useEffect } from 'react';
import {
  Box, Typography, Button, TextField, FormControl, InputLabel, Select, MenuItem, Grid, Dialog, DialogTitle, DialogContent, DialogActions, SelectChangeEvent
} from '@mui/material';
import { apiService } from '../../api';

const WrittenInvoicesPage: React.FC = () => {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [open, setOpen] = useState(false);
  const [invoiceType, setInvoiceType] = useState<'rental' | 'sale'>('rental');
  const [form, setForm] = useState({
    property: '',
    amount: '',
    dueDate: '',
    client: '',
    description: '',
    saleDetails: '',
  });
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loadingInvoices, setLoadingInvoices] = useState(true);

  useEffect(() => {
    const fetchInvoices = async () => {
      setLoadingInvoices(true);
      try {
        const data = await apiService.getInvoices();
        setInvoices(data);
      } catch (err) {
        // Optionally handle error
      } finally {
        setLoadingInvoices(false);
      }
    };
    fetchInvoices();
  }, []);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value);
  };

  const handleStatusChange = (e: SelectChangeEvent) => {
    setStatus(e.target.value as string);
  };

  const handleOpen = () => setOpen(true);
  const handleClose = () => setOpen(false);

  const handleTypeChange = (e: SelectChangeEvent) => {
    setInvoiceType(e.target.value as 'rental' | 'sale');
  };

  const handleFormChange = (e: React.ChangeEvent<HTMLInputElement | { name?: string; value: unknown }>) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name as string]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await apiService.createInvoice({
        ...form,
        type: invoiceType,
        status: 'unpaid',
      });
      setSuccess(true);
      setForm({ property: '', amount: '', dueDate: '', client: '', description: '', saleDetails: '' });
      setOpen(false);
    } catch (err) {
      setSuccess(false);
      setLoading(false);
      const error = err as any;
      alert('Failed to add invoice: ' + (error?.response?.data?.message || error?.message || 'Unknown error'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4" gutterBottom>
          Invoices
        </Typography>
        <Button variant="contained" color="primary" onClick={handleOpen}>
          Add Invoice
        </Button>
      </Box>
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={12} md={6}>
          <FormControl fullWidth>
            <InputLabel>Status</InputLabel>
            <Select
              value={status}
              label="Status"
              onChange={handleStatusChange}
            >
              <MenuItem value="all">All</MenuItem>
              <MenuItem value="paid">Paid</MenuItem>
              <MenuItem value="unpaid">Unpaid</MenuItem>
              <MenuItem value="overdue">Overdue</MenuItem>
            </Select>
          </FormControl>
        </Grid>
        <Grid item xs={12} md={6}>
          <TextField
            fullWidth
            label="Search Invoices"
            value={search}
            onChange={handleSearchChange}
            variant="outlined"
          />
        </Grid>
      </Grid>
      {/* Invoice list/table */}
      {loadingInvoices ? (
        <div>Loading invoices...</div>
      ) : (
        <Box sx={{ overflowX: 'auto', mb: 3 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ borderBottom: '1px solid #ccc', padding: '8px' }}>Property</th>
                <th style={{ borderBottom: '1px solid #ccc', padding: '8px' }}>Client</th>
                <th style={{ borderBottom: '1px solid #ccc', padding: '8px' }}>Amount</th>
                <th style={{ borderBottom: '1px solid #ccc', padding: '8px' }}>Due Date</th>
                <th style={{ borderBottom: '1px solid #ccc', padding: '8px' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => (
                <tr key={inv._id}>
                  <td style={{ borderBottom: '1px solid #eee', padding: '8px' }}>{inv.property}</td>
                  <td style={{ borderBottom: '1px solid #eee', padding: '8px' }}>{inv.client}</td>
                  <td style={{ borderBottom: '1px solid #eee', padding: '8px' }}>{inv.amount}</td>
                  <td style={{ borderBottom: '1px solid #eee', padding: '8px' }}>{new Date(inv.dueDate).toLocaleDateString()}</td>
                  <td style={{ borderBottom: '1px solid #eee', padding: '8px' }}>{inv.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Box>
      )}
      <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
        <DialogTitle>Add Invoice</DialogTitle>
        <form onSubmit={handleSubmit}>
          <DialogContent>
            <FormControl fullWidth sx={{ mb: 2 }}>
              <InputLabel>Invoice Type</InputLabel>
              <Select
                value={invoiceType}
                label="Invoice Type"
                onChange={handleTypeChange}
              >
                <MenuItem value="rental">Property Rental</MenuItem>
                <MenuItem value="sale">Property Sale</MenuItem>
              </Select>
            </FormControl>
            <TextField
              fullWidth
              label="Property"
              name="property"
              value={form.property}
              onChange={handleFormChange}
              sx={{ mb: 2 }}
              required
            />
            <TextField
              fullWidth
              label="Client"
              name="client"
              value={form.client}
              onChange={handleFormChange}
              sx={{ mb: 2 }}
              required
            />
            <TextField
              fullWidth
              label="Amount"
              name="amount"
              type="number"
              value={form.amount}
              onChange={handleFormChange}
              sx={{ mb: 2 }}
              required
            />
            <TextField
              fullWidth
              label="Due Date"
              name="dueDate"
              type="date"
              value={form.dueDate}
              onChange={handleFormChange}
              sx={{ mb: 2 }}
              InputLabelProps={{ shrink: true }}
              required
            />
            <TextField
              fullWidth
              label="Description"
              name="description"
              value={form.description}
              onChange={handleFormChange}
              sx={{ mb: 2 }}
              multiline
              rows={2}
            />
            {invoiceType === 'sale' && (
              <TextField
                fullWidth
                label="Sale Details"
                name="saleDetails"
                value={form.saleDetails}
                onChange={handleFormChange}
                sx={{ mb: 2 }}
                multiline
                rows={2}
              />
            )}
          </DialogContent>
          <DialogActions>
            <Button onClick={handleClose}>Cancel</Button>
            <Button type="submit" variant="contained" color="primary" disabled={loading}>
              {loading ? 'Saving...' : 'Create Invoice'}
            </Button>
          </DialogActions>
        </form>
      </Dialog>
    </Box>
  );
};

export default WrittenInvoicesPage; 