import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Box,
  Typography,
  Button,
  CircularProgress,
  Alert,
  Paper,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  TextField
} from '@mui/material';
import { Add as AddIcon } from '@mui/icons-material';
import { useAuth } from '../../contexts/AuthContext';
import { usePropertyService } from '../../services/propertyService';
import { useTenantService } from '../../services/tenantService';
import paymentService from '../../services/paymentService';
import { Payment, PaymentStatus, PaymentFormData, PaymentFilter } from '../../types/payment';
import { Property } from '../../types/property';
import { Tenant } from '../../types/tenant';
import PaymentList from '../../components/payments/PaymentList';
import PaymentForm from '../../components/payments/PaymentForm';
import PaymentSummary from '../../components/payments/PaymentSummary';
import { AuthErrorReport } from '../../components/AuthErrorReport';

const AccountantPaymentsPage: React.FC = () => {
  const { user, loading: authLoading } = useAuth();
  const propertyService = usePropertyService();
  const tenantService = useTenantService();

  const [payments, setPayments] = useState<Payment[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [page, setPage] = useState<number>(1);
  const [limit, setLimit] = useState<number>(25);
  const [properties, setProperties] = useState<Property[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState<Payment | undefined>(undefined);
  const [filters, setFilters] = useState<PaymentFilter>({});
  const [debouncedFilters, setDebouncedFilters] = useState<PaymentFilter>({});
  const [showAuthError, setShowAuthError] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [finalizeOpen, setFinalizeOpen] = useState(false);
  const [finalizePayment, setFinalizePayment] = useState<Payment | null>(null);
  const [finalizePropertyId, setFinalizePropertyId] = useState<string>('');
  const [finalizeTenantId, setFinalizeTenantId] = useState<string>('');
  const [finalizeOwnerId, setFinalizeOwnerId] = useState<string>('');
  const [finalizeRelationship, setFinalizeRelationship] = useState<'management' | 'introduction' | ''>('');
  const [finalizeCommissionPercent, setFinalizeCommissionPercent] = useState<string>('');
  const [finalizing, setFinalizing] = useState(false);

  // Filter tenants to those linked to the selected property during finalize flow
  const tenantsForSelectedProperty = useMemo(() => {
    if (!finalizePropertyId) return tenants;
    return tenants.filter((t) => String(t.propertyId || '') === String(finalizePropertyId));
  }, [tenants, finalizePropertyId]);

  // When a property is selected in finalize dialog, auto-pick the tenant if unambiguous
  useEffect(() => {
    if (!finalizePropertyId) {
      setFinalizeTenantId('');
      return;
    }
    const matches = tenants.filter((t) => String(t.propertyId || '') === String(finalizePropertyId));
    const activeMatches = matches.filter((t) => t.status === 'Active');
    let chosen: Tenant | undefined;
    if (activeMatches.length === 1) {
      chosen = activeMatches[0];
    } else if (matches.length === 1) {
      chosen = matches[0];
    } else {
      chosen = undefined;
    }
    setFinalizeTenantId(chosen ? chosen._id : '');
  }, [finalizePropertyId, tenants]);

  // Prefill finalize dialog from selected payment when opening, if data is present
  useEffect(() => {
    if (!finalizeOpen || !finalizePayment) return;
    const propId = (finalizePayment as any).propertyId && typeof (finalizePayment as any).propertyId === 'object'
      ? String((finalizePayment as any).propertyId._id)
      : String((finalizePayment as any).propertyId || '');
    const tId = (finalizePayment as any).tenantId && typeof (finalizePayment as any).tenantId === 'object'
      ? String((finalizePayment as any).tenantId._id)
      : String((finalizePayment as any).tenantId || '');
    if (propId) setFinalizePropertyId(propId);
    if (tId) setFinalizeTenantId(tId);
  }, [finalizeOpen, finalizePayment]);

  const summary = useMemo(() => {
    const totalIncome = payments.reduce((sum, payment) => sum + payment.amount, 0);
    const totalPayments = payments.length;
    const overduePayments = payments.filter(p => p.status === 'failed').length;
    const pendingAmount = payments
      .filter(p => p.status === 'pending')
      .reduce((sum, payment) => sum + payment.amount, 0);
    const currencyBreakdown = payments.reduce((acc, payment) => {
      const currency = payment.currency;
      acc[currency] = (acc[currency] || 0) + payment.amount;
      return acc;
    }, {} as { [key: string]: number });
    return {
      totalIncome,
      totalPayments,
      overduePayments,
      pendingAmount,
      currencyBreakdown
    };
  }, [payments]);

  useEffect(() => {
    let isMounted = true;
    const loadData = async () => {
      if (authLoading) return;
      try {
        setLoading(true);
        setError(null);
        const [propertiesData, tenantsData, paymentsPage] = await Promise.all([
          propertyService.getProperties(),
          // Defer tenants heavy fetch; load lazily when needed
          Promise.resolve({ tenants: [] as Tenant[] }),
          paymentService.getPaymentsPage({ page, limit, includeProvisional: 'true' } as any)
        ]);
        if (!isMounted) return;
        const properties = Array.isArray(propertiesData) ? propertiesData : [];
        const tenants = Array.isArray((tenantsData as any)?.tenants) ? (tenantsData as any).tenants : [];
        const paymentsList = Array.isArray((paymentsPage as any)?.items) ? (paymentsPage as any).items : [];
        const total = Number((paymentsPage as any)?.total) || paymentsList.length;
        setProperties(properties);
        setTenants(tenants);
        setPayments(paymentsList as any[]);
        setTotalCount(total);
      } catch (err: any) {
        if (!isMounted) return;
        setError('Failed to load data. Please try again later.');
        setProperties([]);
        setTenants([]);
        setPayments([]);
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    loadData();
    return () => { isMounted = false; };
  }, [authLoading]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedFilters(filters);
    }, 500);
    return () => clearTimeout(timer);
  }, [filters]);

  useEffect(() => {
    const loadPayments = async () => {
      try {
        setLoading(true);
        setError(null);
        const filterParams: any = { page, limit, paginate: true };
        if (debouncedFilters.startDate) filterParams.startDate = debouncedFilters.startDate.toISOString();
        if (debouncedFilters.endDate) filterParams.endDate = debouncedFilters.endDate.toISOString();
        if (debouncedFilters.status) filterParams.status = debouncedFilters.status;
        if (debouncedFilters.paymentMethod) filterParams.paymentMethod = debouncedFilters.paymentMethod;
        if (debouncedFilters.propertyId) filterParams.propertyId = debouncedFilters.propertyId;
        // Include provisional payments on accountant view
        const { items, total } = await paymentService.getPaymentsPage({ ...filterParams, includeProvisional: 'true' } as any);
        setPayments(items as any[]);
        setTotalCount(total);
      } catch (err: any) {
        setError(err instanceof Error ? err.message : 'Failed to load payments');
      } finally {
        setLoading(false);
      }
    };
    loadPayments();
  }, [debouncedFilters, user?.companyId, page, limit]);

  const handleCreatePayment = async (data: PaymentFormData) => {
    try {
      setLoading(true);
      setError(null);
      let response: any;
      if (data.paymentType === 'levy') {
        response = await paymentService.createLevyPayment(data);
        setSuccessMessage('Levy payment created successfully');
      } else if (data.paymentType === 'municipal') {
        response = await paymentService.createMunicipalPayment(data);
        setSuccessMessage('Municipal payment created successfully');
      } else {
        // Use accountant endpoint that accepts PaymentFormData
        const resp = await paymentService.createPaymentAccountant(data);
        const created = (resp as any)?.data || resp;
        if (created) {
          setPayments(prev => [...prev, created as Payment]);
        }
        setSuccessMessage('Payment created successfully');
      }
      setShowForm(false);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to create payment');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdatePayment = async (id: string, data: PaymentFormData) => {
    try {
      setLoading(true);
      setError(null);
      const response = await paymentService.updatePayment(id, data);
      setPayments(prev => prev.map(p => p._id === id ? response : p));
      setShowForm(false);
      setSelectedPayment(undefined);
      setSuccessMessage('Payment updated successfully');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to update payment');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box sx={{ width: '100%' }}>
      <Typography variant="h4" component="h1" sx={{ fontWeight: 600, mb: 3 }}>
        Accountant Payments
      </Typography>
      {error && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}
      {successMessage && (
        <Alert severity="success" sx={{ mb: 3 }} onClose={() => setSuccessMessage(null)}>
          {successMessage}
        </Alert>
      )}
      <PaymentSummary summary={summary} />
      {!showForm && (
        <Box display="flex" justifyContent="flex-end" mb={2}>
          <Button
            variant="contained"
            color="primary"
            startIcon={<AddIcon />}
            onClick={() => {
              setSelectedPayment(undefined);
              setShowForm(true);
            }}
            sx={{ borderRadius: 2 }}
          >
            Add Payment
          </Button>
        </Box>
      )}
      {showForm ? (
        <PaymentForm
          onSubmit={selectedPayment ? (data) => handleUpdatePayment(selectedPayment._id, data) : handleCreatePayment}
          onCancel={() => {
            setShowForm(false);
            setSelectedPayment(undefined);
          }}
          initialData={selectedPayment}
          properties={properties}
          tenants={tenants}
        />
      ) : (
        <PaymentList
          payments={payments}
          totalCount={totalCount}
          onEdit={(payment) => {
            setSelectedPayment(payment);
            setShowForm(true);
          }}
          onFinalize={(payment) => {
            setFinalizePayment(payment);
            setFinalizeOpen(true);
          }}
          onDownloadReceipt={async () => {}}
          onFilterChange={(next) => {
            const n = next as any;
            if (typeof n.page === 'number') setPage(n.page);
            if (typeof n.limit === 'number') setLimit(n.limit);
            const { page: _p, limit: _l, ...rest } = n;
            setFilters(rest);
          }}
          isMobile={false}
          filters={filters}
          loading={loading}
          error={error}
          properties={properties}
          tenants={tenants}
        />
      )}
      <Dialog open={finalizeOpen} onClose={() => setFinalizeOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Finalize Manual Payment</DialogTitle>
        <DialogContent>
          <Box sx={{ mt: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <FormControl fullWidth size="small">
              <InputLabel>Property</InputLabel>
              <Select
                label="Property"
                value={finalizePropertyId}
                onChange={(e) => setFinalizePropertyId(e.target.value as string)}
              >
                {properties.map((p) => (
                  <MenuItem key={p._id} value={p._id}>{p.name}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl fullWidth size="small">
              <InputLabel>Tenant</InputLabel>
              <Select
                label="Tenant"
                value={finalizeTenantId}
                onChange={(e) => setFinalizeTenantId(e.target.value as string)}
              >
                {tenantsForSelectedProperty.map((t) => (
                  <MenuItem key={t._id} value={t._id}>
                    {t.firstName} {t.lastName}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField
              label="Owner ID (optional)"
              size="small"
              fullWidth
              value={finalizeOwnerId}
              onChange={(e) => setFinalizeOwnerId(e.target.value)}
            />
            <FormControl fullWidth size="small">
              <InputLabel>Relationship (optional)</InputLabel>
              <Select
                label="Relationship (optional)"
                value={finalizeRelationship}
                onChange={(e) => setFinalizeRelationship(e.target.value as any)}
              >
                <MenuItem value="">None</MenuItem>
                <MenuItem value="management">Management</MenuItem>
                <MenuItem value="introduction">Introduction</MenuItem>
              </Select>
            </FormControl>
            <TextField
              label="Override Commission % (optional)"
              size="small"
              fullWidth
              type="number"
              value={finalizeCommissionPercent}
              onChange={(e) => setFinalizeCommissionPercent(e.target.value)}
              inputProps={{ min: 0, step: 0.1 }}
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setFinalizeOpen(false)} disabled={finalizing}>Cancel</Button>
          <Button
            variant="contained"
            disabled={finalizing || !finalizePayment || !finalizePropertyId || !finalizeTenantId}
            onClick={async () => {
              if (!finalizePayment) return;
              try {
                setFinalizing(true);
                setError(null);
                const payload: any = {
                  propertyId: finalizePropertyId,
                  tenantId: finalizeTenantId,
                };
                if (finalizeOwnerId) payload.ownerId = finalizeOwnerId;
                if (finalizeRelationship) payload.relationshipType = finalizeRelationship;
                if (finalizeCommissionPercent) payload.overrideCommissionPercent = Number(finalizeCommissionPercent);
                const resp = await paymentService.finalizeProvisionalPayment(finalizePayment._id, payload);
                const updated = resp?.payment || null;
                if (updated) {
                  setPayments((prev) => prev.map((p) => (p._id === updated._id ? (updated as any) : p)));
                }
                setSuccessMessage('Payment finalized successfully');
                setFinalizeOpen(false);
                setFinalizePayment(null);
                setFinalizePropertyId('');
                setFinalizeTenantId('');
                setFinalizeOwnerId('');
                setFinalizeRelationship('');
                setFinalizeCommissionPercent('');
              } catch (err: any) {
                setError(err?.message || 'Failed to finalize payment');
              } finally {
                setFinalizing(false);
              }
            }}
          >
            {finalizing ? 'Finalizing...' : 'Finalize'}
          </Button>
        </DialogActions>
      </Dialog>
      <Dialog
        open={showAuthError}
        onClose={() => setShowAuthError(false)}
        maxWidth="sm"
        fullWidth
      >
        <AuthErrorReport
          error="Please log in to access payments"
          onRetry={() => setShowAuthError(false)}
          onLogin={() => setShowAuthError(false)}
        />
      </Dialog>
    </Box>
  );
};

export default AccountantPaymentsPage; 