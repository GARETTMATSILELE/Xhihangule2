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
  Grid,
  TextField
} from '@mui/material';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import * as XLSX from 'xlsx';
import accountantService, { CommissionData, AgencyCommission, PREACommission, CommissionAccountData, CommissionReportsData, PropertyCommissionReport } from '../../services/accountantService';
import { useCompany } from '../../contexts/CompanyContext';

const CommissionsPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState(0);
  const { company } = useCompany();
  const [agentCommissions, setAgentCommissions] = useState<CommissionData | null>(null);
  const [agencyCommission, setAgencyCommission] = useState<AgencyCommission | null>(null);
  const [preaCommission, setPREACommission] = useState<PREACommission | null>(null);
  const [commissionAccount, setCommissionAccount] = useState<CommissionAccountData | null>(null);
  const [commissionReports, setCommissionReports] = useState<CommissionReportsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Filter states for agent commissions
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState<number | 'all'>(new Date().getMonth());
  const [filterType, setFilterType] = useState<'monthly' | 'yearly'>('monthly');

  // Filter states for agency commissions
  const [agencySelectedYear, setAgencySelectedYear] = useState<number>(new Date().getFullYear());
  const [agencySelectedMonth, setAgencySelectedMonth] = useState<number | 'all'>(new Date().getMonth());
  const [agencySelectedWeek, setAgencySelectedWeek] = useState<number | 'all'>(1);
  const [agencySelectedDay, setAgencySelectedDay] = useState<number | 'all'>(new Date().getDate());
  const [agencyFilterType, setAgencyFilterType] = useState<'daily' | 'weekly' | 'monthly' | 'yearly'>('monthly');
  const [agencySearchTerm, setAgencySearchTerm] = useState<string>('');
  const [agentSearchTerm, setAgentSearchTerm] = useState<string>('');
  const [preaSearchTerm, setPREASearchTerm] = useState<string>('');
  const [preaSelectedYear, setPREASelectedYear] = useState<number>(new Date().getFullYear());
  const [preaSelectedMonth, setPREASelectedMonth] = useState<number>(new Date().getMonth());
  const [commissionFromYear, setCommissionFromYear] = useState<number>(new Date().getFullYear());
  const [commissionFromMonth, setCommissionFromMonth] = useState<number>(0);
  const [commissionToYear, setCommissionToYear] = useState<number>(new Date().getFullYear());
  const [commissionToMonth, setCommissionToMonth] = useState<number>(new Date().getMonth());
  const [commissionReportFilter, setCommissionReportFilter] = useState<'all' | 'sales' | 'rentals'>('all');

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

  const getWeekOptions = () => {
    const weeks = [];
    for (let week = 1; week <= 53; week++) {
      weeks.push({ value: week, label: `Week ${week}` });
    }
    return weeks;
  };

  const getDayOptions = () => {
    const days = [];
    for (let day = 1; day <= 31; day++) {
      days.push({ value: day, label: `Day ${day}` });
    }
    return days;
  };

  const getCurrentWeekOfYear = () => {
    const now = new Date();
    const start = new Date(now.getFullYear(), 0, 1);
    const days = Math.floor((now.getTime() - start.getTime()) / (24 * 60 * 60 * 1000));
    return Math.ceil((days + start.getDay() + 1) / 7);
  };

  const compareMonthYear = (yearA: number, monthA: number, yearB: number, monthB: number) => {
    if (yearA !== yearB) return yearA - yearB;
    return monthA - monthB;
  };

  const getCommissionAccountFilters = () => ({
    fromYear: commissionFromYear,
    fromMonth: commissionFromMonth + 1, // API uses 1-12
    toYear: commissionToYear,
    toMonth: commissionToMonth + 1 // API uses 1-12
  });

  const getCommissionRangeLabel = () => {
    return `${getMonthName(commissionFromMonth)} ${commissionFromYear} - ${getMonthName(commissionToMonth)} ${commissionToYear}`;
  };

  const isSalesCommissionEntry = (entry: PropertyCommissionReport['entries'][number]) => {
    return String(entry.accountKey || '').startsWith('sale-');
  };

  const getCommissionReportFilterLabel = () => {
    if (commissionReportFilter === 'sales') return 'Sales';
    if (commissionReportFilter === 'rentals') return 'Rentals';
    return 'All';
  };

  const getFilteredCommissionReportProperties = (reportsData?: CommissionReportsData | null): PropertyCommissionReport[] => {
    if (!reportsData) return [];

    return reportsData.properties
      .map((property) => {
        const filteredEntries = property.entries.filter((entry) => {
          if (commissionReportFilter === 'all') return true;
          if (commissionReportFilter === 'sales') return isSalesCommissionEntry(entry);
          // Treat all non-sale commission entries (rental + introduction) as rentals
          return !isSalesCommissionEntry(entry);
        });

        if (filteredEntries.length === 0) return null;

        let runningBalance = 0;
        let totalExpected = 0;
        let totalReceived = 0;

        const entries = filteredEntries.map((entry) => {
          totalExpected += entry.debit;
          totalReceived += entry.credit;
          runningBalance += entry.debit - entry.credit;
          return {
            ...entry,
            balance: Number(runningBalance.toFixed(2))
          };
        });

        return {
          ...property,
          totalExpectedCommission: Number(totalExpected.toFixed(2)),
          totalReceivedCommission: Number(totalReceived.toFixed(2)),
          closingBalance: Number(runningBalance.toFixed(2)),
          entries
        };
      })
      .filter((property): property is PropertyCommissionReport => Boolean(property));
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
    
    let filtered = agentCommissions.details.map(agent => {
      // Filter properties to only show those with payments for the selected period
      const propertiesWithPayments = agent.properties.filter(property => property.hasPayment);
      
      return {
        ...agent,
        properties: propertiesWithPayments, // Only show properties with payments
        filteredCommission: calculateFilteredCommission(agent),
        totalProperties: agent.properties.length, // Keep track of total properties
        propertiesWithPayments: propertiesWithPayments.length // Count of properties with payments
      };
    });

    // Apply search filter
    if (agentSearchTerm.trim()) {
      const searchLower = agentSearchTerm.toLowerCase();
      filtered = filtered.filter(agent => 
        agent.agentName.toLowerCase().includes(searchLower)
      );
    }
    
    return filtered;
  };

  const getFilteredAgencyCommissions = () => {
    if (!agencyCommission) return [];
    
    let filtered = agencyCommission.details;
    
    // Apply search filter
    if (agencySearchTerm.trim()) {
      const searchLower = agencySearchTerm.toLowerCase();
      filtered = filtered.filter(detail => 
        detail.propertyName.toLowerCase().includes(searchLower) ||
        detail.propertyAddress.toLowerCase().includes(searchLower) ||
        detail.paymentId.toLowerCase().includes(searchLower)
      );
    }
    
    return filtered;
  };

  const getFilteredPREACommissions = () => {
    if (!preaCommission) return [];
    
    let filtered = preaCommission.details;
    
    // Apply search filter
    if (preaSearchTerm.trim()) {
      const searchLower = preaSearchTerm.toLowerCase();
      filtered = filtered.filter(detail => 
        detail.propertyName.toLowerCase().includes(searchLower)
      );
    }
    
    return filtered;
  };

  useEffect(() => {
    const fetchCommissionData = async () => {
      try {
        setLoading(true);
        setError(null);

        const filters = {
          year: agencySelectedYear,
          month: agencySelectedMonth === 'all' ? undefined : agencySelectedMonth,
          week: agencySelectedWeek === 'all' ? undefined : agencySelectedWeek,
          day: agencySelectedDay === 'all' ? undefined : agencySelectedDay,
          filterType: agencyFilterType
        };
        const { agentCommissions, agencyCommission, preaCommission, commissionAccount, commissionReports } = await accountantService.getAllCommissions(
          filters,
          getCommissionAccountFilters()
        );

        setAgentCommissions(agentCommissions);
        setAgencyCommission(agencyCommission);
        setPREACommission(preaCommission);
        setCommissionAccount(commissionAccount);
        setCommissionReports(commissionReports);
      } catch (err) {
        console.error('Error fetching commission data:', err);
        setError(err instanceof Error ? err.message : 'An error occurred while fetching commission data');
      } finally {
        setLoading(false);
      }
    };

    fetchCommissionData();
  }, []);

  // Set initial week value when component mounts
  useEffect(() => {
    setAgencySelectedWeek(getCurrentWeekOfYear());
  }, []);

  // Effect to refresh agency commission data when filters change
  useEffect(() => {
    const fetchAgencyCommissionData = async () => {
      try {
        setLoading(true);
        setError(null);

        const agencyFilters = {
          year: agencySelectedYear,
          month: agencySelectedMonth === 'all' ? undefined : agencySelectedMonth,
          week: agencySelectedWeek === 'all' ? undefined : agencySelectedWeek,
          day: agencySelectedDay === 'all' ? undefined : agencySelectedDay,
          filterType: agencyFilterType
        };

        const agencyData = await accountantService.getAgencyCommission(agencyFilters);
        setAgencyCommission(agencyData);
      } catch (err) {
        console.error('Error fetching agency commission data:', err);
        setError(err instanceof Error ? err.message : 'An error occurred while fetching agency commission data');
      } finally {
        setLoading(false);
      }
    };

    // Only fetch if we have agency commission data already loaded
    if (agencyCommission) {
      fetchAgencyCommissionData();
    }
  }, [agencySelectedYear, agencySelectedMonth, agencySelectedWeek, agencySelectedDay, agencyFilterType]);

  // Effect to refresh PREA commission data when filters change
  useEffect(() => {
    const fetchPREACommissionData = async () => {
      try {
        setLoading(true);
        setError(null);

        const preaFilters = {
          year: preaSelectedYear,
          month: preaSelectedMonth,
          filterType: 'monthly' as const
        };

        const preaData = await accountantService.getPREACommission(preaFilters);
        setPREACommission(preaData);
      } catch (err) {
        console.error('Error fetching PREA commission data:', err);
        setError(err instanceof Error ? err.message : 'An error occurred while fetching PREA commission data');
      } finally {
        setLoading(false);
      }
    };

    if (preaCommission) {
      fetchPREACommissionData();
    }
  }, [preaSelectedYear, preaSelectedMonth]);

  // Effect to refresh Commission Account data when date range filters change
  useEffect(() => {
    const fetchCommissionAccountData = async () => {
      try {
        setLoading(true);
        setError(null);
        const accountData = await accountantService.getCommissionAccount(getCommissionAccountFilters());
        setCommissionAccount(accountData);
      } catch (err) {
        console.error('Error fetching commission account data:', err);
        setError(err instanceof Error ? err.message : 'An error occurred while fetching commission account data');
      } finally {
        setLoading(false);
      }
    };

    if (commissionAccount) {
      fetchCommissionAccountData();
    }
  }, [commissionFromYear, commissionFromMonth, commissionToYear, commissionToMonth]);

  const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
    setActiveTab(newValue);
  };

  const printCommissionPropertyReport = (property: PropertyCommissionReport) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Commission Report - ${property.propertyTitle}</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 20px; }
            table { width: 100%; border-collapse: collapse; margin-top: 16px; }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
            th { background-color: #f2f2f2; font-weight: bold; }
            .summary { margin: 16px 0; padding: 12px; background: #f9f9f9; border-radius: 4px; }
            @page { size: A4 portrait; margin: 12mm; }
            @media print {
              body { margin: 0; }
            }
          </style>
        </head>
        <body>
          <h2>Commission Report - ${property.propertyTitle}</h2>
          <p>${property.propertyAddress || ''}</p>
          <p>Generated on: ${new Date().toLocaleDateString()}</p>
          <div class="summary">
            <p>Total Expected Commission (Dr): ${formatCurrency(property.totalExpectedCommission)}</p>
            <p>Total Received Commission (Cr): ${formatCurrency(property.totalReceivedCommission)}</p>
            <p>Closing Balance: ${formatCurrency(property.closingBalance)}</p>
          </div>
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Description</th>
                <th>Dr</th>
                <th>Cr</th>
                <th>Balance</th>
              </tr>
            </thead>
            <tbody>
              ${property.entries.map((entry) => `
                <tr>
                  <td>${formatDate(entry.date)}</td>
                  <td>${entry.description}</td>
                  <td>${entry.debit > 0 ? formatCurrency(entry.debit) : '-'}</td>
                  <td>${entry.credit > 0 ? formatCurrency(entry.credit) : '-'}</td>
                  <td>${formatCurrency(entry.balance)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </body>
      </html>
    `;

    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.onload = () => {
      const closeWindow = () => {
        try {
          printWindow.close();
        } catch (_) {
          // Ignore close errors in restricted browser contexts
        }
      };
      printWindow.addEventListener('afterprint', closeWindow, { once: true });
      printWindow.print();
      setTimeout(closeWindow, 1500);
    };
  };

  const printReport = () => {
    // Create a new window for printing
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const title = ['Agent Commissions', 'Agency Commission', 'PREA Commission', 'Commission Account', 'Commission Reports'][activeTab];
    const data = [agentCommissions, agencyCommission, preaCommission, commissionAccount, commissionReports][activeTab];
    
    if (!data) {
      printWindow.alert('No data available to print');
      printWindow.close();
      return;
    }

    let printContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>${title}</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 20px; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
            th { background-color: #f2f2f2; font-weight: bold; }
            .header { text-align: center; margin-bottom: 20px; }
            .summary { margin: 20px 0; padding: 15px; background-color: #f9f9f9; border-radius: 5px; }
            @page { size: A4 portrait; margin: 12mm; }
            @media print {
              body { margin: 0; }
            }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>${title}</h1>
            <p>Generated on: ${new Date().toLocaleDateString()}</p>
          </div>
    `;

    if (data && activeTab === 0 && 'details' in data) {
      // Agent Commissions
      const filteredAgents = getFilteredAgentCommissions();
      
      // Add filter info
      let filterInfo = `${filterType} for ${selectedYear}`;
      if (filterType === 'monthly' && selectedMonth !== 'all') {
        filterInfo += ` - ${getMonthName(selectedMonth as number)}`;
      }
      
      printContent += `
        <div class="summary">
          <h3>Filter: ${filterInfo}</h3>
          <p>Total ${filterType} commission: ${formatCurrency(
            filteredAgents.reduce((sum: number, agent: any) => sum + agent.filteredCommission, 0)
          )}</p>
          <p>Agents found: ${filteredAgents.length} / ${agentCommissions?.details.length || 0}</p>
        </div>
        <table>
          <thead>
            <tr>
              <th>Agent Name</th>
              <th>${filterType === 'monthly' ? 'Monthly Commission' : 'Yearly Commission'}</th>
              <th>Properties with Payments</th>
              <th>Total Properties</th>
              <th>Total Commission</th>
            </tr>
          </thead>
          <tbody>
      `;
      
      filteredAgents.forEach((agent: any) => {
        const totalCommission = agent.monthlyCommissions?.reduce(
          (sum: number, monthData: any) => sum + (monthData.commission || 0),
          0
        ) || 0;
        printContent += `
          <tr>
            <td>${agent.agentName}</td>
            <td>${formatCurrency(agent.filteredCommission)}</td>
            <td>${agent.propertiesWithPayments}</td>
            <td>${agent.totalProperties}</td>
            <td>${formatCurrency(totalCommission)}</td>
          </tr>
        `;
      });
      
      printContent += `
          </tbody>
        </table>
      `;
    } else if (data && activeTab === 1 && 'details' in data) {
      // Agency Commission
      const filteredDetails = getFilteredAgencyCommissions();
      
      // Add filter info
      let filterInfo = `${agencyFilterType} for ${agencySelectedYear}`;
      if (agencyFilterType === 'monthly' && agencySelectedMonth !== 'all') {
        filterInfo += ` - ${getMonthName(agencySelectedMonth as number)}`;
      } else if (agencyFilterType === 'weekly' && agencySelectedWeek !== 'all') {
        filterInfo += ` - Week ${agencySelectedWeek}`;
      } else if (agencyFilterType === 'daily' && agencySelectedMonth !== 'all' && agencySelectedDay !== 'all') {
        filterInfo += ` - ${getMonthName(agencySelectedMonth as number)} ${agencySelectedDay}`;
      }
      
      printContent += `
        <div class="summary">
          <h3>Filter: ${filterInfo}</h3>
          <p>Total ${agencyFilterType} commission: ${formatCurrency(data.total)}</p>
          <p>Number of payments: ${filteredDetails.length} / ${data.details.length}</p>
        </div>
        <table>
          <thead>
            <tr>
              <th>Payment Date</th>
              <th>Property Name</th>
              <th>Property Address</th>
              <th>Rental Amount</th>
              <th>Agency Share</th>
            </tr>
          </thead>
          <tbody>
      `;
      
      filteredDetails.forEach((detail: any) => {
        printContent += `
          <tr>
            <td>${formatDate(detail.paymentDate)}</td>
            <td>${detail.propertyName}</td>
            <td>${detail.propertyAddress}</td>
            <td>${formatCurrency(detail.rentalAmount)}</td>
            <td>${formatCurrency(detail.agencyShare)}</td>
          </tr>
        `;
      });
      
      printContent += `
          </tbody>
        </table>
      `;
    } else if (data && activeTab === 2 && 'details' in data) {
      // PREA Commission
      const filteredDetails = getFilteredPREACommissions();
      
      printContent += `
        <div class="summary">
          <h3>PREA Commission Report</h3>
          <p>Period: ${getMonthName(preaSelectedMonth)} ${preaSelectedYear}</p>
          <p>Properties found: ${filteredDetails.length} / ${data.details.length}</p>
          <p>Total commission: ${formatCurrency(data.total)}</p>
        </div>
        <table>
          <thead>
            <tr>
              <th>Property Name</th>
              <th>Amount</th>
            </tr>
          </thead>
          <tbody>
      `;
      
      filteredDetails.forEach((detail: any) => {
        printContent += `
          <tr>
            <td>${detail.propertyName}</td>
            <td>${formatCurrency(detail.commission)}</td>
          </tr>
        `;
      });
      
      printContent += `
          </tbody>
        </table>
      `;
    } else if (data && activeTab === 3 && 'entries' in data) {
      // Commission Account
      const commissionData = data as CommissionAccountData;
      printContent += `
        <div class="summary">
          <h3>Commission Account Ledger</h3>
          <p>Period: ${getCommissionRangeLabel()}</p>
          <p>Opening balance: ${formatCurrency(commissionData.openingBalance || 0)}</p>
          <p>Total commission received: ${formatCurrency(commissionData.totalCommissionReceived)}</p>
          <p>Total payouts: ${formatCurrency(commissionData.totalPayouts)}</p>
          <p>Balance: ${formatCurrency(commissionData.balance)}</p>
        </div>
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Description</th>
              <th>Debit</th>
              <th>Credit</th>
              <th>Balance</th>
            </tr>
          </thead>
          <tbody>
      `;

      commissionData.entries.forEach((entry: any) => {
        printContent += `
          <tr>
            <td>${formatDate(entry.date)}</td>
            <td>${entry.description}</td>
            <td>${entry.debit > 0 ? formatCurrency(entry.debit) : '-'}</td>
            <td>${entry.credit > 0 ? formatCurrency(entry.credit) : '-'}</td>
            <td>${formatCurrency(entry.balance)}</td>
          </tr>
        `;
      });

      printContent += `
          </tbody>
        </table>
      `;
    } else if (data && activeTab === 4 && 'properties' in data) {
      const reportsData = data as CommissionReportsData;
      const filteredProperties = getFilteredCommissionReportProperties(reportsData);
      printContent += `
        <div class="summary">
          <h3>Commission Reports by Property</h3>
          <p>Type: ${getCommissionReportFilterLabel()}</p>
          <p>Properties with payments: ${filteredProperties.length}</p>
        </div>
        <table>
          <thead>
            <tr>
              <th>Property</th>
              <th>Address</th>
              <th>Expected Commission (Dr)</th>
              <th>Received Commission (Cr)</th>
              <th>Balance</th>
            </tr>
          </thead>
          <tbody>
      `;
      filteredProperties.forEach((property) => {
        printContent += `
          <tr>
            <td>${property.propertyTitle}</td>
            <td>${property.propertyAddress || '-'}</td>
            <td>${formatCurrency(property.totalExpectedCommission)}</td>
            <td>${formatCurrency(property.totalReceivedCommission)}</td>
            <td>${formatCurrency(property.closingBalance)}</td>
          </tr>
        `;
      });
      printContent += `
          </tbody>
        </table>
      `;
    }

    printContent += `
        </body>
      </html>
    `;

    printWindow.document.write(printContent);
    printWindow.document.close();
    
    // Wait for content to load then print
    printWindow.onload = () => {
      const closeWindow = () => {
        try {
          printWindow.close();
        } catch (_) {
          // Ignore close errors in restricted browser contexts
        }
      };
      printWindow.addEventListener('afterprint', closeWindow, { once: true });
      printWindow.print();
      setTimeout(closeWindow, 1500);
    };
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

    const data = [agentCommissions, agencyCommission, preaCommission, commissionAccount, commissionReports][activeTab];
    if (!data) {
      return (
        <Box p={3}>
          <Alert severity="info">No data available for this commission type.</Alert>
        </Box>
      );
    }

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
              <Grid item xs={12} sm={2}>
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
                <TextField
                  fullWidth
                  size="small"
                  label="Search Agents"
                  placeholder="Search by agent name"
                  value={agentSearchTerm}
                  onChange={(e) => setAgentSearchTerm(e.target.value)}
                  variant="outlined"
                />
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
              <Typography variant="body2" color="text.secondary">
                Properties with payments: {getFilteredAgentCommissions().reduce((sum, agent) => sum + agent.propertiesWithPayments, 0)} / {getFilteredAgentCommissions().reduce((sum, agent) => sum + agent.totalProperties, 0)}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Agents found: {getFilteredAgentCommissions().length} / {agentCommissions?.details.length || 0}
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
                  <TableCell align="right">Total Properties</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {getFilteredAgentCommissions().map((agent) => (
                  <React.Fragment key={agent.agentId}>
                    <TableRow>
                      <TableCell>
                        <details>
                          <summary style={{ cursor: 'pointer' }}>{agent.agentName}</summary>
                          <div style={{ padding: '8px 0' }}>
                            <Table size="small">
                              <TableHead>
                                <TableRow>
                                  <TableCell>Property Name</TableCell>
                                  <TableCell>Payment Date</TableCell>
                                  <TableCell>Reference</TableCell>
                                  <TableCell align="right">Amount</TableCell>
                                </TableRow>
                              </TableHead>
                              <TableBody>
                                {(agent as any).commissionEntries
                                  ?.filter((e: any) => {
                                    const matchesYear = e.year === selectedYear;
                                    const matchesMonth = filterType === 'yearly' ? true : (selectedMonth === 'all' ? true : e.month === selectedMonth);
                                    return matchesYear && matchesMonth;
                                  })
                                  ?.map((e: any) => (
                                    <TableRow key={e.paymentId + '-' + e.year + '-' + e.month}>
                                      <TableCell>{e.propertyName}</TableCell>
                                      <TableCell>{new Date(e.paymentDate).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}</TableCell>
                                      <TableCell>{e.referenceNumber || '-'}</TableCell>
                                      <TableCell align="right">{formatCurrency(e.amount)}</TableCell>
                                    </TableRow>
                                  ))}
                              </TableBody>
                            </Table>
                          </div>
                        </details>
                      </TableCell>
                      <TableCell align="right">
                        {formatCurrency(agent.filteredCommission)}
                      </TableCell>
                      <TableCell align="right">{agent.totalProperties}</TableCell>
                    </TableRow>
                  </React.Fragment>
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
                      {getFilteredAgentCommissions().reduce((sum, agent) => sum + agent.totalProperties, 0)}
                    </strong>
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
      const agencyData = data as AgencyCommission;
      return (
        <Box>
          {/* Filter Controls for Agency Commission */}
          <Box sx={{ mb: 3, p: 2, backgroundColor: 'background.paper', borderRadius: 1 }}>
            <Typography variant="h6" gutterBottom>
              Filter Agency Commission
            </Typography>
            <Grid container spacing={2} alignItems="center">
              <Grid item xs={12} sm={2}>
                <FormControl fullWidth size="small">
                  <InputLabel>Filter Type</InputLabel>
                  <Select
                    value={agencyFilterType}
                    label="Filter Type"
                    onChange={(e) => setAgencyFilterType(e.target.value as 'daily' | 'weekly' | 'monthly' | 'yearly')}
                  >
                    <MenuItem value="daily">Daily</MenuItem>
                    <MenuItem value="weekly">Weekly</MenuItem>
                    <MenuItem value="monthly">Monthly</MenuItem>
                    <MenuItem value="yearly">Yearly</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} sm={3}>
                <TextField
                  fullWidth
                  size="small"
                  label="Search Properties"
                  placeholder="Search by property name, address, or payment ID"
                  value={agencySearchTerm}
                  onChange={(e) => setAgencySearchTerm(e.target.value)}
                  variant="outlined"
                />
              </Grid>
              <Grid item xs={12} sm={2}>
                <FormControl fullWidth size="small">
                  <InputLabel>Year</InputLabel>
                  <Select
                    value={agencySelectedYear}
                    label="Year"
                    onChange={(e) => setAgencySelectedYear(e.target.value as number)}
                  >
                    {getYearOptions().map((year) => (
                      <MenuItem key={year} value={year}>
                        {year}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
              {agencyFilterType === 'monthly' && (
                <Grid item xs={12} sm={2}>
                  <FormControl fullWidth size="small">
                    <InputLabel>Month</InputLabel>
                    <Select
                      value={agencySelectedMonth}
                      label="Month"
                      onChange={(e) => setAgencySelectedMonth(e.target.value as number | 'all')}
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
              {agencyFilterType === 'weekly' && (
                <Grid item xs={12} sm={2}>
                  <FormControl fullWidth size="small">
                    <InputLabel>Week</InputLabel>
                    <Select
                      value={agencySelectedWeek}
                      label="Week"
                      onChange={(e) => setAgencySelectedWeek(e.target.value as number | 'all')}
                    >
                      <MenuItem value="all">All Weeks</MenuItem>
                      {getWeekOptions().map((week) => (
                        <MenuItem key={week.value} value={week.value}>
                          {week.label}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Grid>
              )}
              {agencyFilterType === 'daily' && (
                <>
                  <Grid item xs={12} sm={2}>
                    <FormControl fullWidth size="small">
                      <InputLabel>Month</InputLabel>
                      <Select
                        value={agencySelectedMonth}
                        label="Month"
                        onChange={(e) => setAgencySelectedMonth(e.target.value as number | 'all')}
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
                  <Grid item xs={12} sm={2}>
                    <FormControl fullWidth size="small">
                      <InputLabel>Day</InputLabel>
                      <Select
                        value={agencySelectedDay}
                        label="Day"
                        onChange={(e) => setAgencySelectedDay(e.target.value as number | 'all')}
                      >
                        <MenuItem value="all">All Days</MenuItem>
                        {getDayOptions().map((day) => (
                          <MenuItem key={day.value} value={day.value}>
                            {day.label}
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  </Grid>
                </>
              )}
            </Grid>
            
            {/* Summary */}
            <Box sx={{ mt: 2, p: 2, backgroundColor: 'grey.50', borderRadius: 1 }}>
              <Typography variant="subtitle2" color="text.secondary">
                Showing {agencyFilterType} commissions for {agencySelectedYear}
                {agencyFilterType === 'monthly' && agencySelectedMonth !== 'all' && ` - ${getMonthName(agencySelectedMonth as number)}`}
                {agencyFilterType === 'weekly' && agencySelectedWeek !== 'all' && ` - Week ${agencySelectedWeek}`}
                {agencyFilterType === 'daily' && agencySelectedMonth !== 'all' && agencySelectedDay !== 'all' && 
                  ` - ${getMonthName(agencySelectedMonth as number)} ${agencySelectedDay}`}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Total {agencyFilterType} commission: {formatCurrency(agencyData.total)}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Number of payments: {getFilteredAgencyCommissions().length} / {agencyData.details.length}
              </Typography>
            </Box>
          </Box>

          {/* Agency Commission Table */}
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
                {getFilteredAgencyCommissions().map((detail: any) => (
                  <TableRow key={detail.paymentId}>
                    <TableCell>{formatDate(detail.paymentDate)}</TableCell>
                    <TableCell>{detail.propertyName || 'Manual Entry'}</TableCell>
                    <TableCell>{detail.propertyAddress || 'Manual Entry'}</TableCell>
                    <TableCell align="right">{formatCurrency(detail.rentalAmount)}</TableCell>
                    <TableCell align="right">{formatCurrency(detail.agencyShare)}</TableCell>
                  </TableRow>
                ))}
                <TableRow>
                  <TableCell><strong>Total</strong></TableCell>
                  <TableCell></TableCell>
                  <TableCell></TableCell>
                  <TableCell align="right"><strong>{formatCurrency(getFilteredAgencyCommissions().reduce((sum: number, d: any) => sum + (d.rentalAmount || 0), 0))}</strong></TableCell>
                  <TableCell align="right"><strong>{formatCurrency(getFilteredAgencyCommissions().reduce((sum: number, d: any) => sum + (d.agencyShare || 0), 0))}</strong></TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </TableContainer>
        </Box>
      );
    }

    // Handle PREA Commission tab
    if (activeTab === 2) {
      const preaData = data as PREACommission;
      return (
        <Box>
          {/* Filter Controls for PREA Commission */}
          <Box sx={{ mb: 3, p: 2, backgroundColor: 'background.paper', borderRadius: 1 }}>
            <Typography variant="h6" gutterBottom>
              Filter PREA Commission
            </Typography>
            <Grid container spacing={2} alignItems="center">
              <Grid item xs={12} sm={3}>
                <TextField
                  fullWidth
                  size="small"
                  label="Search Properties"
                  placeholder="Search by property name"
                  value={preaSearchTerm}
                  onChange={(e) => setPREASearchTerm(e.target.value)}
                  variant="outlined"
                />
              </Grid>
              <Grid item xs={12} sm={2}>
                <FormControl fullWidth size="small">
                  <InputLabel>Year</InputLabel>
                  <Select
                    value={preaSelectedYear}
                    label="Year"
                    onChange={(e) => setPREASelectedYear(e.target.value as number)}
                  >
                    {getYearOptions().map((year) => (
                      <MenuItem key={year} value={year}>
                        {year}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} sm={2}>
                <FormControl fullWidth size="small">
                  <InputLabel>Month</InputLabel>
                  <Select
                    value={preaSelectedMonth}
                    label="Month"
                    onChange={(e) => setPREASelectedMonth(e.target.value as number)}
                  >
                    {getMonthOptions().map((month) => (
                      <MenuItem key={month.value} value={month.value}>
                        {month.label}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
            </Grid>
            
            {/* Summary */}
            <Box sx={{ mt: 2, p: 2, backgroundColor: 'grey.50', borderRadius: 1 }}>
              <Typography variant="subtitle2" color="text.secondary">
                Showing PREA commission for {getMonthName(preaSelectedMonth)} {preaSelectedYear}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Properties found: {getFilteredPREACommissions().length} / {preaData.details.length}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Total commission: {formatCurrency(preaData.total)}
              </Typography>
            </Box>
          </Box>

          {/* PREA Commission Table */}
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Property Name</TableCell>
                  <TableCell align="right">Amount</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {getFilteredPREACommissions().map((detail: any) => (
                  <TableRow key={detail.propertyId}>
                    <TableCell>{detail.propertyName}</TableCell>
                    <TableCell align="right">{formatCurrency(detail.commission)}</TableCell>
                  </TableRow>
                ))}
                <TableRow>
                  <TableCell><strong>Total</strong></TableCell>
                  <TableCell align="right"><strong>{formatCurrency(preaData.total)}</strong></TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </TableContainer>
        </Box>
      );
    }

    if (activeTab === 3 && 'entries' in data) {
      const accountData = data as CommissionAccountData;
      return (
        <Box>
          <Box sx={{ mb: 3, p: 2, backgroundColor: 'background.paper', borderRadius: 1 }}>
            <Typography variant="h6" gutterBottom>
              Commission Account Summary
            </Typography>
            <Grid container spacing={2} alignItems="center" sx={{ mb: 2 }}>
              <Grid item xs={12} sm={3}>
                <FormControl fullWidth size="small">
                  <InputLabel>From Year</InputLabel>
                  <Select
                    value={commissionFromYear}
                    label="From Year"
                    onChange={(e) => {
                      const nextFromYear = e.target.value as number;
                      if (compareMonthYear(nextFromYear, commissionFromMonth, commissionToYear, commissionToMonth) > 0) {
                        setCommissionToYear(nextFromYear);
                        setCommissionToMonth(commissionFromMonth);
                      }
                      setCommissionFromYear(nextFromYear);
                    }}
                  >
                    {getYearOptions().map((year) => (
                      <MenuItem key={`commission-from-year-${year}`} value={year}>
                        {year}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} sm={3}>
                <FormControl fullWidth size="small">
                  <InputLabel>From Month</InputLabel>
                  <Select
                    value={commissionFromMonth}
                    label="From Month"
                    onChange={(e) => {
                      const nextFromMonth = e.target.value as number;
                      if (compareMonthYear(commissionFromYear, nextFromMonth, commissionToYear, commissionToMonth) > 0) {
                        setCommissionToYear(commissionFromYear);
                        setCommissionToMonth(nextFromMonth);
                      }
                      setCommissionFromMonth(nextFromMonth);
                    }}
                  >
                    {getMonthOptions().map((month) => (
                      <MenuItem key={`commission-from-month-${month.value}`} value={month.value}>
                        {month.label}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} sm={3}>
                <FormControl fullWidth size="small">
                  <InputLabel>To Year</InputLabel>
                  <Select
                    value={commissionToYear}
                    label="To Year"
                    onChange={(e) => {
                      const nextToYear = e.target.value as number;
                      if (compareMonthYear(commissionFromYear, commissionFromMonth, nextToYear, commissionToMonth) > 0) {
                        setCommissionFromYear(nextToYear);
                        setCommissionFromMonth(commissionToMonth);
                      }
                      setCommissionToYear(nextToYear);
                    }}
                  >
                    {getYearOptions().map((year) => (
                      <MenuItem key={`commission-to-year-${year}`} value={year}>
                        {year}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} sm={3}>
                <FormControl fullWidth size="small">
                  <InputLabel>To Month</InputLabel>
                  <Select
                    value={commissionToMonth}
                    label="To Month"
                    onChange={(e) => {
                      const nextToMonth = e.target.value as number;
                      if (compareMonthYear(commissionFromYear, commissionFromMonth, commissionToYear, nextToMonth) > 0) {
                        setCommissionFromYear(commissionToYear);
                        setCommissionFromMonth(nextToMonth);
                      }
                      setCommissionToMonth(nextToMonth);
                    }}
                  >
                    {getMonthOptions().map((month) => (
                      <MenuItem key={`commission-to-month-${month.value}`} value={month.value}>
                        {month.label}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
            </Grid>
            <Box sx={{ mt: 1, p: 2, backgroundColor: 'grey.50', borderRadius: 1 }}>
              <Typography variant="subtitle2" color="text.secondary">
                Period: {getCommissionRangeLabel()}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Opening balance: {formatCurrency(accountData.openingBalance || 0)}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Total commission received: {formatCurrency(accountData.totalCommissionReceived)}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Total commission paid out to agents: {formatCurrency(accountData.totalPayouts)}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Current commission account balance: {formatCurrency(accountData.balance)}
              </Typography>
            </Box>
          </Box>

          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Date</TableCell>
                  <TableCell>Description</TableCell>
                  <TableCell align="right">Debit</TableCell>
                  <TableCell align="right">Credit</TableCell>
                  <TableCell align="right">Balance</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {accountData.entries.map((entry: any) => (
                  <TableRow key={entry.entryId}>
                    <TableCell>{formatDate(entry.date)}</TableCell>
                    <TableCell>{entry.description}</TableCell>
                    <TableCell align="right">{entry.debit > 0 ? formatCurrency(entry.debit) : '-'}</TableCell>
                    <TableCell align="right">{entry.credit > 0 ? formatCurrency(entry.credit) : '-'}</TableCell>
                    <TableCell align="right">{formatCurrency(entry.balance)}</TableCell>
                  </TableRow>
                ))}
                <TableRow>
                  <TableCell><strong>Total</strong></TableCell>
                  <TableCell></TableCell>
                  <TableCell align="right"><strong>{formatCurrency(accountData.totalPayouts)}</strong></TableCell>
                  <TableCell align="right"><strong>{formatCurrency(accountData.totalCommissionReceived)}</strong></TableCell>
                  <TableCell align="right"><strong>{formatCurrency(accountData.balance)}</strong></TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </TableContainer>
        </Box>
      );
    }

    if (activeTab === 4 && 'properties' in data) {
      const reportsData = data as CommissionReportsData;
      const filteredProperties = getFilteredCommissionReportProperties(reportsData);
      return (
        <Box>
          <Box sx={{ mb: 3, p: 2, backgroundColor: 'background.paper', borderRadius: 1 }}>
            <Typography variant="h6" gutterBottom>
              Commission Reports
            </Typography>
            <Grid container spacing={2} alignItems="center">
              <Grid item xs={12} sm={3}>
                <FormControl fullWidth size="small">
                  <InputLabel>Type</InputLabel>
                  <Select
                    value={commissionReportFilter}
                    label="Type"
                    onChange={(e) => setCommissionReportFilter(e.target.value as 'all' | 'sales' | 'rentals')}
                  >
                    <MenuItem value="all">All</MenuItem>
                    <MenuItem value="sales">Sales</MenuItem>
                    <MenuItem value="rentals">Rentals</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
            </Grid>
            <Box sx={{ mt: 2, p: 2, backgroundColor: 'grey.50', borderRadius: 1 }}>
              <Typography variant="body2" color="text.secondary">
                Type: {getCommissionReportFilterLabel()}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Properties with payments: {filteredProperties.length}
              </Typography>
            </Box>
          </Box>

          {filteredProperties.map((property) => (
            <Box key={property.propertyId} sx={{ mb: 3, border: '1px solid', borderColor: 'divider', borderRadius: 1, p: 2 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                <Typography variant="subtitle1">
                  {property.propertyTitle}
                </Typography>
                <Button variant="outlined" size="small" onClick={() => printCommissionPropertyReport(property)}>
                  Print
                </Button>
              </Box>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                {property.propertyAddress || 'Address not available'}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Expected (Dr): {formatCurrency(property.totalExpectedCommission)} | Received (Cr): {formatCurrency(property.totalReceivedCommission)} | Balance: {formatCurrency(property.closingBalance)}
              </Typography>

              <details style={{ marginTop: 10 }}>
                <summary style={{ cursor: 'pointer' }}>View transactions</summary>
                <TableContainer sx={{ mt: 1 }}>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Date</TableCell>
                        <TableCell>Description</TableCell>
                        <TableCell align="right">Dr</TableCell>
                        <TableCell align="right">Cr</TableCell>
                        <TableCell align="right">Balance</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {property.entries.map((entry) => (
                        <TableRow key={entry.entryId}>
                          <TableCell>{formatDate(entry.date)}</TableCell>
                          <TableCell>{entry.description}</TableCell>
                          <TableCell align="right">{entry.debit > 0 ? formatCurrency(entry.debit) : '-'}</TableCell>
                          <TableCell align="right">{entry.credit > 0 ? formatCurrency(entry.credit) : '-'}</TableCell>
                          <TableCell align="right">{formatCurrency(entry.balance)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </details>
            </Box>
          ))}
        </Box>
      );
    }

    // Default case (should not reach here)
    return null;
  };

  const downloadPDF = () => {
    const doc = new jsPDF();
    const title = ['Agent Commissions', 'Agency Commission', 'PREA Commission', 'Commission Account', 'Commission Reports'][activeTab];
    const data = [agentCommissions, agencyCommission, preaCommission, commissionAccount, commissionReports][activeTab];
    
    if (!data) {
      alert('No data available to download');
      return;
    }

    // Add title and generation date
    doc.setFontSize(16);
    doc.text(title, 14, 20);
    doc.setFontSize(10);
    doc.text(`Generated on: ${new Date().toLocaleDateString()}`, 14, 30);

      if (data) {
      const tableData: any[] = [];
      const headers: string[] = [];

      if (data && activeTab === 0 && 'details' in data) {
        // Agent Commissions with filtering
        const filteredAgents = getFilteredAgentCommissions();
        headers.push('Agent Name', filterType === 'monthly' ? 'Monthly Commission' : 'Yearly Commission', 'Total Properties');
        
        // Add filter info
        let filterInfo = `${filterType} for ${selectedYear}`;
        if (filterType === 'monthly' && selectedMonth !== 'all') {
          filterInfo += ` - ${getMonthName(selectedMonth as number)}`;
        }
        doc.text(`Filter: ${filterInfo}`, 14, 40);
        doc.text(`Agents found: ${filteredAgents.length} / ${agentCommissions?.details.length || 0}`, 14, 45);
        
        filteredAgents.forEach((agent: any) => {
          tableData.push([
            agent.agentName,
            formatCurrency(agent.filteredCommission),
            agent.totalProperties
          ]);
        });
        
        // Add search info if there's a search term
        if (agentSearchTerm.trim()) {
          doc.text(`Search: "${agentSearchTerm}"`, 14, 50);
        }
      } else if (data && activeTab === 1 && 'details' in data) {
        headers.push('Payment Date', 'Property Name', 'Property Address', 'Rental Amount', 'Agency Share');
        const filteredDetails = getFilteredAgencyCommissions();
        
        // Add filter info
        let filterInfo = `${agencyFilterType} for ${agencySelectedYear}`;
        if (agencyFilterType === 'monthly' && agencySelectedMonth !== 'all') {
          filterInfo += ` - ${getMonthName(agencySelectedMonth as number)}`;
        } else if (agencyFilterType === 'weekly' && agencySelectedWeek !== 'all') {
          filterInfo += ` - Week ${agencySelectedWeek}`;
        } else if (agencyFilterType === 'daily' && agencySelectedMonth !== 'all' && agencySelectedDay !== 'all') {
          filterInfo += ` - ${getMonthName(agencySelectedMonth as number)} ${agencySelectedDay}`;
        }
        
        doc.text(`Filter: ${filterInfo}`, 14, 40);
        doc.text(`Payments found: ${filteredDetails.length} / ${data.details.length}`, 14, 45);
        
        filteredDetails.forEach((detail: any) => {
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
        
        // Add search info if there's a search term
        if (agencySearchTerm.trim()) {
          doc.text(`Search: "${agencySearchTerm}"`, 14, 50);
        }
      } else if (data && activeTab === 2 && 'details' in data) {
        headers.push('Property Name', 'Amount');
        const filteredDetails = getFilteredPREACommissions();
        
        doc.text(`Period: ${getMonthName(preaSelectedMonth)} ${preaSelectedYear}`, 14, 40);
        doc.text(`Properties found: ${filteredDetails.length} / ${data.details.length}`, 14, 45);
        
        filteredDetails.forEach((detail: any) => {
          tableData.push([
            detail.propertyName,
            formatCurrency(detail.commission)
          ]);
        });
        
        // Add search info if there's a search term
        if (preaSearchTerm.trim()) {
          doc.text(`Search: "${preaSearchTerm}"`, 14, 50);
        }
      } else if (data && activeTab === 3 && 'entries' in data) {
        headers.push('Date', 'Description', 'Debit', 'Credit', 'Balance');
        const commissionData = data as CommissionAccountData;

        doc.text(`Period: ${getCommissionRangeLabel()}`, 14, 40);
        doc.text(`Opening balance: ${formatCurrency(commissionData.openingBalance || 0)}`, 14, 45);
        doc.text(`Total commission received: ${formatCurrency(commissionData.totalCommissionReceived)}`, 14, 50);
        doc.text(`Total payouts: ${formatCurrency(commissionData.totalPayouts)}`, 14, 55);
        doc.text(`Balance: ${formatCurrency(commissionData.balance)}`, 14, 60);

        commissionData.entries.forEach((entry: any) => {
          tableData.push([
            new Date(entry.date).toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'short',
              day: 'numeric'
            }),
            entry.description,
            entry.debit > 0 ? formatCurrency(entry.debit) : '-',
            entry.credit > 0 ? formatCurrency(entry.credit) : '-',
            formatCurrency(entry.balance)
          ]);
        });
      } else if (data && activeTab === 4 && 'properties' in data) {
        headers.push('Property', 'Address', 'Expected (Dr)', 'Received (Cr)', 'Balance');
        const reportsData = data as CommissionReportsData;
        const filteredProperties = getFilteredCommissionReportProperties(reportsData);
        doc.text(`Type: ${getCommissionReportFilterLabel()}`, 14, 40);
        doc.text(`Properties with payments: ${filteredProperties.length}`, 14, 45);
        filteredProperties.forEach((property) => {
          tableData.push([
            property.propertyTitle,
            property.propertyAddress || '-',
            formatCurrency(property.totalExpectedCommission),
            formatCurrency(property.totalReceivedCommission),
            formatCurrency(property.closingBalance)
          ]);
        });
      }

      // Start table below the header information
      const startY = activeTab === 3 ? 70 : 55;
      
      (doc as any).autoTable({
        head: [headers],
        body: tableData,
        startY: startY,
        styles: {
          fontSize: 8,
          cellPadding: 2
        },
        headStyles: {
          fillColor: [66, 139, 202],
          textColor: 255
        }
      });
    }

    doc.save(`${title.toLowerCase().replace(' ', '_')}.pdf`);
  };

  const downloadExcel = () => {
    const title = ['Agent Commissions', 'Agency Commission', 'PREA Commission', 'Commission Account', 'Commission Reports'][activeTab];
    const data = [agentCommissions, agencyCommission, preaCommission, commissionAccount, commissionReports][activeTab];
    
    if (!data) {
      alert('No data available to download');
      return;
    }

    let worksheetData: any[] = [];

    // Add metadata rows at the top
    const metadata: Record<string, string>[] = [
      { 'Report Type': title },
      { 'Generated On': new Date().toLocaleDateString() },
      { '': '' } // Empty row for spacing
    ];

    if (activeTab === 0 && 'details' in data) {
        // Agent Commissions with filtering
        const filteredAgents = getFilteredAgentCommissions();
        
        // Add filter metadata
        let filterInfo = `${filterType} for ${selectedYear}`;
        if (filterType === 'monthly' && selectedMonth !== 'all') {
          filterInfo += ` - ${getMonthName(selectedMonth as number)}`;
        }
        
        metadata.push(
          { 'Filter': filterInfo },
          { 'Agents Found': `${filteredAgents.length} / ${agentCommissions?.details.length || 0}` }
        );
        
        if (agentSearchTerm.trim()) {
          metadata.push({ 'Search Term': `"${agentSearchTerm}"` });
        }
        
        metadata.push({ '': '' }); // Empty row before data
        
        worksheetData = [
          ...metadata,
          ...filteredAgents.map((agent: any) => ({
            'Agent Name': agent.agentName,
            [filterType === 'monthly' ? 'Monthly Commission' : 'Yearly Commission']: agent.filteredCommission,
            'Total Properties': agent.totalProperties
          }))
        ];
      } else if (activeTab === 1 && 'details' in data) {
        // Agency Commission
        const filteredDetails = getFilteredAgencyCommissions();
        
        // Add filter metadata
        let filterInfo = `${agencyFilterType} for ${agencySelectedYear}`;
        if (agencyFilterType === 'monthly' && agencySelectedMonth !== 'all') {
          filterInfo += ` - ${getMonthName(agencySelectedMonth as number)}`;
        } else if (agencyFilterType === 'weekly' && agencySelectedWeek !== 'all') {
          filterInfo += ` - Week ${agencySelectedWeek}`;
        } else if (agencyFilterType === 'daily' && agencySelectedMonth !== 'all' && agencySelectedDay !== 'all') {
          filterInfo += ` - ${getMonthName(agencySelectedMonth as number)} ${agencySelectedDay}`;
        }
        
        metadata.push(
          { 'Filter': filterInfo },
          { 'Payments Found': `${filteredDetails.length} / ${data.details.length}` }
        );
        
        if (agencySearchTerm.trim()) {
          metadata.push({ 'Search Term': `"${agencySearchTerm}"` });
        }
        
        metadata.push({ '': '' }); // Empty row before data
        
        worksheetData = [
          ...metadata,
          ...filteredDetails.map((detail: any) => ({
            'Payment Date': new Date(detail.paymentDate).toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'short',
              day: 'numeric'
            }),
            'Property Name': detail.propertyName,
            'Property Address': detail.propertyAddress,
            'Rental Amount': detail.rentalAmount,
            'Agency Share': detail.agencyShare
          }))
        ];
      } else if (activeTab === 2 && 'details' in data) {
        // PREA Commission (monthly only)
        const filteredDetails = getFilteredPREACommissions();
        
        metadata.push(
          { 'Period': `${getMonthName(preaSelectedMonth)} ${preaSelectedYear}` },
          { 'Properties Found': `${filteredDetails.length} / ${data.details.length}` }
        );
        
        if (preaSearchTerm.trim()) {
          metadata.push({ 'Search Term': `"${preaSearchTerm}"` });
        }
        
        metadata.push({ '': '' }); // Empty row before data
        
        worksheetData = [
          ...metadata,
          ...filteredDetails.map((detail: any) => ({
            'Property Name': detail.propertyName,
            'Amount': detail.commission
          }))
        ];
      } else if (activeTab === 3 && 'entries' in data) {
        // Commission Account
        const commissionData = data as CommissionAccountData;
        metadata.push(
          { 'Period': getCommissionRangeLabel() },
          { 'Opening Balance': formatCurrency(commissionData.openingBalance || 0) },
          { 'Total Commission Received': formatCurrency(commissionData.totalCommissionReceived) },
          { 'Total Payouts': formatCurrency(commissionData.totalPayouts) },
          { 'Balance': formatCurrency(commissionData.balance) },
          { '': '' }
        );

        worksheetData = [
          ...metadata,
          ...commissionData.entries.map((entry: any) => ({
            'Date': new Date(entry.date).toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'short',
              day: 'numeric'
            }),
            'Description': entry.description,
            'Debit': entry.debit,
            'Credit': entry.credit,
            'Balance': entry.balance
          }))
        ];
      } else if (activeTab === 4 && 'properties' in data) {
        const reportsData = data as CommissionReportsData;
        const filteredProperties = getFilteredCommissionReportProperties(reportsData);
        metadata.push(
          { 'Type': getCommissionReportFilterLabel() },
          { 'Properties with Payments': String(filteredProperties.length) },
          { '': '' }
        );

        worksheetData = [
          ...metadata,
          ...filteredProperties.map((property) => ({
            'Property': property.propertyTitle,
            'Address': property.propertyAddress || '',
            'Expected (Dr)': property.totalExpectedCommission,
            'Received (Cr)': property.totalReceivedCommission,
            'Balance': property.closingBalance
          }))
        ];
      }

      const worksheet = XLSX.utils.json_to_sheet(worksheetData);

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, title);
      XLSX.writeFile(workbook, `${title.toLowerCase().replace(' ', '_')}.xlsx`);
    }
  // Gate entire page if commissions disabled
  if (company?.featureFlags && company.featureFlags.commissionEnabled === false) {
    return (
      <Box sx={{ width: '100%', mt: 4 }}>
        <Typography variant="h5" gutterBottom>
          Commissions
        </Typography>
        <Alert severity="info">
          Commissions are not available on your current plan.
        </Alert>
      </Box>
    );
  }

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
              disabled={loading || (!agentCommissions && !agencyCommission && !preaCommission && !commissionAccount && !commissionReports)}
            >
              Download PDF
            </Button>
            <Button 
              variant="contained" 
              onClick={downloadExcel}
              disabled={loading || (!agentCommissions && !agencyCommission && !preaCommission && !commissionAccount && !commissionReports)}
            >
              Download Excel
            </Button>
            <Button 
              variant="contained" 
              onClick={printReport}
              disabled={loading || (!agentCommissions && !agencyCommission && !preaCommission && !commissionAccount && !commissionReports)}
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
            <Tab label="Commission Account" />
            <Tab label="Commission Reports" />
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