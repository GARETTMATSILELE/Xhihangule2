import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { usePropertyService } from '../services/propertyService';
import { useTenantService } from '../services/tenantService';

const TestAuth: React.FC = () => {
  const { user, company, isAuthenticated, loading } = useAuth();
  const [testResults, setTestResults] = useState<any>({});
  const [isTesting, setIsTesting] = useState(false);

  const propertyService = usePropertyService();
  const tenantService = useTenantService();

  const runTests = async () => {
    setIsTesting(true);
    const results: any = {};

    try {
      // Test 1: Check if user has companyId
      results.userCheck = {
        hasUser: !!user,
        hasCompanyId: !!user?.companyId,
        companyId: user?.companyId,
        role: user?.role,
        email: user?.email
      };

      // Test 2: Check if company data is available
      results.companyCheck = {
        hasCompany: !!company,
        companyData: company
      };

      // Test 3: Test properties API
      try {
        const properties = await propertyService.getProperties();
        results.propertiesTest = {
          success: true,
          count: properties.length,
          sampleProperty: properties[0] ? {
            id: properties[0]._id,
            name: properties[0].name,
            companyId: properties[0].companyId
          } : null
        };
      } catch (error) {
        results.propertiesTest = {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        };
      }

      // Test 4: Test tenants API
      try {
        const tenants = await tenantService.getAll();
        results.tenantsTest = {
          success: true,
          count: tenants.tenants.length,
          sampleTenant: tenants.tenants[0] ? {
            id: tenants.tenants[0]._id,
            name: `${tenants.tenants[0].firstName} ${tenants.tenants[0].lastName}`,
            companyId: tenants.tenants[0].companyId
          } : null
        };
      } catch (error) {
        results.tenantsTest = {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        };
      }

    } catch (error) {
      results.generalError = error instanceof Error ? error.message : 'Unknown error';
    }

    setTestResults(results);
    setIsTesting(false);
  };

  if (loading) {
    return <div>Loading...</div>;
  }

  if (!isAuthenticated) {
    return <div>Please log in to test authentication</div>;
  }

  return (
    <div style={{ padding: '20px', maxWidth: '800px', margin: '0 auto' }}>
      <h1>Authentication Test</h1>
      
      <div style={{ marginBottom: '20px' }}>
        <h2>Current User State</h2>
        <pre style={{ background: '#f5f5f5', padding: '10px', borderRadius: '4px' }}>
          {JSON.stringify({ user, company, isAuthenticated }, null, 2)}
        </pre>
      </div>

      <button 
        onClick={runTests} 
        disabled={isTesting}
        style={{ 
          padding: '10px 20px', 
          fontSize: '16px', 
          backgroundColor: '#007bff', 
          color: 'white', 
          border: 'none', 
          borderRadius: '4px',
          cursor: isTesting ? 'not-allowed' : 'pointer'
        }}
      >
        {isTesting ? 'Running Tests...' : 'Run API Tests'}
      </button>

      {Object.keys(testResults).length > 0 && (
        <div style={{ marginTop: '20px' }}>
          <h2>Test Results</h2>
          <pre style={{ background: '#f5f5f5', padding: '10px', borderRadius: '4px', overflow: 'auto' }}>
            {JSON.stringify(testResults, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
};

export default TestAuth; 