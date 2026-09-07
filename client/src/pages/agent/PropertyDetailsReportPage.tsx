import React, { useEffect, useState } from 'react';
import { Alert, Box, Button, CircularProgress, Stack, Typography } from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { useLocation, useNavigate } from 'react-router-dom';
import { ReportBuilder } from '../../reports/components/ReportBuilder';
import { propertyDetailsReportDefinition, PropertyReportRow } from '../../reports/definitions/propertyDetails';
import { propertyReportService } from '../../reports/services/propertyReportService';
import { useCompany } from '../../contexts/CompanyContext';
import { useAuth } from '../../contexts/AuthContext';

const COMPANY_REPORT_ROLES = ['accountant', 'admin', 'principal', 'prea'];

type PropertyDetailsReportPageProps = {
  scope?: 'agent' | 'company';
};

const PropertyDetailsReportPage: React.FC<PropertyDetailsReportPageProps> = ({ scope }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { company } = useCompany();
  const { user, company: authCompany } = useAuth();
  const roles = (
    Array.isArray((user as any)?.roles) && (user as any).roles.length
      ? (user as any).roles
      : [user?.role]
  ).filter(Boolean) as string[];
  const isAccountantView =
    scope === 'company' ||
    location.pathname.includes('/accountant-dashboard') ||
    roles.some((role) => COMPANY_REPORT_ROLES.includes(String(role)));
  const reportScope: 'agent' | 'company' = isAccountantView ? 'company' : (scope || 'agent');
  const backPath = isAccountantView ? '/accountant-dashboard/reports' : '/agent-dashboard/inspections';
  const backLabel = isAccountantView ? 'Back to reports' : 'Back to inspections';
  const [rows, setRows] = useState<PropertyReportRow[]>([]);
  const [generatedAt, setGeneratedAt] = useState(new Date().toISOString());
  const [companyName, setCompanyName] = useState('');
  const [companyLogo, setCompanyLogo] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        setLoading(true);
        setError('');
        const data = await propertyReportService.getPropertyDetailsReport(reportScope);
        if (cancelled) return;
        setRows(data.properties || []);
        setGeneratedAt(data.generatedAt || new Date().toISOString());
        setCompanyName(data.company?.name || company?.name || authCompany?.name || '');
        setCompanyLogo(data.company?.logo || company?.logo || authCompany?.logo || '');
      } catch (err: any) {
        if (cancelled) return;
        setError(err?.response?.data?.message || 'Could not load the property details report.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [authCompany?.logo, authCompany?.name, company?.logo, company?.name, reportScope]);

  return (
    <Box>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} justifyContent="space-between" alignItems={{ xs: 'flex-start', sm: 'center' }} sx={{ mb: 3 }} className="no-print">
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 900, letterSpacing: '-0.03em' }}>
            Property Details Report
          </Typography>
          <Typography color="text.secondary">
            {isAccountantView
              ? 'All company properties you can view. Choose the details you want, then preview and print.'
              : 'Choose the properties and information you want, then preview and print.'}
          </Typography>
        </Box>
        <Button startIcon={<ArrowBackIcon />} onClick={() => navigate(backPath)} sx={{ textTransform: 'none', fontWeight: 800 }}>
          {backLabel}
        </Button>
      </Stack>
      {error ? <Alert severity="error" sx={{ mb: 2 }} className="no-print">{error}</Alert> : null}
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }} className="no-print">
          <CircularProgress />
        </Box>
      ) : (
        <ReportBuilder
          definition={propertyDetailsReportDefinition}
          rows={rows}
          getId={(row) => row.id}
          getPrimaryLabel={(row) => row.address || row.name}
          getSecondaryLabel={(row) => [row.name, row.agentName, row.ownerName, row.tenantName, row.occupancyStatus].filter(Boolean).join(' · ')}
          companyName={companyName}
          companyLogo={companyLogo}
          generatedAt={generatedAt}
        />
      )}
    </Box>
  );
};

export default PropertyDetailsReportPage;
