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
  Autocomplete,
  FormControlLabel,
  Switch
} from '@mui/material';
import { PaymentFormData, PaymentMethod, Currency, Payment } from '../../types/payment';
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
  initialData?: Payment;
  submitLabel?: string;
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
  onAgentChange?: (agentId: string) => void;
};

const PAYMENT_METHODS: PaymentMethod[] = ['bank_transfer', 'cash', 'credit_card', 'mobile_money'];
const CURRENCIES: Currency[] = ['USD', 'ZiG', 'ZAR'];
const DEFAULT_SALE_VAT_RATE_PERCENT = 15.5;

const SalesPaymentForm: React.FC<Props> = ({ onSubmit, onCancel, isInstallment = false, initialData, submitLabel, prefill, onAgentChange }) => {
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
  const [seededProperties, setSeededProperties] = useState<Property[]>([]);
  const [loadingProperties, setLoadingProperties] = useState<boolean>(false);
  const [selectedPropertyId, setSelectedPropertyId] = useState<string>('');
  const [vatIncluded, setVatIncluded] = useState<boolean>(false);
  const [vatRatePercent, setVatRatePercent] = useState<number>(DEFAULT_SALE_VAT_RATE_PERCENT);
  const propertyOptions = useMemo(() => {
    const out: any[] = [];
    const seen = new Set<string>();
    for (const p of (properties || []) as any[]) {
      const pid = String(p?._id || p?.id || '').trim();
      const label = `${p?.name || p?.propertyName || ''} ${p?.address || ''}`.trim();
      const key = pid ? `id:${pid}` : `label:${label.toLowerCase()}`;
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(p);
    }
    return out;
  }, [properties]);

  useEffect(() => {
    if (!initialData) return;
    setBuyerName(String((initialData as any).buyerName || ''));
    setSellerName(String((initialData as any).sellerName || ''));
    setAgentId(String((initialData as any).agentId || ''));
    setPaymentDate(initialData.paymentDate ? new Date(initialData.paymentDate).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10));
    setPaymentMethod((initialData.paymentMethod as PaymentMethod) || 'bank_transfer');
    setCurrency((initialData.currency as Currency) || 'USD');
    setSaleReference(String((initialData as any).referenceNumber || (initialData as any).manualPropertyAddress || ''));
    setSaleId(String((initialData as any).saleId || ''));
    setAmountPaid(String(Math.abs(Number((initialData as any).amount || 0))));
    setVatIncluded(Boolean((initialData as any).vatIncluded));
    const vr = Number((initialData as any).vatRate);
    if (Number.isFinite(vr) && vr >= 0) {
      setVatRatePercent(vr <= 1 ? vr * 100 : vr);
    }
    const totalComm = Number((initialData as any)?.commissionDetails?.totalCommission || 0);
    const preaFee = Number((initialData as any)?.commissionDetails?.preaFee || 0);
    const agency = Number((initialData as any)?.commissionDetails?.agencyShare || 0);
    const agent = Number((initialData as any)?.commissionDetails?.agentShare || 0);
    if (totalComm > 0) {
      const grossPaid = Math.abs(Number((initialData as any).amount || 0));
      const initialVatIncluded = Boolean((initialData as any).vatIncluded);
      const initialVatRateRaw = Number((initialData as any).vatRate);
      const initialVatRate = Number.isFinite(initialVatRateRaw)
        ? (initialVatRateRaw <= 1 ? initialVatRateRaw : initialVatRateRaw / 100)
        : (DEFAULT_SALE_VAT_RATE_PERCENT / 100);
      const taxableBase = initialVatIncluded ? grossPaid / (1 + initialVatRate) : grossPaid;
      setCommissionPercent(Math.max(0, Number((((totalComm / Math.max(1, taxableBase)) * 100)).toFixed(2))));
      setPreaPercentOfCommission(Math.max(0, Number(((preaFee / totalComm) * 100).toFixed(2))));
      const rem = Math.max(0, totalComm - preaFee);
      const agencyPct = rem > 0 ? Math.max(0, Math.min(100, Number(((agency / rem) * 100).toFixed(2)))) : 50;
      handleAgencyPercentChange(agencyPct);
    }
    const notes = String((initialData as any).notes || '');
    const totalSale = notes.match(/Total\s+Sale\s+Price\s+([0-9,.]+)/i);
    if (totalSale?.[1]) {
      const parsed = Number(totalSale[1].replace(/,/g, ''));
      if (Number.isFinite(parsed) && parsed > 0) setTotalSalePrice(String(parsed));
    }
  }, [initialData]);

  // In edit mode, ensure total sale price is hydrated from linked sale when notes do not include it.
  useEffect(() => {
    let cancelled = false;
    const loadLinkedSaleTotal = async () => {
      const linkedSaleId = String((initialData as any)?.saleId || '');
      if (!linkedSaleId) return;
      const current = Number(totalSalePrice);
      if (Number.isFinite(current) && current > 0) return;
      try {
        const sale = await salesContractService.get(linkedSaleId);
        const total = Number((sale as any)?.totalSalePrice || 0);
        if (!cancelled && Number.isFinite(total) && total > 0) {
          setTotalSalePrice(String(total));
        }
      } catch {
        // keep manual/notes-based value if lookup fails
      }
    };
    loadLinkedSaleTotal();
    return () => { cancelled = true; };
  }, [initialData, totalSalePrice]);

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

  // Seed with latest sale properties for autocomplete
  useEffect(() => {
    let cancelled = false;
    const seed = async () => {
      try {
        setLoadingProperties(true);
        // Lightweight seed: latest sale properties, minimal fields
        const list = await (propertyService as any).searchPublicProperties?.({
          saleOnly: true,
          limit: 20,
          fields: 'id,_id,name,address,price,commission,commissionPreaPercent,commissionAgencyPercentRemaining,commissionAgentPercentRemaining,propertyOwnerId,buyerId,rentalType'
        }).catch(async () => {
          try { return await propertyService.getProperties(); } catch { return []; }
        });
        const arr = Array.isArray(list) ? list : [];
        if (!cancelled) {
          setSeededProperties(arr as any[]);
          setProperties(arr as any[]);
        }
      } catch {
        if (!cancelled) {
          setSeededProperties([]);
          setProperties([]);
        }
      } finally {
        if (!cancelled) setLoadingProperties(false);
      }
    };
    seed();
    return () => { cancelled = true; };
  }, []);

  // Debounced search as user types sale reference/address
  useEffect(() => {
    let cancelled = false;
    const handle = setTimeout(async () => {
      try {
        const q = (saleReference || '').trim();
        if (!q) {
          // When clearing the search, restore the seeded default list
          if (!cancelled) {
            setProperties(seededProperties);
            setLoadingProperties(false);
          }
          return;
        }
        setLoadingProperties(true);
        const list = await (propertyService as any).searchPublicProperties?.({
          q,
          saleOnly: true,
          limit: 20,
          fields: 'id,_id,name,address,price,commission,commissionPreaPercent,commissionAgencyPercentRemaining,commissionAgentPercentRemaining,propertyOwnerId,buyerId,rentalType'
        });
        if (!cancelled) {
          setProperties(Array.isArray(list) ? (list as any[]) : []);
        }
      } catch {
        if (!cancelled) setProperties([]);
      } finally {
        if (!cancelled) setLoadingProperties(false);
      }
    }, 250);
    return () => { cancelled = true; clearTimeout(handle); };
  }, [saleReference, seededProperties]);

  // When a property is selected for a non-development sale, auto-fill the Buyer field
  // from the buyers collection using the property's id. Do not override if buyerName
  // was already set (e.g., by development workflow or manual input).
  useEffect(() => {
    let cancelled = false;
    const maybePopulateBuyer = async () => {
      if (!selectedPropertyId) return;
      if ((buyerName || '').trim().length > 0) return;
      try {
        // Prefer Property.buyerId when available (more deterministic than querying by propertyId)
        const prop: any = (properties || []).find((p: any) => String(p?._id || '') === String(selectedPropertyId));
        const buyerId = prop?.buyerId;
        if (buyerId) {
          const b = await buyerService.get(String(buyerId));
          const name = (b as any)?.name;
          if (!cancelled && typeof name === 'string' && name.trim()) {
            setBuyerName(name.trim());
            return;
          }
        }
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

  const vatRateDecimal = useMemo(() => {
    const raw = Number(vatRatePercent);
    const bounded = Math.max(0, Math.min(100, Number.isFinite(raw) ? raw : DEFAULT_SALE_VAT_RATE_PERCENT));
    return bounded / 100;
  }, [vatRatePercent]);

  const commissionOnPaid = useMemo(() => {
    const paid = Number(amountPaid) || 0;
    // VAT is not income: deduct included VAT first, then apply commission.
    const taxableBase = vatIncluded ? paid / (1 + vatRateDecimal) : paid;
    return (commissionPercent / 100) * taxableBase;
  }, [amountPaid, commissionPercent, vatIncluded, vatRateDecimal]);

  const vatAmountOnPayment = useMemo(() => {
    if (!vatIncluded) return 0;
    const paid = Number(amountPaid) || 0;
    const taxableBase = paid / (1 + vatRateDecimal);
    return Math.max(0, paid - taxableBase);
  }, [amountPaid, vatIncluded, vatRateDecimal]);

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
    const taxableBase = Math.max(0, paid - vatAmountOnPayment);
    const vatRate = Math.max(0, Math.min(1, Number(company?.commissionConfig?.vatPercentOnCommission ?? 0.155)));
    const vatOnCommission = vatRate * commissionOnPaid;
    return Math.max(0, taxableBase - commissionOnPaid - vatOnCommission);
  }, [amountPaid, vatAmountOnPayment, commissionOnPaid, company?.commissionConfig?.vatPercentOnCommission]);

  const ownerAmountForThisPayment = useMemo(() => {
    const paid = Number(amountPaid) || 0;
    const taxableBase = Math.max(0, paid - vatAmountOnPayment);
    const vatRate = Math.max(0, Math.min(1, Number(company?.commissionConfig?.vatPercentOnCommission ?? 0.155)));
    const vatOnCommission = vatRate * commissionOnPaid;
    return Math.max(0, taxableBase - commissionOnPaid - vatOnCommission);
  }, [amountPaid, vatAmountOnPayment, commissionOnPaid, company?.commissionConfig?.vatPercentOnCommission]);

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
        notes: `Sale: Buyer ${buyerName}; Seller ${sellerName}; Total Sale Price ${price.toLocaleString()} ${currency}${isInstallment ? `; Installment ${paid.toLocaleString()} ${currency}` : ''}${vatIncluded ? '; VAT Included YES' : '; VAT Included NO'}`,
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
        vatIncluded,
        vatRate: vatIncluded ? vatRateDecimal : undefined,
        vatAmount: vatIncluded ? Number(vatAmountOnPayment.toFixed(2)) : 0,
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
      <Typography variant="h6" sx={{ mb: 2 }}>{initialData ? 'Edit Sale Payment' : 'New Sale Payment'}</Typography>
      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}
      <Grid container spacing={2}>
        <Grid item xs={12} md={6}>
          <TextField id="buyerName" name="buyerName" fullWidth label="Buyer" value={buyerName} onChange={(e) => setBuyerName(e.target.value)} />
        </Grid>
        <Grid item xs={12} md={6}>
          <TextField id="sellerName" name="sellerName" fullWidth label="Seller" value={sellerName} onChange={(e) => setSellerName(e.target.value)} />
        </Grid>
        <Grid item xs={12} md={6}>
          <FormControl fullWidth>
            <InputLabel id="sales-agent-label">Sales Agent</InputLabel>
            <Select
              labelId="sales-agent-label"
              id="sales-agent"
              name="agentId"
              value={agentId}
              label="Sales Agent"
              onChange={(e) => {
                const val = e.target.value as string;
                setAgentId(val);
                if (onAgentChange) onAgentChange(val);
              }}
            >
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
            id="sale-reference"
            freeSolo
            openOnFocus
            options={propertyOptions}
            loading={loadingProperties}
            loadingText="Searching properties…"
            noOptionsText="No matching properties"
            isOptionEqualToValue={(option: any, value: any) => {
              if (typeof option === 'string' || typeof value === 'string') return String(option) === String(value);
              return String(option?._id || option?.id || '') === String(value?._id || value?.id || '');
            }}
            getOptionLabel={(option: any) => {
              if (typeof option === 'string') return option;
              const name = option.name || option.propertyName || '';
              const address = option.address || '';
              const label = [name, address].filter(Boolean).join(' - ');
              return label || option._id || '';
            }}
            // Options are pre-filtered server-side; just include raw input for manual entry
            filterOptions={(opts, state) => {
              const input = (state.inputValue || '').trim();
              const list = Array.isArray(opts) ? opts : [];
              if (input && !list.some(o => {
                const label = (typeof o === 'string') ? o : `${o.name || ''} ${o.address || ''}`.trim();
                return label.toLowerCase() === input.toLowerCase();
              })) {
                return [state.inputValue, ...list];
              }
              return list as any[];
            }}
            renderOption={(props, option: any) => {
              const key =
                typeof option === 'string'
                  ? `manual:${option}`
                  : `property:${String(option?._id || option?.id || `${option?.name || ''}:${option?.address || ''}`)}`;
              return (
                <li {...props} key={key}>
                  {typeof option === 'string'
                    ? option
                    : [option?.name || option?.propertyName || '', option?.address || ''].filter(Boolean).join(' - ')}
                </li>
              );
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
                // Auto-populate Buyer from property.buyerId when present (do not override existing buyerName)
                const buyerId = prop?.buyerId;
                if (buyerId && !(buyerName || '').trim()) {
                  buyerService.get(String(buyerId)).then((b: any) => {
                    const name = (b as any)?.name;
                    if (typeof name === 'string' && name.trim()) setBuyerName(name.trim());
                  }).catch(() => {/* ignore */});
                }
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
              <TextField {...params} id="saleReference" name="saleReference" fullWidth label="Sale Reference / Address" placeholder="Start typing to search properties or enter manually" />
            )}
          />
        </Grid>
        <Grid item xs={12} md={6}>
          <FormControl fullWidth>
            <InputLabel id="link-to-sale-label">Link to Sale</InputLabel>
            <Select
              labelId="link-to-sale-label"
              id="saleId"
              name="saleId"
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
          <TextField id="totalSalePrice" name="totalSalePrice" fullWidth label="Total Sale Price" type="number" value={totalSalePrice} onChange={(e) => setTotalSalePrice(e.target.value)} inputProps={{ min: 0, step: '0.01' }} />
        </Grid>
        <Grid item xs={12} md={4}>
          <TextField id="amountPaid" name="amountPaid" fullWidth label="Amount Paid" type="number" value={amountPaid} onChange={(e) => setAmountPaid(e.target.value)} inputProps={{ min: 0, step: '0.01' }} />
        </Grid>
        <Grid item xs={12} md={4}>
          <FormControlLabel
            control={<Switch checked={vatIncluded} onChange={(_, checked) => setVatIncluded(checked)} color="primary" />}
            label={vatIncluded ? 'VAT Included: ON' : 'VAT Included: OFF'}
          />
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
            When ON, VAT is deducted first.
          </Typography>
          {vatIncluded && (
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
              VAT deduction on this payment: {vatAmountOnPayment.toFixed(2)} {currency}
            </Typography>
          )}
        </Grid>
        <Grid item xs={12} md={4}>
          <TextField
            id="vatRatePercent"
            name="vatRatePercent"
            fullWidth
            label="VAT Rate %"
            type="number"
            value={vatRatePercent}
            onChange={(e) => setVatRatePercent(Number(e.target.value))}
            inputProps={{ min: 0, max: 100, step: '0.1' }}
            helperText="Default 15.5%"
            disabled={!vatIncluded}
          />
        </Grid>
        <Grid item xs={12} md={4}>
          <FormControl fullWidth>
            <InputLabel id="currency-label">Currency</InputLabel>
            <Select id="currency" name="currency" labelId="currency-label" value={currency} label="Currency" onChange={(e) => setCurrency(e.target.value as Currency)}>
              {CURRENCIES.map(c => (
                <MenuItem key={c} value={c}>{c}</MenuItem>
              ))}
            </Select>
          </FormControl>
        </Grid>

        <Grid item xs={12} md={4}>
          <TextField id="paymentDate" name="paymentDate" fullWidth label="Payment Date" type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} InputLabelProps={{ shrink: true }} />
        </Grid>
        <Grid item xs={12} md={4}>
          <FormControl fullWidth>
            <InputLabel id="payment-method-label">Payment Method</InputLabel>
            <Select id="paymentMethod" name="paymentMethod" labelId="payment-method-label" value={paymentMethod} label="Payment Method" onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}>
              {PAYMENT_METHODS.map(m => (
                <MenuItem key={m} value={m}>{m.replace('_', ' ')}</MenuItem>
              ))}
            </Select>
          </FormControl>
        </Grid>
        <Grid item xs={12} md={4}>
          <TextField id="commissionPercent" name="commissionPercent" fullWidth label="Commission %" type="number" value={commissionPercent} onChange={(e) => setCommissionPercent(Number(e.target.value))} inputProps={{ min: 0, max: 100, step: '0.1' }} />
        </Grid>

        <Grid item xs={12}>
          <Paper variant="outlined" sx={{ p: 2 }}>
            <Typography variant="subtitle1" sx={{ mb: 1 }}>Commission Split</Typography>
            <Grid container spacing={2}>
              <Grid item xs={12} md={3}>
                <TextField id="totalCommission" name="totalCommission" fullWidth label="Total Commission (This Payment)" value={commissionOnPaid.toFixed(2)} InputProps={{ readOnly: true }} />
              </Grid>
              <Grid item xs={12} md={3}>
                <TextField id="preaPercentOfCommission" name="preaPercentOfCommission" fullWidth label="PREA % of Commission" type="number" value={preaPercentOfCommission} onChange={(e) => setPreaPercentOfCommission(Number(e.target.value))} inputProps={{ min: 0, max: 100, step: '0.1' }} />
              </Grid>
              <Grid item xs={12} md={3}>
                <TextField id="preaShare" name="preaShare" fullWidth label="PREA Share" type="number" value={preaShare} onChange={(e) => setPreaShare(Number(e.target.value))} inputProps={{ min: 0, step: '0.01' }} />
              </Grid>
              <Grid item xs={12} md={3}>
                <TextField id="sellerRevenue" name="sellerRevenue" fullWidth label={`Seller Revenue (paid - commission - VAT ${Number(((company?.commissionConfig?.vatPercentOnCommission ?? 0.155) * 100).toFixed(2))}% on commission)`} value={sellerRevenue.toFixed(2)} InputProps={{ readOnly: true }} />
              </Grid>
              <Grid item xs={12} md={3}>
                <TextField id="agencyPercent" name="agencyPercent" fullWidth label="Agency % of Remaining" type="number" value={agencyPercent} onChange={(e) => handleAgencyPercentChange(Number(e.target.value))} inputProps={{ min: 0, max: 100, step: '0.1' }} />
              </Grid>
              <Grid item xs={12} md={3}>
                <TextField id="agentPercent" name="agentPercent" fullWidth label="Agent % of Remaining" type="number" value={agentPercent} InputProps={{ readOnly: true }} />
              </Grid>
              <Grid item xs={12} md={3}>
                <TextField id="agencyShare" name="agencyShare" fullWidth label="Agency Share Amount" value={agencyShare.toFixed(2)} InputProps={{ readOnly: true }} />
              </Grid>
              <Grid item xs={12} md={3}>
                <TextField id="agentShare" name="agentShare" fullWidth label="Agent Share Amount" value={agentShare.toFixed(2)} InputProps={{ readOnly: true }} />
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
            {submitting ? 'Saving...' : (submitLabel || 'Save Sale Payment')}
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


