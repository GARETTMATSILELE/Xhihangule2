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
import { salesContractService } from '../../services/accountantService';

interface PaymentReceiptProps {
  receipt: any;
  onClose: () => void;
}

const PaymentReceipt: React.FC<PaymentReceiptProps> = ({ receipt, onClose }) => {
  const [paidToDate, setPaidToDate] = useState<number | null>(null);
  const [saleTotal, setSaleTotal] = useState<number | null>(null);
  const [saleCurrency, setSaleCurrency] = useState<string | null>(null);
  const isSale = useMemo(() => (receipt?.paymentType || receipt?.type) === 'sale', [receipt]);
  const groupRef = useMemo(() => receipt?.saleId || receipt?.referenceNumber || receipt?.manualPropertyAddress || '', [receipt]);
  const currency = receipt?.currency || 'USD';
  const isLevy = useMemo(() => (receipt?.paymentType || receipt?.type) === 'levy', [receipt]);
  // Ensure company details presence for print even if backend omitted optional fields
  const safeCompany = useMemo(() => {
    const c = receipt?.company || {};
    return {
      name: c.name || 'Property Management',
      address: c.address || 'Address not available',
      phone: c.phone || 'Phone not available',
      email: c.email || 'Email not available',
      website: c.website,
      registrationNumber: c.registrationNumber,
      tinNumber: c.tinNumber,
      logo: c.logo
    };
  }, [receipt?.company]);

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

  // Prefer server-provided totals first, then contract, then parsed notes
  const serverTotal = typeof receipt?.totalSalePrice === 'number' ? receipt.totalSalePrice : null;
  const serverPaidToDate = typeof receipt?.paidToDate === 'number' ? receipt.paidToDate : null;
  const serverOutstanding = typeof receipt?.outstanding === 'number' ? receipt.outstanding : null;

  const preferredTotalSale = useMemo(() => {
    if (serverTotal != null) return serverTotal;
    if (saleTotal != null) return saleTotal;
    return parsedTotalSale;
  }, [serverTotal, saleTotal, parsedTotalSale]);
  const preferredCurrency = useMemo(() => (saleCurrency || currency), [saleCurrency, currency]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!isSale || !groupRef) return;
      // If server already provided paidToDate, trust it and skip client aggregation
      if (serverPaidToDate != null) {
        setPaidToDate(serverPaidToDate);
        return;
      }
      try {
        const payments: any[] = await paymentService.getSalesPayments();
        const related = (Array.isArray(payments) ? payments : [])
          .filter((p: any) => (p.paymentType === 'sale'))
          .filter((p: any) => (receipt.saleId ? (String(p.saleId) === String(receipt.saleId)) : ((p.referenceNumber && p.referenceNumber === receipt.referenceNumber) || (p.manualPropertyAddress && p.manualPropertyAddress === receipt.manualPropertyAddress))));
        const totalPaid = related.reduce((s: number, p: any) => s + (p.amount || 0), 0);
        if (!cancelled) setPaidToDate(totalPaid);
      } catch {
        if (!cancelled) setPaidToDate(null);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [isSale, groupRef, receipt?.referenceNumber, receipt?.manualPropertyAddress, serverPaidToDate]);

  // Load linked sales contract for accurate totals/currency
  useEffect(() => {
    let cancelled = false;
    const loadSale = async () => {
      if (!isSale) return;
      const id = receipt?.saleId;
      if (!id) return;
      try {
        const sale = await salesContractService.get(String(id));
        if (!cancelled && sale) {
          if (typeof sale.totalSalePrice === 'number') setSaleTotal(sale.totalSalePrice);
          if (sale.currency) setSaleCurrency(sale.currency);
        }
      } catch {
        // ignore; fall back to parsed value from notes
      }
    };
    loadSale();
    return () => { cancelled = true; };
  }, [isSale, receipt?.saleId]);

  const outstanding = useMemo(() => {
    if (serverOutstanding != null) return serverOutstanding;
    if (preferredTotalSale == null || paidToDate == null) return null;
    return Math.max(0, preferredTotalSale - paidToDate);
  }, [serverOutstanding, preferredTotalSale, paidToDate]);
  const handlePrint = () => {
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      const saleTotalsHtml = (isSale && preferredTotalSale != null) ? `
                <div class="detail-row"><span class="label">Total Sale Price:</span><span class="value">${preferredCurrency} ${(preferredTotalSale || 0).toLocaleString()}</span></div>
                <div class="detail-row"><span class="label">Paid To Date:</span><span class="value">${preferredCurrency} ${(paidToDate || 0).toLocaleString()}</span></div>
                <div class="detail-row"><span class="label">Outstanding:</span><span class="value">${preferredCurrency} ${((preferredTotalSale || 0) - (paidToDate || 0) > 0 ? ((preferredTotalSale || 0) - (paidToDate || 0)) : 0).toLocaleString()}</span></div>
              ` : '';
      printWindow.document.write(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>${isLevy ? 'Levy Payment Receipt' : 'Payment Receipt'} - ${receipt.receiptNumber}</title>
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
              .receipt-title {
                font-size: 16px;
                font-weight: bold;
                margin-top: 6px;
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
              .two-col-row {
                display: flex;
                gap: 16px;
              }
              .detail-row-inline {
                display: flex;
                justify-content: space-between;
                flex: 1;
                margin: 8px 0;
                border-bottom: 1px solid #eee;
                padding-bottom: 5px;
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
                ${safeCompany.logo ? `<img src="data:image/png;base64,${safeCompany.logo}" alt="Company Logo" class="company-logo">` : ''}
                <h1>${safeCompany.name}</h1>
                <p>${safeCompany.address}</p>
                <p>Phone: ${safeCompany.phone} | Email: ${safeCompany.email}</p>
                ${safeCompany.website ? `<p>Website: ${safeCompany.website}</p>` : ''}
                ${safeCompany.registrationNumber ? `<p>Reg. No: ${safeCompany.registrationNumber}</p>` : ''}
                ${safeCompany.tinNumber ? `<p>Tax No: ${safeCompany.tinNumber}</p>` : ''}
                <div class="receipt-title">${isLevy ? 'Levy Payment Receipt' : 'Payment Receipt'}</div>
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
                  <span class="label">${isSale ? 'Buyer' : 'Tenant'}:</span>
                  <span class="value">${receipt.buyerName || receipt.manualTenantName || (receipt.tenant ? receipt.tenant.firstName + ' ' + receipt.tenant.lastName : (receipt.tenantName || 'N/A'))}</span>
                </div>
                ${isSale && (receipt.sellerName || receipt.manualPropertyAddress) ? `
                <div class="detail-row">
                  <span class="label">Seller:</span>
                  <span class="value">${receipt.sellerName || ''}</span>
                </div>` : ''}
                <div class="detail-row">
                  <span class="label">Agent:</span>
                  <span class="value">${(receipt.agent?.firstName || receipt.processedBy?.firstName || '')} ${(receipt.agent?.lastName || receipt.processedBy?.lastName || '') || 'N/A'}</span>
                </div>
                <div class="two-col-row">
                  <div class="detail-row-inline">
                    <span class="label">Processed By:</span>
                    <span class="value">${receipt.processedBy?.firstName} ${receipt.processedBy?.lastName || 'N/A'}</span>
                  </div>
                  ${isSale && (outstanding != null) ? `
                  <div class="detail-row-inline">
                    <span class="label">Balance:</span>
                    <span class="value">${preferredCurrency} ${(outstanding || 0).toLocaleString()}</span>
                  </div>` : ''}
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
                imgProps={{ decoding: 'async', loading: 'lazy' }}
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
          <Typography variant="subtitle2" color="textSecondary">{(receipt.paymentType || receipt.type) === 'sale' ? 'Buyer' : 'Tenant'}</Typography>
          <Typography variant="body1">
            {receipt.buyerName || receipt.manualTenantName || (receipt.tenant ? `${receipt.tenant.firstName} ${receipt.tenant.lastName}` : (receipt.tenantName || 'N/A'))}
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