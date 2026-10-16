import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import api from '../api/axios';
import { getDemoCompany } from '../demo/demoData';
import { isDemoMode } from '../demo/demoMode';
import { useAuth } from './AuthContext';

interface BankAccount {
  accountNumber: string;
  accountName: string;
  accountType: 'USD NOSTRO' | 'ZiG';
  bankName: string;
  branchName: string;
  branchCode: string;
}

interface Company {
  _id: string;
  name: string;
  address: string;
  phone: string;
  email: string;
  website?: string;
  registrationNumber: string;
  tinNumber: string;
  vatNumber?: string;
  ownerId: string;
  description?: string;
  logo?: string;
  isActive: boolean;
  subscriptionStatus: 'active' | 'inactive' | 'trial' | 'past_due' | 'suspended' | 'cancelled' | 'expired' | 'TRIAL' | 'ACTIVE' | 'PAST_DUE' | 'SUSPENDED' | 'CANCELLED' | 'EXPIRED';
  subscriptionEndDate?: Date;
  companyType?: 'INDIVIDUAL_LANDLORD' | 'REGISTERED_BUSINESS';
  workspaceType?: 'agency' | 'individual';
  tenantStatus?: 'active' | 'suspended' | 'pending' | 'archived';
  onboardingStatus?: 'PENDING_SETUP' | 'PENDING_PAYMENT' | 'PAYMENT_RECEIVED' | 'INITIALIZING_WORKSPACE' | 'ACTIVE' | 'FAILED_SETUP' | 'SUSPENDED';
  onboardingCompleted?: boolean;
  workspacePreferences?: {
    currency?: 'USD' | 'ZiG';
    timezone?: string;
    measurementUnits?: 'metric' | 'imperial';
    invoicePrefix?: string;
    invoiceNotes?: string;
  };
  bankAccounts: BankAccount[];
  commissionConfig?: {
    preaPercentOfTotal: number;
    agentPercentOfRemaining: number;
    agencyPercentOfRemaining: number;
    vatPercentOnCommission?: number;
  };
  plan?: 'INDIVIDUAL' | 'SME' | 'ENTERPRISE';
  propertyLimit?: number | null;
  featureFlags?: {
    commissionEnabled: boolean;
    agentAccounts: boolean;
    propertyAccounts: boolean;
    propertyOwners?: boolean;
    commissions?: boolean;
    trustAccounting?: boolean;
    maintenanceApprovals?: boolean;
    accounting?: boolean;
    agents?: boolean;
  };
  fiscalConfig?: {
    enabled?: boolean;
    providerName?: string;
    agentName?: string;
    deviceSerial?: string;
    fdmsBaseUrl?: string;
    apiKey?: string;
    apiUsername?: string;
    apiPassword?: string;
  };
  receivablesCutover?: { year: number; month: number };
  rentReceivableOpeningBalance?: number;
  levyReceivableOpeningBalance?: number;
  taxProfile?: {
    vatRegistered?: boolean;
    vatRegistrationEffectiveDate?: string | Date | null;
    vatCategory?: string;
    fiscalisationEnabled?: boolean;
  };
  createdAt: string;
  updatedAt: string;
  __v: number;
}

interface CompanyContextType {
  company: Company | null;
  loading: boolean;
  error: string | null;
  fetchCompany: () => Promise<void>;
  hasCompany: boolean;
  refreshCompany: () => Promise<void>;
}

const CompanyContext = createContext<CompanyContextType | undefined>(undefined);

export const CompanyProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [company, setCompany] = useState<Company | null>(() => (isDemoMode() ? (getDemoCompany() as Company) : null));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasCompany, setHasCompany] = useState(() => isDemoMode());
  const { isAuthenticated, user } = useAuth();
  const inFlightRef = React.useRef<Promise<void> | null>(null);
  const lastFetchKeyRef = React.useRef<string | null>(null);
  const lastFetchAtRef = React.useRef<number>(0);

  const validateCompanyData = (data: any): Company => {
    if (!data || !data._id || !data.name) {
      console.error('Invalid company data:', data);
      throw new Error('Invalid company data received');
    }

    // Some fields are legitimately absent during onboarding (especially for individual landlords).
    // Only enforce business-only identifiers when the workspace is a registered business.
    const companyType = data.companyType as Company['companyType'] | undefined;
    const isRegisteredBusiness = companyType === 'REGISTERED_BUSINESS';
    if (isRegisteredBusiness) {
      if (!data.registrationNumber || !data.tinNumber) {
        console.error('Missing required business identifiers:', data);
        throw new Error('Company registration details are incomplete');
      }
    }

    return {
      _id: data._id,
      name: data.name,
      address: data.address || '',
      phone: data.phone || '',
      email: data.email || '',
      website: data.website,
      registrationNumber: data.registrationNumber || '',
      tinNumber: data.tinNumber || '',
      vatNumber: data.vatNumber,
      ownerId: data.ownerId,
      description: data.description,
      logo: data.logo,
      isActive: data.isActive ?? true,
      subscriptionStatus: data.subscriptionStatus ?? 'trial',
      subscriptionEndDate: data.subscriptionEndDate,
      companyType,
      workspaceType: data.workspaceType === 'individual' ? 'individual' : 'agency',
      tenantStatus: data.tenantStatus,
      onboardingStatus: data.onboardingStatus,
      onboardingCompleted: data.onboardingCompleted,
      workspacePreferences: data.workspacePreferences,
      bankAccounts: data.bankAccounts || [],
      plan: data.plan,
      propertyLimit: data.propertyLimit,
      featureFlags: data.featureFlags,
      fiscalConfig: data.fiscalConfig,
      receivablesCutover: data.receivablesCutover,
      rentReceivableOpeningBalance: data.rentReceivableOpeningBalance,
      levyReceivableOpeningBalance: data.levyReceivableOpeningBalance,
      taxProfile: data.taxProfile,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
      __v: data.__v || 0
    };
  };

  const fetchCompany = async () => {
    if (isDemoMode()) {
      setCompany(getDemoCompany() as Company);
      setHasCompany(true);
      setLoading(false);
      setError(null);
      return;
    }
    if (!isAuthenticated || !user) {
      setLoading(false);
      setCompany(null);
      setHasCompany(false);
      return;
    }

    try {
      // Dedupe concurrent calls (StrictMode + rerenders)
      if (inFlightRef.current) {
        await inFlightRef.current;
        return;
      }

      const key = String(user.companyId || 'current');
      // If we already have this company and we fetched it very recently, skip.
      // (Prevents "constant refresh" feel when something triggers repeated renders.)
      const now = Date.now();
      const recentlyFetched = lastFetchKeyRef.current === key && (now - lastFetchAtRef.current) < 15_000;
      if (company && hasCompany && recentlyFetched) {
        return;
      }

      // Only show a loading state if we don't already have a company object.
      if (!company) setLoading(true);
      setError(null);
      
      if (process.env.NODE_ENV === 'development') {
        console.log('Fetching company data for user:', {
          userId: user._id,
          companyId: user.companyId,
          role: user.role
        });
      }

      const run = (async () => {
      let response: any;

      try {
        // Normal tenant users must use /current; /companies/:id is restricted to
        // platform admins and returns 403 for accountant/admin dashboard users.
        response = await api.get('/companies/current');
      } catch (apiError: any) {
        if (user.companyId && user.role === 'system_admin') {
          response = await api.get(`/companies/${user.companyId}`);
        } else {
          throw apiError;
        }
      }

      if (process.env.NODE_ENV === 'development') {
        console.log('Company data received:', response.data);
      }
      
      // Handle both response formats: direct company data or wrapped response
      const companyData = response.data.status === 'success' ? response.data.data : response.data;
      
      if (!companyData) {
        throw new Error('No company data received');
      }

      const validatedCompany = validateCompanyData(companyData);

      if (process.env.NODE_ENV === 'development') {
        console.log('Validated company data:', validatedCompany);
      }
      setCompany(validatedCompany);
      setHasCompany(true);
      setError(null);
      
      // Store company ID in localStorage for other services to use
      localStorage.setItem('companyId', validatedCompany._id);
      lastFetchKeyRef.current = key;
      lastFetchAtRef.current = Date.now();
      })();

      inFlightRef.current = run;
      await run;
    } catch (err: any) {
      console.error('Error fetching company:', err);
      
      // Handle specific error cases
      if (err.response?.data?.code === 'NO_COMPANY') {
        setError('No company found. Please create a company first.');
      } else if (err.response?.status === 401) {
        setError('Authentication required. Please log in again.');
      } else if (err.response?.status === 503) {
        setError('Service temporarily unavailable. Please try again later.');
      } else {
        setError(err.response?.data?.message || err.message || 'Failed to fetch company data');
      }
      
      setCompany(null);
      setHasCompany(false);
      localStorage.removeItem('companyId');
    } finally {
      setLoading(false);
      inFlightRef.current = null;
    }
  };

  // Function to refresh company data
  const refreshCompany = async () => {
    await fetchCompany();
  };

  // Initial fetch when authenticated
  useEffect(() => {
    if (isDemoMode()) {
      setCompany(getDemoCompany() as Company);
      setHasCompany(true);
      setLoading(false);
      setError(null);
      return;
    }
    // Always attempt to fetch the "current" company when authenticated.
    // New signups/onboarding can have a company without user.companyId being populated yet.
    if (isAuthenticated && user) {
      fetchCompany();
    } else {
      setLoading(false);
      setCompany(null);
      setHasCompany(false);
    }
  }, [isAuthenticated, user?._id, user?.companyId]);

  // Set up periodic refresh of company data
  useEffect(() => {
    let refreshInterval: NodeJS.Timeout;
    
    if (isAuthenticated && hasCompany) {
      refreshInterval = setInterval(() => {
        refreshCompany();
      }, 5 * 60 * 1000); // Refresh every 5 minutes
    }

    return () => {
      if (refreshInterval) {
        clearInterval(refreshInterval);
      }
    };
  }, [isAuthenticated, hasCompany]);

  return (
    <CompanyContext.Provider value={{ company, loading, error, fetchCompany, hasCompany, refreshCompany }}>
      {children}
    </CompanyContext.Provider>
  );
};

export const useCompany = () => {
  const context = useContext(CompanyContext);
  if (context === undefined) {
    // Graceful fallback to avoid runtime crashes if a component renders outside provider
    return {
      company: null,
      loading: false,
      error: null,
      fetchCompany: async () => {},
      hasCompany: false,
      refreshCompany: async () => {},
    } as CompanyContextType;
  }
  return context;
}; 