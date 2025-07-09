import React, { useState } from 'react';
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
import { useCompany } from '../../contexts/CompanyContext';
import AssessmentIcon from '@mui/icons-material/Assessment';
import DownloadIcon from '@mui/icons-material/Download';

const OwnerReports: React.FC = () => {
  const { company } = useCompany();
  const [loading, setLoading] = useState(false);

  const handleDownload = (reportType: string) => {
    // TODO: Implement report download
    console.log('Downloading report:', reportType);
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