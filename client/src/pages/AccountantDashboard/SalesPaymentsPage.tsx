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
  const [filters, setFilters] = useState<PaymentFilter>({ saleMode: 'quick' as any });
  // Development linkage state
  const [developments, setDevelopments] = useState<any[]>([]);
  const [selectedDevId, setSelectedDevId] = useState<string>('');
  const [units, setUnits] = useState<any[]>([]);
  const [selectedUnitId, setSelectedUnitId] = useState<string>('');
  const [saleId, setSaleId] = useState<string>('');
  const [commissionDefaults, setCommissionDefaults] = useState<{ commissionPercent?: number; preaPercentOfCommission?: number; agencyPercentRemaining?: number; agentPercentRemaining?: number }>({});
  const [prefill, setPrefill] = useState<{ saleReference?: string; sellerName?: string; totalSalePrice?: number; commission?: { commissionPercent?: number; preaPercentOfCommission?: number; agencyPercentRemaining?: number; agentPercentRemaining?: number } } | undefined>(undefined);

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
        const [propertiesData, tenantsData, paymentsData, devs] = await Promise.all([
          propertyService.getProperties().catch(() => []),
          tenantService.getAll().catch(() => ({ tenants: [] })),
          paymentService.getSalesPayments().catch(() => []),
          developmentService.list().catch(() => [])
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
        setDevelopments(Array.isArray(devs) ? devs : []);
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
      const payload: PaymentFormData = { ...data, paymentType: 'sale' } as any;
      if (saleId) (payload as any).saleId = saleId;
      if (selectedDevId) (payload as any).developmentId = selectedDevId;
      if (selectedUnitId) (payload as any).developmentUnitId = selectedUnitId as any;
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
                    // Load only sold units and include only those with a buyer set
                    const data = await developmentUnitService.list({ developmentId: id, requireBuyer: true, limit: 500 });
                    const list = Array.isArray(data) ? data : (data?.items || []);
                    setUnits(list as any[]);
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
                    // Try to resolve an existing sale by buyerName + development name
                    const unit = (units || []).find((u: any) => String(u._id || u.id) === String(uid));
                    const buyerName = unit?.buyerName || '';
                    const dev = (developments || []).find((d: any) => String(d._id || d.id) === String(selectedDevId));
                    const devName = dev?.name || '';
                    const list = await salesContractService.list({ reference: '' });
                    const found = (Array.isArray(list) ? list : []).find((s: any) => {
                      const ref = String(s.reference || s.manualPropertyAddress || '').toLowerCase();
                      return (buyerName && String(s.buyerName||'').toLowerCase() === String(buyerName).toLowerCase()) || (ref && (ref.includes(devName.toLowerCase())));
                    });
                    if (found) setSaleId(found._id);
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
                    // Prefill reference with development address + unit code/number, and price from unit
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
          onCancel={() => setShowForm(false)}
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


