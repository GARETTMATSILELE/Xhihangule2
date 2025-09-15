import React, { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Typography,
  Button,
  Alert,
  ToggleButton,
  ToggleButtonGroup
} from '@mui/material';
import { Add as AddIcon } from '@mui/icons-material';
import { useAuth } from '../../contexts/AuthContext';
import { usePropertyService } from '../../services/propertyService';
import { useTenantService } from '../../services/tenantService';
import paymentService from '../../services/paymentService';
import { Payment, PaymentFilter, PaymentFormData } from '../../types/payment';
import { Property } from '../../types/property';
import { Tenant } from '../../types/tenant';
import PaymentList from '../../components/payments/PaymentList';
import SalesPaymentForm from '../../components/payments/SalesPaymentForm';

const SalesPaymentsPage: React.FC = () => {
  const { user, loading: authLoading } = useAuth();
  const propertyService = usePropertyService();
  const tenantService = useTenantService();

  const [payments, setPayments] = useState<Payment[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [mode, setMode] = useState<'quick' | 'installment'>('quick');
  const [filters, setFilters] = useState<PaymentFilter>({ saleMode: 'quick' as any });

  const summary = useMemo(() => {
    const salesPayments = payments.filter(p => p.paymentType === 'sale');
    const totalIncome = salesPayments.reduce((sum, p) => sum + p.amount, 0);
    const totalPayments = salesPayments.length;
    const overduePayments = salesPayments.filter(p => p.status === 'failed').length;
    const pendingAmount = salesPayments
      .filter(p => p.status === 'pending')
      .reduce((sum, p) => sum + p.amount, 0);
    const currencyBreakdown = salesPayments.reduce((acc, p) => {
      acc[p.currency] = (acc[p.currency] || 0) + p.amount;
      return acc;
    }, {} as { [key: string]: number });
    return { totalIncome, totalPayments, overduePayments, pendingAmount, currencyBreakdown };
  }, [payments]);

  useEffect(() => {
    let isMounted = true;
    const loadData = async () => {
      if (authLoading) return;
      try {
        setLoading(true);
        setError(null);
        const [propertiesData, tenantsData, paymentsData] = await Promise.all([
          propertyService.getProperties().catch(() => []),
          tenantService.getAll().catch(() => ({ tenants: [] })),
          paymentService.getSalesPayments().catch(() => [])
        ]);
        if (!isMounted) return;
        const properties = Array.isArray(propertiesData) ? propertiesData : [];
        const tenants = Array.isArray((tenantsData as any).tenants) ? (tenantsData as any).tenants : (Array.isArray(tenantsData) ? tenantsData : []);
        const payments = (Array.isArray(paymentsData) ? (paymentsData as Payment[]) : [])
          .filter(p => p.paymentType === 'sale')
          .filter(p => (p as any).saleMode === mode);
        setProperties(properties);
        setTenants(tenants);
        setPayments(payments);
      } catch (err: any) {
        if (!isMounted) return;
        setError('Failed to load sales payments');
        setPayments([]);
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    loadData();
    return () => { isMounted = false; };
  }, [authLoading]);

  useEffect(() => {
    const applyFilters = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await paymentService.getSalesPayments({ ...filters, paymentType: 'sale', saleMode: mode });
        const onlySales = (Array.isArray(data) ? data : []).filter((p: any) => p.paymentType === 'sale');
        setPayments((onlySales as any[]).filter(p => (p as any).saleMode === mode) as Payment[]);
      } catch (err: any) {
        setError(err instanceof Error ? err.message : 'Failed to load payments');
      } finally {
        setLoading(false);
      }
    };
    applyFilters();
  }, [filters, mode]);

  useEffect(() => {
    setFilters(prev => ({ ...prev, saleMode: mode }));
  }, [mode]);

  const handleCreatePayment = async (data: PaymentFormData) => {
    try {
      setLoading(true);
      setError(null);
      const payload: PaymentFormData = { ...data, paymentType: 'sale' };
      const created = await paymentService.createSalesPaymentAccountant(payload);
      const createdPayment = (created as any)?.payment || (created as any)?.data || created;
      if (createdPayment && (createdPayment as any).paymentType === 'sale') {
        setPayments(prev => [...prev, createdPayment as Payment]);
      }
      setShowForm(false);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to create sales payment');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box sx={{ width: '100%' }}>
      <Typography variant="h4" component="h1" sx={{ fontWeight: 600, mb: 3 }}>
        Sales (Agency Introduction) Payments
      </Typography>
      {error && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}
      {!showForm && (
        <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
          <ToggleButtonGroup
            size="small"
            value={mode}
            exclusive
            onChange={(_, val) => val && setMode(val)}
          >
            <ToggleButton value="quick">Quick Sale</ToggleButton>
            <ToggleButton value="installment">Installment Payment</ToggleButton>
          </ToggleButtonGroup>
          <Button
            variant="contained"
            color="primary"
            startIcon={<AddIcon />}
            onClick={() => {
              setShowForm(true);
            }}
            sx={{ borderRadius: 2 }}
          >
            {mode === 'quick' ? 'Add Quick Sale' : 'Add Installment Payment'}
          </Button>
        </Box>
      )}
      {showForm ? (
        <SalesPaymentForm
          onSubmit={async (data) => {
            await handleCreatePayment(data);
            setShowForm(false);
          }}
          onCancel={() => setShowForm(false)}
          isInstallment={mode === 'installment'}
        />
      ) : (
        <PaymentList
          payments={payments}
          onEdit={() => {}}
          onDownloadReceipt={async () => {}}
          onFilterChange={setFilters}
          isMobile={false}
          filters={filters}
          loading={loading}
          error={error}
          properties={properties}
          tenants={tenants}
        />
      )}
    </Box>
  );
};

export default SalesPaymentsPage;


