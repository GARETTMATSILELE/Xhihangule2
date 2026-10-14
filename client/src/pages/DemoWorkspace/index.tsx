import React from 'react';
import { Box } from '@mui/material';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import Seo from '../../components/SEO/Seo';
import { CompanyProvider } from '../../contexts/CompanyContext';
import DemoChrome from '../../demo/DemoChrome';
import { isDemoAgencyPath, notifyDemoBlocked } from '../../demo/demoMode';
import IndividualDashboard from '../IndividualDashboard';
import ExecutiveOperationsDashboard from '../admin/ExecutiveOperationsDashboard';

function AgencyDemo() {
  return (
    <Box sx={{ p: { xs: 2, md: 3 }, bgcolor: '#f4f7f5', minHeight: 'calc(100vh - 108px)' }}>
      <ExecutiveOperationsDashboard />
    </Box>
  );
}

export default function DemoWorkspace() {
  const { pathname } = useLocation();
  const agency = isDemoAgencyPath(pathname);

  React.useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      const anchor = target?.closest('a[href]') as HTMLAnchorElement | null;
      if (!anchor) return;
      const href = anchor.getAttribute('href') || '';
      if (href.startsWith('/admin-dashboard') || href.startsWith('/billing')) {
        event.preventDefault();
        notifyDemoBlocked();
      }
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, []);

  return (
    <CompanyProvider key={agency ? 'agency' : 'individual'}>
      <Seo
        title="Sample workspace | Mantis Africa"
        description="Explore a labelled sample Mantis workspace with fictional properties, tenants, leases and payments. Sample data is never mixed with a live account."
      />
      <DemoChrome>
        <Routes>
          <Route path="enterprise" element={<AgencyDemo />} />
          <Route path="*" element={agency ? <Navigate to="/demo/enterprise" replace /> : <IndividualDashboard />} />
        </Routes>
      </DemoChrome>
    </CompanyProvider>
  );
}
