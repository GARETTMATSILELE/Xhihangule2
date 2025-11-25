import React, { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Typography,
  Button,
  Alert,
  ToggleButton,
  ToggleButtonGroup,
  Grid,
  TextField,
  MenuItem
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
import salesReceiptService from '../../services/salesReceiptService';
import SalesPaymentForm from '../../components/payments/SalesPaymentForm';
import { developmentService } from '../../services/developmentService';
import { developmentUnitService } from '../../services/developmentUnitService';
import { salesContractService } from '../../services/accountantService';
import { buyerService } from '../../services/buyerService';

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
  const [filters, setFilters] = useState<PaymentFilter>({ saleMode: 'quick' as any, page: 1 as any, limit: 25 as any });
  const [totalCount, setTotalCount] = useState<number | undefined>(undefined);
  // Development linkage state
  const [developments, setDevelopments] = useState<any[]>([]);
  const [selectedDevId, setSelectedDevId] = useState<string>('');
  const [units, setUnits] = useState<any[]>([]);
  const [selectedUnitId, setSelectedUnitId] = useState<string>('');
  const [saleId, setSaleId] = useState<string>('');
  const [commissionDefaults, setCommissionDefaults] = useState<{ commissionPercent?: number; preaPercentOfCommission?: number; agencyPercentRemaining?: number; agentPercentRemaining?: number }>({});
  const [prefill, setPrefill] = useState<{ saleReference?: string; sellerName?: string; totalSalePrice?: number; commission?: { commissionPercent?: number; preaPercentOfCommission?: number; agencyPercentRemaining?: number; agentPercentRemaining?: number } } | undefined>(undefined);

  // Cache units per development to avoid repeat network calls when toggling
  const unitsCache = React.useRef<Record<string, any[]>>({});

  // Reset all form-related local state so each new payment starts clean
  const resetFormState = React.useCallback(() => {
    setSelectedDevId('');
    setSelectedUnitId('');
    setSaleId('');
    setUnits([]);
    setCommissionDefaults({});
    setPrefill(undefined);
  }, []);

  // Consistent newest-first ordering (paymentDate -> createdAt fallback)
  const sortSalesPayments = React.useCallback((list: Payment[]) => {
    const toTime = (p: any) => {
      const d = p?.paymentDate || p?.createdAt || p?.updatedAt;
      return d ? new Date(d).getTime() : 0;
    };
    return [...list].sort((a, b) => toTime(b) - toTime(a));
  }, []);

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
        const [propertiesData, paymentsPage] = await Promise.all([
          propertyService.getProperties().catch(() => []),
          paymentService.getSalesPaymentsPage({ saleMode: mode, page: 1, limit: (filters as any).limit || 25, noDevelopment: undefined }).catch(() => ({ items: [], total: 0, page: 1, pages: 1 }))
        ]);
        if (!isMounted) return;
        const properties = Array.isArray(propertiesData) ? propertiesData : [];
        const payments = sortSalesPayments(((paymentsPage as any)?.items || []) as Payment[])
          .filter(p => p.paymentType === 'sale')
          .filter(p => (p as any).saleMode === mode);
        setProperties(properties);
        setTenants([]); // avoid heavy tenants load; rely on populated data for display
        setPayments(payments);
        setTotalCount(Number((paymentsPage as any)?.total) || payments.length);
        // Defer development list fetch until form is opened
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

  // Fetch developments only when needed (when form opens), and only once
  useEffect(() => {
    let isMounted = true;
    const fetchDevsIfNeeded = async () => {
      if (!showForm) return;
      if ((developments || []).length > 0) return;
      try {
        const devs = await developmentService.list({
          fields: '_id,name,address,commissionPercent,commissionPreaPercent,commissionAgencyPercentRemaining,commissionAgentPercentRemaining,owner.firstName,owner.lastName,variations.id,variations.label'
        }).catch(() => []);
        if (!isMounted) return;
        setDevelopments(Array.isArray(devs) ? devs : []);
      } catch {}
    };
    fetchDevsIfNeeded();
    return () => { isMounted = false; };
  }, [showForm, developments]);

  useEffect(() => {
    const applyFilters = async () => {
      try {
        setLoading(true);
        setError(null);
        const page = Number((filters as any).page || 1);
        const limit = Number((filters as any).limit || 25);
        const resp = await paymentService.getSalesPaymentsPage({ ...(filters as any), paymentType: 'sale', saleMode: mode, page, limit });
        const list = Array.isArray((resp as any).items) ? (resp as any).items : [];
        const onlySales = list.filter((p: any) => p.paymentType === 'sale');
        const next = (onlySales as any[]).filter(p => (p as any).saleMode === mode) as Payment[];
        setPayments(sortSalesPayments(next));
        setTotalCount(Number((resp as any).total) || next.length);
      } catch (err: any) {
        setError(err instanceof Error ? err.message : 'Failed to load payments');
      } finally {
        setLoading(false);
      }
    };
    applyFilters();
  }, [filters, mode, sortSalesPayments]);

  useEffect(() => {
    setFilters(prev => ({ ...prev, saleMode: mode }));
  }, [mode]);

  const handleCreatePayment = async (data: PaymentFormData) => {
    try {
      setLoading(true);
      setError(null);
      const payload: PaymentFormData = { ...data, paymentType: 'sale' } as any;
      if (saleId) (payload as any).saleId = saleId;
      if (selectedDevId) (payload as any).developmentId = selectedDevId;
      if (selectedUnitId) (payload as any).developmentUnitId = selectedUnitId as any;
      const created = await paymentService.createSalesPaymentAccountant(payload);
      const createdPayment = (created as any)?.payment || (created as any)?.data || created;
      if (createdPayment && (createdPayment as any).paymentType === 'sale') {
        setPayments(prev => {
          const filtered = (prev || []).filter(p => (p as any).saleMode === mode);
          const next = [createdPayment as Payment, ...filtered];
          return sortSalesPayments(next);
        });
      }
      // Ensure next entry starts from a clean form
      resetFormState();
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
        <>
        <Box sx={{ mb: 2 }}>
          <Grid container spacing={2}>
            <Grid item xs={12} md={4}>
              <TextField select fullWidth label="Development" value={selectedDevId} onChange={async (e) => {
                const id = e.target.value;
                setSelectedDevId(id);
                setSelectedUnitId('');
                setSaleId('');
                setCommissionDefaults({});
                // Reset prefill; will reapply after data loads
                setPrefill(undefined);
                if (id) {
                  try {
                    // Use cache if available for instant UI; fallback to network and update cache
                    const cached = unitsCache.current[id];
                    if (cached) {
                      setUnits(cached as any[]);
                    } else {
                      // Load only sold units and include only those with a buyer set; request a lightweight payload
                      const data = await developmentUnitService.list({ developmentId: id, requireBuyer: true, limit: 500, fields: 'id,_id,unitCode,unitNumber,variationId,price,buyerName' } as any);
                      const list = Array.isArray(data) ? data : (data?.items || []);
                      unitsCache.current[id] = list as any[];
                      setUnits(list as any[]);
                    }
                    // Apply commission defaults
                    const dev = (developments || []).find((d: any) => String(d._id || d.id) === String(id));
                    if (dev) {
                      setCommissionDefaults({
                        commissionPercent: dev.commissionPercent,
                        preaPercentOfCommission: dev.commissionPreaPercent,
                        agencyPercentRemaining: dev.commissionAgencyPercentRemaining,
                        agentPercentRemaining: dev.commissionAgentPercentRemaining
                      });
                      // Prefill seller from owner and base address for reference
                      const ownerName = [dev.owner?.firstName, dev.owner?.lastName].filter(Boolean).join(' ').trim();
                      const baseRef = [dev.name, dev.address].filter(Boolean).join(' - ');
                      setPrefill(prev => ({
                        ...prev,
                        saleReference: baseRef || prev?.saleReference,
                        sellerName: ownerName || prev?.sellerName,
                        commission: {
                          commissionPercent: dev.commissionPercent,
                          preaPercentOfCommission: dev.commissionPreaPercent,
                          agencyPercentRemaining: dev.commissionAgencyPercentRemaining,
                          agentPercentRemaining: dev.commissionAgentPercentRemaining
                        }
                      }));
                    }
                  } catch {
                    setUnits([]);
                  }
                } else {
                  setUnits([]);
                }
              }}>
                <MenuItem value="">None</MenuItem>
                {(developments || []).map((d: any) => (
                  <MenuItem key={d._id || d.id} value={d._id || d.id}>
                    {d.name}{d.address ? ` — ${d.address}` : ''}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid item xs={12} md={4}>
              <TextField select fullWidth label="Unit" value={selectedUnitId} onChange={async (e) => {
                const uid = e.target.value;
                setSelectedUnitId(uid);
                setSaleId('');
                if (uid) {
                  try {
                    // Avoid full contracts fetch; prefer fast local prefill and defer linking
                    const unit = (units || []).find((u: any) => String(u._id || u.id) === String(uid));
                    const dev = (developments || []).find((d: any) => String(d._id || d.id) === String(selectedDevId));
                    // Auto-fill buyer by querying buyers collection with development/unit filters
                    try {
                      const buyers = await buyerService.list({ developmentId: selectedDevId, developmentUnitId: uid });
                      const b = Array.isArray(buyers) ? buyers[0] : undefined;
                      if (b) {
                        setPrefill(prev => ({
                          ...prev,
                          sellerName: prev?.sellerName, // keep seller if set from dev owner
                          saleReference: prev?.saleReference,
                          // SalesPaymentForm reads buyerName from its own state; we pass via prefill by trick: set saleReference which triggers contract search; it still allows manual edit
                        }));
                        // Imperatively set buyerName by dispatching a custom event (form is sibling component)
                        window.dispatchEvent(new CustomEvent('sales-form-set-buyer', { detail: { name: b.name } }));
                      }
                    } catch {}
                    // Prefill reference with development address + unit code/number, and price from unit (fast, local)
                    const unitLabel = unit?.unitCode || (unit?.unitNumber ? `Unit ${unit.unitNumber}` : '');
                    const baseRef = [dev?.name, dev?.address, unitLabel].filter(Boolean).join(' - ');
                    const unitPrice = typeof unit?.price === 'number' ? unit.price : undefined;
                    setPrefill(prev => ({
                      ...prev,
                      saleReference: baseRef || prev?.saleReference,
                      totalSalePrice: typeof unitPrice === 'number' ? unitPrice : prev?.totalSalePrice
                    }));
                  } catch {}
                }
              }} disabled={!selectedDevId} helperText={!selectedDevId ? 'Select a development first' : undefined}>
                <MenuItem value="">None</MenuItem>
                {(units || []).map((u: any) => {
                  const dev = (developments || []).find((d: any) => String(d._id || d.id) === String(selectedDevId));
                  const variationLabel = (dev?.variations || []).find((v: any) => String(v.id || v._id) === String(u.variationId))?.label;
                  const display = u.unitCode
                    ? (variationLabel ? `${u.unitCode} • ${variationLabel}` : u.unitCode)
                    : (variationLabel ? `${variationLabel}${u.unitNumber ? ` • Unit ${u.unitNumber}` : ''}` : `Unit ${u.unitNumber || ''}`);
                  return (
                    <MenuItem key={u._id || u.id} value={u._id || u.id}>
                      {display}
                    </MenuItem>
                  );
                })}
              </TextField>
            </Grid>
            <Grid item xs={12} md={4}>
              <TextField fullWidth label="Linked Sale (optional)" value={saleId} onChange={(e)=>setSaleId(e.target.value)} placeholder="Auto-filled when found" />
            </Grid>
          </Grid>
        </Box>
        <SalesPaymentForm
          onSubmit={async (data) => {
            await handleCreatePayment(data);
            setShowForm(false);
          }}
          onCancel={() => {
            // Clear any previous selections/prefill when cancelling
            resetFormState();
            setShowForm(false);
          }}
          isInstallment={mode === 'installment'}
          prefill={prefill}
        />
        </>
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
          totalCount={totalCount}
          disableOutstandingFetch={mode === 'quick'}
          getReceiptForPrint={async (payment) => {
            // Always use the dedicated sales receipt for sales payments
            return await salesReceiptService.getSalesPaymentReceipt(payment._id, user?.companyId);
          }}
        />
      )}
    </Box>
  );
};

export default SalesPaymentsPage;


