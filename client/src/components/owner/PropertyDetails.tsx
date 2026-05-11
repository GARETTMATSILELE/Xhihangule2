import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import api from '../../api/axios';
import { apiService } from '../../api';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  Box,
  Container,
  Grid,
  Paper,
  Typography,
  Button,
  CircularProgress,
  Alert,
  Card,
  CardContent,
  Divider,
  List,
  ListItem,
  ListItemText,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Stack
} from '@mui/material';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell
} from 'recharts';
import {
  Business as BusinessIcon,
  Payment as PaymentIcon,
  Build as BuildIcon,
  Person as PersonIcon,
  Home as HomeIcon,
  ExpandMore as ExpandMoreIcon,
  Print as PrintIcon,
  WarningAmber as WarningAmberIcon
} from '@mui/icons-material';
import { useTheme } from '@mui/material/styles';
import useMediaQuery from '@mui/material/useMediaQuery';
import {
  buildUnifiedTransactions,
  calculateOwnerFinancialSummary,
  daysUntil,
  derivePaymentStatus,
  type PaymentStatus
} from './ownerDashboardUtils';

interface Property {
  _id: string;
  name: string;
  address: string;
  type: string;
  status: string;
  rent: number;
  bedrooms: number;
  bathrooms: number;
  area: number;
  description: string;
  images: string[];
  amenities: string[];
  occupancyRate: number;
  totalRentCollected: number;
  currentArrears: number;
  nextLeaseExpiry: string;
  units: number;
  occupiedUnits: number;
  commission?: number;
}

interface MaintenanceRequest {
  _id: string;
  title: string;
  description: string;
  priority: string;
  status: string;
  estimatedCost: number;
  createdAt: string;
  propertyId: string;
}

interface Tenant {
  _id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  leaseStartDate: string;
  leaseEndDate: string;
  monthlyRent: number;
  status: string;
  monthlyRentPaid?: number;
  rentPaid?: number;
  totalPaid?: number;
}

interface FinancialData {
  totalIncome: number;
  totalExpenses: number;
  netIncome: number;
  monthlyData: any[];
  recentTransactions: any[];
  transactions: any[];
  totalOwnerPayouts?: number;
  totalCommission?: number;
}

const PropertyDetails: React.FC = () => {
  const { propertyId } = useParams<{ propertyId: string }>();
  const navigate = useNavigate();
  const [property, setProperty] = useState<Property | null>(null);
  const [maintenanceRequests, setMaintenanceRequests] = useState<MaintenanceRequest[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [financialData, setFinancialData] = useState<FinancialData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const formatCurrency = useMemo(() => (value: number) => `$${Number(value || 0).toLocaleString()}`, []);
  const sectionPaperSx = { p: { xs: 1.5, sm: 2, md: 3 }, borderRadius: 2 };
  const { user } = useAuth();
  const sortedTransactions = useMemo(() => {
    const transactions = financialData?.transactions;
    const items = Array.isArray(transactions) ? [...transactions] : [];
    return items.sort((a: any, b: any) => {
      const dateA = new Date(a?.date || 0).getTime();
      const dateB = new Date(b?.date || 0).getTime();
      if (dateB !== dateA) return dateB - dateA;
      const createdA = new Date(a?.createdAt || a?.updatedAt || 0).getTime();
      const createdB = new Date(b?.createdAt || b?.updatedAt || 0).getTime();
      if (createdB !== createdA) return createdB - createdA;
      return String(b?.id || '').localeCompare(String(a?.id || ''));
    });
  }, [financialData?.transactions]);

  const financialSummary = useMemo(() => {
    const grossIncome = financialData?.totalIncome || 0;
    const expenses = financialData?.totalExpenses || 0;
    const amountPaidToOwner = financialData?.totalOwnerPayouts || 0;
    const commissionRate = Number(property?.commission || 0);
    return calculateOwnerFinancialSummary({
      grossIncome,
      expenses,
      amountPaidToOwner,
      commissionRate
    });
  }, [financialData, property?.commission]);
  const managementFeeFromPayments = useMemo(() => {
    if (typeof financialData?.totalCommission === 'number') {
      return Number(financialData.totalCommission || 0);
    }
    return (financialData?.transactions || [])
      .filter((tx: any) => tx?.type === 'income')
      .reduce((sum: number, tx: any) => sum + Number(tx?.commissionAmount || 0), 0);
  }, [financialData]);

  const unifiedTransactions = useMemo(
    () => buildUnifiedTransactions(financialData?.transactions || []),
    [financialData?.transactions]
  );

  const currentMonthIncome = useMemo(() => {
    const now = new Date();
    return (financialData?.transactions || [])
      .filter((tx: any) => {
        if (tx?.type !== 'income') return false;
        const d = new Date(tx?.date || tx?.createdAt || 0);
        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
      })
      .reduce((sum: number, tx: any) => sum + Number(tx?.amount || 0), 0);
  }, [financialData?.transactions]);

  const tenantPaymentRows = useMemo(() => {
    const tenantCount = tenants.length || 1;
    return tenants.map((tenant) => {
      const expectedRent = Number(tenant.monthlyRent || property?.rent || 0);
      const paidFromTenant = Number(
        tenant.monthlyRentPaid || tenant.rentPaid || tenant.totalPaid || 0
      );
      const proratedFallback = currentMonthIncome / tenantCount;
      const receivedRent = paidFromTenant > 0 ? paidFromTenant : proratedFallback;
      const paymentStatus = derivePaymentStatus(expectedRent, receivedRent);
      const leaseDaysRemaining = daysUntil(tenant.leaseEndDate);
      return {
        tenant,
        expectedRent,
        receivedRent,
        paymentStatus,
        leaseDaysRemaining
      };
    });
  }, [tenants, property?.rent, currentMonthIncome]);

  const alerts = useMemo(() => {
    const items: { id: string; text: string; severity: 'warning' | 'info' | 'success' }[] = [];
    const overdueCount = tenantPaymentRows.filter((row) => row.paymentStatus === 'overdue').length;
    if (overdueCount > 0) {
      items.push({
        id: 'overdue',
        text: `${overdueCount} tenant payment${overdueCount > 1 ? 's are' : ' is'} overdue`,
        severity: 'warning'
      });
    }
    tenantPaymentRows.forEach((row) => {
      if (row.leaseDaysRemaining !== null && row.leaseDaysRemaining >= 0 && row.leaseDaysRemaining < 60) {
        items.push({
          id: `lease-${row.tenant._id}`,
          text: `Lease expiring in ${row.leaseDaysRemaining} days for ${row.tenant.firstName} ${row.tenant.lastName}`,
          severity: 'info'
        });
      }
    });
    if (maintenanceRequests.length === 0) {
      items.push({
        id: 'maintenance-clear',
        text: 'No issues reported this month',
        severity: 'success'
      });
    }
    return items;
  }, [tenantPaymentRows, maintenanceRequests.length]);

  const maintenanceSummary = useMemo(() => {
    const totalCost = maintenanceRequests.reduce((sum, item) => sum + Number(item.estimatedCost || 0), 0);
    return { count: maintenanceRequests.length, totalCost };
  }, [maintenanceRequests]);

  const activityFeed = useMemo(() => {
    const formatMonthLabel = (value?: string) => {
      if (!value) return 'Unknown month';
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return 'Unknown month';
      return date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    };

    const paymentEvents = (financialData?.transactions || [])
      .filter((tx: any) => tx?.type === 'income')
      .map((tx: any, index: number) => ({
        id: `payment-${tx?.id || tx?._id || index}`,
        date: String(tx?.date || tx?.createdAt || new Date(0).toISOString()),
        text: `Rent payment received (${formatMonthLabel(String(tx?.date || tx?.createdAt || ''))})`
      }));

    const leaseEvents = tenants
      .flatMap((tenant) => {
        const events = [];
        if (tenant.leaseStartDate) {
          events.push({
            id: `lease-start-${tenant._id}`,
            date: tenant.leaseStartDate,
            text: `Lease started - ${tenant.firstName} ${tenant.lastName} (${formatMonthLabel(tenant.leaseStartDate)})`
          });
        }
        if (tenant.leaseEndDate) {
          events.push({
            id: `lease-end-${tenant._id}`,
            date: tenant.leaseEndDate,
            text: `Lease ending - ${tenant.firstName} ${tenant.lastName} (${formatMonthLabel(tenant.leaseEndDate)})`
          });
        }
        return events;
      });

    const maintenanceEvents = maintenanceRequests.map((request) => ({
      id: `maintenance-${request._id}`,
      date: request.createdAt,
      text: `Maintenance recorded - ${request.title}`
    }));

    return [...paymentEvents, ...leaseEvents, ...maintenanceEvents]
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 12);
  }, [financialData?.transactions, tenants, maintenanceRequests]);
  
  const getTransactionLabel = (type: string) => {
    if (type === 'income') return 'Income';
    if (type === 'owner_payout') return 'Owner Payout';
    if (type === 'expense') return 'Expense';
    return type ? type.replace(/_/g, ' ') : 'Unknown';
  };

  const getTransactionColor = (type: string): 'success' | 'warning' | 'error' | 'default' => {
    if (type === 'income') return 'success';
    if (type === 'owner_payout') return 'warning';
    if (type === 'expense') return 'error';
    return 'default';
  };

  const printTransactions = () => {
    if (!financialData?.transactions?.length || !property) return;

    const rowsHtml = sortedTransactions.map((transaction: any) => `
      <tr>
        <td>${new Date(transaction.date).toLocaleString()}</td>
        <td>${transaction.description || 'No description'}</td>
        <td>${getTransactionLabel(transaction.type)}</td>
        <td>${transaction.status || 'unknown'}</td>
        <td style="text-align:right;">$${Number(transaction.amount || 0).toLocaleString()}</td>
        <td style="text-align:right;">$${Number(transaction.runningBalance || 0).toLocaleString()}</td>
      </tr>
    `).join('');

    const printWindow = window.open('', '_blank', 'width=1024,height=768');
    if (!printWindow) return;

    printWindow.document.write(`
      <html>
        <head>
          <title>${property.name} - Transactions</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 24px; color: #111; }
            h1 { margin-bottom: 4px; }
            p { margin: 0 0 16px 0; color: #555; }
            table { width: 100%; border-collapse: collapse; margin-top: 16px; }
            th, td { border: 1px solid #ddd; padding: 8px; font-size: 12px; }
            th { background: #f5f5f5; text-align: left; }
          </style>
        </head>
        <body>
          <h1>${property.name} - Transactions</h1>
          <p>${property.address}</p>
          <p>Generated: ${new Date().toLocaleString()}</p>
          <table>
            <thead>
              <tr>
                <th>Date & Time</th>
                <th>Description</th>
                <th>Type</th>
                <th>Status</th>
                <th style="text-align:right;">Amount</th>
                <th style="text-align:right;">Balance</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
          </table>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  };

  const downloadStatementPdf = () => {
    if (!property || !financialData) return;

    const statementTransactions = [...sortedTransactions].sort((a: any, b: any) => {
      const dateA = new Date(a?.date || a?.createdAt || 0).getTime();
      const dateB = new Date(b?.date || b?.createdAt || 0).getTime();
      if (dateA !== dateB) return dateA - dateB;
      const createdA = new Date(a?.createdAt || a?.updatedAt || 0).getTime();
      const createdB = new Date(b?.createdAt || b?.updatedAt || 0).getTime();
      return createdA - createdB;
    });

    const timeframeStart = statementTransactions.length
      ? new Date(statementTransactions[0]?.date || statementTransactions[0]?.createdAt || Date.now())
      : new Date();
    const timeframeEnd = statementTransactions.length
      ? new Date(
          statementTransactions[statementTransactions.length - 1]?.date ||
            statementTransactions[statementTransactions.length - 1]?.createdAt ||
            Date.now()
        )
      : new Date();
    const timeframeText = `${timeframeStart.toLocaleDateString()} - ${timeframeEnd.toLocaleDateString()}`;

    const ownerName =
      `${(user as any)?.firstName || ''} ${(user as any)?.lastName || ''}`.trim() ||
      (user as any)?.name ||
      (user as any)?.email ||
      'Property Owner';
    const ownerEmail = (user as any)?.email || 'N/A';
    const tenantNames = tenants.length
      ? tenants.map((tenant) => `${tenant.firstName} ${tenant.lastName}`.trim()).join(', ')
      : 'No tenants on record';

    let runningBalance = 0;
    const totalIncome = statementTransactions
      .filter((tx: any) => String(tx?.type || '').toLowerCase() === 'income')
      .reduce((sum: number, tx: any) => sum + Number(tx?.amount || 0), 0);
    const totalExpenses = statementTransactions
      .filter((tx: any) => String(tx?.type || '').toLowerCase() === 'expense')
      .reduce((sum: number, tx: any) => sum + Number(tx?.amount || 0), 0);
    const totalPayouts = statementTransactions
      .filter((tx: any) => String(tx?.type || '').toLowerCase() === 'owner_payout')
      .reduce((sum: number, tx: any) => sum + Number(tx?.amount || 0), 0);
    const closingBalance = totalIncome - totalExpenses - totalPayouts;

    const transactionRows = statementTransactions.map((tx: any) => {
      const txType = String(tx?.type || '').toLowerCase();
      const amount = Number(tx?.amount || 0);
      const income = txType === 'income' ? amount : 0;
      const expense = txType === 'expense' ? amount : 0;
      const payout = txType === 'owner_payout' ? amount : 0;
      const delta = income - expense - payout;
      runningBalance += delta;
      return [
        new Date(tx?.date || tx?.createdAt || Date.now()).toLocaleDateString(),
        getTransactionLabel(txType),
        String(tx?.description || 'No description'),
        income > 0 ? formatCurrency(income) : '-',
        expense > 0 ? formatCurrency(expense) : '-',
        payout > 0 ? formatCurrency(payout) : '-',
        formatCurrency(runningBalance)
      ];
    });

    const doc = new jsPDF();
    doc.setFontSize(14);
    doc.text('Owner Property Statement', 14, 16);
    doc.setFontSize(10);
    doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 23);
    doc.text(`Timeframe: ${timeframeText}`, 14, 29);

    doc.text(`Property: ${property.name || 'N/A'}`, 14, 37);
    doc.text(`Address: ${property.address || 'N/A'}`, 14, 43);
    doc.text(`Owner: ${ownerName}`, 14, 49);
    doc.text(`Owner Email: ${ownerEmail}`, 14, 55);

    const tenantLine = `Tenants: ${tenantNames}`;
    const tenantLines = doc.splitTextToSize(tenantLine, 180);
    doc.text(tenantLines, 14, 61);
    const summaryStartY = 61 + tenantLines.length * 6 + 2;

    doc.text(`Total Income: ${formatCurrency(totalIncome)}`, 14, summaryStartY);
    doc.text(`Total Expenses: ${formatCurrency(totalExpenses)}`, 14, summaryStartY + 6);
    doc.text(`Total Payouts: ${formatCurrency(totalPayouts)}`, 14, summaryStartY + 12);
    doc.setFontSize(11);
    doc.text(`Closing Balance (Income - Payouts - Expenses): ${formatCurrency(closingBalance)}`, 14, summaryStartY + 20);
    doc.setFontSize(10);

    autoTable(doc, {
      startY: summaryStartY + 26,
      head: [['Date', 'Type', 'Description', 'Income', 'Expense', 'Payout', 'Running Balance']],
      body: transactionRows.length > 0 ? transactionRows : [['-', '-', 'No transactions available', '-', '-', '-', formatCurrency(0)]],
      styles: {
        fontSize: 8,
        cellPadding: 2
      },
      headStyles: {
        fillColor: [66, 139, 202],
        textColor: 255
      }
    });

    const filenameSafeProperty = String(property.name || 'property').replace(/[^a-z0-9]+/gi, '_').toLowerCase();
    doc.save(`owner_statement_${filenameSafeProperty}.pdf`);
  };

  // Helpers for displaying lease period
  const formatDate = (dateStr: string) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  };

  const getLeaseDurationMonths = (startStr: string, endStr: string) => {
    if (!startStr || !endStr) return '';
    const start = new Date(startStr);
    const end = new Date(endStr);
    let months = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
    // Adjust if end day is before start day within the month
    if (end.getDate() < start.getDate()) months -= 1;
    return months > 0 ? `${months} mo` : '';
  };

  useEffect(() => {
    const fetchData = async () => {
      try {
        if (!user) {
          setError('User not authenticated');
          return;
        }

        const [propertyRes, maintenanceRes, financialRes] = await Promise.all([
          api.get(`/owners/properties/${propertyId}`),
          apiService.getOwnerMaintenanceRequestsPublic(user._id as string, (user as any).companyId),
          apiService.getOwnerFinancialData()
        ]);

        setProperty(propertyRes.data);
        
        // Filter maintenance requests for this property
        const propertyMaintenance = maintenanceRes.data.filter(
          (req: MaintenanceRequest) => req.propertyId === propertyId
        );
        setMaintenanceRequests(propertyMaintenance);

        // Filter financial data for this property
        if (financialRes.data?.success) {
          const propertyFinancial = financialRes.data.data.propertyBreakdown?.find(
            (prop: any) => String(prop.propertyId) === String(propertyId)
          );
          if (propertyFinancial) {
            setFinancialData({
              totalIncome: propertyFinancial.totalIncome || 0,
              totalExpenses: propertyFinancial.totalExpenses || 0,
              totalOwnerPayouts: propertyFinancial.totalOwnerPayouts || 0,
              totalCommission: propertyFinancial.totalCommission || 0,
              netIncome: propertyFinancial.netIncome ?? ((propertyFinancial.totalIncome || 0) - (propertyFinancial.totalExpenses || 0) - (propertyFinancial.totalOwnerPayouts || 0)),
              monthlyData: propertyFinancial.monthlyData || [],
              recentTransactions: propertyFinancial.recentTransactions || [],
              transactions: propertyFinancial.transactions || propertyFinancial.recentTransactions || []
            });
          }
        }

        // Fetch tenant data (you may need to implement this API endpoint)
        try {
          const tenantsRes = await api.get(`/owners/properties/${propertyId}/tenants`);
          setTenants(tenantsRes.data);
        } catch (err) {
          console.log('No tenant data available');
          setTenants([]);
        }

      } catch (err: any) {
        setError(err.response?.data?.error || 'Error fetching property details');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [propertyId]);

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="100vh">
        <CircularProgress />
      </Box>
    );
  }

  if (!property) {
    return (
      <Container>
        <Alert severity="error">Property not found</Alert>
      </Container>
    );
  }

  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      <Grid container spacing={3}>
        <Grid item xs={12}>
          <Box display="flex" justifyContent="space-between" alignItems={{ xs: 'flex-start', sm: 'center' }} flexDirection={{ xs: 'column', sm: 'row' }} gap={1.5}>
            <Typography variant="h4" component="h1">
              <HomeIcon sx={{ mr: 2 }} />
              {property.name || 'Property Details'}
            </Typography>
            <Button variant="outlined" onClick={() => navigate('/owner-dashboard')}>
              Back to Dashboard
            </Button>
          </Box>
        </Grid>

        {error && (
          <Grid item xs={12}>
            <Alert severity="error">{error}</Alert>
          </Grid>
        )}

        {/* Property Address and Rent Section */}
        <Grid item xs={12}>
          <Paper sx={sectionPaperSx}>
            <Box display="flex" alignItems="center" mb={2}>
              <BusinessIcon sx={{ mr: 1 }} />
              <Typography variant="h6">Property Information</Typography>
            </Box>
            <Grid container spacing={3}>
              <Grid item xs={12} md={6}>
                <Typography variant="subtitle1" color="text.secondary">Address</Typography>
                <Typography variant="h6">{property.address}</Typography>
              </Grid>
              <Grid item xs={12} md={6}>
                <Typography variant="subtitle1" color="text.secondary">Monthly Rent</Typography>
                <Typography variant="h6" color="primary.main">
                  ${property.rent ? property.rent.toLocaleString() : '0'}/month
                </Typography>
              </Grid>
              <Grid item xs={12} md={4}>
                <Typography variant="subtitle1" color="text.secondary">Type</Typography>
                <Typography variant="body1">{property.type || 'N/A'}</Typography>
              </Grid>
              <Grid item xs={12} md={4}>
                <Typography variant="subtitle1" color="text.secondary">Status</Typography>
                <Chip
                  label={property.status || 'unknown'}
                  color={property.status === 'available' ? 'success' : property.status === 'rented' ? 'primary' : 'warning'}
                />
              </Grid>
              <Grid item xs={12} md={4}>
                <Typography variant="subtitle1" color="text.secondary">Units</Typography>
                <Typography variant="body1">
                  {property.units || 1} ({property.status === 'rented' ? 1 : (property.occupiedUnits || 0)} occupied)
                </Typography>
              </Grid>
            </Grid>
          </Paper>
        </Grid>

        {/* Financial Summary */}
        <Grid item xs={12}>
          <Paper sx={{ ...sectionPaperSx, border: '1px solid', borderColor: 'divider' }}>
            <Box display="flex" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={2} mb={2}>
              <Typography variant="h6">Owner Financial Summary</Typography>
              <Stack direction="row" spacing={1} flexWrap="wrap">
                <Button
                  variant="outlined"
                  sx={{ flex: { xs: '1 1 calc(50% - 4px)', sm: '0 1 auto' } }}
                  onClick={downloadStatementPdf}
                  disabled={!financialData}
                >
                  Download Statement
                </Button>
                <Button variant="outlined" color="warning" sx={{ flex: { xs: '1 1 calc(50% - 4px)', sm: '0 1 auto' } }}>Add Maintenance</Button>
              </Stack>
            </Box>
            <Grid container spacing={2}>
              <Grid item xs={12} md={4}>
                <Card sx={{ bgcolor: 'success.50' }}>
                  <CardContent>
                    <Typography variant="subtitle2" color="text.secondary">Gross Income</Typography>
                    <Typography variant="h5" color="success.main">
                      {formatCurrency(financialSummary.grossIncome)}
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
              <Grid item xs={12} md={4}>
                <Card sx={{ bgcolor: 'error.50' }}>
                  <CardContent>
                    <Typography variant="subtitle2" color="text.secondary">Expenses</Typography>
                    <Typography variant="h5" color="error.main">
                      {formatCurrency(financialSummary.expenses)}
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
              <Grid item xs={12} md={4}>
                <Card sx={{ bgcolor: 'warning.50' }}>
                  <CardContent>
                    <Typography variant="subtitle2" color="text.secondary">Payouts Already Made to Owner</Typography>
                    <Typography variant="h5" color="warning.main">
                      {formatCurrency(financialSummary.amountPaidToOwner)}
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
              <Grid item xs={12}>
                <Card sx={{ bgcolor: 'primary.main', color: 'primary.contrastText' }}>
                  <CardContent>
                    <Typography variant="subtitle1">Net Amount Payable to Owner</Typography>
                    <Typography variant={isMobile ? 'h5' : 'h3'} fontWeight={700}>
                      {formatCurrency(financialSummary.balanceOwedToOwner)}
                    </Typography>
                    <Typography variant="body2" sx={{ opacity: 0.9 }}>
                      Gross income less expenses and payouts already made.
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
              <Grid item xs={12}>
                <Paper variant="outlined" sx={{ p: 2 }}>
                  <Typography variant="subtitle1" gutterBottom>Commission Breakdown</Typography>
                  <Typography variant="body2" color="text.secondary">
                    Commission Percentage: {financialSummary.commissionRate.toFixed(2)}%
                  </Typography>
                  <Typography variant="body1" color="warning.main" fontWeight={600}>
                    Management Fee: {formatCurrency(managementFeeFromPayments)}
                  </Typography>
                </Paper>
              </Grid>
            </Grid>
          </Paper>
        </Grid>

        {/* Alerts Section */}
        <Grid item xs={12}>
          <Paper sx={sectionPaperSx}>
            <Box display="flex" alignItems="center" mb={2}>
              <WarningAmberIcon sx={{ mr: 1, color: 'warning.main' }} />
              <Typography variant="h6">Alerts & Notifications</Typography>
            </Box>
            <Stack spacing={1}>
              {alerts.map((alertItem) => (
                <Alert key={alertItem.id} severity={alertItem.severity}>{alertItem.text}</Alert>
              ))}
            </Stack>
          </Paper>
        </Grid>

        {/* Tenant Details Section */}
        <Grid item xs={12}>
          <Paper sx={sectionPaperSx}>
            <Box display="flex" alignItems="center" mb={2}>
              <PersonIcon sx={{ mr: 1 }} />
              <Typography variant="h6">Tenant Overview</Typography>
            </Box>
            {tenants.length > 0 ? (
              <TableContainer sx={{ overflowX: 'auto' }}>
                <Table size="small" sx={{ minWidth: 600 }}>
                  <TableHead>
                    <TableRow>
                      <TableCell>Name</TableCell>
                      <TableCell>Rent Amount</TableCell>
                      <TableCell>Payment Status</TableCell>
                      <TableCell>Lease Intelligence</TableCell>
                      <TableCell>Monthly Rent</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {tenantPaymentRows.map(({ tenant, expectedRent, paymentStatus, leaseDaysRemaining }) => (
                      <TableRow key={tenant._id}>
                        <TableCell>{tenant.firstName} {tenant.lastName}</TableCell>
                        <TableCell>{formatCurrency(expectedRent)}</TableCell>
                        <TableCell>
                          <Chip
                            label={paymentStatus === 'paid' ? 'Paid' : paymentStatus === 'partial' ? 'Partial' : 'Overdue'}
                            size="small"
                            color={paymentStatus === 'paid' ? 'success' : paymentStatus === 'partial' ? 'warning' : 'error'}
                          />
                        </TableCell>
                        <TableCell>
                          {leaseDaysRemaining !== null ? (
                            <Box>
                              <Typography variant="body2">{leaseDaysRemaining} days remaining</Typography>
                              {leaseDaysRemaining < 60 && leaseDaysRemaining >= 0 && (
                                <Chip label="Expiring Soon" size="small" color="warning" />
                              )}
                            </Box>
                          ) : (
                            <Typography variant="body2" color="text.secondary">No lease end date</Typography>
                          )}
                        </TableCell>
                        <TableCell>{formatCurrency(property?.rent ? property.rent : (tenant.monthlyRent || 0))}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            ) : (
              <Typography variant="body1" color="text.secondary">
                No tenant information available for this property.
              </Typography>
            )}
          </Paper>
        </Grid>

        {/* Transaction History */}
        <Grid item xs={12}>
          <Paper sx={sectionPaperSx}>
            <Box display="flex" alignItems="center" mb={2}>
              <PaymentIcon sx={{ mr: 1 }} />
              <Typography variant="h6">Transaction History</Typography>
            </Box>
            {financialData ? (
              <Grid container spacing={3}>
                <Grid item xs={12}>
                  <Accordion>
                    <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                      <Box sx={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2 }}>
                        <Typography variant="subtitle1">Income & Expense Transactions</Typography>
                        <Button
                          size="small"
                          variant="outlined"
                          startIcon={<PrintIcon />}
                          onClick={(event) => {
                            event.stopPropagation();
                            printTransactions();
                          }}
                          disabled={unifiedTransactions.length === 0}
                        >
                          Print Transactions
                        </Button>
                      </Box>
                    </AccordionSummary>
                    <AccordionDetails>
                      {unifiedTransactions.length > 0 ? (
                        <TableContainer sx={{ overflowX: 'auto' }}>
                          <Table size="small" sx={{ minWidth: 520 }}>
                            <TableHead>
                              <TableRow>
                                <TableCell>Date</TableCell>
                                <TableCell>Type</TableCell>
                                <TableCell>Description</TableCell>
                                <TableCell align="right">Amount</TableCell>
                              </TableRow>
                            </TableHead>
                            <TableBody>
                              {unifiedTransactions.map((transaction) => (
                                <TableRow key={transaction.id}>
                                  <TableCell>{new Date(transaction.date).toLocaleDateString()}</TableCell>
                                  <TableCell>
                                    <Chip
                                      size="small"
                                      label={transaction.type === 'income' ? 'Income' : 'Expense'}
                                      color={transaction.type === 'income' ? 'success' : 'error'}
                                    />
                                  </TableCell>
                                  <TableCell>{transaction.description || 'No description'}</TableCell>
                                  <TableCell align="right">
                                    <Typography
                                      variant="body2"
                                      color={transaction.type === 'income' ? 'success.main' : 'error.main'}
                                    >
                                      {formatCurrency(Number(transaction.amount || 0))}
                                    </Typography>
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </TableContainer>
                      ) : (
                        <Typography variant="body2" color="text.secondary">
                          No transactions available for this property.
                        </Typography>
                      )}
                    </AccordionDetails>
                  </Accordion>
                </Grid>
              </Grid>
            ) : (
              <Typography variant="body1" color="text.secondary">
                No financial data available for this property.
              </Typography>
            )}
          </Paper>
        </Grid>

        {/* Activity Feed */}
        <Grid item xs={12}>
          <Paper sx={sectionPaperSx}>
            <Typography variant="h6" gutterBottom>Activity Feed</Typography>
            {activityFeed.length > 0 ? (
              <List>
                {activityFeed.map((event) => (
                  <ListItem key={event.id} divider>
                    <ListItemText
                      primary={event.text}
                      secondary={new Date(event.date).toLocaleString()}
                    />
                  </ListItem>
                ))}
              </List>
            ) : (
              <Typography variant="body2" color="text.secondary">
                No recent activity available for this property.
              </Typography>
            )}
          </Paper>
        </Grid>

        {/* Maintenance Data Section */}
        <Grid item xs={12}>
          <Paper sx={sectionPaperSx}>
            <Box display="flex" alignItems="center" mb={2}>
              <BuildIcon sx={{ mr: 1 }} />
              <Typography variant="h6">Maintenance Overview</Typography>
            </Box>
            {maintenanceSummary.count > 0 ? (
              <Box mb={2}>
                <Typography variant="body1">
                  {maintenanceSummary.count} maintenance issue(s) recorded
                </Typography>
                <Typography variant="body2" color="error.main">
                  Total Estimated Cost: {formatCurrency(maintenanceSummary.totalCost)}
                </Typography>
              </Box>
            ) : (
              <Alert severity="success" sx={{ mb: 2 }}>
                No maintenance issues reported this month
              </Alert>
            )}
            {maintenanceRequests.length > 0 ? (
              <TableContainer sx={{ overflowX: 'auto' }}>
                <Table size="small" sx={{ minWidth: 680 }}>
                  <TableHead>
                    <TableRow>
                      <TableCell>Title</TableCell>
                      <TableCell>Description</TableCell>
                      <TableCell>Priority</TableCell>
                      <TableCell>Status</TableCell>
                      <TableCell>Estimated Cost</TableCell>
                      <TableCell>Created</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {maintenanceRequests.map((request) => (
                      <TableRow key={request._id}>
                        <TableCell>{request.title}</TableCell>
                        <TableCell>{request.description}</TableCell>
                        <TableCell>
                          <Chip 
                            label={request.priority} 
                            size="small"
                            color={request.priority === 'high' ? 'error' : request.priority === 'medium' ? 'warning' : 'default'}
                          />
                        </TableCell>
                        <TableCell>
                          <Chip 
                            label={request.status} 
                            size="small"
                            color={request.status === 'completed' ? 'success' : request.status === 'in_progress' ? 'primary' : 'default'}
                          />
                        </TableCell>
                        <TableCell>{formatCurrency(request.estimatedCost || 0)}</TableCell>
                        <TableCell>{new Date(request.createdAt).toLocaleDateString()}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            ) : (
              <Typography variant="body1" color="text.secondary">
                No maintenance requests for this property.
              </Typography>
            )}
          </Paper>
        </Grid>
      </Grid>
    </Container>
  );
};

export default PropertyDetails; 