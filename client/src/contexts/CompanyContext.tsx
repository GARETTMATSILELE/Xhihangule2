import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import api from '../api/axios';
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
  subscriptionStatus: 'active' | 'inactive' | 'trial';
  subscriptionEndDate?: Date;
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
  const [company, setCompany] = useState<Company | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasCompany, setHasCompany] = useState(false);
  const { isAuthenticated, user } = useAuth();

  const validateCompanyData = (data: any): Company => {
    if (!data._id || !data.name || !data.email || 
        !data.registrationNumber || !data.tinNumber || 
        !data.address || !data.phone) {
      console.error('Invalid company data:', data);
      throw new Error('Invalid company data received');
    }

    return {
      _id: data._id,
      name: data.name,
      address: data.address,
      phone: data.phone,
      email: data.email,
      website: data.website,
      registrationNumber: data.registrationNumber,
      tinNumber: data.tinNumber,
      vatNumber: data.vatNumber,
      ownerId: data.ownerId,
      description: data.description,
      logo: data.logo,
      isActive: data.isActive ?? true,
      subscriptionStatus: data.subscriptionStatus ?? 'trial',
      subscriptionEndDate: data.subscriptionEndDate,
      bankAccounts: data.bankAccounts || [],
      plan: data.plan,
      propertyLimit: data.propertyLimit,
      featureFlags: data.featureFlags,
      fiscalConfig: data.fiscalConfig,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
      __v: data.__v || 0
    };
  };

  const fetchCompany = async () => {
    if (!isAuthenticated || !user) {
      setLoading(false);
      setCompany(null);
      setHasCompany(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      
      console.log('Fetching company data for user:', {
        userId: user._id,
        companyId: user.companyId,
        role: user.role
      });

      let response: any;
      let endpoint = '/companies/current';
      
      // If user has a companyId, use it to fetch the company
      if (user.companyId) {
        endpoint = `/companies/${user.companyId}`;
      }

      try {
        response = await api.get(endpoint);
      } catch (apiError: any) {
        // If the first attempt fails and we used companyId, try the current endpoint
        if (user.companyId && apiError.response?.status === 404) {
          console.log('Company not found by ID, trying current endpoint');
          response = await api.get('/companies/current');
        } else {
          throw apiError;
        }
      }

      console.log('Company data received:', response.data);
      
      // Handle both response formats: direct company data or wrapped response
      const companyData = response.data.status === 'success' ? response.data.data : response.data;
      
      if (!companyData) {
        throw new Error('No company data received');
      }

      // Validate required fields
      if (!companyData._id || !companyData.name || !companyData.email || 
          !companyData.registrationNumber || !companyData.tinNumber || 
          !companyData.address || !companyData.phone) {
        console.error('Invalid company data:', companyData);
        throw new Error('Invalid company data received');
      }
      
      // Ensure all required fields are present
      const validatedCompany: Company = {
        _id: companyData._id,
        name: companyData.name,
        address: companyData.address,
        phone: companyData.phone,
        email: companyData.email,
        website: companyData.website,
        registrationNumber: companyData.registrationNumber,
        tinNumber: companyData.tinNumber,
        vatNumber: companyData.vatNumber,
        ownerId: companyData.ownerId,
        description: companyData.description,
        logo: companyData.logo,
        isActive: companyData.isActive ?? true,
        subscriptionStatus: companyData.subscriptionStatus ?? 'trial',
        subscriptionEndDate: companyData.subscriptionEndDate,
        bankAccounts: companyData.bankAccounts || [],
        commissionConfig: companyData.commissionConfig,
        plan: companyData.plan,
        propertyLimit: companyData.propertyLimit,
        featureFlags: companyData.featureFlags,
        fiscalConfig: companyData.fiscalConfig,
        receivablesCutover: companyData.receivablesCutover,
        rentReceivableOpeningBalance: companyData.rentReceivableOpeningBalance,
        levyReceivableOpeningBalance: companyData.levyReceivableOpeningBalance,
        createdAt: companyData.createdAt,
        updatedAt: companyData.updatedAt,
        __v: companyData.__v || 0
      };

      console.log('Validated company data:', validatedCompany);
      setCompany(validatedCompany);
      setHasCompany(true);
      setError(null);
      
      // Store company ID in localStorage for other services to use
      localStorage.setItem('companyId', validatedCompany._id);
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
    }
  };

  // Function to refresh company data
  const refreshCompany = async () => {
    await fetchCompany();
  };

  // Initial fetch when authenticated
  useEffect(() => {
    if (isAuthenticated && user?.companyId) {
      fetchCompany();
    } else {
      setLoading(false);
      setCompany(null);
      setHasCompany(false);
    }
  }, [isAuthenticated, user?.companyId]);

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