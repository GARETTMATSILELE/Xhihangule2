import React, { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Typography,
  Paper,
  Grid,
  Divider,
  Button,
  IconButton,
  Avatar,
} from '@mui/material';
import { Print as PrintIcon, Close as CloseIcon } from '@mui/icons-material';
import paymentService from '../../services/paymentService';

interface PaymentReceiptProps {
  receipt: any;
  onClose: () => void;
}

const PaymentReceipt: React.FC<PaymentReceiptProps> = ({ receipt, onClose }) => {
  const [paidToDate, setPaidToDate] = useState<number | null>(null);
  const isSale = useMemo(() => (receipt?.paymentType || receipt?.type) === 'introduction', [receipt]);
  const groupRef = useMemo(() => receipt?.saleId || receipt?.referenceNumber || receipt?.manualPropertyAddress || '', [receipt]);
  const currency = receipt?.currency || 'USD';

  // Parse total sale price from notes if present (from SalesPaymentForm notes)
  const parsedTotalSale = useMemo(() => {
    const text = String(receipt?.notes || '');
    const match = text.match(/Total\s+Sale\s+Price\s+([0-9,.]+)/i);
    if (match && match[1]) {
      const n = Number(match[1].replace(/,/g, ''));
      return Number.isFinite(n) ? n : null;
    }
    return null;
  }, [receipt?.notes]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!isSale || !groupRef) return;
      try {
        const payments: any[] = await paymentService.getPayments();
        const related = (Array.isArray(payments) ? payments : [])
          .filter((p: any) => (p.paymentType === 'introduction'))
          .filter((p: any) => (receipt.saleId ? (String(p.saleId) === String(receipt.saleId)) : ((p.referenceNumber && p.referenceNumber === receipt.referenceNumber) || (p.manualPropertyAddress && p.manualPropertyAddress === receipt.manualPropertyAddress))));
        const totalPaid = related.reduce((s: number, p: any) => s + (p.amount || 0), 0);
        if (!cancelled) setPaidToDate(totalPaid);
      } catch {
        if (!cancelled) setPaidToDate(null);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [isSale, groupRef, receipt?.referenceNumber, receipt?.manualPropertyAddress]);

  const outstanding = useMemo(() => {
    if (parsedTotalSale == null || paidToDate == null) return null;
    return Math.max(0, parsedTotalSale - paidToDate);
  }, [parsedTotalSale, paidToDate]);
  const handlePrint = () => {
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      const saleTotalsHtml = (isSale && parsedTotalSale != null) ? `
                <div class="detail-row"><span class="label">Total Sale Price:</span><span class="value">${currency} ${(parsedTotalSale || 0).toLocaleString()}</span></div>
                <div class="detail-row"><span class="label">Paid To Date:</span><span class="value">${currency} ${(paidToDate || 0).toLocaleString()}</span></div>
                <div class="detail-row"><span class="label">Outstanding:</span><span class="value">${currency} ${((parsedTotalSale || 0) - (paidToDate || 0) > 0 ? ((parsedTotalSale || 0) - (paidToDate || 0)) : 0).toLocaleString()}</span></div>
              ` : '';
      printWindow.document.write(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>Payment Receipt - ${receipt.receiptNumber}</title>
            <style>
              body {
                font-family: Arial, sans-serif;
                margin: 20px;
                line-height: 1.6;
              }
              .receipt {
                max-width: 600px;
                margin: 0 auto;
                border: 1px solid #ccc;
                padding: 20px;
              }
              .header {
                text-align: center;
                border-bottom: 2px solid #333;
                padding-bottom: 10px;
                margin-bottom: 20px;
              }
              .company-logo {
                max-width: 150px;
                max-height: 60px;
                margin-bottom: 10px;
                display: block;
                margin-left: auto;
                margin-right: auto;
              }
              .receipt-number {
                font-size: 18px;
                font-weight: bold;
                color: #333;
              }
              .amount {
                font-size: 24px;
                font-weight: bold;
                color: #2e7d32;
                text-align: center;
                margin: 20px 0;
              }
              .details {
                margin: 20px 0;
              }
              .detail-row {
                display: flex;
                justify-content: space-between;
                margin: 8px 0;
                border-bottom: 1px solid #eee;
                padding-bottom: 5px;
              }
              .label {
                font-weight: bold;
                color: #666;
              }
              .value {
                color: #333;
              }
              .footer {
                margin-top: 30px;
                text-align: center;
                font-size: 12px;
                color: #666;
              }
              @media print {
                body { margin: 0; }
                .receipt { border: none; }
              }
            </style>
          </head>
          <body>
            <div class="receipt">
              <div class="header">
                ${receipt.company?.logo ? `<img src="data:image/png;base64,${receipt.company.logo}" alt="Company Logo" class="company-logo">` : ''}
                <h1>${receipt.company?.name || 'Property Management'}</h1>
                <p>${receipt.company?.address || 'Address not available'}</p>
                <p>Phone: ${receipt.company?.phone || 'Phone not available'} | Email: ${receipt.company?.email || 'Email not available'}</p>
                ${receipt.company?.website ? `<p>Website: ${receipt.company.website}</p>` : ''}
                ${receipt.company?.registrationNumber ? `<p>Reg. No: ${receipt.company.registrationNumber}</p>` : ''}
                ${receipt.company?.tinNumber ? `<p>Tax No: ${receipt.company.tinNumber}</p>` : ''}
                <div class="receipt-number">Receipt #${receipt.receiptNumber}</div>
              </div>
              
              <div class="amount">
                $${receipt.amount?.toFixed(2) || '0.00'}
              </div>
              
              <div class="details">
                <div class="detail-row">
                  <span class="label">Payment Date:</span>
                  <span class="value">${new Date(receipt.paymentDate).toLocaleDateString()}</span>
                </div>
                <div class="detail-row">
                  <span class="label">Payment Method:</span>
                  <span class="value">${receipt.paymentMethod?.replace('_', ' ').toUpperCase() || 'N/A'}</span>
                </div>
                <div class="detail-row">
                  <span class="label">Status:</span>
                  <span class="value">${receipt.status?.toUpperCase() || 'N/A'}</span>
                </div>
                <div class="detail-row">
                  <span class="label">Property:</span>
                  <span class="value">${receipt.manualPropertyAddress || receipt.property?.name || 'N/A'}</span>
                </div>
                <div class="detail-row">
                  <span class="label">Tenant:</span>
                  <span class="value">${receipt.manualTenantName || (receipt.tenant ? receipt.tenant.firstName + ' ' + receipt.tenant.lastName : (receipt.tenantName || 'N/A'))}</span>
                </div>
                <div class="detail-row">
                  <span class="label">Agent:</span>
                  <span class="value">${(receipt.agent?.firstName || receipt.processedBy?.firstName || '')} ${(receipt.agent?.lastName || receipt.processedBy?.lastName || '') || 'N/A'}</span>
                </div>
                <div class="detail-row">
                  <span class="label">Processed By:</span>
                  <span class="value">${receipt.processedBy?.firstName} ${receipt.processedBy?.lastName || 'N/A'}</span>
                </div>
                ${saleTotalsHtml}
                ${receipt.notes ? `
                <div class="detail-row">
                  <span class="label">Notes:</span>
                  <span class="value">${receipt.notes}</span>
                </div>
                ` : ''}
              </div>
              
              <div class="footer">
                <p>Thank you for your payment!</p>
                <p>Generated on ${new Date().toLocaleString()}</p>
              </div>
            </div>
          </body>
        </html>
      `);
      printWindow.document.close();
      printWindow.print();
    }
  };

  return (
    <Paper elevation={3} sx={{ p: 3, maxWidth: 600, mx: 'auto', my: 2 }}>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
        <Typography variant="h5" component="h2">
          Payment Receipt
        </Typography>
        <Box>
          <IconButton onClick={handlePrint} color="primary" title="Print Receipt">
            <PrintIcon />
          </IconButton>
          <IconButton onClick={onClose} color="secondary" title="Close">
            <CloseIcon />
          </IconButton>
        </Box>
      </Box>

      <Divider sx={{ mb: 2 }} />

      {/* Company Information */}
      {receipt.company && (
        <Box mb={3} p={2} bgcolor="grey.50" borderRadius={1}>
          {/* Company Logo */}
          {receipt.company.logo && (
            <Box sx={{ display: 'flex', justifyContent: 'center', mb: 2 }}>
              <Avatar
                src={`data:image/png;base64,${receipt.company.logo}`}
                sx={{ 
                  width: 120, 
                  height: 60,
                  borderRadius: 1,
                  objectFit: 'contain'
                }}
                variant="rounded"
              />
            </Box>
          )}
          
          <Typography variant="h6" gutterBottom align="center">
            {receipt.company.name}
          </Typography>
          <Typography variant="body2" color="textSecondary" paragraph align="center">
            {receipt.company.address}
          </Typography>
          <Grid container spacing={1}>
            <Grid item xs={12} sm={6}>
              <Typography variant="body2">
                <strong>Phone:</strong> {receipt.company.phone}
              </Typography>
            </Grid>
            <Grid item xs={12} sm={6}>
              <Typography variant="body2">
                <strong>Email:</strong> {receipt.company.email}
              </Typography>
            </Grid>
            {receipt.company.website && (
              <Grid item xs={12} sm={6}>
                <Typography variant="body2">
                  <strong>Website:</strong> {receipt.company.website}
                </Typography>
              </Grid>
            )}
            {receipt.company.registrationNumber && (
              <Grid item xs={12} sm={6}>
                <Typography variant="body2">
                  <strong>Reg. No:</strong> {receipt.company.registrationNumber}
                </Typography>
              </Grid>
            )}
            {receipt.company.tinNumber && (
              <Grid item xs={12} sm={6}>
                <Typography variant="body2">
                  <strong>Tax No:</strong> {receipt.company.tinNumber}
                </Typography>
              </Grid>
            )}
          </Grid>
        </Box>
      )}

      <Box textAlign="center" mb={3}>
        <Typography variant="h4" color="primary" fontWeight="bold">
          ${receipt.amount?.toFixed(2) || '0.00'}
        </Typography>
        <Typography variant="h6" color="textSecondary">
          Receipt #{receipt.receiptNumber}
        </Typography>
      </Box>

      <Grid container spacing={2}>
        <Grid item xs={6}>
          <Typography variant="subtitle2" color="textSecondary">Payment Date</Typography>
          <Typography variant="body1">
            {new Date(receipt.paymentDate).toLocaleDateString()}
          </Typography>
        </Grid>
        <Grid item xs={6}>
          <Typography variant="subtitle2" color="textSecondary">Payment Method</Typography>
          <Typography variant="body1">
            {(receipt.paymentMethod || '').replace('_', ' ').toUpperCase()}
          </Typography>
        </Grid>
        <Grid item xs={6}>
          <Typography variant="subtitle2" color="textSecondary">Status</Typography>
          <Typography variant="body1" color={receipt.status === 'completed' ? 'success.main' : 'warning.main'}>
            {(receipt.status || '').toUpperCase()}
          </Typography>
        </Grid>
        <Grid item xs={6}>
          <Typography variant="subtitle2" color="textSecondary">Property</Typography>
          <Typography variant="body1">
            {receipt.manualPropertyAddress || receipt.property?.name || 'N/A'}
          </Typography>
        </Grid>
        <Grid item xs={6}>
          <Typography variant="subtitle2" color="textSecondary">{(receipt.paymentType || receipt.type) === 'introduction' ? 'Buyer' : 'Tenant'}</Typography>
          <Typography variant="body1">
            {receipt.manualTenantName || (receipt.tenant ? `${receipt.tenant.firstName} ${receipt.tenant.lastName}` : (receipt.tenantName || 'N/A'))}
          </Typography>
        </Grid>
        <Grid item xs={6}>
          <Typography variant="subtitle2" color="textSecondary">Agent</Typography>
          <Typography variant="body1">
            {(receipt.agent?.firstName || receipt.processedBy?.firstName || '')} {(receipt.agent?.lastName || receipt.processedBy?.lastName || '') || 'N/A'}
          </Typography>
        </Grid>
        <Grid item xs={12}>
          <Typography variant="subtitle2" color="textSecondary">Processed By</Typography>
          <Typography variant="body1">
            {receipt.processedBy?.firstName} {receipt.processedBy?.lastName || 'N/A'}
          </Typography>
        </Grid>
        {receipt.notes && (
          <Grid item xs={12}>
            <Typography variant="subtitle2" color="textSecondary">Notes</Typography>
            <Typography variant="body1">{receipt.notes}</Typography>
          </Grid>
        )}
      </Grid>

      <Divider sx={{ my: 2 }} />

      <Box textAlign="center">
        <Typography variant="body2" color="textSecondary">
          Thank you for your payment!
        </Typography>
        <Typography variant="caption" color="textSecondary">
          Generated on {new Date().toLocaleString()}
        </Typography>
      </Box>
    </Paper>
  );
};

export default PaymentReceipt; 