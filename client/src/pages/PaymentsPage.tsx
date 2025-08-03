import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Box,
  Typography,
  Button,
  CircularProgress,
  Alert,
  Container,
  Paper,
  useTheme,
  useMediaQuery,
  Dialog,
  Tabs,
  Tab
} from '@mui/material';
import { Add as AddIcon } from '@mui/icons-material';
import { useAuth } from '../contexts/AuthContext';
import { usePropertyService } from '../services/propertyService';
import { useTenantService } from '../services/tenantService';
import { usePropertyOwnerService } from '../services/propertyOwnerService';
import paymentService from '../services/paymentService';
import { agentService } from '../services/agentService';
import paymentRequestService, { PaymentRequest as PaymentRequestType } from '../services/paymentRequestService';
import { Payment, PaymentStatus, PaymentFormData, PaymentFilter } from '../types/payment';
import { Property } from '../types/property';
import { Tenant } from '../types/tenant';
import { PropertyOwner } from '../services/propertyOwnerService';
import PaymentList from '../components/payments/PaymentList';
import PaymentForm from '../components/payments/PaymentForm';
import PaymentSummary from '../components/payments/PaymentSummary';
import PaymentRequests from '../components/payments/PaymentRequests';
import PaymentRequestForm from '../components/payments/PaymentRequestForm';
import { Header } from '../components/Layout/Header';
import { AuthErrorReport } from '../components/AuthErrorReport';
import { useNavigate, useLocation } from 'react-router-dom';

const PaymentsPage: React.FC = () => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const propertyService = usePropertyService();
  const tenantService = useTenantService();
  const propertyOwnerService = usePropertyOwnerService();
  const [activeTab, setActiveTab] = useState(4); // 4 is the index for Payments in AdminSidebar
  
  const [payments, setPayments] = useState<Payment[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [owners, setOwners] = useState<PropertyOwner[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState<Payment | undefined>(undefined);
  const [filters, setFilters] = useState<PaymentFilter>({});
  const [debouncedFilters, setDebouncedFilters] = useState<PaymentFilter>({});
  const [showAuthError, setShowAuthError] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [paymentRequests, setPaymentRequests] = useState<PaymentRequestType[]>([]);
  const [requestsLoading, setRequestsLoading] = useState(false);
  const [currentTab, setCurrentTab] = useState<'payments' | 'requests'>('payments');
  const [showPaymentRequestForm, setShowPaymentRequestForm] = useState(false);

  // Determine which sidebar to use based on user role
  const SidebarComponent = useMemo(() => {
    if (user?.role === 'agent') {
      return require('../components/Layout/AgentSidebar').AgentSidebar;
    } else {
      return require('../components/Layout/AdminSidebar').AdminSidebar;
    }
  }, [user?.role]);

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

  // Load all data in a single effect
  useEffect(() => {
    let isMounted = true;

    const loadData = async () => {
      if (authLoading || !user?.companyId) {
        return;
      }
      
      try {
        setLoading(true);
        setError(null);
        
        let propertiesData, tenantsData, paymentsData;
        
        // Use agent service if user is an agent, otherwise use regular services
        if (user?.role === 'agent') {
          [propertiesData, tenantsData, paymentsData] = await Promise.all([
            agentService.getProperties(),
            agentService.getTenants(),
            paymentService.getAllPublic() // Keep using public endpoint for payments list
          ]);
        } else {
          [propertiesData, tenantsData, paymentsData] = await Promise.all([
            propertyService.getPublicProperties(),
            tenantService.getAllPublic(),
            paymentService.getAllPublic()
          ]);
        }

        // Load owners data
        let ownersData;
        try {
          ownersData = await propertyOwnerService.getAllPublic(user?.companyId);
        } catch (err) {
          console.warn('Failed to load owners:', err);
          ownersData = [];
        }

        if (!isMounted) return;

        // Handle different response formats
        const properties = Array.isArray(propertiesData) ? propertiesData : [];
        const tenants = Array.isArray(tenantsData) ? tenantsData : (tenantsData.tenants || []);
        const payments = Array.isArray(paymentsData) ? paymentsData : (paymentsData.data || []);
        const owners = Array.isArray(ownersData) ? ownersData : [];

        if (!Array.isArray(properties) || !Array.isArray(tenants) || !Array.isArray(payments)) {
          throw new Error('Invalid data format received from server');
        }

        setProperties(properties);
        setTenants(tenants);
        setPayments(payments);
        setOwners(owners);
        
        // Debug logging
        console.log('Loaded properties:', properties);
        console.log('Loaded payments:', payments);
        if (payments && payments.length > 0) {
          console.log('First payment propertyId:', payments[0].propertyId);
          console.log('First payment propertyId type:', typeof payments[0].propertyId);
        }
      } catch (err: any) {
        if (!isMounted) return;
        
        console.error('Error loading data:', err);
        if (err.response?.status === 401) {
          setError('Authentication required. Please log in to continue.');
          setShowAuthError(true);
        } else {
          setError('Failed to load data. Please try again later.');
        }
        setProperties([]);
        setTenants([]);
        setPayments([]);
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    loadData();

    return () => {
      isMounted = false;
    };
  }, [authLoading, user?.role]);

  // Load payment requests when tab changes to requests
  useEffect(() => {
    if (currentTab === 'requests' && user?.companyId) {
      loadPaymentRequests();
    }
  }, [currentTab, user?.companyId]);

  const loadPaymentRequests = async () => {
    try {
      setRequestsLoading(true);
      const response = await paymentRequestService.getPaymentRequests();
      setPaymentRequests(response.data);
    } catch (err: any) {
      console.error('Error loading payment requests:', err);
      setError('Failed to load payment requests');
    } finally {
      setRequestsLoading(false);
    }
  };

  // Debounce filter changes
  useEffect(() => {
    console.log('Filter effect running with filters:', filters);
    const timer = setTimeout(() => {
      console.log('Setting debounced filters:', filters);
      setDebouncedFilters(filters);
    }, 500);

    return () => clearTimeout(timer);
  }, [filters]);

  // Load payments when filters change
  useEffect(() => {
    const loadPayments = async () => {
      try {
        setLoading(true);
        setError(null);
        
        // Prepare filter parameters
        const filterParams: any = {};
        if (debouncedFilters.startDate) {
          filterParams.startDate = debouncedFilters.startDate.toISOString();
        }
        if (debouncedFilters.endDate) {
          filterParams.endDate = debouncedFilters.endDate.toISOString();
        }
        if (debouncedFilters.status) {
          filterParams.status = debouncedFilters.status;
        }
        if (debouncedFilters.paymentMethod) {
          filterParams.paymentMethod = debouncedFilters.paymentMethod;
        }
        if (debouncedFilters.propertyId) {
          filterParams.propertyId = debouncedFilters.propertyId;
        }
        
        // Use agent service if user is an agent, otherwise use regular payment service
        let response;
        if (user?.role === 'agent') {
          response = await paymentService.getAllPublic(user?.companyId, filterParams);
        } else {
          response = await paymentService.getAllPublic(user?.companyId, filterParams);
        }
        
        console.log('Payments response:', response);
        console.log('Payments data:', response.data);
        if (response.data && response.data.length > 0) {
          console.log('First payment propertyId:', response.data[0].propertyId);
          console.log('First payment propertyId type:', typeof response.data[0].propertyId);
        }
        setPayments(response.data);
      } catch (err: any) {
        console.error('Error loading payments:', err);
        if (err.response?.status === 401) {
          setError('Authentication required. Please log in to continue.');
          setShowAuthError(true);
        } else {
          setError(err instanceof Error ? err.message : 'Failed to load payments');
        }
      } finally {
        setLoading(false);
      }
    };

    loadPayments();
  }, [debouncedFilters, user?.companyId, user?.role]);

  // Handle payment creation
  const handleCreatePayment = async (data: PaymentFormData) => {
    try {
      setLoading(true);
      setError(null);
      // Ensure ownerId is set
      const property = properties.find(p => String(p._id) === String(data.propertyId));
      if (property && property.ownerId) {
        data.ownerId = property.ownerId;
      }
      let response;
      if (data.paymentType === 'levy') {
        response = await paymentService.createLevyPayment(data);
      } else if (data.paymentType === 'municipal') {
        response = await paymentService.createMunicipalPayment(data);
      } else if (user?.role === 'agent') {
        response = await agentService.createPayment(data, properties, user?._id);
      } else {
        response = await paymentService.createPayment(data);
      }
      setPayments(prev => [...prev, response.data || response]);
      setShowCreateDialog(false);
      setSuccessMessage('Payment created successfully');
    } catch (err: any) {
      console.error('Error creating payment:', err);
      if (err.response?.status === 401) {
        setError('Authentication required. Please log in to continue.');
        setShowAuthError(true);
      } else {
        setError(err.response?.data?.message || 'Failed to create payment');
      }
    } finally {
      setLoading(false);
    }
  };

  // Handle payment update
  const handleUpdatePayment = async (id: string, data: PaymentFormData) => {
    try {
      setLoading(true);
      setError(null);
      
      let response;
      if (user?.role === 'agent') {
        response = await agentService.updatePayment(id, data, properties, user?._id);
      } else {
        response = await paymentService.updatePayment(id, data);
      }
      
      setPayments(prev => prev.map(p => p._id === id ? (response.data || response) : p));
      setShowEditDialog(false);
      setSuccessMessage('Payment updated successfully');
    } catch (err: any) {
      console.error('Error updating payment:', err);
      if (err.response?.status === 401) {
        setError('Authentication required. Please log in to continue.');
        setShowAuthError(true);
      } else {
        setError(err.response?.data?.message || 'Failed to update payment');
      }
    } finally {
      setLoading(false);
    }
  };

  // Handle payment deletion
  const handleDeletePayment = async (id: string) => {
    try {
      setLoading(true);
      setError(null);
      await paymentService.deletePayment(id);
      setPayments(prev => prev.filter(p => p._id !== id));
      setSuccessMessage('Payment deleted successfully');
    } catch (err: any) {
      console.error('Error deleting payment:', err);
      if (err.response?.status === 401) {
        setError('Authentication required. Please log in to continue.');
        setShowAuthError(true);
      } else {
        setError(err.response?.data?.message || 'Failed to delete payment');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleFormSubmit = useCallback(async (formData: PaymentFormData) => {
    if (!user?.companyId) {
      setError('Please log in to create or update payments');
      setShowAuthError(true);
      return;
    }
    try {
      const paymentData = {
        ...formData,
        status: 'completed' as PaymentStatus, // Always set to completed for agent
        companyId: user.companyId
      };
      // Ensure ownerId is set
      const property = properties.find(p => String(p._id) === String(paymentData.propertyId));
      if (property && property.ownerId) {
        paymentData.ownerId = property.ownerId;
      }
      if (selectedPayment) {
        // Use agent service if user is an agent, otherwise use regular payment service
        if (user.role === 'agent') {
          const response = await agentService.updatePayment(selectedPayment._id, paymentData, properties, user?._id);
          setPayments(prev => prev.map(p => p._id === selectedPayment._id ? response.data : p));
        } else {
          const response = await paymentService.updatePayment(selectedPayment._id, paymentData);
          setPayments(prev => prev.map(p => p._id === selectedPayment._id ? response : p));
        }
      } else {
        if (paymentData.paymentType === 'levy') {
          const response = await paymentService.createLevyPayment(paymentData);
          setPayments(prev => [...prev, response.data || response]);
        } else if (paymentData.paymentType === 'municipal') {
          const response = await paymentService.createMunicipalPayment(paymentData);
          setPayments(prev => [...prev, response.data || response]);
        } else if (user.role === 'agent') {
          const response = await agentService.createPayment(paymentData, properties, user?._id);
          setPayments(prev => [...prev, response.data]);
        } else {
          // Use accountant endpoint for admin dashboard payments
          const response = await paymentService.createPaymentAccountant(paymentData);
          setPayments(prev => [...prev, response.data]);
        }
      }
      setShowForm(false);
      setSelectedPayment(undefined);
      setSuccessMessage(selectedPayment ? 'Payment updated successfully' : 'Payment created successfully');
    } catch (err: any) {
      console.error('Error saving payment:', err);
      if (err.response?.status === 401) {
        setError('Authentication required. Please log in to continue.');
        setShowAuthError(true);
      } else {
        setError(err.response?.data?.message || 'Failed to save payment. Please try again.');
      }
    }
  }, [selectedPayment, user?.companyId, user?.role, properties]);

  const handlePaymentClick = useCallback((payment: Payment) => {
    if (!user?.companyId) {
      setError('Please log in to edit payments');
      setShowAuthError(true);
      return;
    }
    setSelectedPayment(payment);
    setShowForm(true);
  }, [user?.companyId]);

  const handleDownloadReceipt = useCallback(async (payment: Payment) => {
    try {
      const blob = await paymentService.downloadReceiptPublic(payment._id, user?.companyId);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `receipt-${payment._id}.json`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err: any) {
      console.error('Error downloading receipt:', err);
      setError('Failed to download receipt');
    }
  }, [user?.companyId]);

  const handlePaymentRequestSubmit = useCallback(async (formData: any) => {
    if (!user?.companyId) {
      setError('Please log in to create payment requests');
      setShowAuthError(true);
      return;
    }
    try {
      const newRequest = {
        propertyId: formData.propertyId,
        tenantId: formData.tenant || undefined,
        ownerId: formData.owner || undefined,
        amount: formData.amount,
        currency: formData.currency,
        reason: formData.reason,
        requestDate: formData.date,
        dueDate: new Date(formData.date.getTime() + 7 * 24 * 60 * 60 * 1000), // 7 days from request date
        notes: formData.reason,
        payTo: formData.payTo
      };
      
      const response = await paymentRequestService.createPaymentRequest(newRequest);
      setPaymentRequests(prev => [response, ...prev]);
      setShowPaymentRequestForm(false);
      setSuccessMessage('Payment request created successfully');
    } catch (err: any) {
      console.error('Error creating payment request:', err);
      setError(err.message || 'Failed to create payment request. Please try again.');
    }
  }, [user?.companyId]);

  const handleFilterChange = useCallback((newFilters: PaymentFilter) => {
    console.log('PaymentsPage handleFilterChange called with:', newFilters);
    setFilters(newFilters);
  }, []);

  // Handle authentication errors locally without triggering global auth error events
  const handleAuthError = useCallback((error: any) => {
    console.error('Authentication error in PaymentsPage:', error);
    if (error.response?.status === 401) {
      setError('Authentication required. Please log in to continue.');
      setShowAuthError(true);
    } else {
      setError(error.message || 'An unexpected error occurred. Please try again.');
    }
  }, []);

  // Enhanced error handling for payment operations
  const handlePaymentOperation = useCallback(async (
    operation: () => Promise<any>,
    successMessage: string
  ) => {
    try {
      setLoading(true);
      setError(null);
      const result = await operation();
      setSuccessMessage(successMessage);
      return result;
    } catch (err: any) {
      console.error('Payment operation error:', err);
      handleAuthError(err);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [handleAuthError]);

  if (authLoading) {
    return (
      <Box sx={{ display: 'flex', minHeight: '100vh' }}>
        <Box sx={{ flexGrow: 1 }}>
          <Header />
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
            <CircularProgress />
          </Box>
        </Box>
      </Box>
    );
  }

  if (loading) {
    return (
      <Box sx={{ display: 'flex', minHeight: '100vh' }}>
        <Box sx={{ flexGrow: 1 }}>
          <Header />
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
            <CircularProgress />
          </Box>
        </Box>
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      <Box sx={{ flexGrow: 1 }}>
        <Header />
        <Box sx={{ 
          height: 'calc(100vh - 64px)', 
          display: 'flex', 
          flexDirection: 'column',
          bgcolor: 'background.paper'
        }}>
            <Box display="flex" justifyContent="space-between" alignItems="center" sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }}>
              <Typography variant="h4" component="h1" sx={{ fontWeight: 600 }}>
                Payments
              </Typography>
              <Box sx={{ display: 'flex', gap: 2 }}>
                <Button
                  variant="outlined"
                  color="primary"
                  startIcon={<AddIcon />}
                  onClick={() => {
                    if (!user?.companyId) {
                      setError('Please log in to create payment requests');
                      setShowAuthError(true);
                      return;
                    }
                    setShowPaymentRequestForm(true);
                  }}
                  sx={{ borderRadius: 2 }}
                >
                  Add Payment Request
                </Button>
                <Button
                  variant="contained"
                  color="primary"
                  startIcon={<AddIcon />}
                  onClick={() => {
                    if (!user?.companyId) {
                      setError('Please log in to create payments');
                      setShowAuthError(true);
                      return;
                    }
                    setSelectedPayment(undefined);
                    setShowForm(true);
                  }}
                  sx={{ borderRadius: 2 }}
                >
                  Add Payment
                </Button>
              </Box>
            </Box>

            {error && (
              <Alert 
                severity="error" 
                sx={{ m: 2 }}
                onClose={() => setError(null)}
              >
                {error}
              </Alert>
            )}

            {successMessage && (
              <Alert 
                severity="success" 
                sx={{ m: 2 }}
                onClose={() => setSuccessMessage(null)}
              >
                {successMessage}
              </Alert>
            )}

            <Box sx={{ px: 2, py: 1 }}>
              <PaymentSummary summary={summary} />
            </Box>

            <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <Tabs 
                value={currentTab} 
                onChange={(e, newValue) => setCurrentTab(newValue)}
                sx={{ borderBottom: 1, borderColor: 'divider', px: 2 }}
              >
                <Tab label="Payments" value="payments" />
                <Tab label="Payment Requests" value="requests" />
              </Tabs>

              <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                {showPaymentRequestForm ? (
                  <Box sx={{ p: 2, overflow: 'auto' }}>
                    <PaymentRequestForm
                      onSubmit={handlePaymentRequestSubmit}
                      onCancel={() => setShowPaymentRequestForm(false)}
                      properties={properties}
                      owners={owners}
                      tenants={tenants}
                      loading={loading}
                    />
                  </Box>
                ) : currentTab === 'payments' ? (
                  showForm ? (
                    <PaymentForm
                      onSubmit={handleFormSubmit}
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
                      onEdit={handlePaymentClick}
                      onDownloadReceipt={handleDownloadReceipt}
                      onFilterChange={handleFilterChange}
                      isMobile={isMobile}
                      filters={filters}
                      loading={loading}
                      error={error}
                      properties={properties}
                      tenants={tenants}
                    />
                  )
                ) : (
                  <PaymentRequests
                    requests={paymentRequests}
                    onApprove={async (requestId) => {
                      try {
                        await paymentRequestService.markAsPaid(requestId);
                        await loadPaymentRequests(); // Reload the list
                        setSuccessMessage('Payment request marked as paid');
                      } catch (err: any) {
                        setError(err.message || 'Failed to approve payment request');
                      }
                    }}
                    onReject={async (requestId) => {
                      try {
                        await paymentRequestService.markAsRejected(requestId);
                        await loadPaymentRequests(); // Reload the list
                        setSuccessMessage('Payment request rejected');
                      } catch (err: any) {
                        setError(err.message || 'Failed to reject payment request');
                      }
                    }}
                    onView={(request) => {
                      // TODO: Implement view functionality
                      console.log('View request:', request);
                    }}
                    onEdit={(request) => {
                      // TODO: Implement edit functionality
                      console.log('Edit request:', request);
                    }}
                    loading={requestsLoading}
                    error={null}
                    isMobile={isMobile}
                  />
                )}
              </Box>
            </Box>
        </Box>
      </Box>

      <Dialog
        open={showAuthError}
        onClose={() => setShowAuthError(false)}
        maxWidth="sm"
        fullWidth
      >
        <AuthErrorReport
          error="Please log in to access payments"
          onRetry={() => {
            setShowAuthError(false);
          }}
          onLogin={() => {
            setShowAuthError(false);
            navigate('/login', {
              state: {
                from: location.pathname,
                message: 'Please log in to access payments'
              }
            });
          }}
        />
      </Dialog>
    </Box>
  );
};

export default PaymentsPage; 