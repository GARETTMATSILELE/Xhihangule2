import React, { useState, useEffect } from 'react';
import {
  Box,
  Container,
  Typography,
  Paper,
  Tabs,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Button,
  CircularProgress,
  Alert,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Grid
} from '@mui/material';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import * as XLSX from 'xlsx';
import accountantService, { CommissionData, AgencyCommission, PREACommission } from '../../services/accountantService';

const CommissionsPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState(0);
  const [agentCommissions, setAgentCommissions] = useState<CommissionData | null>(null);
  const [agencyCommission, setAgencyCommission] = useState<AgencyCommission | null>(null);
  const [preaCommission, setPREACommission] = useState<PREACommission | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Filter states for agent commissions
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState<number | 'all'>(new Date().getMonth());
  const [filterType, setFilterType] = useState<'monthly' | 'yearly'>('monthly');

  // Helper functions for filtering
  const getMonthName = (month: number) => {
    const months = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    return months[month];
  };

  const getYearOptions = () => {
    const currentYear = new Date().getFullYear();
    const years = [];
    for (let year = currentYear - 5; year <= currentYear + 1; year++) {
      years.push(year);
    }
    return years;
  };

  const getMonthOptions = () => {
    const months = [];
    for (let month = 0; month < 12; month++) {
      months.push({ value: month, label: getMonthName(month) });
    }
    return months;
  };

  const calculateFilteredCommission = (agent: any) => {
    if (filterType === 'yearly') {
      // Calculate yearly commission for the selected year
      const yearlyCommissions = agent.monthlyCommissions?.filter(
        (m: any) => m.year === selectedYear
      ) || [];
      return yearlyCommissions.reduce((sum: number, m: any) => sum + m.commission, 0);
    } else if (filterType === 'monthly') {
      if (selectedMonth === 'all') {
        // Calculate total monthly commission for the selected year
        const monthlyCommissions = agent.monthlyCommissions?.filter(
          (m: any) => m.year === selectedYear
        ) || [];
        return monthlyCommissions.reduce((sum: number, m: any) => sum + m.commission, 0);
      } else {
        // Get commission for the specific month and year
        const monthlyCommission = agent.monthlyCommissions?.find(
          (m: any) => m.month === selectedMonth && m.year === selectedYear
        );
        return monthlyCommission?.commission || 0;
      }
    }
    return agent.commission;
  };

  const getFilteredAgentCommissions = () => {
    if (!agentCommissions) return [];
    
    return agentCommissions.details.map(agent => ({
      ...agent,
      filteredCommission: calculateFilteredCommission(agent)
    }));
  };

  useEffect(() => {
    const fetchCommissionData = async () => {
      try {
        setLoading(true);
        setError(null);

        const { agentCommissions, agencyCommission, preaCommission } = await accountantService.getAllCommissions();

        setAgentCommissions(agentCommissions);
        setAgencyCommission(agencyCommission);
        setPREACommission(preaCommission);
      } catch (err) {
        console.error('Error fetching commission data:', err);
        setError(err instanceof Error ? err.message : 'An error occurred while fetching commission data');
      } finally {
        setLoading(false);
      }
    };

    fetchCommissionData();
  }, []);

  const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
    setActiveTab(newValue);
  };

  const downloadPDF = () => {
    const doc = new jsPDF();
    const title = ['Agent Commissions', 'Agency Commission', 'PREA Commission'][activeTab];
    const data = [agentCommissions, agencyCommission, preaCommission][activeTab];

    // Format currency helper function
    const formatCurrency = (amount: number) => {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
      }).format(amount);
    };

    doc.text(title, 14, 15);

    if (data) {
      const tableData: any[] = [];
      const headers: string[] = [];

      if (activeTab === 0 && 'details' in data) {
        // Agent Commissions with filtering
        const filteredAgents = getFilteredAgentCommissions();
        headers.push('Agent Name', filterType === 'monthly' ? 'Monthly Commission' : 'Yearly Commission', 'Properties', 'Total Commission');
        filteredAgents.forEach((agent: any) => {
          tableData.push([
            agent.agentName,
            formatCurrency(agent.filteredCommission),
            agent.properties.length,
            formatCurrency(agent.commission * 12)
          ]);
        });
        
        // Add filter info to title
        let filterInfo = `${filterType} for ${selectedYear}`;
        if (filterType === 'monthly' && selectedMonth !== 'all') {
          filterInfo += ` - ${getMonthName(selectedMonth as number)}`;
        }
        doc.text(`${title} (${filterInfo})`, 14, 15);
      } else if (activeTab === 1 && 'details' in data) {
        headers.push('Payment Date', 'Property Name', 'Property Address', 'Rental Amount', 'Agency Share');
        data.details.forEach((detail: any) => {
          const paymentDate = new Date(detail.paymentDate).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
          });
          tableData.push([
            paymentDate,
            detail.propertyName,
            detail.propertyAddress,
            formatCurrency(detail.rentalAmount),
            formatCurrency(detail.agencyShare)
          ]);
        });
      } else if ('details' in data) {
        headers.push('Property Name', 'Monthly', 'Yearly', 'Total');
        data.details.forEach((detail: any) => {
          tableData.push([
            detail.propertyName,
            formatCurrency(detail.commission),
            formatCurrency(detail.commission * 12),
            formatCurrency(detail.commission * 12)
          ]);
        });
      }

      (doc as any).autoTable({
        head: [headers],
        body: tableData,
        startY: 25
      });
    }

    doc.save(`${title.toLowerCase().replace(' ', '_')}.pdf`);
  };

  const downloadExcel = () => {
    const title = ['Agent Commissions', 'Agency Commission', 'PREA Commission'][activeTab];
    const data = [agentCommissions, agencyCommission, preaCommission][activeTab];

    if (data) {
      let worksheetData: any[] = [];

      if (activeTab === 0 && 'details' in data) {
        // Agent Commissions with filtering
        const filteredAgents = getFilteredAgentCommissions();
        worksheetData = filteredAgents.map((agent: any) => ({
          'Agent Name': agent.agentName,
          [filterType === 'monthly' ? 'Monthly Commission' : 'Yearly Commission']: agent.filteredCommission,
          'Properties': agent.properties.length,
          'Total Commission': agent.commission * 12
        }));
      } else if (activeTab === 1 && 'details' in data) {
        worksheetData = data.details.map((detail: any) => ({
          'Payment Date': new Date(detail.paymentDate).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
          }),
          'Property Name': detail.propertyName,
          'Property Address': detail.propertyAddress,
          'Rental Amount': detail.rentalAmount,
          'Agency Share': detail.agencyShare
        }));
      } else if ('details' in data) {
        worksheetData = data.details.map((detail: any) => ({
          'Property Name': detail.propertyName,
          'Monthly': detail.commission,
          'Yearly': detail.commission * 12,
          'Total': detail.commission * 12
        }));
      }

      const worksheet = XLSX.utils.json_to_sheet(worksheetData);

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, title);
      XLSX.writeFile(workbook, `${title.toLowerCase().replace(' ', '_')}.xlsx`);
    }
  };

  const printReport = () => {
    window.print();
  };

  const renderTable = () => {
    if (loading) {
      return (
        <Box display="flex" justifyContent="center" alignItems="center" minHeight="200px">
          <CircularProgress />
        </Box>
      );
    }

    if (error) {
      return (
        <Box p={3}>
          <Alert severity="error">{error}</Alert>
        </Box>
      );
    }

    const data = [agentCommissions, agencyCommission, preaCommission][activeTab];
    if (!data) {
      return (
        <Box p={3}>
          <Alert severity="info">No data available for this commission type.</Alert>
        </Box>
      );
    }

    // Format currency helper function
    const formatCurrency = (amount: number) => {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
      }).format(amount);
    };

    // Format date for display
    const formatDate = (date: Date) => {
      return new Date(date).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
    };

    // Render filter controls for agent commissions
    if (activeTab === 0) {
      return (
        <Box>
          {/* Filter Controls */}
          <Box sx={{ mb: 3, p: 2, backgroundColor: 'background.paper', borderRadius: 1 }}>
            <Typography variant="h6" gutterBottom>
              Filter Agent Commissions
            </Typography>
            <Grid container spacing={2} alignItems="center">
              <Grid item xs={12} sm={3}>
                <FormControl fullWidth size="small">
                  <InputLabel>Filter Type</InputLabel>
                  <Select
                    value={filterType}
                    label="Filter Type"
                    onChange={(e) => setFilterType(e.target.value as 'monthly' | 'yearly')}
                  >
                    <MenuItem value="monthly">Monthly</MenuItem>
                    <MenuItem value="yearly">Yearly</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} sm={3}>
                <FormControl fullWidth size="small">
                  <InputLabel>Year</InputLabel>
                  <Select
                    value={selectedYear}
                    label="Year"
                    onChange={(e) => setSelectedYear(e.target.value as number)}
                  >
                    {getYearOptions().map((year) => (
                      <MenuItem key={year} value={year}>
                        {year}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
              {filterType === 'monthly' && (
                <Grid item xs={12} sm={3}>
                  <FormControl fullWidth size="small">
                    <InputLabel>Month</InputLabel>
                    <Select
                      value={selectedMonth}
                      label="Month"
                      onChange={(e) => setSelectedMonth(e.target.value as number | 'all')}
                    >
                      <MenuItem value="all">All Months</MenuItem>
                      {getMonthOptions().map((month) => (
                        <MenuItem key={month.value} value={month.value}>
                          {month.label}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Grid>
              )}
            </Grid>
            
            {/* Summary */}
            <Box sx={{ mt: 2, p: 2, backgroundColor: 'grey.50', borderRadius: 1 }}>
              <Typography variant="subtitle2" color="text.secondary">
                Showing {filterType} commissions for {selectedYear}
                {filterType === 'monthly' && selectedMonth !== 'all' && ` - ${getMonthName(selectedMonth as number)}`}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Total {filterType} commission: {formatCurrency(
                  getFilteredAgentCommissions().reduce((sum, agent) => sum + agent.filteredCommission, 0)
                )}
              </Typography>
            </Box>
          </Box>

          {/* Commission Table */}
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Agent Name</TableCell>
                  <TableCell align="right">
                    {filterType === 'monthly' ? 'Monthly Commission' : 'Yearly Commission'}
                  </TableCell>
                  <TableCell align="right">Properties</TableCell>
                  <TableCell align="right">Total Commission</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {getFilteredAgentCommissions().map((agent) => (
                  <TableRow key={agent.agentId}>
                    <TableCell>{agent.agentName}</TableCell>
                    <TableCell align="right">
                      {formatCurrency(agent.filteredCommission)}
                    </TableCell>
                    <TableCell align="right">{agent.properties.length}</TableCell>
                    <TableCell align="right">{formatCurrency(agent.commission * 12)}</TableCell>
                  </TableRow>
                ))}
                <TableRow>
                  <TableCell><strong>Total</strong></TableCell>
                  <TableCell align="right">
                    <strong>
                      {formatCurrency(
                        getFilteredAgentCommissions().reduce((sum, agent) => sum + agent.filteredCommission, 0)
                      )}
                    </strong>
                  </TableCell>
                  <TableCell align="right">
                    <strong>
                      {getFilteredAgentCommissions().reduce((sum, agent) => sum + agent.properties.length, 0)}
                    </strong>
                  </TableCell>
                  <TableCell align="right">
                    <strong>{formatCurrency(agentCommissions?.total || 0)}</strong>
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </TableContainer>
        </Box>
      );
    }

    // Handle Agency Commission tab
    if (activeTab === 1) {
      return (
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Payment Date</TableCell>
                <TableCell>Property Name</TableCell>
                <TableCell>Property Address</TableCell>
                <TableCell align="right">Rental Amount</TableCell>
                <TableCell align="right">Agency Share</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {data.details.map((detail: any) => (
                <TableRow key={detail.paymentId}>
                  <TableCell>{formatDate(detail.paymentDate)}</TableCell>
                  <TableCell>{detail.propertyName}</TableCell>
                  <TableCell>{detail.propertyAddress}</TableCell>
                  <TableCell align="right">{formatCurrency(detail.rentalAmount)}</TableCell>
                  <TableCell align="right">{formatCurrency(detail.agencyShare)}</TableCell>
                </TableRow>
              ))}
              <TableRow>
                <TableCell><strong>Total</strong></TableCell>
                <TableCell></TableCell>
                <TableCell></TableCell>
                <TableCell align="right"><strong>{formatCurrency(data.monthly)}</strong></TableCell>
                <TableCell align="right"><strong>{formatCurrency(data.total)}</strong></TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </TableContainer>
      );
    }

    // Handle PREA Commission tab
    if (activeTab === 2) {
      return (
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Property Name</TableCell>
                <TableCell align="right">Monthly</TableCell>
                <TableCell align="right">Yearly</TableCell>
                <TableCell align="right">Total</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {data.details.map((detail: any) => (
                <TableRow key={detail.propertyId}>
                  <TableCell>{detail.propertyName}</TableCell>
                  <TableCell align="right">{formatCurrency(detail.commission)}</TableCell>
                  <TableCell align="right">{formatCurrency(detail.commission * 12)}</TableCell>
                  <TableCell align="right">{formatCurrency(detail.commission * 12)}</TableCell>
                </TableRow>
              ))}
              <TableRow>
                <TableCell><strong>Total</strong></TableCell>
                <TableCell align="right"><strong>{formatCurrency(data.monthly)}</strong></TableCell>
                <TableCell align="right"><strong>{formatCurrency(data.yearly)}</strong></TableCell>
                <TableCell align="right"><strong>{formatCurrency(data.total)}</strong></TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </TableContainer>
      );
    }

    // Default case (should not reach here)
    return null;
  };

  return (
    <Box sx={{ width: '100%' }}>
      <Box sx={{ mt: 4 }}>
        <Box sx={{ mb: 4 }}>
          <Typography variant="h4" gutterBottom>
            Commission Reports
          </Typography>
          <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
            <Button 
              variant="contained" 
              onClick={downloadPDF}
              disabled={loading || !agentCommissions && !agencyCommission && !preaCommission}
            >
              Download PDF
            </Button>
            <Button 
              variant="contained" 
              onClick={downloadExcel}
              disabled={loading || !agentCommissions && !agencyCommission && !preaCommission}
            >
              Download Excel
            </Button>
            <Button 
              variant="contained" 
              onClick={printReport}
              disabled={loading || !agentCommissions && !agencyCommission && !preaCommission}
            >
              Print Report
            </Button>
          </Box>
        </Box>

        <Paper sx={{ width: '100%', mb: 2 }}>
          <Tabs value={activeTab} onChange={handleTabChange}>
            <Tab label="Agent Commissions" />
            <Tab label="Agency Commission" />
            <Tab label="PREA Commission" />
          </Tabs>

          <Box sx={{ p: 3 }}>
            {renderTable()}
          </Box>
        </Paper>
      </Box>
    </Box>
  );
};

export default CommissionsPage; 