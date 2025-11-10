import React, { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Grid,
  TextField,
  MenuItem,
  FormControl,
  InputLabel,
  Select,
  Button,
  Typography,
  Paper,
  Alert,
  Autocomplete
} from '@mui/material';
import { PaymentFormData, PaymentMethod, Currency } from '../../types/payment';
import paymentService from '../../services/paymentService';
import { salesContractService } from '../../services/accountantService';
import { useAuth } from '../../contexts/AuthContext';
import { useCompany } from '../../contexts/CompanyContext';
import { usePropertyService } from '../../services/propertyService';
import { Property } from '../../types/property';
import api from '../../api/axios';
import { buyerService } from '../../services/buyerService';

type Props = {
  onSubmit: (data: PaymentFormData) => Promise<void> | void;
  onCancel: () => void;
  isInstallment?: boolean;
  prefill?: {
    saleReference?: string;
    sellerName?: string;
    totalSalePrice?: number;
    commission?: {
      commissionPercent?: number;
      preaPercentOfCommission?: number;
      agencyPercentRemaining?: number;
      agentPercentRemaining?: number;
    }
  };
};

const PAYMENT_METHODS: PaymentMethod[] = ['bank_transfer', 'cash', 'credit_card', 'mobile_money'];
const CURRENCIES: Currency[] = ['USD', 'ZWL'];

const SalesPaymentForm: React.FC<Props> = ({ onSubmit, onCancel, isInstallment = false, prefill }) => {
  const { user } = useAuth();
  const { company } = useCompany();
  const [buyerName, setBuyerName] = useState('');
  const [sellerName, setSellerName] = useState('');
  const [agentId, setAgentId] = useState('');
  const [agents, setAgents] = useState<any[]>([]);
  const [paymentDate, setPaymentDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('bank_transfer');
  const [currency, setCurrency] = useState<Currency>('USD');
  const [saleReference, setSaleReference] = useState('');
  const [saleId, setSaleId] = useState<string>('');
  const [existingSales, setExistingSales] = useState<any[]>([]);
  const [totalSalePrice, setTotalSalePrice] = useState<string>('');
  const [amountPaid, setAmountPaid] = useState<string>('');
  const [preaPercentOfCommission, setPreaPercentOfCommission] = useState<number>(3);
  const [commissionPercent, setCommissionPercent] = useState<number>(5);
  const [agencyPercent, setAgencyPercent] = useState<number>(50);
  const [agentPercent, setAgentPercent] = useState<number>(50);
  const [preaShare, setPreaShare] = useState<number>(0);
  const [agencyShare, setAgencyShare] = useState<number>(0);
  const [agentShare, setAgentShare] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const propertyService = usePropertyService();
  const [properties, setProperties] = useState<Property[]>([]);
  const [loadingProperties, setLoadingProperties] = useState<boolean>(false);
  const [selectedPropertyId, setSelectedPropertyId] = useState<string>('');

  // Apply prefill values when provided (without clobbering user typing if not provided)
  useEffect(() => {
    if (!prefill) return;
    if (typeof prefill.saleReference === 'string') setSaleReference(prefill.saleReference);
    if (typeof prefill.sellerName === 'string') setSellerName(prefill.sellerName);
    if (typeof prefill.totalSalePrice === 'number' && !Number.isNaN(prefill.totalSalePrice)) setTotalSalePrice(String(prefill.totalSalePrice));
    if (prefill.commission) {
      if (typeof prefill.commission.commissionPercent === 'number') setCommissionPercent(prefill.commission.commissionPercent);
      if (typeof prefill.commission.preaPercentOfCommission === 'number') setPreaPercentOfCommission(prefill.commission.preaPercentOfCommission);
      if (typeof prefill.commission.agencyPercentRemaining === 'number') handleAgencyPercentChange(prefill.commission.agencyPercentRemaining);
      if (typeof prefill.commission.agentPercentRemaining === 'number') setAgentPercent(prefill.commission.agentPercentRemaining);
    }
  }, [prefill]);

  useEffect(() => {
    const loadAgents = async () => {
      try {
        const list = await paymentService.getAgentsPublic(user?.companyId, 'sales');
        setAgents(Array.isArray(list) ? list : []);
      } catch (err) {
        setAgents([]);
      }
    };
    loadAgents();
  }, [user?.companyId]);

  // Listen for external buyer prefill events from parent page (e.g., selecting a development unit)
  useEffect(() => {
    const handler = (e: any) => {
      const name = e?.detail?.name;
      if (typeof name === 'string' && name.trim()) setBuyerName(name.trim());
    };
    window.addEventListener('sales-form-set-buyer', handler as any);
    return () => window.removeEventListener('sales-form-set-buyer', handler as any);
  }, []);

  // Load properties for address/reference autocomplete
  useEffect(() => {
    let cancelled = false;
    const loadProps = async () => {
      try {
        setLoadingProperties(true);
        const list = await propertyService.getPublicProperties().catch(async () => {
          // Fallback to authenticated list if public fails
          try { return await propertyService.getProperties(); } catch { return []; }
        });
        const arr = Array.isArray(list) ? list : [];
        if (!cancelled) setProperties(arr.filter((p: any) => (p as any).rentalType === 'sale'));
      } catch {
        if (!cancelled) setProperties([]);
      } finally {
        if (!cancelled) setLoadingProperties(false);
      }
    };
    loadProps();
    return () => { cancelled = true; };
  }, [propertyService]);

  // When a property is selected for a non-development sale, auto-fill the Buyer field
  // from the buyers collection using the property's id. Do not override if buyerName
  // was already set (e.g., by development workflow or manual input).
  useEffect(() => {
    let cancelled = false;
    const maybePopulateBuyer = async () => {
      if (!selectedPropertyId) return;
      if ((buyerName || '').trim().length > 0) return;
      try {
        const buyers = await buyerService.list({ propertyId: selectedPropertyId });
        const list = Array.isArray(buyers) ? buyers : [];
        if (!cancelled && list.length > 0) {
          const best = list[0];
          const name = (best as any)?.name;
          if (typeof name === 'string' && name.trim()) {
            setBuyerName(name.trim());
          }
        }
      } catch {
        // ignore lookup errors; user can type manually
      }
    };
    maybePopulateBuyer();
    return () => { cancelled = true; };
  }, [selectedPropertyId, buyerName]);

  // Load existing sales contracts filtered by reference when user types
  useEffect(() => {
    let cancelled = false;
    const loadSales = async () => {
      try {
        const list = await salesContractService.list(saleReference ? { reference: saleReference } : undefined);
        if (!cancelled) setExistingSales(Array.isArray(list) ? list : []);
      } catch {
        if (!cancelled) setExistingSales([]);
      }
    };
    loadSales();
    return () => { cancelled = true; };
  }, [saleReference]);

  // Commission should be calculated from amount paid (not total price) for both quick and installment
  const totalCommission = useMemo(() => {
    const price = Number(totalSalePrice) || 0;
    return (commissionPercent / 100) * price;
  }, [totalSalePrice, commissionPercent]);

  const commissionOnPaid = useMemo(() => {
    const paid = Number(amountPaid) || 0;
    return (commissionPercent / 100) * paid;
  }, [amountPaid, commissionPercent]);

  useEffect(() => {
    // Calculate splits based on configured percentages
    // Always use commission based on amount paid
    const baseCommission = commissionOnPaid;
    const prea = (preaPercentOfCommission / 100) * baseCommission;
    const remaining = Math.max(0, baseCommission - prea);
    const agency = remaining * (agencyPercent / 100);
    const agent = remaining * (agentPercent / 100);
    setPreaShare(Number(prea.toFixed(2)));
    setAgencyShare(Number(agency.toFixed(2)));
    setAgentShare(Number(agent.toFixed(2)));
  }, [commissionOnPaid, preaPercentOfCommission, agencyPercent, agentPercent]);

  // Keep agent percent complementary to agency percent
  const handleAgencyPercentChange = (value: number) => {
    const v = Math.max(0, Math.min(100, value));
    setAgencyPercent(v);
    setAgentPercent(Number((100 - v).toFixed(2)));
  };

  const sellerRevenue = useMemo(() => {
    const paid = Number(amountPaid) || 0;
    const vatRate = Math.max(0, Math.min(1, Number(company?.commissionConfig?.vatPercentOnCommission ?? 0.15)));
    const vatOnCommission = vatRate * commissionOnPaid;
    return Math.max(0, paid - commissionOnPaid - vatOnCommission);
  }, [amountPaid, commissionOnPaid, company?.commissionConfig?.vatPercentOnCommission]);

  const ownerAmountForThisPayment = useMemo(() => {
    const paid = Number(amountPaid) || 0;
    const vatRate = Math.max(0, Math.min(1, Number(company?.commissionConfig?.vatPercentOnCommission ?? 0.15)));
    const vatOnCommission = vatRate * commissionOnPaid;
    return Math.max(0, paid - commissionOnPaid - vatOnCommission);
  }, [amountPaid, commissionOnPaid, company?.commissionConfig?.vatPercentOnCommission]);

  const handleSubmit = async () => {
    try {
      setSubmitting(true);
      setError(null);
      const price = Number(totalSalePrice) || 0;
      const paid = Number(amountPaid) || 0;
      if (!buyerName || !sellerName || !paymentDate || price <= 0 || paid <= 0) {
        setError('Please fill buyer, seller, date, total sale price, and amount paid');
        return;
      }
      // Ensure splits sum to commission for this payment
      const sumSplits = Number((preaShare + agencyShare + agentShare).toFixed(2));
      const totalCommRounded = Number(commissionOnPaid.toFixed(2));
      if (Math.abs(sumSplits - totalCommRounded) > 0.02) {
        setError('Commission splits must add up to total commission');
        return;
      }

      const data: PaymentFormData = {
        paymentType: 'sale',
        saleMode: isInstallment ? 'installment' : 'quick',
        propertyType: 'residential',
        // Prefer linked sale property when chosen
        propertyId: selectedPropertyId || 'manual_sale',
        tenantId: 'manual_buyer',
        agentId: agentId || '',
        paymentDate: new Date(paymentDate),
        paymentMethod,
        amount: paid,
        depositAmount: 0,
        referenceNumber: saleReference || '',
        notes: `Sale: Buyer ${buyerName}; Seller ${sellerName}; Total Sale Price ${price.toLocaleString()} ${currency}${isInstallment ? `; Installment ${paid.toLocaleString()} ${currency}` : ''}`,
        currency,
        leaseId: '',
        companyId: user?.companyId || '',
        rentalPeriodMonth: new Date(paymentDate).getMonth() + 1,
        rentalPeriodYear: new Date(paymentDate).getFullYear(),
        commissionDetails: {
          totalCommission: totalCommRounded,
          preaFee: Number(preaShare.toFixed(2)),
          agentShare: Number(agentShare.toFixed(2)),
          agencyShare: Number(agencyShare.toFixed(2)),
          ownerAmount: Number(ownerAmountForThisPayment.toFixed(2))
        },
        processedBy: user?._id || '',
        // Use manual fields to satisfy backend validation when no property/tenant
        manualPropertyAddress: saleReference || `Sale - ${sellerName}`,
        manualTenantName: buyerName,
        // Optional linkage to SalesContract for installments and summaries
        saleId: saleId || undefined,
        // Explicitly include buyer/seller fields for backend persistence
        buyerName,
        sellerName
      } as PaymentFormData;

      await Promise.resolve(onSubmit(data));
    } catch (err: any) {
      setError(err?.message || 'Failed to save sale payment');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Paper elevation={2} sx={{ p: 2 }}>
      <Typography variant="h6" sx={{ mb: 2 }}>New Sale Payment</Typography>
      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}
      <Grid container spacing={2}>
        <Grid item xs={12} md={6}>
          <TextField fullWidth label="Buyer" value={buyerName} onChange={(e) => setBuyerName(e.target.value)} />
        </Grid>
        <Grid item xs={12} md={6}>
          <TextField fullWidth label="Seller" value={sellerName} onChange={(e) => setSellerName(e.target.value)} />
        </Grid>
        <Grid item xs={12} md={6}>
          <FormControl fullWidth>
            <InputLabel>Sales Agent</InputLabel>
            <Select value={agentId} label="Sales Agent" onChange={(e) => setAgentId(e.target.value as string)}>
              <MenuItem value="">None</MenuItem>
              {agents.map((a: any) => (
                <MenuItem key={a._id || a.id} value={a._id || a.id}>
                  {a.firstName ? `${a.firstName} ${a.lastName || ''}` : (a.name || a.email || a._id)}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Grid>
        <Grid item xs={12} md={6}>
          <Autocomplete
            freeSolo
            options={properties}
            loading={loadingProperties}
            getOptionLabel={(option: any) => {
              if (typeof option === 'string') return option;
              const name = option.name || option.propertyName || '';
              const address = option.address || '';
              const label = [name, address].filter(Boolean).join(' - ');
              return label || option._id || '';
            }}
            filterOptions={(opts, state) => {
              // Default filtering over combined label
              const input = (state.inputValue || '').toLowerCase();
              const filtered = (opts as any[]).filter(o => {
                const label = (typeof o === 'string') ? o : `${o.name || o.propertyName || ''} ${o.address || ''}`;
                return label.toLowerCase().includes(input);
              });
              // Also include raw input for manual entry
              if (input && !filtered.some(o => (typeof o === 'string' ? o : `${o.name || ''} ${o.address || ''}`).toLowerCase() === input)) {
                return [state.inputValue, ...filtered];
              }
              return filtered;
            }}
            value={saleReference}
            onChange={(_, newValue) => {
              if (typeof newValue === 'string') {
                setSaleReference(newValue);
                setSelectedPropertyId('');
              } else if (newValue) {
                const label = `${(newValue as any).name || (newValue as any).propertyName || ''} ${(newValue as any).address || ''}`.trim();
                setSaleReference(label || (newValue as any)._id || '');
                setSelectedPropertyId((newValue as any)._id || '');
                // Auto-populate commission and price from selected property if present
                const prop: any = newValue as any;
                if (typeof prop?.commission === 'number') setCommissionPercent(Number(prop.commission));
                if (typeof prop?.commissionPreaPercent === 'number') setPreaPercentOfCommission(Number(prop.commissionPreaPercent));
                if (typeof prop?.commissionAgencyPercentRemaining === 'number') setAgencyPercent(Number(prop.commissionAgencyPercentRemaining));
                if (typeof prop?.commissionAgentPercentRemaining === 'number') setAgentPercent(Number(prop.commissionAgentPercentRemaining));
                if (typeof prop?.price === 'number' && !isNaN(prop.price)) setTotalSalePrice(String(prop.price));
                // Auto-populate Seller from sales owner (propertyOwnerId from property -> GET /sales-owners/:id)
                const ownerId = (prop as any).propertyOwnerId;
                if (ownerId) {
                  api.get(`/sales-owners/${ownerId}`).then((resp) => {
                    const owner = resp.data as any;
                    const name = [owner?.firstName, owner?.lastName].filter(Boolean).join(' ').trim();
                    if (name) setSellerName(name);
                  }).catch(() => {/* ignore */});
                }
              } else {
                setSaleReference('');
                setSelectedPropertyId('');
              }
            }}
            inputValue={saleReference}
            onInputChange={(_, newInput) => setSaleReference(newInput)}
            renderInput={(params) => (
              <TextField {...params} fullWidth label="Sale Reference / Address" placeholder="Start typing to search properties or enter manually" />
            )}
          />
        </Grid>
        <Grid item xs={12} md={6}>
          <FormControl fullWidth>
            <InputLabel>Link to Sale</InputLabel>
            <Select
              value={saleId}
              label="Link to Sale"
              onChange={(e) => setSaleId(e.target.value as string)}
            >
              <MenuItem value="">Create new sale...</MenuItem>
              {existingSales.map((s: any) => (
                <MenuItem key={s._id} value={s._id}>
                  {s.reference || s.manualPropertyAddress || s.buyerName} • {s.currency || 'USD'} {Number(s.totalSalePrice || 0).toLocaleString()}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Grid>

        <Grid item xs={12} md={4}>
          <TextField fullWidth label="Total Sale Price" type="number" value={totalSalePrice} onChange={(e) => setTotalSalePrice(e.target.value)} inputProps={{ min: 0, step: '0.01' }} />
        </Grid>
        <Grid item xs={12} md={4}>
          <TextField fullWidth label="Amount Paid" type="number" value={amountPaid} onChange={(e) => setAmountPaid(e.target.value)} inputProps={{ min: 0, step: '0.01' }} />
        </Grid>
        <Grid item xs={12} md={4}>
          <FormControl fullWidth>
            <InputLabel>Currency</InputLabel>
            <Select value={currency} label="Currency" onChange={(e) => setCurrency(e.target.value as Currency)}>
              {CURRENCIES.map(c => (
                <MenuItem key={c} value={c}>{c}</MenuItem>
              ))}
            </Select>
          </FormControl>
        </Grid>

        <Grid item xs={12} md={4}>
          <TextField fullWidth label="Payment Date" type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} InputLabelProps={{ shrink: true }} />
        </Grid>
        <Grid item xs={12} md={4}>
          <FormControl fullWidth>
            <InputLabel>Payment Method</InputLabel>
            <Select value={paymentMethod} label="Payment Method" onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}>
              {PAYMENT_METHODS.map(m => (
                <MenuItem key={m} value={m}>{m.replace('_', ' ')}</MenuItem>
              ))}
            </Select>
          </FormControl>
        </Grid>
        <Grid item xs={12} md={4}>
          <TextField fullWidth label="Commission %" type="number" value={commissionPercent} onChange={(e) => setCommissionPercent(Number(e.target.value))} inputProps={{ min: 0, max: 100, step: '0.1' }} />
        </Grid>

        <Grid item xs={12}>
          <Paper variant="outlined" sx={{ p: 2 }}>
            <Typography variant="subtitle1" sx={{ mb: 1 }}>Commission Split</Typography>
            <Grid container spacing={2}>
              <Grid item xs={12} md={3}>
                <TextField fullWidth label="Total Commission" value={totalCommission.toFixed(2)} InputProps={{ readOnly: true }} />
              </Grid>
              <Grid item xs={12} md={3}>
                <TextField fullWidth label="PREA % of Commission" type="number" value={preaPercentOfCommission} onChange={(e) => setPreaPercentOfCommission(Number(e.target.value))} inputProps={{ min: 0, max: 100, step: '0.1' }} />
              </Grid>
              <Grid item xs={12} md={3}>
                <TextField fullWidth label="PREA Share" type="number" value={preaShare} onChange={(e) => setPreaShare(Number(e.target.value))} inputProps={{ min: 0, step: '0.01' }} />
              </Grid>
              <Grid item xs={12} md={3}>
                <TextField fullWidth label={`Seller Revenue (paid - commission - VAT ${Number(((company?.commissionConfig?.vatPercentOnCommission ?? 0.15) * 100).toFixed(2))}% on commission)`} value={sellerRevenue.toFixed(2)} InputProps={{ readOnly: true }} />
              </Grid>
              <Grid item xs={12} md={3}>
                <TextField fullWidth label="Agency % of Remaining" type="number" value={agencyPercent} onChange={(e) => handleAgencyPercentChange(Number(e.target.value))} inputProps={{ min: 0, max: 100, step: '0.1' }} />
              </Grid>
              <Grid item xs={12} md={3}>
                <TextField fullWidth label="Agent % of Remaining" type="number" value={agentPercent} InputProps={{ readOnly: true }} />
              </Grid>
              <Grid item xs={12} md={3}>
                <TextField fullWidth label="Agency Share Amount" value={agencyShare.toFixed(2)} InputProps={{ readOnly: true }} />
              </Grid>
              <Grid item xs={12} md={3}>
                <TextField fullWidth label="Agent Share Amount" value={agentShare.toFixed(2)} InputProps={{ readOnly: true }} />
              </Grid>
            </Grid>
            <Typography variant="caption" color="text.secondary">
              By default PREA is {preaPercentOfCommission}% of commission. Remaining commission is split between agency and agent (default 50/50). You can edit the percentages per sale.
            </Typography>
          </Paper>
        </Grid>

        <Grid item xs={12} display="flex" justifyContent="flex-end" gap={2}>
          <Button variant="outlined" onClick={onCancel} disabled={submitting}>Cancel</Button>
          <Button variant="contained" onClick={handleSubmit} disabled={submitting}>
            {submitting ? 'Saving...' : 'Save Sale Payment'}
          </Button>
          {!saleId && (
            <Button
              variant="text"
              disabled={submitting || !buyerName || !(Number(totalSalePrice) > 0)}
              onClick={async () => {
                try {
                  setSubmitting(true);
                  const contract = await salesContractService.create({
                    buyerName,
                    sellerName: sellerName || undefined,
                    manualPropertyAddress: saleReference || undefined,
                    totalSalePrice: Number(totalSalePrice),
                    currency,
                    commissionPercent,
                    preaPercentOfCommission,
                    agencyPercentRemaining: agencyPercent,
                    agentPercentRemaining: agentPercent,
                    reference: saleReference || undefined
                  });
                  setSaleId(contract._id);
                } catch (e: any) {
                  setError(e?.message || 'Failed to create sale');
                } finally {
                  setSubmitting(false);
                }
              }}
            >
              Create Sale First
            </Button>
          )}
        </Grid>
      </Grid>
    </Paper>
  );
};

export default SalesPaymentForm;


