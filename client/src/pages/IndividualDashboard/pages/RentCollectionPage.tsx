import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Grid,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography
} from '@mui/material';
import { AttachMoney } from '@mui/icons-material';
import { useSearchParams } from 'react-router-dom';
import { useCompany } from '../../../contexts/CompanyContext';
import { useAuth } from '../../../contexts/AuthContext';
import PaymentForm from '../../../components/payments/PaymentForm';
import paymentService from '../../../services/paymentService';
import api from '../../../api/axios';
import { Payment, PaymentFormData } from '../../../types/payment';
import { Property } from '../../../types/property';
import { Tenant } from '../../../types/tenant';
import { Lease } from '../../../types/lease';
import { CenteredLoader, PageShell } from '../components/shared';
import { INDIVIDUAL_THEME } from '../theme';
import { money } from '../utils/formatters';
import {
  PortfolioRentStatus,
  PropertyRentStatus,
  derivePortfolioRentStatus,
  getId
} from '../utils/rentCollectionStatus';

function statusChipColor(label: PropertyRentStatus['statusLabel']): 'success' | 'error' {
  return label === 'Overdue' ? 'error' : 'success';
}

function RentCalendar({
  payments,
  portfolio
}: {
  payments: Payment[];
  portfolio: PortfolioRentStatus;
}) {
  const now = new Date();
  const month = now.getMonth();
  const year = now.getFullYear();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const currentMonthKey = `${year}-${String(month + 1).padStart(2, '0')}`;

  const paidDays = new Set(
    payments
      .filter((p) => {
        const d = new Date(p.paymentDate);
        return d.getMonth() === month && d.getFullYear() === year;
      })
      .map((p) => new Date(p.paymentDate).getDate())
  );

  const dueDays = new Set(
    portfolio.properties.flatMap((item) =>
      item.periods
        .filter((period) => period.key === currentMonthKey)
        .map((period) => period.dueDate.getDate())
    )
  );

  const monthOutstanding = portfolio.properties.some((item) =>
    item.overduePeriods.some((period) => period.key === currentMonthKey)
  );
  const monthFullyPaid = portfolio.properties.some((item) =>
    item.periods.some((period) => period.key === currentMonthKey && period.status === 'paid')
  ) && !monthOutstanding;

  return (
    <Card elevation={0} sx={{ border: `1px solid ${INDIVIDUAL_THEME.border}`, borderRadius: 2 }}>
      <CardContent>
        <Typography variant="h6" gutterBottom>Rent Calendar — {now.toLocaleString(undefined, { month: 'long', year: 'numeric' })}</Typography>
        <Grid container spacing={0.5}>
          {days.map((day) => {
            const isPaidDay = paidDays.has(day);
            const isDueDay = dueDays.has(day);
            const isPastOrToday = day <= now.getDate();
            let color: string = INDIVIDUAL_THEME.neutral;
            let label = '';
            if (isPaidDay || (isDueDay && monthFullyPaid)) {
              color = INDIVIDUAL_THEME.success;
              label = 'Paid';
            } else if (isDueDay && isPastOrToday && monthOutstanding) {
              color = INDIVIDUAL_THEME.danger;
              label = 'Overdue';
            } else if (isDueDay && !isPastOrToday) {
              color = INDIVIDUAL_THEME.warning;
              label = 'Due';
            }
            return (
              <Grid item xs={1.7} sm={1.2} md={0.8} key={day}>
                <Box sx={{ textAlign: 'center', p: 0.5, borderRadius: 1, bgcolor: label ? `${color}18` : 'transparent', border: `1px solid ${label ? `${color}40` : INDIVIDUAL_THEME.border}` }}>
                  <Typography variant="caption" fontWeight={700}>{day}</Typography>
                  {label && (
                    <Typography variant="caption" display="block" sx={{ fontSize: '0.6rem', color }}>{label}</Typography>
                  )}
                </Box>
              </Grid>
            );
          })}
        </Grid>
      </CardContent>
    </Card>
  );
}

function PropertyRentStatusCard({ item }: { item: PropertyRentStatus }) {
  return (
    <Card elevation={0} sx={{ border: `1px solid ${INDIVIDUAL_THEME.border}`, borderRadius: 2, height: '100%' }}>
      <CardContent>
        <Stack spacing={1.5}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, alignItems: 'flex-start' }}>
            <Box>
              <Typography fontWeight={700}>{item.propertyName}</Typography>
              <Typography variant="body2" color="text.secondary">{item.tenantName}</Typography>
            </Box>
            <Chip size="small" label={item.statusLabel} color={statusChipColor(item.statusLabel)} />
          </Box>
          <Typography variant="body2" color="text.secondary">
            Lease starts {item.leaseStart.toLocaleDateString()}
          </Typography>
          {item.status === 'overdue' ? (
            <Box>
              <Typography fontWeight={700} color="error.main">{money(item.outstandingTotal)} overdue</Typography>
              <Typography variant="body2" color="text.secondary">
                {item.overduePeriods.map((period) => `${period.label} (${money(period.outstanding)})`).join(', ')}
              </Typography>
            </Box>
          ) : (
            <Typography variant="body2" color="text.secondary">
              {item.status === 'not_started'
                ? 'Lease has not started, so no rent is due yet.'
                : 'All due months on this lease are paid.'}
            </Typography>
          )}
        </Stack>
      </CardContent>
    </Card>
  );
}

export function RentCollectionPage() {
  const { company } = useCompany();
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const prefillPropertyId = searchParams.get('propertyId') || '';
  const autoRecord = searchParams.get('record') === '1';

  const [properties, setProperties] = useState<Property[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [leases, setLeases] = useState<Lease[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showPaymentForm, setShowPaymentForm] = useState(autoRecord);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [downloadingReceiptId, setDownloadingReceiptId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [propertyRows, tenantResult, leaseRows, paymentRows] = await Promise.all([
        api.get('/properties').then((r) => Array.isArray(r.data) ? r.data : r.data?.data || r.data?.properties || []),
        api.get('/tenants', { params: { page: 1, limit: 10000 } }).then((r) => r.data?.tenants || r.data?.data?.tenants || r.data?.data || []),
        api.get('/leases').then((r) => Array.isArray(r.data) ? r.data : r.data?.data || r.data?.leases || []),
        paymentService.getPayments({ paymentType: 'rental' })
      ]);
      setProperties(Array.isArray(propertyRows) ? propertyRows : []);
      setTenants(Array.isArray(tenantResult) ? tenantResult : []);
      setLeases(Array.isArray(leaseRows) ? leaseRows : []);
      setPayments(Array.isArray(paymentRows) ? paymentRows : []);
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Failed to load rent collection data');
    } finally {
      setLoading(false);
    }
  }, []);

  const findMatchingLease = useCallback((formData: PaymentFormData) => {
    const propertyId = String(formData.propertyId || '');
    const tenantId = String(formData.tenantId || '');
    return leases.find((lease: any) => {
      const lp = String(lease.propertyId?._id || lease.propertyId || '');
      const lt = String(lease.tenantId?._id || lease.tenantId || '');
      const status = String(lease.status || '').toLowerCase();
      return lp === propertyId && lt === tenantId && ['active', 'expiring_soon'].includes(status);
    }) || null;
  }, [leases]);

  useEffect(() => { reload(); }, [reload]);

  const handleSubmit = async (formData: PaymentFormData) => {
    try {
      setSaving(true);
      setError(null);
      setSuccess(null);
      const lease = findMatchingLease(formData);
      await paymentService.createPaymentAccountant({
        ...formData,
        paymentType: 'rental',
        leaseId: String(formData.leaseId || lease?._id || ''),
        status: 'completed',
        companyId: company?._id || user?.companyId || formData.companyId
      } as any);
      setSuccess('Rent payment recorded successfully.');
      await reload();
      setShowPaymentForm(false);
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Failed to record rent payment');
    } finally {
      setSaving(false);
    }
  };

  const portfolioStatus = useMemo(
    () => derivePortfolioRentStatus(leases, payments, properties, tenants),
    [leases, payments, properties, tenants]
  );

  const statusDetail = useMemo(() => {
    if (portfolioStatus.label === 'No overdue payments') {
      return portfolioStatus.startedLeaseCount === 0
        ? 'No active lease has reached its start date, so nothing is overdue.'
        : 'There are no overdue rent amounts on active leases.';
    }
    if (portfolioStatus.label === 'Paid up to date') {
      return 'All due months on active leases have been paid.';
    }
    const overdueNames = portfolioStatus.overdueProperties.map((item) => item.propertyName).join(', ');
    return `${money(portfolioStatus.outstandingTotal)} outstanding across ${overdueNames}.`;
  }, [portfolioStatus]);

  const downloadReceipt = async (payment: Payment) => {
    try {
      setError(null);
      setDownloadingReceiptId(payment._id);
      const blob = await paymentService.downloadReceipt(payment._id, company?._id);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `receipt-${payment.referenceNumber || payment._id}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => window.URL.revokeObjectURL(url), 1000);
    } catch (err: any) {
      setError(err?.message || 'Failed to download receipt');
    } finally {
      setDownloadingReceiptId(null);
    }
  };

  if (loading) return <CenteredLoader />;

  return (
    <PageShell
      title="Rent Collection"
      subtitle="Record rent through the shared Mantis payment engine — receipts and references preserved."
      action={!showPaymentForm && (
        <Button variant="contained" startIcon={<AttachMoney />} onClick={() => setShowPaymentForm(true)} sx={{ bgcolor: INDIVIDUAL_THEME.primary }}>
          Record Rent
        </Button>
      )}
    >
      {error && <Alert severity="error">{error}</Alert>}
      {success && <Alert severity="success">{success}</Alert>}

      <Card elevation={0} sx={{ border: `1px solid ${INDIVIDUAL_THEME.border}` }}>
        <CardContent>
          <Stack spacing={1.5}>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'center' }}>
              <Typography variant="body2" color="text.secondary">Payment Status:</Typography>
              <Chip label={portfolioStatus.label} color={portfolioStatus.color} />
              {portfolioStatus.label === 'Overdue' && (
                <Typography fontWeight={700} color="error.main">
                  {money(portfolioStatus.outstandingTotal)} late
                </Typography>
              )}
            </Stack>
            <Typography variant="body2" color="text.secondary">{statusDetail}</Typography>
          </Stack>
        </CardContent>
      </Card>

      {portfolioStatus.overdueProperties.length > 0 && (
        <Card elevation={0} sx={{ border: `1px solid ${INDIVIDUAL_THEME.border}` }}>
          <CardContent>
            <Typography variant="h6" gutterBottom>Late properties</Typography>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Property</TableCell>
                    <TableCell>Tenant</TableCell>
                    <TableCell>Months overdue</TableCell>
                    <TableCell align="right">Amount late</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {portfolioStatus.overdueProperties.map((item) => (
                    <TableRow key={item.leaseId || item.propertyId}>
                      <TableCell>{item.propertyName}</TableCell>
                      <TableCell>{item.tenantName}</TableCell>
                      <TableCell>
                        {item.overduePeriods.map((period) => period.label).join(', ')}
                      </TableCell>
                      <TableCell align="right">{money(item.outstandingTotal)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </CardContent>
        </Card>
      )}

      {portfolioStatus.properties.length > 0 && (
        <Grid container spacing={2}>
          {portfolioStatus.properties.map((item) => (
            <Grid item xs={12} md={6} lg={4} key={item.leaseId || item.propertyId}>
              <PropertyRentStatusCard item={item} />
            </Grid>
          ))}
        </Grid>
      )}

      {showPaymentForm && (
        <PaymentForm
          onSubmit={handleSubmit}
          onCancel={() => setShowPaymentForm(false)}
          properties={properties}
          tenants={tenants}
          loading={saving}
          individualMode
          initialData={prefillPropertyId ? ({ propertyId: prefillPropertyId } as Payment) : undefined}
        />
      )}

      <RentCalendar payments={payments} portfolio={portfolioStatus} />

      <Card elevation={0} sx={{ border: `1px solid ${INDIVIDUAL_THEME.border}` }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>Recent Rent Payments</Typography>
          <Stack spacing={1}>
            {payments.slice(0, 15).map((payment) => {
              const property = properties.find((p) => getId(p._id) === getId(payment.propertyId));
              const tenant = tenants.find((t) => getId(t._id) === getId(payment.tenantId));
              return (
                <Box key={payment._id} sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, py: 1, borderBottom: `1px solid ${INDIVIDUAL_THEME.border}` }}>
                  <Box>
                    <Typography fontWeight={600}>{property?.name || 'Rent payment'}</Typography>
                    <Typography variant="body2" color="text.secondary">
                      {tenant ? `${tenant.firstName} ${tenant.lastName}` : 'Tenant'} | {payment.referenceNumber} | {new Date(payment.paymentDate).toLocaleDateString()}
                    </Typography>
                  </Box>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Typography fontWeight={700}>{money(payment.amount)}</Typography>
                    <Button
                      size="small"
                      onClick={() => downloadReceipt(payment)}
                      disabled={downloadingReceiptId === payment._id}
                    >
                      {downloadingReceiptId === payment._id ? 'Downloading...' : 'Receipt'}
                    </Button>
                  </Stack>
                </Box>
              );
            })}
            {!payments.length && <Typography color="text.secondary">No rent payments recorded yet.</Typography>}
          </Stack>
        </CardContent>
      </Card>
    </PageShell>
  );
}

export default RentCollectionPage;
