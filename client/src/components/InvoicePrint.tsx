import React, { useState } from 'react';
import { Box, Typography, Button, Grid, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow } from '@mui/material';
import { Print as PrintIcon } from '@mui/icons-material';
import { useCompany } from '../contexts/CompanyContext';
import './InvoicePrint.css';

interface InvoiceItem {
  code: string;
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

interface Invoice {
  _id: string;
  property: string;
  client: ClientDetails | string; // Support both old (string) and new (object) formats
  currency?: 'USD' | 'ZiG' | 'ZAR';
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
    // Preferred: image or URL provided by fiscal machine
    qrImage?: string; // full data URL or absolute URL
    qrImageBase64?: string; // raw base64 image data from device
    qrUrl?: string; // absolute URL served by device/integrator
    // Legacy placeholder field (no longer used to generate QR):
    qrContent?: string;
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

  const deriveCurrency = () => {
    // Prefer explicit invoice currency if present, otherwise derive from bank account, fallback to USD
    if (invoice.currency === 'USD' || invoice.currency === 'ZiG' || invoice.currency === 'ZAR') return invoice.currency;
    const acctType = invoice.selectedBankAccount?.accountType;
    if (acctType === 'USD NOSTRO') return 'USD';
    if (acctType === 'ZiG') return 'ZiG';
    return 'USD';
  };

  const currencyCode = deriveCurrency();

  const formatCurrency = (amount: number) => {
    if (currencyCode === 'USD') {
      return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
    }
    if (currencyCode === 'ZAR') {
      return new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' }).format(amount);
    }
    // ZiG formatting (no official ISO code in Intl), prefix with label
    return `ZiG ${new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount)}`;
  };

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const formatDateTime = (date: Date) => {
    const d = new Date(date);
    return `${d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })} ${d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;
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

  // Derive QR image source strictly from what the fiscal machine provided
  const qrImageSrc: string | undefined =
    (invoice.fiscalData as any)?.qrImage
      || ((invoice.fiscalData as any)?.qrImageBase64 ? `data:image/png;base64,${(invoice.fiscalData as any).qrImageBase64}` : undefined)
      || (invoice.fiscalData as any)?.qrUrl;

  const [qrError, setQrError] = useState(false);

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
            {(company?.registrationNumber || company?.tinNumber || (company as any)?.vatNumber || (company as any)?.bpNumber) && (
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
                {(company as any)?.bpNumber && (
                  <Typography variant="body2" color="text.secondary">
                    BP No: {(company as any).bpNumber}
                  </Typography>
                )}
              </Box>
            )}
          </div>

          {/* Invoice Details */}
          <div className="invoice-details">
            <Typography variant="h5" gutterBottom sx={{ fontWeight: 'bold', color: '#1976d2' }}>
              FISCAL TAX INVOICE
            </Typography>
            <div className="invoice-number">
              Invoice #: {invoice.fiscalData?.documentNumber ? invoice.fiscalData.documentNumber : invoice._id.slice(-8).toUpperCase()}
            </div>
            <Typography variant="body2" color="text.secondary">
              Date/Time of Supply: {formatDateTime(invoice.createdAt)}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Due Date: {formatDate(invoice.dueDate)}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Currency: {currencyCode}
            </Typography>
            <div className={`status-badge ${getStatusClass(invoice.status)}`}>
              {invoice.status.toUpperCase()}
            </div>

            {/* Fiscal QR Code: only show if an image/URL is provided by the fiscal device */}
            <div className="fiscal-qr">
              {qrImageSrc && !qrError ? (
                <img
                  src={qrImageSrc}
                  alt="Fiscal QR Code"
                  className="fiscal-qr-box"
                  onError={() => setQrError(true)}
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
              <Typography variant="body2" color="text.secondary">
                <strong>BP Number:</strong> {clientDetails.bpNumber || 'N/A'}
              </Typography>
            </Grid>
          </Grid>
        </div>

        {/* Invoice Items Table */}
        <div className="invoice-content line-items-block no-gap-below">
          <Typography variant="h6" gutterBottom>
            Invoice Items:
          </Typography>
          <TableContainer component={Paper} sx={{ mb: 1 }}>
            <Table className="items-table">
              <TableHead>
                <TableRow>
                  <TableCell className="code-cell" sx={{ fontWeight: 'bold', width: '12%' }}>Code</TableCell>
                  <TableCell sx={{ fontWeight: 'bold', width: '38%' }}>Description</TableCell>
                  <TableCell sx={{ fontWeight: 'bold', width: '10%', textAlign: 'center' }}>Qty</TableCell>
                  <TableCell sx={{ fontWeight: 'bold', width: '15%', textAlign: 'right' }}>Unit Price</TableCell>
                  <TableCell sx={{ fontWeight: 'bold', width: '10%', textAlign: 'center' }}>Tax %</TableCell>
                  <TableCell sx={{ fontWeight: 'bold', width: '15%', textAlign: 'right' }}>Line Total</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {invoice.items?.map((item, index) => (
                  <TableRow key={index}>
                    <TableCell className="code-value">{item.code}</TableCell>
                    <TableCell>{item.description}</TableCell>
                    <TableCell sx={{ textAlign: 'center' }}>{item.quantity ?? 1}</TableCell>
                    <TableCell sx={{ textAlign: 'right' }}>{formatCurrency(item.unitPrice ?? item.netPrice)}</TableCell>
                    <TableCell sx={{ textAlign: 'center' }}>{item.taxPercentage}%</TableCell>
                    <TableCell sx={{ textAlign: 'right' }}>{formatCurrency((item.quantity ?? 1) * (item.unitPrice ?? item.netPrice))}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
          {/* Inline Tax Breakdown (print-visible) */}
          <Box className="tax-breakdown-inline" sx={{ p: 2, pt: 1, border: '1px solid #e0e0e0', borderRadius: 1, bgcolor: '#fafafa', mt: 0 }}>
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
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 2, pt: 1, borderTop: '2px solid #1976d2' }}>
              <Typography variant="h6">Total Amount:</Typography>
              <Typography variant="h6" sx={{ fontWeight: 'bold', color: '#1976d2' }}>
                {formatCurrency(invoice.totalAmount)}
              </Typography>
            </Box>
          </Box>

          {/* Bank Account Details (moved here to ensure it prints on page with totals) */}
          {invoice.selectedBankAccount && (
            <Box className="bank-details" sx={{ 
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
              {invoice.fiscalData.signature ? `Signature: ${invoice.fiscalData.signature}` : ''}
            </Typography>
          )}
        </div>
      </div>
    </div>
  );
};

export default InvoicePrint; 