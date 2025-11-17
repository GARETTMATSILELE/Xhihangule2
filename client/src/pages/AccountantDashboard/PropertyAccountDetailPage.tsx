import React, { useEffect, useState } from 'react';
import { useParams, useLocation } from 'react-router-dom';
import {
  Box,
  Typography,
  Grid,
  Card,
  CardContent,
  Button,
  CircularProgress,
  TextField,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  Alert,
  Tabs,
  Tab,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  IconButton,
  Tooltip,
  Divider
} from '@mui/material';
import {
  Add as AddIcon,
  AccountBalance as AccountBalanceIcon,
  TrendingUp as TrendingUpIcon,
  TrendingDown as TrendingDownIcon,
  Payment as PaymentIcon,
  History as HistoryIcon,
  CheckCircle as CheckCircleIcon,
  Cancel as CancelIcon,
  Pending as PendingIcon,
  Print as PrintIcon
} from '@mui/icons-material';
import { usePropertyService } from '../../services/propertyService';
import { propertyAccountService, PropertyAccount, Transaction, OwnerPayout, ExpenseData, PayoutData } from '../../services/propertyAccountService';
import { useAuth } from '../../contexts/AuthContext';
import { usePropertyOwnerService, PropertyOwner } from '../../services/propertyOwnerService';
import paymentService from '../../services/paymentService';
import { Paid as PaidIcon } from '@mui/icons-material';

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;
  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`property-account-tabpanel-${index}`}
      aria-labelledby={`property-account-tab-${index}`}
      {...other}
    >
      {value === index && <Box sx={{ p: 3 }}>{children}</Box>}
    </div>
  );
}

const PropertyAccountDetailPage: React.FC = () => {
  const { propertyId } = useParams<{ propertyId: string }>();
  const location = useLocation();
  const { user, company } = useAuth();
  const { getProperty } = usePropertyService();
  const { getSalesById } = usePropertyOwnerService();
  
  // State
  const [property, setProperty] = useState<any>(null);
  const [account, setAccount] = useState<PropertyAccount | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tabValue, setTabValue] = useState(0);
  const [ownerMap, setOwnerMap] = useState<Record<string, string>>({});
  const [depositSummary, setDepositSummary] = useState<{ totalPaid: number; totalPayout: number; held: number } | null>(null);
  
  // Dialog states
  const [expenseDialogOpen, setExpenseDialogOpen] = useState(false);
  const [payoutDialogOpen, setPayoutDialogOpen] = useState(false);
  const [statementDialogOpen, setStatementDialogOpen] = useState(false);
  const [expenseData, setExpenseData] = useState<ExpenseData>({
    amount: 0,
    date: new Date(),
    description: '',
    category: 'general',
    notes: ''
  });
  const [payoutData, setPayoutData] = useState<PayoutData>({
    amount: 0,
    paymentMethod: 'bank_transfer',
    recipientId: '',
    recipientName: '',
    notes: ''
  });
  
  const [statementData, setStatementData] = useState({
    startDate: new Date(new Date().getFullYear(), new Date().getMonth(), 1), // First day of current month
    endDate: new Date(),
    includeAllTransactions: false
  });
  
  // Form states
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Levies state and payout controls (moved before any early returns to satisfy Hooks rules)
  const [levyRows, setLevyRows] = useState<any[]>([]);
  const [leviesLoaded, setLeviesLoaded] = useState(false);
  const [payoutOpen, setPayoutOpen] = useState(false);
  const [payoutRow, setPayoutRow] = useState<any>(null);
  const [payoutForm, setPayoutForm] = useState({ paidToName: '', paidToAccount: '', paidToContact: '', payoutDate: '', payoutMethod: 'bank_transfer', payoutReference: '', notes: '' });

  useEffect(() => {
    const fetchData = async () => {
      if (!propertyId) return;
      
      setLoading(true);
      setError(null);
      try {
        // Fetch property first to determine ledger type
        const search = new URLSearchParams(location.search);
        const found = await getProperty(propertyId);
        setProperty(found || null);

        const inferredLedger = (search.get('ledger') === 'sale' || (!search.get('ledger') && (found as any)?.rentalType === 'sale'))
          ? 'sale'
          : 'rental';

        // Fetch account and deposit summary in parallel
        const [accountData, depositSum] = await Promise.all([
          propertyAccountService.getPropertyAccount(propertyId, inferredLedger as any),
          paymentService.getPropertyDepositSummary(propertyId).catch(() => null)
        ]);
        setAccount(accountData);
        if (depositSum) setDepositSummary(depositSum);

        // Resolve owner name efficiently
        const map: Record<string, string> = {};
        if (inferredLedger === 'sale') {
          try {
            const raw = (found as any).propertyOwnerId;
            const ownerId = typeof raw === 'object' && raw && (raw as any).$oid ? (raw as any).$oid : (raw ? String(raw) : '');
            if (ownerId) {
              const salesOwner = await getSalesById(ownerId);
              if (salesOwner && (salesOwner.firstName || salesOwner.lastName)) {
                map[String((found as any)._id)] = `${salesOwner.firstName || ''} ${salesOwner.lastName || ''}`.trim();
              }
            }
          } catch (e) {
            // ignore owner fetch failure; we'll fall back to account.ownerName
          }
        }
        setOwnerMap(map);
        
      } catch (err: any) {
        setError(err.message || 'Failed to fetch property account data');
      } finally {
        setLoading(false);
      }
    };
    
    fetchData();
  }, [propertyId]);

  // Lazy-load levy payments when Levies tab is opened
  useEffect(() => {
    const loadLevies = async () => {
      try {
        if (!propertyId || !user?.companyId) return;
        const all = await paymentService.getLevyPayments(user.companyId);
        const filtered = (Array.isArray(all) ? all : []).filter((p: any) => String(p?.propertyId?._id || p?.propertyId) === String(propertyId));
        setLevyRows(filtered);
        setLeviesLoaded(true);
      } catch {
        // ignore
      }
    };
    if (tabValue === 2 && !leviesLoaded) {
      loadLevies();
    }
  }, [tabValue, leviesLoaded, propertyId, user?.companyId]);

  const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue);
  };

  const handleAddExpense = async () => {
    if (!propertyId) return;
    
    setSubmitting(true);
    setSubmitError(null);
    setSuccess(null);
    
    try {
      const updatedAccount = await propertyAccountService.addExpense(propertyId, expenseData);
      setAccount(updatedAccount);
      setExpenseDialogOpen(false);
      setExpenseData({
        amount: 0,
        date: new Date(),
        description: '',
        category: 'general',
        notes: ''
      });
      setSuccess('Expense added successfully!');
    } catch (err: any) {
      setSubmitError(err.message || 'Failed to add expense');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreatePayout = async () => {
    if (!propertyId) return;
    
    setSubmitting(true);
    setSubmitError(null);
    setSuccess(null);
    
    try {
      const result = await propertyAccountService.createOwnerPayout(propertyId, payoutData);
      setAccount(result.account);
      setPayoutDialogOpen(false);
      setPayoutData({
        amount: 0,
        paymentMethod: 'bank_transfer',
        recipientId: '',
        recipientName: '',
        notes: ''
      });
      setSuccess('Owner payout created successfully!');
    } catch (err: any) {
      setSubmitError(err.message || 'Failed to create payout');
    } finally {
      setSubmitting(false);
    }
  };

  const handleOpenPayoutDialog = () => {
    // Pre-populate recipient information from account
    setPayoutData({
      ...payoutData,
      recipientId: account?.ownerId || '',
      recipientName: ownerMap[propertyId!] || account?.ownerName || ''
    });
    setPayoutDialogOpen(true);
  };

  const handleUpdatePayoutStatus = async (payoutId: string, status: 'completed' | 'failed' | 'cancelled') => {
    if (!propertyId) return;
    
    try {
      const updatedAccount = await propertyAccountService.updatePayoutStatus(propertyId, payoutId, status);
      setAccount(updatedAccount);
      setSuccess(`Payout status updated to ${status}`);
    } catch (err: any) {
      setSubmitError(err.message || 'Failed to update payout status');
    }
  };

  const handlePrintAcknowledgement = async (payout: OwnerPayout) => {
    if (!propertyId) return;
    
    try {
      const acknowledgementData = await propertyAccountService.getAcknowledgementDocument(propertyId, payout._id!);
      
      // Create a new window for printing
      const printWindow = window.open('', '_blank');
      if (!printWindow) {
        setSubmitError('Please allow popups to print the acknowledgement');
        return;
      }

      // Get company details and property address
      const companyName = company?.name || 'Property Management Company';
      const propertyAddress = property?.address || 'Property Address Not Available';

      // Create the print content
      const printContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Payment Acknowledgement Receipt</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 40px; }
            .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #333; padding-bottom: 20px; }
            .title { font-size: 24px; font-weight: bold; margin-bottom: 10px; }
            .subtitle { font-size: 16px; color: #666; margin-bottom: 5px; }
            .property-address { font-size: 14px; color: #666; }
            .receipt-details { margin: 30px 0; }
            .detail-row { display: flex; justify-content: space-between; margin: 15px 0; padding: 10px 0; border-bottom: 1px solid #eee; }
            .detail-label { font-weight: bold; min-width: 120px; }
            .detail-value { flex: 1; }
            .signature-section { margin-top: 50px; }
            .signature-line { border-top: 1px solid #000; margin-top: 30px; width: 200px; }
            .signature-label { font-size: 12px; color: #666; margin-top: 5px; }
            .footer { margin-top: 50px; text-align: center; font-size: 12px; color: #666; }
            @media print {
              body { margin: 20px; }
              .no-print { display: none; }
            }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="title">Payment Acknowledgement Receipt</div>
            <div class="subtitle">${companyName}</div>
            <div class="property-address">${propertyAddress}</div>
          </div>
          
          <div class="receipt-details">
            <div class="detail-row">
              <span class="detail-label">Date:</span>
              <span class="detail-value">${new Date(payout.date).toLocaleDateString()}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">Reference:</span>
              <span class="detail-value">${payout.referenceNumber}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">Recipient:</span>
              <span class="detail-value">${payout.recipientName}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">Amount:</span>
              <span class="detail-value">${propertyAccountService.formatCurrency(payout.amount)}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">Method:</span>
              <span class="detail-value">${propertyAccountService.getPaymentMethodLabel(payout.paymentMethod)}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">Status:</span>
              <span class="detail-value">${payout.status}</span>
            </div>
            ${payout.notes ? `
            <div class="detail-row">
              <span class="detail-label">Notes:</span>
              <span class="detail-value">${payout.notes}</span>
            </div>
            ` : ''}
          </div>
          
          <div class="signature-section">
            <p>I, <strong>${payout.recipientName}</strong>, acknowledge receipt of the above payment.</p>
            <div class="signature-line"></div>
            <div class="signature-label">Recipient Signature</div>
          </div>
          
          <div class="footer">
            <p>This document serves as proof of payment receipt. Please keep this for your records.</p>
            <p>Generated on ${new Date().toLocaleString()}</p>
          </div>
          
          <div class="no-print" style="position: fixed; top: 20px; right: 20px;">
            <button onclick="window.print()" style="padding: 10px 20px; background: #1976d2; color: white; border: none; border-radius: 4px; cursor: pointer;">
              Print Receipt
            </button>
            <button onclick="window.close()" style="padding: 10px 20px; background: #666; color: white; border: none; border-radius: 4px; cursor: pointer; margin-left: 10px;">
              Close
            </button>
          </div>
        </body>
        </html>
      `;

      printWindow.document.write(printContent);
      printWindow.document.close();
      
    } catch (err: any) {
      setSubmitError(err.message || 'Failed to generate acknowledgement document');
    }
  };

  const handlePrintStatement = async () => {
    if (!propertyId) return;
    
    try {
      // Create a new window for printing
      const printWindow = window.open('', '_blank');
      if (!printWindow) {
        setSubmitError('Please allow popups to print the statement');
        return;
      }

      // Get company details and property information
      const companyName = company?.name || 'Property Management Company';
      const propertyAddress = property?.address || 'Property Address Not Available';
      const ownerName = ownerMap[propertyId!] || account?.ownerName || 'Unknown Owner';
      
      // Deduplicate base transactions (by type + paymentId) then filter by date range
      const baseDeduped = (() => {
        const seen = new Set<string>();
        const result: typeof transactions = [];
        for (const t of transactions) {
          const paymentId = (t as any)?.paymentId ? String((t as any).paymentId) : '';
          const key = paymentId
            ? `${t.type}:${paymentId}`
            : `${t.type}:${t.referenceNumber || ''}:${new Date(t.date).getTime()}:${Number(t.amount || 0)}`;
          if (seen.has(key)) continue;
          seen.add(key);
          result.push(t);
        }
        return result;
      })();
      let filteredTransactions = baseDeduped;
      if (!statementData.includeAllTransactions) {
        filteredTransactions = baseDeduped.filter(transaction => {
          const transactionDate = new Date(transaction.date);
          return transactionDate >= statementData.startDate && transactionDate <= statementData.endDate;
        });
      }

      // Calculate summary for the period
      const periodIncome = filteredTransactions
        .filter(t => t.type === 'income')
        .reduce((sum, t) => sum + t.amount, 0);
      
      const periodExpenses = filteredTransactions
        .filter(t => t.type === 'expense')
        .reduce((sum, t) => sum + t.amount, 0);
      
      // Get payouts from the account's ownerPayouts array and filter by date range
      let periodPayouts = 0;
      let filteredPayouts: OwnerPayout[] = [];
      
      if (account?.ownerPayouts) {
        if (statementData.includeAllTransactions) {
          filteredPayouts = account.ownerPayouts;
          periodPayouts = account.totalOwnerPayouts;
        } else {
          filteredPayouts = account.ownerPayouts.filter(payout => {
            const payoutDate = new Date(payout.date);
            return payoutDate >= statementData.startDate && payoutDate <= statementData.endDate;
          });
          periodPayouts = filteredPayouts.reduce((sum, payout) => sum + payout.amount, 0);
        }
      }

      // Calculate net income after payouts
      const netIncomeAfterPayouts = periodIncome - periodPayouts;
      const netIncomeAfterExpenses = netIncomeAfterPayouts - periodExpenses;

      // Create the print content
      const printContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Property Statement</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 40px; }
            .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #333; padding-bottom: 20px; }
            .title { font-size: 24px; font-weight: bold; margin-bottom: 10px; }
            .subtitle { font-size: 16px; color: #666; margin-bottom: 5px; }
            .property-address { font-size: 14px; color: #666; }
            .property-info { margin: 20px 0; padding: 15px; background: #f9f9f9; border-radius: 5px; }
            .info-row { display: flex; justify-content: space-between; margin: 8px 0; }
            .info-label { font-weight: bold; min-width: 120px; }
            .info-value { flex: 1; }
            .period-info { margin: 20px 0; padding: 15px; background: #e3f2fd; border-radius: 5px; }
            .summary-section { margin: 20px 0; }
            .summary-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px; margin: 15px 0; }
            .summary-card { padding: 15px; border: 1px solid #ddd; border-radius: 5px; text-align: center; }
            .summary-amount { font-size: 20px; font-weight: bold; margin: 5px 0; }
            .income { color: #4caf50; }
            .expense { color: #f44336; }
            .payout { color: #2196f3; }
            .transactions-table { margin: 30px 0; }
            .transactions-table table { width: 100%; border-collapse: collapse; }
            .transactions-table th, .transactions-table td { 
              border: 1px solid #ddd; 
              padding: 8px; 
              text-align: left; 
            }
            .transactions-table th { background: #f5f5f5; font-weight: bold; }
            .income-row { background: #f1f8e9; }
            .expense-row { background: #ffebee; }
            .payout-row { background: #e3f2fd; }
            .footer { margin-top: 50px; text-align: center; font-size: 12px; color: #666; }
            @media print {
              body { margin: 20px; }
              .no-print { display: none; }
            }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="title">Property Statement</div>
            <div class="subtitle">${companyName}</div>
            <div class="property-address">${propertyAddress}</div>
          </div>
          
          <div class="property-info">
            <div class="info-row">
              <span class="info-label">Property Owner:</span>
              <span class="info-value">${ownerName}</span>
            </div>
            <div class="info-row">
              <span class="info-label">Property Address:</span>
              <span class="info-value">${propertyAddress}</span>
            </div>
            <div class="info-row">
              <span class="info-label">Statement Period:</span>
              <span class="info-value">${statementData.includeAllTransactions ? 'All Transactions' : `${statementData.startDate.toLocaleDateString()} to ${statementData.endDate.toLocaleDateString()}`}</span>
            </div>
            <div class="info-row">
              <span class="info-label">Generated On:</span>
              <span class="info-value">${new Date().toLocaleString()}</span>
            </div>
          </div>
          
          <div class="summary-section">
            <h3>Period Summary</h3>
            <div class="summary-grid">
              <div class="summary-card">
                <div>Total Rent Income</div>
                <div class="summary-amount income">${propertyAccountService.formatCurrency(periodIncome)}</div>
              </div>
              <div class="summary-card">
                <div>Owner Payouts (Deductions)</div>
                <div class="summary-amount expense">-${propertyAccountService.formatCurrency(periodPayouts)}</div>
              </div>
              <div class="summary-card">
                <div>Net Income After Payouts</div>
                <div class="summary-amount ${netIncomeAfterPayouts >= 0 ? 'income' : 'expense'}">${propertyAccountService.formatCurrency(netIncomeAfterPayouts)}</div>
              </div>
            </div>
            <div class="summary-grid" style="margin-top: 15px;">
              <div class="summary-card">
                <div>Total Expenses</div>
                <div class="summary-amount expense">${propertyAccountService.formatCurrency(periodExpenses)}</div>
              </div>
              <div class="summary-card">
                <div>Final Net Income</div>
                <div class="summary-amount ${netIncomeAfterExpenses >= 0 ? 'income' : 'expense'}">${propertyAccountService.formatCurrency(netIncomeAfterExpenses)}</div>
              </div>
              <div class="summary-card" style="background: #f5f5f5;">
                <div>Available for Payouts</div>
                <div class="summary-amount payout">${propertyAccountService.formatCurrency(account?.runningBalance || 0)}</div>
              </div>
            </div>
          </div>
          
          <div class="transactions-table">
            <h3>Income & Expense Transactions</h3>
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Type</th>
                  <th>Description</th>
                  <th>Amount</th>
                  <th>Balance</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                ${filteredTransactions
                  .filter(transaction => transaction.type !== 'owner_payout')
                  .map(transaction => {
                    const isIncome = transaction.type === 'income';
                    const isExpense = transaction.type === 'expense';
                    
                    let amountDisplay = '';
                    if (isIncome) {
                      amountDisplay = `+${propertyAccountService.formatCurrency(transaction.amount)}`;
                    } else {
                      amountDisplay = `-${propertyAccountService.formatCurrency(transaction.amount)}`;
                    }
                    
                    return `
                      <tr class="${isIncome ? 'income-row' : 'expense-row'}">
                        <td>${new Date(transaction.date).toLocaleDateString()}</td>
                        <td>${propertyAccountService.getTransactionTypeLabel(transaction.type)}</td>
                        <td>${transaction.description}</td>
                        <td style="color: ${isIncome ? '#4caf50' : '#f44336'};">
                          ${amountDisplay}
                        </td>
                        <td>${propertyAccountService.formatCurrency(transaction.runningBalance || 0)}</td>
                        <td>${transaction.status}</td>
                      </tr>
                    `;
                  }).join('')}
              </tbody>
            </table>
          </div>
          
          ${filteredPayouts.length > 0 ? `
          <div class="transactions-table">
            <h3>Owner Payouts (Deductions from Rent)</h3>
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Reference</th>
                  <th>Recipient</th>
                  <th>Amount (Deduction)</th>
                  <th>Payment Method</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                ${filteredPayouts.map(payout => `
                  <tr class="payout-row">
                    <td>${new Date(payout.date).toLocaleDateString()}</td>
                    <td>${payout.referenceNumber}</td>
                    <td>${payout.recipientName}</td>
                    <td style="color: #ff9800; font-weight: bold;">
                      -${propertyAccountService.formatCurrency(payout.amount)} (Deduction)
                    </td>
                    <td>${propertyAccountService.getPaymentMethodLabel(payout.paymentMethod)}</td>
                    <td>${payout.status}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
          ` : ''}
          
          <div class="footer">
            <p>This statement shows all transactions for the specified period. Please keep this for your records.</p>
            <p>Generated by ${companyName} on ${new Date().toLocaleString()}</p>
          </div>
          
          <div class="no-print" style="position: fixed; top: 20px; right: 20px;">
            <button onclick="window.print()" style="padding: 10px 20px; background: #1976d2; color: white; border: none; border-radius: 4px; cursor: pointer;">
              Print Statement
            </button>
            <button onclick="window.close()" style="padding: 10px 20px; background: #666; color: white; border: none; border-radius: 4px; cursor: pointer; margin-left: 10px;">
              Close
            </button>
          </div>
        </body>
        </html>
      `;

      printWindow.document.write(printContent);
      printWindow.document.close();
      setStatementDialogOpen(false);
      
    } catch (err: any) {
      setSubmitError(err.message || 'Failed to generate statement');
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircleIcon color="success" />;
      case 'pending':
        return <PendingIcon color="warning" />;
      case 'failed':
        return <CancelIcon color="error" />;
      case 'cancelled':
        return <CancelIcon color="disabled" />;
      default:
        return null;
    }
  };

  // Prepare transactions and stable, deduplicated view BEFORE any early returns
  const baseTransactions = Array.isArray(account?.transactions) ? account!.transactions : [];
  const { transactions, finalBalance } = propertyAccountService.calculateRunningBalance(baseTransactions);
  const uniqueTransactions: Transaction[] = React.useMemo(() => {
    const seen = new Set<string>();
    const result: Transaction[] = [];
    for (const t of transactions) {
      const paymentId = (t as any)?.paymentId ? String((t as any).paymentId) : '';
      const key = paymentId
        ? `${t.type}:${paymentId}`
        : `${t.type}:${t.referenceNumber || ''}:${new Date(t.date).getTime()}:${Number(t.amount || 0)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(t);
    }
    return result;
  }, [transactions]);

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress />
      </Box>
    );
  }

  if (error || !property) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error">{error || 'Property not found'}</Alert>
      </Box>
    );
  }

  if (!account) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="info">
          No account data available for this property. The account will be created automatically when the first payment is recorded.
        </Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Box sx={{ mb: 3 }}>
        <Typography variant="h4" fontWeight={600} gutterBottom>
          {property.name}
        </Typography>
        {/* Ledger type label */}
        <Chip
          label={(account.ledgerType === 'sale' ? 'Sale Ledger' : 'Rental Ledger')}
          color={account.ledgerType === 'sale' ? 'secondary' : 'primary'}
          size="small"
          sx={{ mb: 1 }}
        />
        <Typography variant="body1" color="text.secondary" gutterBottom>
          {property.address}
        </Typography>
        <script dangerouslySetInnerHTML={{ __html: `
          window.__CURRENT_PROPERTY_ADDRESS__ = ${JSON.stringify(property.address || '')};
          window.__CURRENT_OWNER_NAME__ = ${JSON.stringify(ownerMap[propertyId!] || account.ownerName || '')};
          window.__CURRENT_TENANT_NAME__ = '';
        ` }} />
        <Typography variant="body2" color="text.secondary">
          Owner: {ownerMap[propertyId!] || account.ownerName || 'Unknown'}
        </Typography>
        {account.ownerId && (
          <Typography variant="body2" color="text.secondary">
            Owner ID: {account.ownerId}
          </Typography>
        )}
      </Box>

      {/* Success/Error Messages */}
      {success && (
        <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess(null)}>
          {success}
        </Alert>
      )}
      {submitError && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setSubmitError(null)}>
          {submitError}
        </Alert>
      )}

      {/* Summary Cards */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center">
                <AccountBalanceIcon color="primary" sx={{ mr: 1 }} />
                <Typography variant="h6">Current Balance</Typography>
              </Box>
              <Typography variant="h4" color="primary" sx={{ mt: 1 }}>
                {propertyAccountService.formatCurrency(account.runningBalance)}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center">
                <TrendingUpIcon color="success" sx={{ mr: 1 }} />
                <Typography variant="h6">Total Income</Typography>
              </Box>
              <Typography variant="h4" color="success.main" sx={{ mt: 1 }}>
                {propertyAccountService.formatCurrency(account.totalIncome)}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center">
                <TrendingDownIcon color="error" sx={{ mr: 1 }} />
                <Typography variant="h6">Total Expenses</Typography>
              </Box>
              <Typography variant="h4" color="error.main" sx={{ mt: 1 }}>
                {propertyAccountService.formatCurrency(account.totalExpenses)}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center">
                <PaymentIcon color="info" sx={{ mr: 1 }} />
                <Typography variant="h6">Total Payouts</Typography>
              </Box>
              <Typography variant="h4" color="info.main" sx={{ mt: 1 }}>
                {propertyAccountService.formatCurrency(account.totalOwnerPayouts)}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Owner Information Card + Deposits Held (side by side) */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Property Owner Information
              </Typography>
              <Typography variant="body1" sx={{ mb: 1 }}>
                <strong>Name:</strong> {ownerMap[propertyId!] || account.ownerName || 'Unknown'}
              </Typography>
              {account.ownerId && (
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                  <strong>Owner ID:</strong> {account.ownerId}
                </Typography>
              )}
              <Typography variant="body2" color="text.secondary">
                <strong>Property:</strong> {property.name}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={6}>
          <Card sx={{ cursor: 'pointer' }} onClick={() => window.open(`/accountant-dashboard/property-accounts/${propertyId}/deposits`, '_self')}>
            <CardContent>
              <Box display="flex" alignItems="center">
                <HistoryIcon color="info" sx={{ mr: 1 }} />
                <Typography variant="h6">Deposits Held</Typography>
              </Box>
              <Typography variant="h4" color="info.main" sx={{ mt: 1 }}>
                {propertyAccountService.formatCurrency(depositSummary?.held || 0)}
              </Typography>
              <Divider sx={{ my: 1 }} />
              <Typography variant="body2" color="text.secondary">
                Paid: {propertyAccountService.formatCurrency(depositSummary?.totalPaid || 0)} | Payouts: {propertyAccountService.formatCurrency(depositSummary?.totalPayout || 0)}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Action Buttons */}
      <Box sx={{ mb: 3 }}>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => setExpenseDialogOpen(true)}
          sx={{ mr: 2 }}
        >
          Add Expense
        </Button>
        <Button
          variant="contained"
          color="secondary"
          startIcon={<PaymentIcon />}
          onClick={handleOpenPayoutDialog}
          disabled={account.runningBalance <= 0}
        >
          Pay Owner
        </Button>
      </Box>

      {/* Tabs */}
      <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Tabs value={tabValue} onChange={handleTabChange}>
          <Tab label="Transactions" />
          <Tab label="Owner Payouts" />
          <Tab label="Levies" />
          <Tab label="Summary" />
        </Tabs>
      </Box>

      {/* Transactions Tab */}
      <TabPanel value={tabValue} index={0}>
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Date</TableCell>
                <TableCell>Type</TableCell>
                <TableCell>Description</TableCell>
                <TableCell>Amount</TableCell>
                <TableCell>Balance</TableCell>
                <TableCell>Status</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {uniqueTransactions.map((transaction, index) => (
                <TableRow key={String((transaction as any)?._id || (transaction as any)?.paymentId || index)}>
                  <TableCell>{new Date(transaction.date).toLocaleDateString()}</TableCell>
                  <TableCell>
                    <Chip
                      label={propertyAccountService.getTransactionTypeLabel(transaction.type)}
                      color={transaction.type === 'income' ? 'success' : 'default'}
                      size="small"
                    />
                  </TableCell>
                  <TableCell>{transaction.description}</TableCell>
                  <TableCell>
                    <Typography
                      color={transaction.type === 'income' ? 'success.main' : 'error.main'}
                    >
                      {transaction.type === 'income' ? '+' : '-'}
                      {propertyAccountService.formatCurrency(transaction.amount)}
                    </Typography>
                  </TableCell>
                  <TableCell>{propertyAccountService.formatCurrency(transaction.runningBalance || 0)}</TableCell>
                  <TableCell>
                    <Chip
                      label={transaction.status}
                      color={transaction.status === 'completed' ? 'success' : 'warning'}
                      size="small"
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </TabPanel>

      {/* Owner Payouts Tab */}
      <TabPanel value={tabValue} index={1}>
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Date</TableCell>
                <TableCell>Reference</TableCell>
                <TableCell>Recipient</TableCell>
                <TableCell>Amount</TableCell>
                <TableCell>Method</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {account.ownerPayouts.map((payout) => (
                <TableRow key={payout._id}>
                  <TableCell>{new Date(payout.date).toLocaleDateString()}</TableCell>
                  <TableCell>{payout.referenceNumber}</TableCell>
                  <TableCell>{payout.recipientName}</TableCell>
                  <TableCell>{propertyAccountService.formatCurrency(payout.amount)}</TableCell>
                  <TableCell>{propertyAccountService.getPaymentMethodLabel(payout.paymentMethod)}</TableCell>
                  <TableCell>
                    <Box display="flex" alignItems="center">
                      {getStatusIcon(payout.status)}
                      <Typography sx={{ ml: 1 }}>{payout.status}</Typography>
                    </Box>
                  </TableCell>
                  <TableCell>
                    <Box>
                      {payout.status === 'pending' && (
                        <>
                          <Tooltip title="Mark as Completed">
                            <IconButton
                              size="small"
                              color="success"
                              onClick={() => handleUpdatePayoutStatus(payout._id!, 'completed')}
                            >
                              <CheckCircleIcon />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Mark as Failed">
                            <IconButton
                              size="small"
                              color="error"
                              onClick={() => handleUpdatePayoutStatus(payout._id!, 'failed')}
                            >
                              <CancelIcon />
                            </IconButton>
                          </Tooltip>
                        </>
                      )}
                      {payout.status === 'completed' && (
                        <Tooltip title="Print Acknowledgement Receipt">
                          <IconButton
                            size="small"
                            color="primary"
                            onClick={() => handlePrintAcknowledgement(payout)}
                          >
                            <PrintIcon />
                          </IconButton>
                        </Tooltip>
                      )}
                    </Box>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </TabPanel>

      {/* Levies Tab */}
      <TabPanel value={tabValue} index={2}>
        <Paper sx={{ p: 2 }}>
          <Typography variant="h6" gutterBottom>Levies</Typography>
          {levyRows.length === 0 ? (
            <Typography color="text.secondary">No levy payments found for this property.</Typography>
          ) : (
            <TableContainer>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>Date</TableCell>
                    <TableCell>Reference</TableCell>
                    <TableCell>Amount</TableCell>
                    <TableCell>Method</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell>Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {levyRows.map((row: any) => (
                    <TableRow key={row._id}>
                      <TableCell>{row.paymentDate ? new Date(row.paymentDate).toLocaleDateString() : '-'}</TableCell>
                      <TableCell>{row.referenceNumber || '-'}</TableCell>
                      <TableCell>{propertyAccountService.formatCurrency(Number(row.amount) || 0)}</TableCell>
                      <TableCell>{(row.paymentMethod || '').toString().replace('_',' ')}</TableCell>
                      <TableCell>
                        {row?.payout?.paidOut ? (
                          <Chip label="Paid Out" color="success" size="small" variant="outlined" />
                        ) : (
                          <Chip label={(row.status || '').toString()} size="small" variant="outlined" />
                        )}
                      </TableCell>
                      <TableCell>
                        <Box sx={{ display: 'flex', gap: 1 }}>
                          <Tooltip title="Initiate Payout">
                            <IconButton
                              color="success"
                              size="small"
                              onClick={() => {
                                setPayoutRow(row);
                                const addr = (row?.propertyId && typeof row.propertyId === 'object') ? (row.propertyId.address || '') : '';
                                const baseRef = String(row.referenceNumber || row._id || '').toUpperCase();
                                const suffix = new Date().toISOString().slice(0,10).replace(/-/g, '');
                                const autoRef = `LPY-${baseRef.slice(-6)}-${suffix}`;
                                setPayoutForm({ paidToName: '', paidToAccount: addr, paidToContact: '', payoutDate: new Date().toISOString().slice(0,10), payoutMethod: 'bank_transfer', payoutReference: autoRef, notes: '' });
                                setPayoutOpen(true);
                              }}
                            >
                              <PaidIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </Box>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </Paper>

        <Dialog open={payoutOpen} onClose={() => setPayoutOpen(false)} maxWidth="sm" fullWidth>
          <DialogContent>
            <Typography variant="h6" sx={{ mb: 2 }}>Initiate Levy Payout</Typography>
            <Grid container spacing={2}>
              <Grid item xs={12}><TextField fullWidth label="Paid To (Association Name)" value={payoutForm.paidToName} onChange={(e)=>setPayoutForm(f=>({...f, paidToName: e.target.value}))} /></Grid>
              <Grid item xs={12} sm={6}><TextField fullWidth label="Account" value={payoutForm.paidToAccount} onChange={(e)=>setPayoutForm(f=>({...f, paidToAccount: e.target.value}))} /></Grid>
              <Grid item xs={12} sm={6}><TextField fullWidth label="Contact" value={payoutForm.paidToContact} onChange={(e)=>setPayoutForm(f=>({...f, paidToContact: e.target.value}))} /></Grid>
              <Grid item xs={12} sm={6}><TextField fullWidth type="date" label="Payout Date" InputLabelProps={{ shrink: true }} value={payoutForm.payoutDate} onChange={(e)=>setPayoutForm(f=>({...f, payoutDate: e.target.value}))} /></Grid>
              <Grid item xs={12} sm={6}>
                <FormControl fullWidth>
                  <InputLabel>Payout Method</InputLabel>
                  <Select
                    label="Payout Method"
                    value={payoutForm.payoutMethod}
                    onChange={(e)=>setPayoutForm(f=>({...f, payoutMethod: e.target.value as string}))}
                  >
                    <MenuItem value="cash">Cash</MenuItem>
                    <MenuItem value="bank_transfer">Bank Transfer</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} sm={6}><TextField fullWidth label="Payout Reference" value={payoutForm.payoutReference} onChange={(e)=>setPayoutForm(f=>({...f, payoutReference: e.target.value}))} /></Grid>
              <Grid item xs={12}><TextField fullWidth label="Notes" value={payoutForm.notes} onChange={(e)=>setPayoutForm(f=>({...f, notes: e.target.value}))} /></Grid>
            </Grid>
            <Box sx={{ display:'flex', justifyContent:'flex-end', gap:1, mt:2 }}>
              <Button onClick={()=>setPayoutOpen(false)}>Cancel</Button>
              <Button variant="contained" onClick={async ()=>{
                try {
                  if (!payoutRow?._id) return;
                  const updated = await paymentService.initiateLevyPayout(payoutRow._id, payoutForm);
                  // refresh list
                  if (user?.companyId) {
                    const all = await paymentService.getLevyPayments(user.companyId);
                    const filtered = (Array.isArray(all) ? all : []).filter((p: any) => String(p?.propertyId?._id || p?.propertyId) === String(propertyId));
                    setLevyRows(filtered);
                  }
                  setPayoutOpen(false);
                  // open acknowledgement
                  const html = await paymentService.getLevyPayoutAcknowledgement(payoutRow._id, user?.companyId);
                  const win = window.open('', '_blank');
                  if (win) { win.document.write(html); win.document.close(); win.focus(); }
                } catch (err) {
                  console.error('Failed to initiate payout', err);
                  alert('Failed to initiate payout');
                }
              }}>Save & Print Acknowledgement</Button>
            </Box>
          </DialogContent>
        </Dialog>
      </TabPanel>

      {/* Summary Tab */}
      <TabPanel value={tabValue} index={3}>
        <Grid container spacing={3}>
          <Grid item xs={12} md={6}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>Account Summary</Typography>
                <Box sx={{ mt: 2 }}>
                  <Typography variant="body2" color="text.secondary">
                    Last Income: {account.lastIncomeDate ? new Date(account.lastIncomeDate).toLocaleDateString() : 'Never'}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Last Expense: {account.lastExpenseDate ? new Date(account.lastExpenseDate).toLocaleDateString() : 'Never'}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Last Payout: {account.lastPayoutDate ? new Date(account.lastPayoutDate).toLocaleDateString() : 'Never'}
                  </Typography>
                </Box>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} md={6}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>Quick Actions</Typography>
                <Box sx={{ mt: 2 }}>
                  <Button
                    variant="outlined"
                    fullWidth
                    sx={{ mb: 1 }}
                    onClick={() => setExpenseDialogOpen(true)}
                  >
                    Add Expense
                  </Button>
                  <Button
                    variant="outlined"
                    fullWidth
                    sx={{ mb: 1 }}
                    onClick={handleOpenPayoutDialog}
                    disabled={account.runningBalance <= 0}
                  >
                    Pay Owner
                  </Button>
                  <Button
                    variant="outlined"
                    fullWidth
                    sx={{ mb: 1 }}
                    onClick={() => setStatementDialogOpen(true)}
                    startIcon={<PrintIcon />}
                  >
                    Print Statement
                  </Button>
                </Box>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      </TabPanel>

      {/* Add Expense Dialog */}
      <Dialog open={expenseDialogOpen} onClose={() => setExpenseDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Add Expense</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12} sm={6}>
              <TextField
                label="Amount"
                type="number"
                value={expenseData.amount}
                onChange={(e) => setExpenseData({ ...expenseData, amount: Number(e.target.value) })}
                fullWidth
                required
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                label="Date"
                type="date"
                value={expenseData.date.toISOString().split('T')[0]}
                onChange={(e) => setExpenseData({ ...expenseData, date: new Date(e.target.value) })}
                fullWidth
                required
                InputLabelProps={{ shrink: true }}
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                label="Description"
                value={expenseData.description}
                onChange={(e) => setExpenseData({ ...expenseData, description: e.target.value })}
                fullWidth
                required
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth>
                <InputLabel>Category</InputLabel>
                <Select
                  value={expenseData.category}
                  onChange={(e) => setExpenseData({ ...expenseData, category: e.target.value })}
                  label="Category"
                >
                  <MenuItem value="general">General</MenuItem>
                  <MenuItem value="repair">Repair</MenuItem>
                  <MenuItem value="maintenance">Maintenance</MenuItem>
                  <MenuItem value="utilities">Utilities</MenuItem>
                  <MenuItem value="other">Other</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12}>
              <TextField
                label="Notes"
                value={expenseData.notes}
                onChange={(e) => setExpenseData({ ...expenseData, notes: e.target.value })}
                fullWidth
                multiline
                rows={3}
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setExpenseDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleAddExpense} variant="contained" disabled={submitting}>
            {submitting ? <CircularProgress size={24} /> : 'Add Expense'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Create Payout Dialog */}
      <Dialog open={payoutDialogOpen} onClose={() => setPayoutDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Pay Property Owner</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12} sm={6}>
              <TextField
                label="Amount"
                type="number"
                value={payoutData.amount}
                onChange={(e) => setPayoutData({ ...payoutData, amount: Number(e.target.value) })}
                fullWidth
                required
                helperText={`Available balance: ${propertyAccountService.formatCurrency(account.runningBalance)}`}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth>
                <InputLabel>Payment Method</InputLabel>
                <Select
                  value={payoutData.paymentMethod}
                  onChange={(e) => setPayoutData({ ...payoutData, paymentMethod: e.target.value as any })}
                  label="Payment Method"
                >
                  <MenuItem value="bank_transfer">Bank Transfer</MenuItem>
                  <MenuItem value="cash">Cash</MenuItem>
                  <MenuItem value="mobile_money">Mobile Money</MenuItem>
                  <MenuItem value="check">Check</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12}>
              <TextField
                label="Recipient Name"
                value={payoutData.recipientName}
                onChange={(e) => setPayoutData({ ...payoutData, recipientName: e.target.value })}
                fullWidth
                required
                helperText="Pre-populated with property owner name"
                InputProps={{
                  readOnly: false,
                  style: { backgroundColor: payoutData.recipientName === (propertyId ? ownerMap[propertyId] || account?.ownerName : account?.ownerName) ? '#f5f5f5' : 'white' }
                }}
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                label="Notes"
                value={payoutData.notes}
                onChange={(e) => setPayoutData({ ...payoutData, notes: e.target.value })}
                fullWidth
                multiline
                rows={3}
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPayoutDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleCreatePayout} variant="contained" disabled={submitting}>
            {submitting ? <CircularProgress size={24} /> : 'Create Payout'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Print Statement Dialog */}
      <Dialog open={statementDialogOpen} onClose={() => setStatementDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Print Property Statement</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12}>
              <FormControl fullWidth>
                <InputLabel>Statement Period</InputLabel>
                <Select
                  value={statementData.includeAllTransactions ? 'all' : 'period'}
                  onChange={(e) => setStatementData({ 
                    ...statementData, 
                    includeAllTransactions: e.target.value === 'all' 
                  })}
                  label="Statement Period"
                >
                  <MenuItem value="period">Specific Period</MenuItem>
                  <MenuItem value="all">All Transactions</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            {!statementData.includeAllTransactions && (
              <>
                <Grid item xs={12} sm={6}>
                  <TextField
                    label="Start Date"
                    type="date"
                    value={statementData.startDate.toISOString().split('T')[0]}
                    onChange={(e) => setStatementData({ 
                      ...statementData, 
                      startDate: new Date(e.target.value) 
                    })}
                    fullWidth
                    required
                    InputLabelProps={{ shrink: true }}
                  />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField
                    label="End Date"
                    type="date"
                    value={statementData.endDate.toISOString().split('T')[0]}
                    onChange={(e) => setStatementData({ 
                      ...statementData, 
                      endDate: new Date(e.target.value) 
                    })}
                    fullWidth
                    required
                    InputLabelProps={{ shrink: true }}
                  />
                </Grid>
              </>
            )}
            <Grid item xs={12}>
              <Alert severity="info">
                <Typography variant="body2">
                  <strong>Property:</strong> {property?.name}<br />
                  <strong>Owner:</strong> {ownerMap[propertyId!] || account?.ownerName || 'Unknown'}<br />
                  <strong>Address:</strong> {property?.address}<br />
                  <strong>Company:</strong> {company?.name}
                </Typography>
              </Alert>
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setStatementDialogOpen(false)}>Cancel</Button>
          <Button onClick={handlePrintStatement} variant="contained" disabled={submitting}>
            {submitting ? <CircularProgress size={24} /> : 'Print Statement'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default PropertyAccountDetailPage; 