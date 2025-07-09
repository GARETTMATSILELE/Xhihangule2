import React, { useState } from 'react';
import {
  Box,
  Container,
  Typography,
  Paper,
  Grid,
  Card,
  CardContent,
  CardHeader,
  Button,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  SelectChangeEvent
} from '@mui/material';
import {
  Download as DownloadIcon,
  Print as PrintIcon,
  Email as EmailIcon
} from '@mui/icons-material';

const ReportsPage: React.FC = () => {
  const [reportType, setReportType] = useState('');
  const [dateRange, setDateRange] = useState('');

  const handleReportTypeChange = (event: SelectChangeEvent) => {
    setReportType(event.target.value);
  };

  const handleDateRangeChange = (event: SelectChangeEvent) => {
    setDateRange(event.target.value);
  };

  const handleDownload = () => {
    // TODO: Implement download functionality
    console.log('Downloading report:', { reportType, dateRange });
  };

  const handlePrint = () => {
    // TODO: Implement print functionality
    console.log('Printing report:', { reportType, dateRange });
  };

  const handleEmail = () => {
    // TODO: Implement email functionality
    console.log('Emailing report:', { reportType, dateRange });
  };

  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      <Typography variant="h4" gutterBottom>
        Reports
      </Typography>

      <Grid container spacing={3}>
        {/* Report Configuration */}
        <Grid item xs={12}>
          <Paper sx={{ p: 3, mb: 3 }}>
            <Grid container spacing={3}>
              <Grid item xs={12} md={6}>
                <FormControl fullWidth>
                  <InputLabel>Report Type</InputLabel>
                  <Select
                    value={reportType}
                    label="Report Type"
                    onChange={handleReportTypeChange}
                  >
                    <MenuItem value="financial">Financial Summary</MenuItem>
                    <MenuItem value="rental">Rental Income</MenuItem>
                    <MenuItem value="expenses">Expenses</MenuItem>
                    <MenuItem value="commission">Commission</MenuItem>
                    <MenuItem value="tax">Tax Summary</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} md={6}>
                <FormControl fullWidth>
                  <InputLabel>Date Range</InputLabel>
                  <Select
                    value={dateRange}
                    label="Date Range"
                    onChange={handleDateRangeChange}
                  >
                    <MenuItem value="today">Today</MenuItem>
                    <MenuItem value="week">This Week</MenuItem>
                    <MenuItem value="month">This Month</MenuItem>
                    <MenuItem value="quarter">This Quarter</MenuItem>
                    <MenuItem value="year">This Year</MenuItem>
                    <MenuItem value="custom">Custom Range</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
            </Grid>
          </Paper>
        </Grid>

        {/* Report Actions */}
        <Grid item xs={12}>
          <Box sx={{ display: 'flex', gap: 2, mb: 3 }}>
            <Button
              variant="contained"
              startIcon={<DownloadIcon />}
              onClick={handleDownload}
              disabled={!reportType || !dateRange}
            >
              Download
            </Button>
            <Button
              variant="contained"
              startIcon={<PrintIcon />}
              onClick={handlePrint}
              disabled={!reportType || !dateRange}
            >
              Print
            </Button>
            <Button
              variant="contained"
              startIcon={<EmailIcon />}
              onClick={handleEmail}
              disabled={!reportType || !dateRange}
            >
              Email
            </Button>
          </Box>
        </Grid>

        {/* Report Preview */}
        <Grid item xs={12}>
          <Card>
            <CardHeader title="Report Preview" />
            <CardContent>
              <Typography variant="body1" color="text.secondary">
                Select a report type and date range to generate a preview.
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Container>
  );
};

export default ReportsPage; 