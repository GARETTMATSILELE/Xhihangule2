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

function RentCalendar({ payments }: { payments: Payment[] }) {
  const now = new Date();
  const month = now.getMonth();
  const year = now.getFullYear();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  const paidDays = new Set(
    payments
      .filter((p) => {
        const d = new Date(p.paymentDate);
        return d.getMonth() === month && d.getFullYear() === year;
      })
      .map((p) => new Date(p.paymentDate).getDate())
  );

  return (
    <Card elevation={0} sx={{ border: `1px solid ${INDIVIDUAL_THEME.border}`, borderRadius: 2 }}>
      <CardContent>
        <Typography variant="h6" gutterBottom>Rent Calendar — {now.toLocaleString(undefined, { month: 'long', year: 'numeric' })}</Typography>
        <Grid container spacing={0.5}>
          {days.map((day) => {
            const isPast = day < now.getDate();
            const isPaid = paidDays.has(day);
            let color: string = INDIVIDUAL_THEME.neutral;
            let label = 'Upcoming';
            if (isPaid) { color = INDIVIDUAL_THEME.success; label = 'Paid'; }
            else if (isPast) { color = INDIVIDUAL_THEME.danger; label = 'Overdue'; }
            else if (day === now.getDate()) { color = INDIVIDUAL_THEME.warning; label = 'Pending'; }
            return (
              <Grid item xs={1.7} sm={1.2} md={0.8} key={day}>
                <Box sx={{ textAlign: 'center', p: 0.5, borderRadius: 1, bgcolor: `${color}18`, border: `1px solid ${color}40` }}>
                  <Typography variant="caption" fontWeight={700}>{day}</Typography>
                  <Typography variant="caption" display="block" sx={{ fontSize: '0.6rem', color }}>{label}</Typography>
                </Box>
              </Grid>
            );
          })}
        </Grid>
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

  const statusSummary = useMemo(() => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthPayments = payments.filter((p) => new Date(p.paymentDate) >= monthStart);
    const totalPaid = monthPayments.reduce((s, p) => s + Number(p.amount || 0), 0);
    const expected = leases.filter((l: any) => ['active', 'expiring_soon'].includes(String(l.status || '').toLowerCase())).reduce((s, l: any) => s + Number(l.rentAmount || l.monthlyRent || 0), 0);
    if (totalPaid >= expected && expected > 0) return { label: 'Paid', color: 'success' as const };
    if (totalPaid > 0) return { label: 'Partially Paid', color: 'warning' as const };
    if (now.getDate() > 5) return { label: 'Overdue', color: 'error' as const };
    if (totalPaid > expected) return { label: 'Advance Payment', color: 'info' as const };
    return { label: 'Pending', color: 'default' as const };
  }, [payments, leases]);

  const downloadReceipt = async (payment: Payment) => {
    const blob = await paymentService.downloadReceipt(payment._id, company?._id);
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `receipt-${payment.referenceNumber || payment._id}.pdf`;
    link.click();
    window.URL.revokeObjectURL(url);
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

      <Stack direction="row" spacing={1} alignItems="center">
        <Typography variant="body2" color="text.secondary">Payment Status:</Typography>
        <Chip label={statusSummary.label} color={statusSummary.color} />
      </Stack>

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

      <RentCalendar payments={payments} />

      <Card elevation={0} sx={{ border: `1px solid ${INDIVIDUAL_THEME.border}` }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>Recent Rent Payments</Typography>
          <Stack spacing={1}>
            {payments.slice(0, 15).map((payment) => {
              const property = properties.find((p) => String(p._id) === String(payment.propertyId));
              const tenant = tenants.find((t) => String(t._id) === String(payment.tenantId));
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
                    <Button size="small" onClick={() => downloadReceipt(payment)}>Receipt</Button>
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
