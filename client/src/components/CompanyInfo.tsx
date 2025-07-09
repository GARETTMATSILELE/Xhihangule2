import React, { useEffect, useState } from 'react';
import api from '../api/axios';

interface Company {
  _id: string;
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
}

const CompanyInfo: React.FC = () => {
  const [company, setCompany] = useState<Company | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [connectionStatus, setConnectionStatus] = useState<string>('disconnected');
  const [lastPing, setLastPing] = useState<string | null>(null);

  const checkConnection = async () => {
    try {
      const pingResponse = await api.get('/health');
      setConnectionStatus('connected');
      setLastPing(pingResponse.data.timestamp);
    } catch (error) {
      setConnectionStatus('disconnected');
      console.error('Connection check failed:', error);
    }
  };

  const fetchCompanyInfo = async () => {
    try {
      const response = await api.get('/companies/current');
      setCompany(response.data.data);
      setError(null);
    } catch (error) {
      console.error('Failed to fetch company info:', error);
      setError('Failed to fetch company information');
      setCompany(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCompanyInfo();
  }, []);

  if (loading) {
    return <div>Loading...</div>;
  }

  if (error) {
    return <div className="error">Error: {error}</div>;
  }

  if (!company) {
    return <div>No company data available</div>;
  }

  return (
    <div className="company-info">
      <h2>{company.name}</h2>
      {company.description && <p>{company.description}</p>}
      <div className="company-meta">
        <p>Created: {new Date(company.createdAt).toLocaleDateString()}</p>
        <p>Last Updated: {new Date(company.updatedAt).toLocaleDateString()}</p>
      </div>
    </div>
  );
};

export default CompanyInfo; 