import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Box,
  Typography,
  Button,
  CircularProgress,
  Alert,
  Paper,
  Dialog
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
        const [propertiesData, tenantsData, paymentsData] = await Promise.all([
          propertyService.getPublicProperties(),
          tenantService.getAllPublic(),
          paymentService.getAllPublic()
        ]);
        if (!isMounted) return;
        const properties = Array.isArray(propertiesData) ? propertiesData : [];
        const tenants = Array.isArray(tenantsData) ? tenantsData : (tenantsData.tenants || []);
        const payments = Array.isArray(paymentsData) ? paymentsData : (paymentsData.data || []);
        setProperties(properties);
        setTenants(tenants);
        setPayments(payments);
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
        const filterParams: any = {};
        if (debouncedFilters.startDate) filterParams.startDate = debouncedFilters.startDate.toISOString();
        if (debouncedFilters.endDate) filterParams.endDate = debouncedFilters.endDate.toISOString();
        if (debouncedFilters.status) filterParams.status = debouncedFilters.status;
        if (debouncedFilters.paymentMethod) filterParams.paymentMethod = debouncedFilters.paymentMethod;
        if (debouncedFilters.propertyId) filterParams.propertyId = debouncedFilters.propertyId;
        const response = await paymentService.getAllPublic(user?.companyId, filterParams);
        setPayments(response.data);
      } catch (err: any) {
        setError(err instanceof Error ? err.message : 'Failed to load payments');
      } finally {
        setLoading(false);
      }
    };
    loadPayments();
  }, [debouncedFilters, user?.companyId]);

  const handleCreatePayment = async (data: PaymentFormData) => {
    try {
      setLoading(true);
      setError(null);
      let response: Payment | undefined;
      if (data.paymentType === 'levy') {
        response = await paymentService.createLevyPayment(data);
        setSuccessMessage('Levy payment created successfully');
      } else if (data.paymentType === 'municipal') {
        response = await paymentService.createMunicipalPayment(data);
        setSuccessMessage('Municipal payment created successfully');
      } else {
        response = await paymentService.createPayment(data);
        if (response) {
          setPayments(prev => [...prev, response as Payment]);
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
    <Box sx={{ p: 3 }}>
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
          onEdit={(payment) => {
            setSelectedPayment(payment);
            setShowForm(true);
          }}
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