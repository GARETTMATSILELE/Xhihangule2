import React, { useState, useEffect, useRef } from 'react';
import {
  Box,
  Typography,
  Button,
  CircularProgress,
  Alert,
  Grid,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  SelectChangeEvent,
  Paper,
  Checkbox,
  FormControlLabel,
  Switch,
  Autocomplete,
} from '@mui/material';
import paymentService from '../../services/paymentService';
import { usePropertyService } from '../../services/propertyService';
import { useTenantService } from '../../services/tenantService';
import { useLeaseService } from '../../services/leaseService';
import { Payment, PAYMENT_METHODS, SUPPORTED_CURRENCIES } from '../../types/payment';
import { Tenant } from '../../types/tenant';
import { Property } from '../../types/property';
import { PaymentFormData } from '../../types/payment';
import { Lease } from '../../types/lease';
import { formatPaymentApiError } from '../../utils/paymentApiError';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { useAuth } from '../../contexts/AuthContext';
import { useCompany } from '../../contexts/CompanyContext';
// Removed public API usage for security; use authenticated services only

export interface PaymentFormProps {
  onSubmit: (data: PaymentFormData) => Promise<void>;
  onCancel: () => void;
  initialData?: Payment;
  properties: Property[];
  tenants: Tenant[];
  loading?: boolean;
  individualMode?: boolean;
}

// Helper to generate a reference number
function generateReferenceNumber() {
  return `REF-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}

/** Levy-first split preview for combined rent+levy payments. */
function previewCombinedAllocation(amount: number, levyRemaining: number, rentRemaining: number) {
  const amt = Math.max(0, Number(amount || 0));
  const levyAllocated = Math.min(amt, Math.max(0, levyRemaining));
  const rentAllocated = Math.max(0, amt - levyAllocated);
  return { levyAllocated, rentAllocated: Math.min(rentAllocated, Math.max(0, rentRemaining)) };
}

const PaymentForm: React.FC<PaymentFormProps> = ({
  onSubmit,
  onCancel,
  initialData,
  properties,
  tenants,
  loading = false,
  individualMode = false,
}) => {
  const { user } = useAuth();
  const { company } = useCompany();
  const isIndividualMode = individualMode || company?.workspaceType === 'individual' || company?.plan === 'INDIVIDUAL';
  const propertyService = usePropertyService();
  const tenantService = useTenantService();
  const leaseService = useLeaseService();
  const [error, setError] = useState<string | null>(null);
  const [availableLeases, setAvailableLeases] = useState<Lease[]>([]);
  const [leasesLoading, setLeasesLoading] = useState(false);
  const [loadingData, setLoadingData] = useState(false);
  const [agents, setAgents] = useState<any[]>([]);
  const [internalProperties, setInternalProperties] = useState<Property[]>([]);
  const [internalTenants, setInternalTenants] = useState<Tenant[]>([]);
  const [filteredTenants, setFilteredTenants] = useState<Tenant[]>([]);
  
  // New state for manual entry
  const [useManualProperty, setUseManualProperty] = useState(false);
  const [useManualTenant, setUseManualTenant] = useState(false);
  const [manualPropertyAddress, setManualPropertyAddress] = useState('');
  const [manualTenantName, setManualTenantName] = useState('');
  // Remote property search state (server-side, fast autocomplete)
  const [propertySearchOpen, setPropertySearchOpen] = useState(false);
  const [propertySearchText, setPropertySearchText] = useState('');
  const [remotePropertyOptions, setRemotePropertyOptions] = useState<Property[]>([]);
  const [remotePropertyLoading, setRemotePropertyLoading] = useState(false);
  const remoteSearchTimerRef = useRef<number | null>(null);
  const remoteRequestSeqRef = useRef(0);
  
  const [formData, setFormData] = useState<PaymentFormData>(() => ({
    paymentType: isIndividualMode ? 'rental' : initialData?.paymentType || 'rental',
    propertyType: initialData?.propertyType || 'residential',
    propertyId: initialData?.propertyId ? String(initialData.propertyId) : '',
    tenantId: initialData?.tenantId ? String(initialData.tenantId) : '',
    agentId: initialData?.agentId ? String(initialData.agentId) : '',
    paymentDate: initialData?.paymentDate ? new Date(initialData.paymentDate) : new Date(),
    paymentMethod: initialData?.paymentMethod || 'cash',
    amount: initialData?.amount || 0,
    depositAmount: initialData?.depositAmount || 0,
    referenceNumber: initialData?.referenceNumber || '',
    notes: initialData?.notes || '',
    currency: initialData?.currency || 'USD',
    leaseId: initialData?.leaseId ? String(initialData.leaseId) : '',
    companyId: '',
    rentalPeriodMonth: initialData?.rentalPeriodMonth || (new Date().getMonth() + 1),
    rentalPeriodYear: initialData?.rentalPeriodYear || (new Date().getFullYear()),
  }));
  // Normalize various ID shapes to string
  function getId(id: any): string {
    if (!id) return '';
    if (typeof id === 'string') return id;
    if (typeof id === 'object') {
      if ((id as any).$oid) return (id as any).$oid as string;
      if ((id as any)._id) return String((id as any)._id);
    }
    return '';
  }

  // Filter tenants when property changes and auto-pick a linked tenant
  useEffect(() => {
    const pid = String(formData.propertyId || '');
    if (!pid) {
      setFilteredTenants(internalTenants);
      return;
    }
    const linked = (internalTenants || []).filter((t: any) => {
      const singleId = getId(t?.propertyId);
      const multiIds = Array.isArray(t?.propertyIds) ? (t.propertyIds as any[]).map(getId) : [];
      return singleId === pid || multiIds.includes(pid);
    });
    setFilteredTenants(linked.length > 0 ? linked : internalTenants);

    const stillValid = linked.some((t: Tenant) => String(t._id) === String(formData.tenantId));
    if (!stillValid) {
      const preferred = linked.find((t: any) => t.status === 'Active') || linked[0];
      setFormData(prev => ({ ...prev, tenantId: preferred ? String(preferred._id) : '', leaseId: '' }));
    }
  }, [formData.propertyId, internalTenants]);

  const INTRODUCTION_LEASE_STATUSES = ['active', 'expiring_soon', 'pending_settlement'];

  useEffect(() => {
    let cancelled = false;
    const loadLeases = async () => {
      const propertyId = String(formData.propertyId || '');
      const tenantId = String(formData.tenantId || '');
      if (!propertyId || !tenantId || useManualProperty || useManualTenant || formData.paymentType !== 'rental') {
        setAvailableLeases([]);
        return;
      }
      setLeasesLoading(true);
      try {
        const leasesData = await leaseService.getAll();
        const list = Array.isArray(leasesData) ? leasesData : [];
        const matched = list.filter((lease) => {
          const sameProperty = String(lease.propertyId || (lease as any).property?._id || '') === propertyId;
          const sameTenant = String(lease.tenantId || (lease as any).tenant?._id || '') === tenantId;
          const status = String(lease.status || '').toLowerCase();
          return sameProperty && sameTenant && INTRODUCTION_LEASE_STATUSES.includes(status);
        });
        if (cancelled) return;
        setAvailableLeases(matched);
        setFormData((prev) => {
          const stillSelected = matched.some((lease) => String(lease._id) === String(prev.leaseId));
          if (stillSelected) return prev;
          if (matched.length === 1) {
            return { ...prev, leaseId: String(matched[0]._id) };
          }
          return { ...prev, leaseId: '' };
        });
      } catch {
        if (!cancelled) setAvailableLeases([]);
      } finally {
        if (!cancelled) setLeasesLoading(false);
      }
    };
    loadLeases();
    return () => {
      cancelled = true;
    };
  }, [formData.propertyId, formData.tenantId, formData.paymentType, useManualProperty, useManualTenant]);

  const [isAdvance, setIsAdvance] = useState(false);
  const [advanceMonths, setAdvanceMonths] = useState(1);
  const [advanceStartMonth, setAdvanceStartMonth] = useState(formData.rentalPeriodMonth);
  const [advanceStartYear, setAdvanceStartYear] = useState(formData.rentalPeriodYear);
  const [propertyRent, setPropertyRent] = useState<number | null>(null);
  const [propertyLevy, setPropertyLevy] = useState<number | null>(null);
  const [remainingForPeriod, setRemainingForPeriod] = useState<number | null>(null);
  const [rentRemainingForPeriod, setRentRemainingForPeriod] = useState<number | null>(null);
  const [levyRemainingForPeriod, setLevyRemainingForPeriod] = useState<number | null>(null);
  const [depositOnly, setDepositOnly] = useState(false);

  const hasCombinedLevy = formData.paymentType === 'rental' && propertyLevy != null && propertyLevy > 0;
  const monthlyCombinedDue = (propertyRent || 0) + (hasCombinedLevy ? (propertyLevy || 0) : 0);

  // Regenerate reference number every time the form is opened for a new payment
  useEffect(() => {
    if (!initialData) {
      setFormData(prev => ({
        ...prev,
        referenceNumber: generateReferenceNumber(),
      }));
    }
    // Only run when initialData changes (i.e., new payment or edit)
  }, [initialData]);

  // Fallback load for properties/tenants when props are empty (run once)
  const fallbackLoadedRef = useRef(false);
  useEffect(() => {
    const loadFallback = async () => {
      try {
        setLoadingData(true);
        setError(null);
        let propsList: Property[] = Array.isArray(properties) && properties.length ? properties : [];
        let tenantList: Tenant[] = Array.isArray(tenants) && tenants.length ? tenants : [];

        // Authenticated-only data access for security
        try {
          if (!propsList.length) {
            propsList = await propertyService.searchPublicProperties({
              limit: 20,
              page: 1,
              fields: 'name,address,rent,commission,commissionPreaPercent,commissionAgencyPercentRemaining,commissionAgentPercentRemaining,ownerId,propertyOwnerId,rentalType'
            });
          }
        } catch {}
        try {
          if (!tenantList.length) {
            const res = await tenantService.getAll();
            tenantList = res.tenants || [];
          }
        } catch {}

        setInternalProperties(propsList);
        setInternalTenants(tenantList);
      } catch (e) {
        console.error('Fallback load failed:', e);
      } finally {
        setLoadingData(false);
      }
    };
    // Only run once when incoming props are empty; otherwise bind props to internals
    if ((properties && properties.length > 0) || (tenants && tenants.length > 0)) {
      setInternalProperties(properties);
      setInternalTenants(tenants);
      return;
    }
    if (!fallbackLoadedRef.current) {
      fallbackLoadedRef.current = true;
      loadFallback();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [properties?.length, tenants?.length]);

  useEffect(() => {
    if (!isIndividualMode) return;
    setUseManualProperty(false);
    setUseManualTenant(false);
    setFormData(prev => ({
      ...prev,
      paymentType: 'rental',
      agentId: prev.agentId || (user?._id ? String(user._id) : '')
    }));
  }, [isIndividualMode, user?._id]);

  // Debounced server-side search for properties (fast, queries DB)
  useEffect(() => {
    let cancelled = false;
    // Only query when dropdown is opened; prefetch on open with current text
    if (!propertySearchOpen) {
      setRemotePropertyLoading(false);
      setRemotePropertyOptions([]);
      return;
    }
    if (remoteSearchTimerRef.current) {
      window.clearTimeout(remoteSearchTimerRef.current);
    }
    const reqId = ++remoteRequestSeqRef.current;
    setRemotePropertyLoading(true);
    // Small debounce to avoid flooding server while typing
    remoteSearchTimerRef.current = window.setTimeout(async () => {
      try {
        // Ask for lightweight projection so responses are tiny and fast
        const fields = 'name,address,rent,commission,commissionPreaPercent,commissionAgencyPercentRemaining,commissionAgentPercentRemaining,ownerId,propertyOwnerId,rentalType';
        const list = await propertyService.searchPublicProperties({
          q: propertySearchText || undefined,
          limit: 20,
          page: 1,
          fields
        });
        if (cancelled || reqId !== remoteRequestSeqRef.current) return;
        // For rental payments, prefer non-sale properties
        const filtered = Array.isArray(list)
          ? list.filter((p: any) => {
              if (formData.paymentType === 'rental') {
                return String((p as any).rentalType || '') !== 'sale';
              }
              return true;
            })
          : [];
        setRemotePropertyOptions(filtered);
      } catch {
        if (!cancelled || reqId !== remoteRequestSeqRef.current) {
          // ignore if cancelled or stale; otherwise clear options
          setRemotePropertyOptions([]);
        }
      } finally {
        if (!cancelled && reqId === remoteRequestSeqRef.current) {
          setRemotePropertyLoading(false);
        }
      }
    }, 300);
    return () => {
      cancelled = true;
      if (remoteSearchTimerRef.current) {
        window.clearTimeout(remoteSearchTimerRef.current);
      }
    };
  }, [propertySearchOpen, propertySearchText, formData.paymentType, propertyService]);

  // Update formData when advance payment changes
  useEffect(() => {
    if (isAdvance) {
      setFormData(prev => ({
        ...prev,
        rentalPeriodMonth: advanceStartMonth,
        rentalPeriodYear: advanceStartYear,
        advanceMonthsPaid: advanceMonths,
        advancePeriodStart: { month: advanceStartMonth, year: advanceStartYear },
        advancePeriodEnd: calculateAdvanceEnd(advanceStartMonth, advanceStartYear, advanceMonths),
        amount: propertyRent != null ? (hasCombinedLevy ? monthlyCombinedDue : propertyRent) * advanceMonths : 0,
        rentUsed: propertyRent ?? undefined,
        levyUsed: hasCombinedLevy ? propertyLevy ?? undefined : undefined,
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        advanceMonthsPaid: 1,
        advancePeriodStart: undefined,
        advancePeriodEnd: undefined,
        amount: propertyRent || 0,
      }));
    }
    // eslint-disable-next-line
  }, [isAdvance, advanceMonths, advanceStartMonth, advanceStartYear, propertyRent, propertyLevy, hasCombinedLevy, monthlyCombinedDue]);

  // When propertyId or paymentType changes, fetch rent or levy
  useEffect(() => {
    let cancelled = false;
    const loadAmounts = async () => {
      if (!formData.propertyId) {
        if (!cancelled) setPropertyRent(null);
        return;
      }
      const pid = String(formData.propertyId);
      const propertySummary = internalProperties.find(p => String(p._id) === pid);
      // Levy flow
      if (formData.paymentType === 'levy') {
        let levyAmount: number | null = null;
        if (propertySummary?.levyOrMunicipalType === 'levy' && typeof propertySummary.levyOrMunicipalAmount !== 'undefined') {
          levyAmount = Number(propertySummary.levyOrMunicipalAmount as any);
        }
        if (levyAmount === null || isNaN(levyAmount)) {
          try {
            const full = await propertyService.getProperty(pid);
            if (!cancelled && full?.levyOrMunicipalType === 'levy' && typeof full.levyOrMunicipalAmount !== 'undefined') {
              levyAmount = Number((full as any).levyOrMunicipalAmount);
            }
          } catch {}
        }
        if (!cancelled) setPropertyRent(typeof levyAmount === 'number' && !isNaN(levyAmount) ? levyAmount : null);
        return;
      }
      // Rental/other flow: use rent (+ levy when property has levies)
      let rentAmount: number | null = null;
      let levyAmount: number | null = null;
      if (typeof propertySummary?.rent !== 'undefined' && propertySummary?.rent !== null) {
        rentAmount = Number((propertySummary as any).rent);
      }
      if (formData.paymentType === 'rental' && propertySummary?.levyOrMunicipalType === 'levy' && typeof propertySummary.levyOrMunicipalAmount !== 'undefined') {
        levyAmount = Number(propertySummary.levyOrMunicipalAmount as any);
      }
      if (rentAmount === null || isNaN(rentAmount) || (formData.paymentType === 'rental' && levyAmount === null)) {
        try {
          const full = await propertyService.getProperty(pid);
          if (!cancelled && typeof full?.rent !== 'undefined' && full?.rent !== null) {
            rentAmount = Number((full as any).rent);
          }
          if (!cancelled && formData.paymentType === 'rental' && full?.levyOrMunicipalType === 'levy' && typeof full.levyOrMunicipalAmount !== 'undefined') {
            levyAmount = Number((full as any).levyOrMunicipalAmount);
          }
        } catch {}
      }
      if (!cancelled) {
        setPropertyRent(typeof rentAmount === 'number' && !isNaN(rentAmount) ? rentAmount : null);
        setPropertyLevy(formData.paymentType === 'rental' && typeof levyAmount === 'number' && !isNaN(levyAmount) ? levyAmount : null);
      }
    };
    loadAmounts();
    return () => { cancelled = true; };
  }, [formData.propertyId, formData.paymentType, internalProperties, propertyService]);

  // Fetch remaining balance for the selected rental period
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        setRemainingForPeriod(null);
        setRentRemainingForPeriod(null);
        setLevyRemainingForPeriod(null);
        if (
          formData.paymentType === 'rental' &&
          !useManualProperty && !useManualTenant &&
          formData.propertyId && formData.tenantId && propertyRent != null
        ) {
          if (hasCombinedLevy) {
            const data = await paymentService.getCombinedRemaining({
              tenantId: String(formData.tenantId),
              propertyId: String(formData.propertyId),
              rentalPeriodMonth: Number(formData.rentalPeriodMonth),
              rentalPeriodYear: Number(formData.rentalPeriodYear),
            });
            if (!cancelled) {
              setRentRemainingForPeriod(data.rentRemaining);
              setLevyRemainingForPeriod(data.levyRemaining);
              setRemainingForPeriod(data.combinedRemaining);
            }
          } else {
            const { remaining } = await paymentService.getRemainingForPeriod({
              tenantId: String(formData.tenantId),
              propertyId: String(formData.propertyId),
              rentalPeriodMonth: Number(formData.rentalPeriodMonth),
              rentalPeriodYear: Number(formData.rentalPeriodYear),
              rent: Number(propertyRent)
            });
            if (!cancelled) setRemainingForPeriod(remaining);
          }
        }
      } catch {
        if (!cancelled) setRemainingForPeriod(null);
      }
    };
    run();
    return () => { cancelled = true; };
  }, [formData.paymentType, formData.propertyId, formData.tenantId, formData.rentalPeriodMonth, formData.rentalPeriodYear, propertyRent, propertyLevy, hasCombinedLevy, useManualProperty, useManualTenant]);

  // When rent or advance months change, update amount
  useEffect(() => {
    if (depositOnly) {
      setFormData(prev => {
        const nextAmount = 0;
        if (prev.amount === nextAmount && prev.rentUsed === (propertyRent ?? prev.rentUsed)) return prev;
        return {
          ...prev,
          amount: nextAmount,
          rentUsed: propertyRent ?? prev.rentUsed,
        };
      });
      return;
    }
    if (propertyRent != null) {
      const perMonthTotal = hasCombinedLevy ? monthlyCombinedDue : propertyRent;
      if (isAdvance) {
        setFormData(prev => ({
          ...prev,
          amount: perMonthTotal * advanceMonths,
          rentUsed: propertyRent,
          levyUsed: hasCombinedLevy ? propertyLevy ?? undefined : undefined,
        }));
      } else {
        setFormData(prev => ({
          ...prev,
          amount: perMonthTotal,
          rentUsed: propertyRent,
          levyUsed: hasCombinedLevy ? propertyLevy ?? undefined : undefined,
        }));
      }
    }
  }, [propertyRent, propertyLevy, hasCombinedLevy, monthlyCombinedDue, isAdvance, advanceMonths, depositOnly]);

  function calculateAdvanceEnd(startMonth: number, startYear: number, months: number) {
    const endMonth = ((startMonth - 1 + months - 1) % 12) + 1;
    const yearsToAdd = Math.floor((startMonth - 1 + months - 1) / 12);
    return { month: endMonth, year: startYear + yearsToAdd };
  }

  useEffect(() => {
    const fetchAgents = async () => {
      try {
        setLoadingData(true);
        setError(null);
        let agentsList = await paymentService.getAgents();
        if (!Array.isArray(agentsList)) agentsList = [] as any[];
        // INDIVIDUAL plan fallback: if no agents, use logged-in user as the sole agent option
      if (isIndividualMode && agentsList.length === 0 && user) {
          agentsList = [{ _id: user._id, firstName: (user as any).firstName || '', lastName: (user as any).lastName || '', email: (user as any).email || '' }];
        }
        setAgents(agentsList);
      } catch (error) {
        setError('Failed to fetch agents. Please try again later.');
        console.error('Error fetching agents:', error);
      } finally {
        setLoadingData(false);
      }
    };

    fetchAgents();
  }, [isIndividualMode, user]); // Only run once on mount for agency; refresh if individual user context resolves

  // Clear agentId if current value does not exist in options
  useEffect(() => {
    if (!formData.agentId) return;
    const exists = agents.some(a => String(a._id) === String(formData.agentId));
    if (!exists) {
      setFormData(prev => ({ ...prev, agentId: '' }));
    }
    // eslint-disable-next-line
  }, [agents]);

  // Auto-select current user as agent in INDIVIDUAL plan when no agent is preselected and available
  useEffect(() => {
    if (!isIndividualMode) return;
    if (!formData.agentId && user && agents.some(a => String(a._id) === String(user._id))) {
      setFormData(prev => ({ ...prev, agentId: String(user._id) }));
    }
    // eslint-disable-next-line
  }, [isIndividualMode, agents, user?._id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setError(null);

      // Deposit-only validation
      if (depositOnly) {
        const dep = Number(formData.depositAmount || 0);
        if (dep <= 0) {
          setError('Enter a deposit amount for a deposit-only payment.');
          return;
        }
      }

      // Validate manual entries
      if (useManualProperty && !manualPropertyAddress.trim()) {
        setError('Please enter a property address');
        return;
      }
      if (useManualTenant && !manualTenantName.trim()) {
        setError('Please enter a tenant name');
        return;
      }

      let dataToSubmit = { ...formData };
      if (isIndividualMode) {
        dataToSubmit.paymentType = 'rental';
        dataToSubmit.agentId = dataToSubmit.agentId || (user?._id ? String(user._id) : '');
      }
      if (depositOnly) {
        dataToSubmit.amount = 0;
        dataToSubmit.notes = `${dataToSubmit.notes ? dataToSubmit.notes + '\n' : ''}Deposit only payment`;
      }
      
      // Handle manual property entry
      if (useManualProperty) {
        dataToSubmit.propertyId = `manual_${Date.now()}`; // Generate a temporary ID
        dataToSubmit.manualPropertyAddress = manualPropertyAddress;
        dataToSubmit.notes = `${dataToSubmit.notes ? dataToSubmit.notes + '\n' : ''}Manual Property: ${manualPropertyAddress}`;
      }
      
      // Handle manual tenant entry
      if (useManualTenant) {
        dataToSubmit.tenantId = `manual_${Date.now()}`; // Generate a temporary ID
        dataToSubmit.manualTenantName = manualTenantName;
        dataToSubmit.notes = `${dataToSubmit.notes ? dataToSubmit.notes + '\n' : ''}Manual Tenant: ${manualTenantName}`;
      }

      // Get commission percentage from selected property (only if not manual)
      let commissionPercent = 0;
      if (!isIndividualMode && !useManualProperty && formData.propertyId) {
        commissionPercent = getCommissionForProperty(formData.propertyId, internalProperties);
      }
      const totalCommission = formData.amount * (commissionPercent / 100);
      const preaFee = totalCommission * 0.03;
      const commissionAfterPrea = totalCommission - preaFee;
      const agentShare = commissionAfterPrea * 0.6;
      const agencyShare = commissionAfterPrea * 0.4;
      const ownerAmount = formData.amount - totalCommission;

      dataToSubmit.commissionDetails = {
        totalCommission,
        preaFee,
        agentShare,
        agencyShare,
        ownerAmount
      };

      // Set processedBy to current user
      if (user?._id) {
        dataToSubmit.processedBy = user._id;
      }

      // Ensure ownerId is included (only if not manual property)
      if (!isIndividualMode && !useManualProperty && formData.propertyId) {
        const property = internalProperties.find(p => String(p._id) === String(formData.propertyId));
        if (property && (property as any).ownerId) {
          const rawOwner = (property as any).ownerId;
          dataToSubmit.ownerId = typeof rawOwner === 'string' ? rawOwner : rawOwner?._id;
        }
      }

      // Inline guard: fully paid or exceeding remaining (skip for deposit-only)
      if (formData.paymentType === 'rental' && remainingForPeriod !== null && !isAdvance && !depositOnly) {
        const amount = Number(dataToSubmit.amount || 0);
        if (remainingForPeriod <= 0) {
          setError(hasCombinedLevy ? 'This month is fully paid (rent and levy).' : 'This month is fully paid.');
          return;
        }
        if (amount > remainingForPeriod) {
          setError(`Only ${remainingForPeriod.toFixed(2)} remains for this month. Enter an amount ≤ remaining.`);
          return;
        }
      }

      if (hasCombinedLevy && propertyLevy != null) {
        dataToSubmit.levyUsed = propertyLevy;
      }

      await onSubmit(dataToSubmit);
    } catch (error) {
      setError(formatPaymentApiError(error, 'Failed to save payment. Please try again later.'));
      console.error('Error saving payment:', error);
    }
  };

  // Helper to get commission percentage from selected property
  function getCommissionForProperty(propertyId: string, properties: Property[]): number {
    const property = properties.find(p => String(p._id) === String(propertyId));
    return property?.commission ?? 0;
  }
  
  // Prefer non-sale (rental) properties for rental/levy/municipal payments.
  // Include properties where rentalType is not 'sale' (or missing), so rental properties appear reliably.
  const filteredPropertiesForDropdown = React.useMemo(() => {
    const list = Array.isArray(internalProperties) ? internalProperties : [];
    // For rental payments, exclude sale-only properties
    if (formData.paymentType === 'rental') {
      return list.filter((p: any) => String((p as any).rentalType || '') !== 'sale');
    }
    // For levies/municipal, allow all company properties
    if (formData.paymentType === 'levy' || formData.paymentType === 'municipal') {
      return list;
    }
    // Default: show all
    return list;
  }, [internalProperties, formData.paymentType]);

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | { name?: string; value: unknown }> | SelectChangeEvent
  ) => {
    const { name, value } = e.target;
    
    // Convert numeric fields to numbers
    let processedValue = value;
    if (name === 'amount' || name === 'depositAmount') {
      processedValue = value === '' ? 0 : Number(value);
    }
    // Ensure rentalPeriodMonth is always a number (value is string from Select)
    if (name === 'rentalPeriodMonth') {
      processedValue = Number(value);
    }
    setFormData(prev => ({
      ...prev,
      [name as string]: processedValue,
    }));
  };

  const handleDateChange = (date: Date | null) => {
    if (date) {
      setFormData(prev => ({
        ...prev,
        paymentDate: date,
      }));
    }
  };

  return (
    <Paper elevation={0} sx={{ p: 3, mt: 3 }}>
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}
      <form onSubmit={handleSubmit}>
        <Grid container spacing={3}>
          {!isIndividualMode && (
            <Grid item xs={12}>
              <FormControl fullWidth>
                <InputLabel>Payment Type</InputLabel>
                <Select
                  name="paymentType"
                  value={formData.paymentType}
                  onChange={handleInputChange}
                  label="Payment Type"
                  required
                >
                  <MenuItem value="rental">Rental</MenuItem>
                  <MenuItem value="introduction">Introduction</MenuItem>
                  <MenuItem value="levy">Levies</MenuItem>
                  <MenuItem value="municipal">Municipal Payments</MenuItem>
                </Select>
              </FormControl>
            </Grid>
          )}

          <Grid item xs={12}>
            <FormControl fullWidth>
              <InputLabel>Property Type</InputLabel>
              <Select
                name="propertyType"
                value={formData.propertyType}
                onChange={handleInputChange}
                label="Property Type"
                required
              >
                <MenuItem value="residential">Residential</MenuItem>
                <MenuItem value="commercial">Commercial</MenuItem>
              </Select>
            </FormControl>
          </Grid>

          {!isIndividualMode && (
            <Grid item xs={12}>
              <FormControlLabel
                control={
                  <Switch
                    checked={useManualProperty}
                    onChange={(e) => setUseManualProperty(e.target.checked)}
                  />
                }
                label="Manual Property Entry"
              />
            </Grid>
          )}

          {useManualProperty ? (
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Property Address"
                value={manualPropertyAddress}
                onChange={(e) => setManualPropertyAddress(e.target.value)}
                required
                placeholder="Enter property address manually"
                helperText="Enter the property address for receipting purposes"
              />
            </Grid>
          ) : (
            <Grid item xs={12}>
              <Autocomplete
                open={propertySearchOpen}
                onOpen={() => setPropertySearchOpen(true)}
                onClose={() => setPropertySearchOpen(false)}
                openOnFocus
                options={remotePropertyOptions}
                loading={remotePropertyLoading}
                getOptionLabel={(option: Property) => `${option.name} - ${option.address}`}
                // Ensure the selected value is found even if not in current options (fallback to internal)
                value={
                  remotePropertyOptions.find((p) => String(p._id) === String(formData.propertyId))
                  || internalProperties.find((p) => String(p._id) === String(formData.propertyId))
                  || filteredPropertiesForDropdown.find((p) => String(p._id) === String(formData.propertyId))
                  || null
                }
                isOptionEqualToValue={(option, value) => String(option._id) === String(value._id)}
                // Disable client-side filtering; server already filtered
                filterOptions={(options) => options}
                loadingText="Searching..."
                noOptionsText={propertySearchText ? 'No matching properties' : 'Type to search properties'}
                onInputChange={(_e, value, reason) => {
                  if (reason === 'input') {
                    setPropertySearchText(value);
                  }
                  // When clearing input, keep dropdown open with first page
                  if (reason === 'clear') {
                    setPropertySearchText('');
                  }
                }}
                onChange={(_, newValue: Property | null) => {
                  const newPropertyId = newValue ? String(newValue._id) : '';
                  const newPropertyType = newValue?.type === 'commercial' ? 'commercial' : 'residential';
                  const newRent = newValue?.rent ?? null;
                  // Ensure the selected property persists in local list so it remains visible after closing
                  if (newValue) {
                    setInternalProperties(prev => {
                      const exists = prev.some(p => String(p._id) === String(newValue._id));
                      return exists ? prev : [newValue, ...prev];
                    });
                  }
                  // Find tenant linked to this property (prefer Active)
                  let autoTenantId = '';
                  let autoAgentId = '';
                  if (newPropertyId) {
                    const tenantsForProperty = internalTenants.filter((t: any) => {
                      const singleId = getId(t?.propertyId);
                      const multiIds = Array.isArray(t?.propertyIds) ? (t.propertyIds as any[]).map(getId) : [];
                      return singleId === newPropertyId || multiIds.includes(newPropertyId);
                    });
                    const selectedTenant = tenantsForProperty.find((t: any) => t.status === 'Active') || tenantsForProperty[0];
                    if (selectedTenant) {
                      autoTenantId = String(selectedTenant._id);
                      if (selectedTenant.ownerId) {
                        autoAgentId = String(selectedTenant.ownerId);
                      }
                    }
                  }
                  const agentExists = agents.some(a => String(a._id) === String(autoAgentId));
                  // Immediately reflect rent and derived amount upon property selection
                  if (newRent !== null && newRent !== undefined) {
                    setPropertyRent(newRent);
                  }
                  setFormData((prev) => ({
                    ...prev,
                    propertyId: newPropertyId,
                    tenantId: newPropertyId ? autoTenantId : '',
                    leaseId: '',
                    agentId: newPropertyId ? (isIndividualMode && user?._id ? String(user._id) : (agentExists ? autoAgentId : '')) : '',
                    propertyType: newPropertyType,
                    amount: (newRent ?? 0),
                  }));
                }}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="Property"
                    required
                    placeholder="Type to search properties"
                    InputProps={{
                      ...params.InputProps,
                      endAdornment: (
                        <>
                          {remotePropertyLoading ? <CircularProgress color="inherit" size={18} /> : null}
                          {params.InputProps.endAdornment}
                        </>
                      ),
                    }}
                  />
                )}
                disabled={loadingData}
                fullWidth
              />
            </Grid>
          )}

          {!isIndividualMode && (
            <Grid item xs={12}>
              <FormControlLabel
                control={
                  <Switch
                    checked={useManualTenant}
                    onChange={(e) => setUseManualTenant(e.target.checked)}
                  />
                }
                label="Manual Tenant Entry"
              />
            </Grid>
          )}

          {useManualTenant ? (
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Tenant Name"
                value={manualTenantName}
                onChange={(e) => setManualTenantName(e.target.value)}
                required
                placeholder="Enter tenant name manually"
                helperText="Enter the tenant name for receipting purposes"
              />
            </Grid>
          ) : (
            <Grid item xs={12}>
              <Autocomplete
                options={filteredTenants.length ? filteredTenants : internalTenants}
                getOptionLabel={(option: Tenant) => `${option.firstName} ${option.lastName} - ${option.email}`}
                value={internalTenants.find((t) => String(t._id) === String(formData.tenantId)) || null}
                onChange={(_, newValue: Tenant | null) => {
                  setFormData((prev) => ({
                    ...prev,
                    tenantId: newValue ? String(newValue._id) : '',
                    leaseId: '',
                  }));
                }}
                renderInput={(params) => (
                  <TextField {...params} label="Tenant" required />
                )}
                disabled={loadingData}
                fullWidth
              />
            </Grid>
          )}

          {!useManualProperty && !useManualTenant && formData.paymentType === 'rental' && (
            <Grid item xs={12}>
              <FormControl fullWidth required={availableLeases.length !== 1}>
                <InputLabel>Lease</InputLabel>
                <Select
                  name="leaseId"
                  value={availableLeases.some((lease) => String(lease._id) === String(formData.leaseId)) ? formData.leaseId : ''}
                  onChange={handleInputChange}
                  label="Lease"
                  disabled={loadingData || leasesLoading || !formData.propertyId || !formData.tenantId}
                >
                  {availableLeases.length === 0 && (
                    <MenuItem value="" disabled>
                      {leasesLoading ? 'Loading leases…' : 'No applicable lease found'}
                    </MenuItem>
                  )}
                  {availableLeases.map((lease) => {
                    const start = lease.startDate ? new Date(lease.startDate).toLocaleDateString() : '';
                    const end = lease.endDate ? new Date(lease.endDate).toLocaleDateString() : '';
                    const rent = Number((lease as any).rentAmount || (lease as any).monthlyRent || 0);
                    return (
                      <MenuItem key={String(lease._id)} value={String(lease._id)}>
                        {`${start}${end ? ` – ${end}` : ''} · ${lease.status}${rent > 0 ? ` · ${rent}` : ''}`}
                      </MenuItem>
                    );
                  })}
                </Select>
              </FormControl>
              {availableLeases.length > 1 && (
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                  Multiple leases apply. Select the lease for this Introduction payment. The first lease is not chosen automatically.
                </Typography>
              )}
            </Grid>
          )}

          {!isIndividualMode && (
            <Grid item xs={12}>
              <FormControl fullWidth>
                <InputLabel>Agent</InputLabel>
                <Select
                  name="agentId"
                  value={agents.some(a => String(a._id) === String(formData.agentId)) ? formData.agentId : ''}
                  onChange={handleInputChange}
                  label="Agent"
                  required
                  disabled={loadingData}
                >
                  {agents.map((agent) => (
                    <MenuItem key={agent._id} value={agent._id}>
                      {agent.firstName} {agent.lastName} - {agent.email}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
          )}

          <Grid item xs={12}>
            <LocalizationProvider dateAdapter={AdapterDateFns}>
              <DatePicker
                label="Payment Date"
                value={formData.paymentDate && !isNaN(formData.paymentDate.getTime()) 
                  ? formData.paymentDate 
                  : null}
                onChange={handleDateChange}
                slotProps={{
                  textField: {
                    fullWidth: true,
                    required: true,
                  },
                }}
              />
            </LocalizationProvider>
          </Grid>

          <Grid item xs={12}>
            <FormControl fullWidth>
              <InputLabel>Payment Method</InputLabel>
              <Select
                name="paymentMethod"
                value={formData.paymentMethod}
                onChange={handleInputChange}
                label="Payment Method"
                required
              >
                {PAYMENT_METHODS.map(method => (
                  <MenuItem key={method} value={method}>
                    {method.replace('_', ' ').toUpperCase()}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>

          <Grid item xs={12} sm={hasCombinedLevy ? 6 : 12}>
            <TextField
              fullWidth
              label={formData.paymentType === 'levy' ? 'Monthly Levies' : formData.paymentType === 'municipal' ? 'Municipal Fees (for this month)' : 'Monthly Rent'}
              value={
                formData.paymentType === 'levy'
                  ? propertyRent !== null ? propertyRent : ''
                  : formData.paymentType === 'municipal'
                    ? formData.amount || ''
                    : useManualProperty
                      ? (formData.amount || '')
                      : propertyRent !== null ? propertyRent : ''
              }
              onChange={(formData.paymentType === 'municipal' || useManualProperty) ? handleInputChange : undefined}
              name={(formData.paymentType === 'municipal' || useManualProperty) ? 'amount' : undefined}
              InputProps={{ readOnly: !(formData.paymentType === 'municipal' || useManualProperty) }}
              helperText={
                formData.paymentType === 'levy'
                  ? 'This is the levies for the selected property.'
                  : formData.paymentType === 'municipal'
                    ? 'Enter the municipal fee for this month.'
                    : useManualProperty
                      ? 'Enter the rent for the selected manual property.'
                      : 'This is the rent for the selected property.'
              }
            />
          </Grid>
          {hasCombinedLevy && (
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Monthly Levy"
                value={propertyLevy !== null ? propertyLevy : ''}
                InputProps={{ readOnly: true }}
                helperText="Levy is collected with rent in one payment."
              />
            </Grid>
          )}
          {hasCombinedLevy && (
            <Grid item xs={12}>
              <Typography variant="body2" color="textSecondary">
                Combined due this month: ${monthlyCombinedDue.toFixed(2)} (rent ${(propertyRent || 0).toFixed(2)} + levy ${(propertyLevy || 0).toFixed(2)})
              </Typography>
            </Grid>
          )}

          <Grid item xs={12}>
            <TextField
              fullWidth
              label="Amount Paid"
              type="number"
              name="amount"
              value={formData.amount || ''}
              onChange={handleInputChange}
              required={!depositOnly}
              InputProps={{ readOnly: isAdvance || depositOnly }}
              helperText={
                depositOnly
                  ? 'Deposit-only mode: rent amount will be set to 0'
                  : (isAdvance
                      ? `Total for ${advanceMonths} months`
                      : `Enter the amount the client is actually paying${(formData.paymentType === 'rental' && remainingForPeriod !== null) ? ` · Remaining this month: $${Number(remainingForPeriod).toFixed(2)}` : ''}`)
              }
            />
          </Grid>
          {formData.paymentType === 'rental' && !isAdvance && remainingForPeriod !== null && (
            <Grid item xs={12}>
              <Typography variant="body2" color={remainingForPeriod <= 0 ? 'error' : 'textSecondary'}>
                {remainingForPeriod <= 0
                  ? (hasCombinedLevy ? 'This month is fully paid (rent and levy). Change rental month or record a different period.' : 'This month is fully paid. Change rental month or record a different period.')
                  : hasCombinedLevy
                    ? `Remaining for ${new Date(0, Number(formData.rentalPeriodMonth) - 1).toLocaleString('default', { month: 'long' })} ${formData.rentalPeriodYear}: rent $${Number(rentRemainingForPeriod ?? 0).toFixed(2)} · levy $${Number(levyRemainingForPeriod ?? 0).toFixed(2)} · total $${Number(remainingForPeriod).toFixed(2)}`
                    : `Remaining for ${new Date(0, Number(formData.rentalPeriodMonth) - 1).toLocaleString('default', { month: 'long' })} ${formData.rentalPeriodYear}: $${Number(remainingForPeriod).toFixed(2)}`}
              </Typography>
            </Grid>
          )}
          {hasCombinedLevy && !depositOnly && Number(formData.amount || 0) > 0 && (
            <Grid item xs={12}>
              {(() => {
                const preview = previewCombinedAllocation(
                  Number(formData.amount || 0),
                  levyRemainingForPeriod ?? propertyLevy ?? 0,
                  rentRemainingForPeriod ?? propertyRent ?? 0
                );
                const dep = Number(formData.depositAmount || 0);
                return (
                  <Typography variant="body2" color="primary">
                    Allocation preview: rent ${preview.rentAllocated.toFixed(2)} · levy ${preview.levyAllocated.toFixed(2)}
                    {dep > 0 ? ` · deposit $${dep.toFixed(2)} · total receipt $${(Number(formData.amount || 0) + dep).toFixed(2)}` : ''}
                  </Typography>
                );
              })()}
            </Grid>
          )}

          {formData.paymentType !== 'levy' && formData.paymentType !== 'municipal' && (
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Deposit Amount (Optional - First Month Only)"
                type="number"
                name="depositAmount"
                value={formData.depositAmount || ''}
                onChange={handleInputChange}
                helperText="Deposit is typically only paid on the first month"
                inputProps={{ min: 0 }}
              />
            </Grid>
          )}

          {formData.paymentType !== 'levy' && formData.paymentType !== 'municipal' && (
            <Grid item xs={12}>
              <Button
                variant={depositOnly ? 'contained' : 'outlined'}
                color="secondary"
                size="small"
                onClick={() => {
                  setDepositOnly((prev) => !prev);
                  setFormData(prev => ({ ...prev, amount: 0 }));
                }}
              >
                {depositOnly ? 'Deposit Only Mode: ON' : 'Deposit Only Payment'}
              </Button>
              {depositOnly && (
                <Typography variant="caption" color="textSecondary" sx={{ ml: 1 }}>
                  Only the deposit will be receipted; rent amount will be ignored.
                </Typography>
              )}
            </Grid>
          )}

          {/* Period Selection (used for rentals and levies) */}
          <Grid item xs={12} sm={6}>
            <FormControl fullWidth>
              <InputLabel>{formData.paymentType === 'levy' ? 'Levy Month' : 'Rental Month'}</InputLabel>
              <Select
                name="rentalPeriodMonth"
                value={formData.rentalPeriodMonth.toString()}
                onChange={handleInputChange}
                label={formData.paymentType === 'levy' ? 'Levy Month' : 'Rental Month'}
                required
              >
                {[...Array(12)].map((_, i) => (
                  <MenuItem key={i + 1} value={(i + 1).toString()}>
                    {new Date(0, i).toLocaleString('default', { month: 'long' })}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField
              fullWidth
              label={formData.paymentType === 'levy' ? 'Levy Year' : 'Rental Year'}
              name="rentalPeriodYear"
              type="number"
              value={formData.rentalPeriodYear}
              onChange={handleInputChange}
              required
              inputProps={{ min: 2000, max: 2100 }}
            />
          </Grid>

          {/* Advance Payment Section */}
          <Grid item xs={12}>
            <FormControlLabel
              control={<Checkbox checked={isAdvance} onChange={e => setIsAdvance(e.target.checked)} />}
              label="Paying in advance?"
            />
          </Grid>
          {isAdvance && (
            <>
              <Grid item xs={12} sm={4}>
                <TextField
                  fullWidth
                  label="Number of Months"
                  type="number"
                  value={advanceMonths}
                  onChange={e => setAdvanceMonths(Math.max(1, Number(e.target.value)))}
                  required
                  inputProps={{ min: 1, max: 36 }}
                />
              </Grid>
              <Grid item xs={12} sm={4}>
                <FormControl fullWidth>
                  <InputLabel>Start Month</InputLabel>
                  <Select
                    name="advanceStartMonth"
                    value={advanceStartMonth.toString()}
                    onChange={e => setAdvanceStartMonth(Number(e.target.value))}
                    label="Start Month"
                    required
                  >
                    {[...Array(12)].map((_, i) => (
                      <MenuItem key={i + 1} value={(i + 1).toString()}>
                        {new Date(0, i).toLocaleString('default', { month: 'long' })}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} sm={4}>
                <TextField
                  fullWidth
                  label="Start Year"
                  type="number"
                  value={advanceStartYear}
                  onChange={e => setAdvanceStartYear(Number(e.target.value))}
                  required
                  inputProps={{ min: 2000, max: 2100 }}
                />
              </Grid>
              <Grid item xs={12}>
                <Typography variant="body2">
                  This payment covers: {new Date(0, advanceStartMonth - 1).toLocaleString('default', { month: 'long' })} {advanceStartYear} to {new Date(0, calculateAdvanceEnd(advanceStartMonth, advanceStartYear, advanceMonths).month - 1).toLocaleString('default', { month: 'long' })} {calculateAdvanceEnd(advanceStartMonth, advanceStartYear, advanceMonths).year}
                </Typography>
                <Typography variant="body2" color="primary">
                  Total Amount: {propertyRent ? propertyRent * advanceMonths : 0} ({propertyRent} × {advanceMonths} months)
                </Typography>
              </Grid>
            </>
          )}

          <Grid item xs={12}>
            <TextField
              fullWidth
              label="Notes"
              name="notes"
              value={formData.notes}
              onChange={handleInputChange}
              multiline
              rows={4}
            />
          </Grid>

          <Grid item xs={12}>
            <FormControl fullWidth>
              <InputLabel>Currency</InputLabel>
              <Select
                name="currency"
                value={formData.currency}
                onChange={handleInputChange}
                label="Currency"
                required
              >
                {SUPPORTED_CURRENCIES.map(currency => (
                  <MenuItem key={currency} value={currency}>
                    {currency}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>

          <Grid item xs={12}>
            <TextField
              fullWidth
              label="Reference Number"
              name="referenceNumber"
              value={formData.referenceNumber}
              onChange={handleInputChange}
              required
              helperText="Enter the payment reference number manually."
            />
          </Grid>

          <Grid item xs={12}>
            <Box display="flex" justifyContent="flex-end" gap={2}>
              <Button
                variant="outlined"
                onClick={onCancel}
                disabled={loading}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="contained"
                disabled={
                  loading ||
                  (formData.paymentType === 'rental' && !isAdvance && remainingForPeriod !== null && remainingForPeriod <= 0)
                }
                startIcon={loading ? <CircularProgress size={20} /> : null}
              >
                {loading ? 'Saving...' : 'Save Payment'}
              </Button>
            </Box>
          </Grid>
        </Grid>
      </form>
    </Paper>
  );
};

export default PaymentForm; 