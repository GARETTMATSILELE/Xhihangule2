import React, { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import OwnerStatementReport from '../../components/admin/reports/OwnerStatementReport';
import IncomeExpenseReport from '../../components/admin/reports/IncomeExpenseReport';
import RentRollReport from '../../components/admin/reports/RentRollReport';

const TABS = [
  { label: 'Financial', key: 'financial' },
  { label: 'Operational', key: 'operational' },
  { label: 'Tenant', key: 'tenant' },
  { label: 'Portfolio', key: 'portfolio' },
  { label: 'Legal', key: 'legal' },
];

const ReportsPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState('financial');
  const { isAuthenticated, user, company } = useAuth();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold mb-2">Reports Dashboard</h1>
        {isAuthenticated ? (
          <div className="bg-green-100 border-l-4 border-green-500 text-green-700 p-3 mb-6 rounded">
            <strong>Authenticated Access:</strong> You are viewing reports with full access to your company data.
            {company && <span className="block mt-1">Company: {company.name}</span>}
            {user && <span className="block">User: {user.firstName} {user.lastName}</span>}
          </div>
        ) : (
          <div className="bg-yellow-100 border-l-4 border-yellow-500 text-yellow-700 p-3 mb-6 rounded">
            <strong>Public Access:</strong> You are viewing public reports. Data may be limited. 
            <span className="block mt-1">Log in for full access to your company reports.</span>
          </div>
        )}
      </div>
      
      <div className="mb-4 flex space-x-2 border-b">
        {TABS.map(tab => (
          <button
            key={tab.key}
            className={`px-4 py-2 font-medium border-b-2 transition-colors duration-150 ${activeTab === tab.key ? 'border-blue-600 text-blue-700 bg-white' : 'border-transparent text-gray-500 hover:text-blue-600'}`}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      
      <div className="space-y-6">
        {activeTab === 'financial' && (
          <>
            <OwnerStatementReport isAuthenticated={isAuthenticated} />
            <IncomeExpenseReport isAuthenticated={isAuthenticated} />
            {/* Add more financial reports here */}
          </>
        )}
        {activeTab === 'operational' && (
          <>
            <RentRollReport isAuthenticated={isAuthenticated} />
            {/* ReceivablesReport, PayablesReport, MaintenanceReport, VacancyReport, etc. */}
            <div className="p-4 bg-white rounded shadow text-gray-400">Operational reports coming soon...</div>
          </>
        )}
        {activeTab === 'tenant' && (
          <>
            {/* TenantLedgerReport, DelinquencyReport, LeaseExpiryReport, etc. */}
            <div className="p-4 bg-white rounded shadow text-gray-400">Tenant reports coming soon...</div>
          </>
        )}
        {activeTab === 'portfolio' && (
          <>
            {/* PortfolioSummaryReport, CapitalExpenditureReport, ForecastReport, etc. */}
            <div className="p-4 bg-white rounded shadow text-gray-400">Portfolio reports coming soon...</div>
          </>
        )}
        {activeTab === 'legal' && (
          <>
            {/* EvictionReport, Legal/Compliance reports, etc. */}
            <div className="p-4 bg-white rounded shadow text-gray-400">Legal reports coming soon...</div>
          </>
        )}
      </div>
    </div>
  );
};

export default ReportsPage; 