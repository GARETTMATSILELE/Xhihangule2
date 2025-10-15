import React from 'react';
import { Box, Typography, Button, Grid, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow } from '@mui/material';
import { Print as PrintIcon } from '@mui/icons-material';
import { useCompany } from '../contexts/CompanyContext';
import './InvoicePrint.css';

interface InvoiceItem {
  code: string;
  description: string;
  taxPercentage: number;
  netPrice: number;
}

interface ClientDetails {
  name: string;
  address: string;
  tinNumber?: string;
  vatNumber?: string;
}

interface Invoice {
  _id: string;
  property: string;
  client: ClientDetails | string; // Support both old (string) and new (object) formats
  subtotal: number;
  discount: number;
  amountExcludingTax: number;
  taxPercentage: number;
  taxAmount: number;
  totalAmount: number;
  dueDate: Date;
  items: InvoiceItem[];
  type: 'rental' | 'sale';
  saleDetails?: string;
  status: 'paid' | 'unpaid' | 'overdue';
  createdAt: Date;
  companyId: string;
  selectedBankAccount?: {
    accountNumber: string;
    accountName: string;
    accountType: 'USD NOSTRO' | 'ZiG';
    bankName: string;
    branchName: string;
    branchCode: string;
  } | null;
  fiscalData?: {
    qrContent?: string; // payload to encode in QR
    fiscalNumber?: string;
    deviceSerial?: string;
    documentNumber?: string;
    signature?: string;
  } | null;
}

interface InvoicePrintProps {
  invoice: Invoice;
}

const InvoicePrint: React.FC<InvoicePrintProps> = ({ invoice }) => {
  const { company } = useCompany();

  const handlePrint = () => {
    window.print();
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const getStatusClass = (status: string) => {
    switch (status) {
      case 'paid':
        return 'status-paid';
      case 'overdue':
        return 'status-overdue';
      default:
        return 'status-unpaid';
    }
  };

  // Helper function to get client details with backward compatibility
  const getClientDetails = () => {
    if (typeof invoice.client === 'string') {
      // Old format - client is just a string
      return {
        name: invoice.client,
        address: 'N/A',
        tinNumber: undefined,
        vatNumber: undefined
      };
    } else {
      // New format - client is an object
      return invoice.client;
    }
  };

  const clientDetails = getClientDetails();

  return (
    <div className="invoice-container">
      {/* Print Button - Hidden when printing */}
      <Box className="no-print" sx={{ mb: 2 }}>
        <Button
          variant="contained"
          startIcon={<PrintIcon />}
          onClick={handlePrint}
        >
          Print Tax Invoice
        </Button>
      </Box>

      {/* Invoice Content */}
      <div className="invoice-page">
        {/* Header */}
        <div className="invoice-header">
          {/* Company Details */}
          <div className="company-info">
            {company?.logo && (
              <img 
                src={`data:image/png;base64,${company.logo}`}
                alt={`${company.name} Logo`}
                className="company-logo"
              />
            )}
            <Typography variant="h4" gutterBottom sx={{ fontWeight: 'bold' }} className="company-name">
              {company?.name || 'Company Name'}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {company?.address || 'Company Address'}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Phone: {company?.phone || 'N/A'}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Email: {company?.email || 'N/A'}
            </Typography>
            {company?.website && (
              <Typography variant="body2" color="text.secondary">
                Website: {company.website}
              </Typography>
            )}
            {/* Tax/Registration details at top alongside company details */}
            {(company?.registrationNumber || company?.tinNumber || (company as any)?.vatNumber) && (
              <Box sx={{ mt: 1 }}>
                {company?.registrationNumber && (
                  <Typography variant="body2" color="text.secondary">
                    Reg. No: {company.registrationNumber}
                  </Typography>
                )}
                {company?.tinNumber && (
                  <Typography variant="body2" color="text.secondary">
                    Tax No: {company.tinNumber}
                  </Typography>
                )}
                {(company as any)?.vatNumber && (
                  <Typography variant="body2" color="text.secondary">
                    VAT No: {(company as any).vatNumber}
                  </Typography>
                )}
              </Box>
            )}
          </div>

          {/* Invoice Details */}
          <div className="invoice-details">
            <Typography variant="h5" gutterBottom sx={{ fontWeight: 'bold', color: '#1976d2' }}>
              TAX INVOICE
            </Typography>
            <div className="invoice-number">
              Invoice #: {invoice._id.slice(-8).toUpperCase()}
            </div>
            <Typography variant="body2" color="text.secondary">
              Date: {formatDate(invoice.createdAt)}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Due Date: {formatDate(invoice.dueDate)}
            </Typography>
            <div className={`status-badge ${getStatusClass(invoice.status)}`}>
              {invoice.status.toUpperCase()}
            </div>

            {/* Fiscal QR Code: show QR if available, else placeholder */}
            <div className="fiscal-qr">
              {invoice.fiscalData?.qrContent ? (
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=${encodeURIComponent(invoice.fiscalData.qrContent)}`}
                  alt="Fiscal QR Code"
                  className="fiscal-qr-box"
                />
              ) : (
                <div className="fiscal-qr-box">
                  <Typography variant="caption" color="text.secondary">
                    Fiscal QR Code
                  </Typography>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Client Information */}
        <div className="client-section">
          <Typography variant="h6" gutterBottom>
            Bill To:
          </Typography>
          <Grid container spacing={2}>
            <Grid item xs={12} md={6}>
              <Typography variant="body1" sx={{ fontWeight: 'bold', mb: 1 }}>
                {clientDetails.name}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                {clientDetails.address}
              </Typography>
            </Grid>
            <Grid item xs={12} md={6}>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
                <strong>TIN Number:</strong> {clientDetails.tinNumber || 'N/A'}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                <strong>VAT Number:</strong> {clientDetails.vatNumber || 'N/A'}
              </Typography>
            </Grid>
          </Grid>
        </div>

        {/* Invoice Items Table */}
        <div className="invoice-content">
          <Typography variant="h6" gutterBottom>
            Invoice Items:
          </Typography>
          <TableContainer component={Paper} sx={{ mb: 3 }}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 'bold', width: '15%' }}>Code</TableCell>
                  <TableCell sx={{ fontWeight: 'bold', width: '50%' }}>Description</TableCell>
                  <TableCell sx={{ fontWeight: 'bold', width: '15%', textAlign: 'center' }}>Tax %</TableCell>
                  <TableCell sx={{ fontWeight: 'bold', width: '20%', textAlign: 'right' }}>Net Price</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {invoice.items?.map((item, index) => (
                  <TableRow key={index}>
                    <TableCell>{item.code}</TableCell>
                    <TableCell>{item.description}</TableCell>
                    <TableCell sx={{ textAlign: 'center' }}>{item.taxPercentage}%</TableCell>
                    <TableCell sx={{ textAlign: 'right' }}>{formatCurrency(item.netPrice)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </div>

        {/* Tax Breakdown */}
        <div className="tax-breakdown">
          <Grid container spacing={2} sx={{ mb: 2 }}>
            <Grid item xs={12} md={12}>
              <Box sx={{ 
                border: '1px solid #e0e0e0', 
                borderRadius: 1, 
                p: 2,
                bgcolor: '#fafafa'
              }}>
                <Typography variant="h6" gutterBottom sx={{ borderBottom: '1px solid #e0e0e0', pb: 1 }}>
                  Tax Breakdown
                </Typography>
                
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                  <Typography variant="body2">Subtotal:</Typography>
                  <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                    {formatCurrency(invoice.subtotal)}
                  </Typography>
                </Box>
                
                {invoice.discount > 0 && (
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                    <Typography variant="body2">Discount:</Typography>
                    <Typography variant="body2" sx={{ fontWeight: 'bold', color: 'red' }}>
                      -{formatCurrency(invoice.discount)}
                    </Typography>
                  </Box>
                )}
                
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                  <Typography variant="body2">Amount Excluding Tax:</Typography>
                  <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                    {formatCurrency(invoice.amountExcludingTax)}
                  </Typography>
                </Box>
                
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                  <Typography variant="body2">VAT ({invoice.taxPercentage}%):</Typography>
                  <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                    {formatCurrency(invoice.taxAmount)}
                  </Typography>
                </Box>
                
                <Box sx={{ 
                  display: 'flex', 
                  justifyContent: 'space-between', 
                  mt: 2, 
                  pt: 1, 
                  borderTop: '2px solid #1976d2' 
                }}>
                  <Typography variant="h6">Total Amount:</Typography>
                  <Typography variant="h6" sx={{ fontWeight: 'bold', color: '#1976d2' }}>
                    {formatCurrency(invoice.totalAmount)}
                  </Typography>
                </Box>
              </Box>
            </Grid>
          </Grid>

          {/* Bank Account Details BELOW totals */}
          {invoice.selectedBankAccount && (
            <Box sx={{ 
              border: '1px solid #e0e0e0', 
              borderRadius: 1, 
              p: 2,
              bgcolor: '#f9f9f9',
              mt: 2
            }}>
              <Typography variant="h6" gutterBottom sx={{ borderBottom: '1px solid #e0e0e0', pb: 1 }}>
                Bank Account Details
              </Typography>
              <Typography variant="body2" sx={{ mb: 0.5 }}>
                <strong>Account Name:</strong> {invoice.selectedBankAccount.accountName}
              </Typography>
              <Typography variant="body2" sx={{ mb: 0.5 }}>
                <strong>Account Number:</strong> {invoice.selectedBankAccount.accountNumber}
              </Typography>
              <Typography variant="body2" sx={{ mb: 0.5 }}>
                <strong>Account Type:</strong> {invoice.selectedBankAccount.accountType}
              </Typography>
              <Typography variant="body2" sx={{ mb: 0.5 }}>
                <strong>Bank Name:</strong> {invoice.selectedBankAccount.bankName}
              </Typography>
              <Typography variant="body2" sx={{ mb: 0.5 }}>
                <strong>Branch Name:</strong> {invoice.selectedBankAccount.branchName}
              </Typography>
              <Typography variant="body2">
                <strong>Branch Code:</strong> {invoice.selectedBankAccount.branchCode}
              </Typography>
            </Box>
          )}
        </div>

        {/* Additional Details */}
        {invoice.saleDetails && invoice.type === 'sale' && (
          <div className="invoice-content">
            <Typography variant="h6" gutterBottom>
              Sale Details:
            </Typography>
            <Typography variant="body1">
              {invoice.saleDetails}
            </Typography>
          </div>
        )}

        {/* Footer */}
        <div className="invoice-footer">
          <Typography variant="body2" color="text.secondary">
            Thank you for your business!
          </Typography>
          {company && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              {company.name} | Reg: {company.registrationNumber} | Tax: {company.tinNumber}
            </Typography>
          )}
          {invoice.fiscalData && (
            <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
              {invoice.fiscalData.fiscalNumber ? `Fiscal No: ${invoice.fiscalData.fiscalNumber}  ` : ''}
              {invoice.fiscalData.deviceSerial ? `Device: ${invoice.fiscalData.deviceSerial}  ` : ''}
              {invoice.fiscalData.documentNumber ? `Doc No: ${invoice.fiscalData.documentNumber}  ` : ''}
            </Typography>
          )}
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            This is a valid tax invoice for VAT purposes
          </Typography>
        </div>
      </div>
    </div>
  );
};

export default InvoicePrint; 