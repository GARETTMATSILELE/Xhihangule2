import React, { useState, useEffect } from 'react';
import {
  Box, Typography, Button, TextField, FormControl, InputLabel, Select, MenuItem, Grid, Dialog, DialogTitle, DialogContent, DialogActions, SelectChangeEvent, IconButton, Tooltip, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper, Divider
} from '@mui/material';
import { Print as PrintIcon, Add as AddIcon, Delete as DeleteIcon } from '@mui/icons-material';
import { apiService } from '../../api';
import { useCompany } from '../../contexts/CompanyContext';
import InvoicePrint from '../../components/InvoicePrint';
import { calculateInvoiceTotals, formatCurrency } from '../../utils/money';

interface InvoiceItem {
  code?: string;
  description: string;
  taxPercentage: number;
  netPrice: number;
  quantity?: number;
  unitPrice?: number;
}

interface ClientDetails {
  name: string;
  address: string;
  tinNumber?: string;
  vatNumber?: string;
  bpNumber?: string;
}

const WrittenInvoicesPage: React.FC = () => {
  const { company } = useCompany();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [open, setOpen] = useState(false);
  const [printDialogOpen, setPrintDialogOpen] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<any>(null);
  const [invoiceType, setInvoiceType] = useState<'rental' | 'sale'>('rental');
  const [taxPercentage, setTaxPercentage] = useState(15);
  const [discount, setDiscount] = useState(0);
  const [selectedBankAccount, setSelectedBankAccount] = useState<string>('');
  const [clientDetails, setClientDetails] = useState<ClientDetails>({
    name: '',
    address: '',
    tinNumber: '',
    vatNumber: '',
    bpNumber: ''
  });
  const [items, setItems] = useState<InvoiceItem[]>([
    { description: '', taxPercentage: 15, netPrice: 0, quantity: 1, unitPrice: 0 }
  ]);
  const [invoiceCurrency, setInvoiceCurrency] = useState<'USD'|'ZiG'|'ZAR'>('USD');
  const [form, setForm] = useState({
    property: '',
    dueDate: '',
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
  const handleClose = () => {
    setOpen(false);
    // Reset form
    setForm({ property: '', dueDate: '', saleDetails: '' });
    setClientDetails({
      name: '',
      address: '',
      tinNumber: '',
      vatNumber: '',
      bpNumber: ''
    });
    setItems([{ description: '', taxPercentage: 15, netPrice: 0 }]);
    setDiscount(0);
    setTaxPercentage(15);
    setSelectedBankAccount('');
    setInvoiceCurrency('USD');
  };

  const handleTypeChange = (e: SelectChangeEvent) => {
    setInvoiceType(e.target.value as 'rental' | 'sale');
  };

  const handleFormChange = (e: React.ChangeEvent<HTMLInputElement | { name?: string; value: unknown }>) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name as string]: value }));
  };

  const handleClientChange = (field: keyof ClientDetails, value: string) => {
    setClientDetails(prev => ({ ...prev, [field]: value }));
  };

  const handleItemChange = (index: number, field: keyof InvoiceItem, value: any) => {
    const newItems = [...items];
    newItems[index] = { ...newItems[index], [field]: value };
    setItems(newItems);
  };

  const addItem = () => {
    setItems([...items, { description: '', taxPercentage: taxPercentage, netPrice: 0, quantity: 1, unitPrice: 0 }]);
  };

  const removeItem = (index: number) => {
    if (items.length > 1) {
      setItems(items.filter((_, i) => i !== index));
    }
  };

  const calculateTotals = () => {
    return calculateInvoiceTotals(items, discount, taxPercentage);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      // Validate client details
      const requiredClientFields = ['name', 'address'];
      if (!clientDetails.name || clientDetails.name.trim() === '') {
        alert('Please fill in client name');
        return;
      }
      if (!clientDetails.address || clientDetails.address.trim() === '') {
        alert('Please fill in client address');
        return;
      }

      // Validate items
      if (items.some(item => !item.description || (item.unitPrice ?? item.netPrice) <= 0 || (item.quantity ?? 1) <= 0)) {
        alert('Please fill in all item descriptions and ensure quantity and unit price are greater than 0');
        return;
      }

      const itemsForApi = items.map(it => {
        const qty = it.quantity ?? 1;
        const unit = it.unitPrice ?? it.netPrice ?? 0;
        const netPrice = qty * unit;
        return { ...it, netPrice };
      });

      const invoiceData = {
        ...form,
        type: invoiceType,
        status: 'unpaid',
        client: clientDetails,
        items: itemsForApi,
        discount,
        taxPercentage,
        currency: invoiceCurrency,
        selectedBankAccount: selectedBankAccount !== '' ? company?.bankAccounts[parseInt(selectedBankAccount)] : null,
      };

      await apiService.createInvoice(invoiceData);
      setSuccess(true);
      handleClose();
      // Refresh invoices list
      const data = await apiService.getInvoices();
      setInvoices(data);
    } catch (err) {
      setSuccess(false);
      setLoading(false);
      const error = err as any;
      alert('Failed to add invoice: ' + (error?.response?.data?.message || error?.message || 'Unknown error'));
    } finally {
      setLoading(false);
    }
  };

  const handlePrintInvoice = (invoice: any) => {
    setSelectedInvoice(invoice);
    setPrintDialogOpen(true);
  };

  const handleClosePrintDialog = () => {
    setPrintDialogOpen(false);
    setSelectedInvoice(null);
  };

  // Filter invoices based on search and status
  const filteredInvoices = invoices.filter(invoice => {
    // Handle both old (string) and new (object) client formats
    const clientName = typeof invoice.client === 'string' 
      ? invoice.client 
      : invoice.client?.name || '';
    
    const matchesSearch = 
      invoice.property.toLowerCase().includes(search.toLowerCase()) ||
      clientName.toLowerCase().includes(search.toLowerCase());
    
    const matchesStatus = status === 'all' || invoice.status === status;
    
    return matchesSearch && matchesStatus;
  });

  const totals = calculateTotals();

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4" gutterBottom>
          Tax Invoices
        </Typography>
        <Button variant="contained" color="primary" onClick={handleOpen}>
          Add Tax Invoice
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
                <th style={{ borderBottom: '1px solid #ccc', padding: '8px' }}>Total Amount</th>
                <th style={{ borderBottom: '1px solid #ccc', padding: '8px' }}>Due Date</th>
                <th style={{ borderBottom: '1px solid #ccc', padding: '8px' }}>Status</th>
                <th style={{ borderBottom: '1px solid #ccc', padding: '8px' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredInvoices.map((inv) => (
                <tr key={inv._id}>
                  <td style={{ borderBottom: '1px solid #eee', padding: '8px' }}>{inv.property}</td>
                  <td style={{ borderBottom: '1px solid #eee', padding: '8px' }}>
                    {typeof inv.client === 'string' ? inv.client : inv.client?.name || 'N/A'}
                  </td>
                  <td style={{ borderBottom: '1px solid #eee', padding: '8px' }}>
                    ${inv.totalAmount?.toLocaleString() || '0'}
                  </td>
                  <td style={{ borderBottom: '1px solid #eee', padding: '8px' }}>
                    {new Date(inv.dueDate).toLocaleDateString()}
                  </td>
                  <td style={{ borderBottom: '1px solid #eee', padding: '8px' }}>
                    <span style={{
                      padding: '4px 8px',
                      borderRadius: '4px',
                      fontSize: '12px',
                      fontWeight: 'bold',
                      backgroundColor: 
                        inv.status === 'paid' ? '#e8f5e8' :
                        inv.status === 'overdue' ? '#ffeaea' : '#fff3e0',
                      color: 
                        inv.status === 'paid' ? '#2e7d32' :
                        inv.status === 'overdue' ? '#d32f2f' : '#f57c00'
                    }}>
                      {inv.status.toUpperCase()}
                    </span>
                  </td>
                  <td style={{ borderBottom: '1px solid #eee', padding: '8px' }}>
                    <Tooltip title="Print Tax Invoice">
                      <IconButton
                        size="small"
                        onClick={() => handlePrintInvoice(inv)}
                        sx={{ color: '#1976d2' }}
                      >
                        <PrintIcon />
                      </IconButton>
                    </Tooltip>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Box>
      )}

      {/* Add Invoice Dialog */}
      <Dialog open={open} onClose={handleClose} maxWidth="lg" fullWidth>
        <DialogTitle>Add Tax Invoice</DialogTitle>
        <form onSubmit={handleSubmit}>
          <DialogContent>
            {/* Invoice Type and Tax Settings */}
            <Grid container spacing={2} sx={{ mb: 3 }}>
              <Grid item xs={12} md={6}>
                <FormControl fullWidth>
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
              </Grid>
              <Grid item xs={12} md={3}>
                <TextField
                  fullWidth
                  label="Tax Percentage (%)"
                  type="number"
                  value={taxPercentage}
                  onChange={(e) => setTaxPercentage(Number(e.target.value))}
                  inputProps={{ min: 0, max: 100, step: 0.01 }}
                />
              </Grid>
              <Grid item xs={12} md={3}>
                <FormControl fullWidth>
                  <InputLabel>Currency</InputLabel>
                  <Select
                    value={invoiceCurrency}
                    label="Currency"
                    onChange={(e) => setInvoiceCurrency(e.target.value as any)}
                  >
                    <MenuItem value="USD">USD</MenuItem>
                    <MenuItem value="ZiG">ZiG</MenuItem>
                    <MenuItem value="ZAR">Rand (ZAR)</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
            </Grid>

            {/* Client Details Section */}
            <Typography variant="h6" sx={{ mb: 2, color: '#1976d2' }}>
              Client Details
            </Typography>
            <Grid container spacing={2} sx={{ mb: 3 }}>
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  label="Client Name"
                  value={clientDetails.name}
                  onChange={(e) => handleClientChange('name', e.target.value)}
                  required
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  label="TIN Number"
                  value={clientDetails.tinNumber}
                  onChange={(e) => handleClientChange('tinNumber', e.target.value)}
                />
              </Grid>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="Client Address"
                  value={clientDetails.address}
                  onChange={(e) => handleClientChange('address', e.target.value)}
                  multiline
                  rows={2}
                  required
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  label="VAT Number"
                  value={clientDetails.vatNumber}
                  onChange={(e) => handleClientChange('vatNumber', e.target.value)}
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  label="BP Number"
                  value={clientDetails.bpNumber}
                  onChange={(e) => handleClientChange('bpNumber', e.target.value)}
                />
              </Grid>
            </Grid>

            <Divider sx={{ my: 2 }} />

            {/* Invoice Details Section */}
            <Typography variant="h6" sx={{ mb: 2, color: '#1976d2' }}>
              Invoice Details
            </Typography>
            <Grid container spacing={2} sx={{ mb: 3 }}>
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  label="Property"
                  name="property"
                  value={form.property}
                  onChange={handleFormChange}
                  required
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  label="Due Date"
                  name="dueDate"
                  type="date"
                  value={form.dueDate}
                  onChange={handleFormChange}
                  InputLabelProps={{ shrink: true }}
                  required
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  label="Discount"
                  type="number"
                  value={discount}
                  onChange={(e) => setDiscount(Number(e.target.value))}
                  inputProps={{ min: 0, step: 0.01 }}
                />
              </Grid>
            </Grid>

            {/* Bank Account Selection */}
            {company?.bankAccounts && company.bankAccounts.length > 0 && (
              <>
                <Divider sx={{ my: 2 }} />
                <Typography variant="h6" sx={{ mb: 2, color: '#1976d2' }}>
                  Bank Account Details
                </Typography>
                <Grid container spacing={2} sx={{ mb: 3 }}>
                  <Grid item xs={12} md={6}>
                    <FormControl fullWidth>
                      <InputLabel>Select Bank Account (Optional)</InputLabel>
                      <Select
                        value={selectedBankAccount}
                        label="Select Bank Account (Optional)"
                        onChange={(e) => setSelectedBankAccount(e.target.value)}
                      >
                        <MenuItem value="">
                          <em>No bank account selected</em>
                        </MenuItem>
                        {company.bankAccounts.map((account, index) => (
                          <MenuItem key={index} value={index.toString()}>
                            {account.accountName} - {account.accountNumber} ({account.accountType})
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  </Grid>
                  {selectedBankAccount !== '' && company.bankAccounts[parseInt(selectedBankAccount)] && (
                    <Grid item xs={12} md={6}>
                      <Box sx={{ 
                        border: '1px solid #e0e0e0', 
                        borderRadius: 1, 
                        p: 2, 
                        bgcolor: '#f9f9f9' 
                      }}>
                        <Typography variant="subtitle2" gutterBottom>
                          Selected Bank Account:
                        </Typography>
                        <Typography variant="body2" sx={{ mb: 0.5 }}>
                          <strong>Account Name:</strong> {company.bankAccounts[parseInt(selectedBankAccount)].accountName}
                        </Typography>
                        <Typography variant="body2" sx={{ mb: 0.5 }}>
                          <strong>Account Number:</strong> {company.bankAccounts[parseInt(selectedBankAccount)].accountNumber}
                        </Typography>
                        <Typography variant="body2" sx={{ mb: 0.5 }}>
                          <strong>Account Type:</strong> {company.bankAccounts[parseInt(selectedBankAccount)].accountType}
                        </Typography>
                        <Typography variant="body2" sx={{ mb: 0.5 }}>
                          <strong>Bank Name:</strong> {company.bankAccounts[parseInt(selectedBankAccount)].bankName}
                        </Typography>
                        <Typography variant="body2" sx={{ mb: 0.5 }}>
                          <strong>Branch:</strong> {company.bankAccounts[parseInt(selectedBankAccount)].branchName}
                        </Typography>
                        <Typography variant="body2">
                          <strong>Branch Code:</strong> {company.bankAccounts[parseInt(selectedBankAccount)].branchCode}
                        </Typography>
                      </Box>
                    </Grid>
                  )}
                </Grid>
              </>
            )}

            {/* Items Section */}
            <Typography variant="h6" sx={{ mb: 2, color: '#1976d2' }}>
              Invoice Items
            </Typography>
            <TableContainer component={Paper} sx={{ mb: 2 }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Description</TableCell>
                    <TableCell align="center">Qty</TableCell>
                    <TableCell align="right">Unit Price</TableCell>
                    <TableCell align="center">Tax %</TableCell>
                    <TableCell align="right">Line Total</TableCell>
                    <TableCell align="center">Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {items.map((item, index) => (
                    <TableRow key={index}>
                      <TableCell>
                        <TextField
                          fullWidth
                          size="small"
                          value={item.description}
                          onChange={(e) => handleItemChange(index, 'description', e.target.value)}
                          placeholder="Item description"
                        />
                      </TableCell>
                      <TableCell align="center">
                        <TextField
                          size="small"
                          type="number"
                          value={item.quantity ?? 1}
                          onChange={(e) => handleItemChange(index, 'quantity', Number(e.target.value))}
                          inputProps={{ min: 1, step: 1 }}
                          sx={{ width: 90 }}
                        />
                      </TableCell>
                      <TableCell align="right">
                        <TextField
                          size="small"
                          type="number"
                          value={item.unitPrice ?? item.netPrice}
                          onChange={(e) => handleItemChange(index, 'unitPrice', Number(e.target.value))}
                          inputProps={{ min: 0, step: 0.01 }}
                          sx={{ width: 120 }}
                        />
                      </TableCell>
                      <TableCell align="center">
                        <TextField
                          size="small"
                          type="number"
                          value={item.taxPercentage}
                          onChange={(e) => handleItemChange(index, 'taxPercentage', Number(e.target.value))}
                          inputProps={{ min: 0, max: 100, step: 0.01 }}
                          sx={{ width: 80 }}
                        />
                      </TableCell>
                      <TableCell align="right">
                        {(() => {
                          const qty = item.quantity ?? 1;
                          const unit = item.unitPrice ?? item.netPrice ?? 0;
                          const line = qty * unit;
                          return formatCurrency(line, invoiceCurrency);
                        })()}
                      </TableCell>
                      <TableCell align="center">
                        <IconButton
                          size="small"
                          onClick={() => removeItem(index)}
                          disabled={items.length === 1}
                        >
                          <DeleteIcon />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>

            <Button
              startIcon={<AddIcon />}
              onClick={addItem}
              variant="outlined"
              sx={{ mb: 2 }}
            >
              Add Item
            </Button>

            {/* Totals Preview */}
            <Box sx={{ 
              border: '1px solid #e0e0e0', 
              borderRadius: 1, 
              p: 2, 
              bgcolor: '#fafafa',
              mt: 2
            }}>
              <Typography variant="h6" gutterBottom>
                Totals Preview
              </Typography>
              <Grid container spacing={1}>
                <Grid item xs={6}>
                  <Typography variant="body2">Subtotal:</Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                    {formatCurrency(totals.subtotal, invoiceCurrency)}
                  </Typography>
                </Grid>
                {discount > 0 && (
                  <>
                    <Grid item xs={6}>
                      <Typography variant="body2">Discount:</Typography>
                    </Grid>
                    <Grid item xs={6}>
                      <Typography variant="body2" sx={{ fontWeight: 'bold', color: 'red' }}>
                        -{formatCurrency(discount, invoiceCurrency)}
                      </Typography>
                    </Grid>
                  </>
                )}
                <Grid item xs={6}>
                  <Typography variant="body2">Amount Excluding Tax:</Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                    {formatCurrency(totals.amountExcludingTax, invoiceCurrency)}
                  </Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="body2">VAT ({taxPercentage}%):</Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                    {formatCurrency(totals.taxAmount, invoiceCurrency)}
                  </Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="h6">Total Amount:</Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="h6" sx={{ fontWeight: 'bold', color: '#1976d2' }}>
                    {formatCurrency(totals.totalAmount, invoiceCurrency)}
                  </Typography>
                </Grid>
              </Grid>
            </Box>

            {invoiceType === 'sale' && (
              <TextField
                fullWidth
                label="Sale Details"
                name="saleDetails"
                value={form.saleDetails}
                onChange={handleFormChange}
                sx={{ mb: 2, mt: 2 }}
                multiline
                rows={2}
              />
            )}
          </DialogContent>
          <DialogActions>
            <Button onClick={handleClose}>Cancel</Button>
            <Button type="submit" variant="contained" color="primary" disabled={loading}>
              {loading ? 'Saving...' : 'Create Tax Invoice'}
            </Button>
          </DialogActions>
        </form>
      </Dialog>

      {/* Print Invoice Dialog */}
      <Dialog 
        open={printDialogOpen} 
        onClose={handleClosePrintDialog} 
        maxWidth="lg" 
        fullWidth
        PaperProps={{
          sx: {
            height: '90vh',
            '@media print': {
              height: 'auto',
              boxShadow: 'none'
            }
          }
        }}
      >
        <DialogTitle sx={{ '@media print': { display: 'none' } }}>
          Print Tax Invoice
          <Button 
            onClick={handleClosePrintDialog}
            sx={{ position: 'absolute', right: 8, top: 8 }}
          >
            Close
          </Button>
        </DialogTitle>
        <DialogContent sx={{ p: 0, '@media print': { p: 0 } }}>
          {selectedInvoice && (
            <InvoicePrint invoice={selectedInvoice} />
          )}
        </DialogContent>
      </Dialog>
    </Box>
  );
};

export default WrittenInvoicesPage; 