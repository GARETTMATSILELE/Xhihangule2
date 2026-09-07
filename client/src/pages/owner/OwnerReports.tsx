import React, { useEffect, useState } from 'react';
import {
  Box,
  Typography,
  Paper,
  Grid,
  Button,
  Card,
  CardContent,
  CardActions,
  Divider,
} from '@mui/material';
import AssessmentIcon from '@mui/icons-material/Assessment';
import DownloadIcon from '@mui/icons-material/Download';
import api from '../../api/axios';
import reportingService from '../../reporting/reportingService';

interface OwnerReportProperty {
  propertyId: string;
  propertyName?: string;
  address?: string;
}

const OwnerReports: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [properties, setProperties] = useState<OwnerReportProperty[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    api.get('/owners/financial-data')
      .then((res) => {
        if (!mounted) return;
        const rows = Array.isArray(res.data?.data?.propertyBreakdown) ? res.data.data.propertyBreakdown : [];
        setProperties(rows.map((row: any) => ({
          propertyId: String(row.propertyId || row._id || ''),
          propertyName: row.propertyName || row.name,
          address: row.address
        })).filter((row: OwnerReportProperty) => row.propertyId));
      })
      .catch(() => {
        if (mounted) setError('Unable to load owner properties for enterprise statements.');
      });
    return () => {
      mounted = false;
    };
  }, []);

  const handleDownload = (reportType: string) => {
    // TODO: Implement report download
    console.log('Downloading report:', reportType);
  };

  const downloadEnterpriseOwnerStatement = async (propertyId: string) => {
    setLoading(true);
    setError(null);
    try {
      const blob = await reportingService.downloadOwnerStatement(propertyId, 'pdf', { includeAllTransactions: true });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `owner-statement-${propertyId}-all-transactions.pdf`;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      setError('Unable to download enterprise owner statement.');
    } finally {
      setLoading(false);
    }
  };

  const reports = [
    {
      title: 'Property Performance',
      description: 'Monthly analysis of property occupancy and revenue',
      type: 'property-performance'
    },
    {
      title: 'Tenant Analysis',
      description: 'Overview of tenant demographics and payment history',
      type: 'tenant-analysis'
    },
    {
      title: 'Financial Summary',
      description: 'Detailed financial reports including income and expenses',
      type: 'financial-summary'
    },
    {
      title: 'Maintenance Reports',
      description: 'History of maintenance requests and their status',
      type: 'maintenance-reports'
    }
  ];

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h5" gutterBottom>
        Reports
      </Typography>
      {error && <Typography color="error" sx={{ mb: 2 }}>{error}</Typography>}
      {properties.length > 0 && (
        <Paper sx={{ p: 2, mb: 3 }}>
          <Typography variant="h6" gutterBottom>Enterprise Owner Statements</Typography>
          <Grid container spacing={2}>
            {properties.map((property) => (
              <Grid item xs={12} sm={6} md={4} key={property.propertyId}>
                <Card variant="outlined">
                  <CardContent>
                    <Typography variant="subtitle1">{property.propertyName || 'Property'}</Typography>
                    <Typography color="textSecondary" variant="body2">{property.address || 'No address on record'}</Typography>
                  </CardContent>
                  <CardActions>
                    <Button
                      startIcon={<DownloadIcon />}
                      onClick={() => downloadEnterpriseOwnerStatement(property.propertyId)}
                      disabled={loading}
                    >
                      Owner Statement PDF
                    </Button>
                  </CardActions>
                </Card>
              </Grid>
            ))}
          </Grid>
        </Paper>
      )}
      <Grid container spacing={3}>
        {reports.map((report) => (
          <Grid item xs={12} sm={6} md={4} key={report.type}>
            <Card>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                  <AssessmentIcon sx={{ mr: 1 }} />
                  <Typography variant="h6">{report.title}</Typography>
                </Box>
                <Typography color="textSecondary" gutterBottom>
                  {report.description}
                </Typography>
              </CardContent>
              <Divider />
              <CardActions>
                <Button
                  startIcon={<DownloadIcon />}
                  onClick={() => handleDownload(report.type)}
                  disabled={loading}
                >
                  Download Report
                </Button>
              </CardActions>
            </Card>
          </Grid>
        ))}
      </Grid>
    </Box>
  );
};

export default OwnerReports; 