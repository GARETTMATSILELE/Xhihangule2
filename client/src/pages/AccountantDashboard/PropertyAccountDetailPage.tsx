import React, { useCallback, useEffect, useRef, useState } from 'react';
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
  Divider,
  FormControlLabel,
  Switch
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
import { propertyAccountService, PropertyAccount, Transaction, OwnerPayout, ExpenseData, OpeningBalanceData, PayoutData } from '../../services/propertyAccountService';
import { useAuth } from '../../contexts/AuthContext';
import { usePropertyOwnerService, PropertyOwner } from '../../services/propertyOwnerService';
import paymentService from '../../services/paymentService';
import { Paid as PaidIcon } from '@mui/icons-material';
import { developmentService } from '../../services/developmentService';
import { developmentUnitService } from '../../services/developmentUnitService';
import { OwnerStatementDTO, OwnerStatementPreview, reportingService, ReportFormat } from '../../reporting';
import { explainDashboardRent, resolveTotalAmountReceived } from '../../reporting/totalAmountReceived';
import { usePropertyAccountLiveRefresh, PropertyAccountRefreshSource } from '../../hooks/usePropertyAccountLiveRefresh';
import { PropertyAccountChangeIds } from '../../utils/paymentsChanged';

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

const RENT_MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

interface TransactionPaymentBreakdown {
  totalCommission: number;
  vatOnCommission: number;
  ownerAmount: number;
  levy: number;
  paymentAmount?: number;
  depositAmount?: number;
  allocationGross?: number;
  grossRent?: number;
  rentUsed?: number;
  rentAllocated?: number;
  levyAllocated?: number;
  commissionBase?: number;
  rentalPeriodMonth?: number;
  rentalPeriodYear?: number;
  advanceMonthsPaid?: number;
  advancePeriodStart?: { month?: number; year?: number };
  advancePeriodEnd?: { month?: number; year?: number };
  paymentType?: string;
}

const periodPoint = (month?: number, year?: number): { month: number; year: number } | undefined => {
  const rentalMonth = Number(month);
  const rentalYear = Number(year);
  if (!Number.isInteger(rentalMonth) || !Number.isInteger(rentalYear) || rentalMonth < 1 || rentalMonth > 12 || rentalYear < 1900) {
    return undefined;
  }
  return { month: rentalMonth, year: rentalYear };
};

const rentalPeriodDescription = (payment?: TransactionPaymentBreakdown): string | undefined => {
  if (!payment) return undefined;
  const start = periodPoint(payment.advancePeriodStart?.month, payment.advancePeriodStart?.year)
    || periodPoint(payment.rentalPeriodMonth, payment.rentalPeriodYear);
  if (!start) return undefined;
  const monthsPaid = Number(payment.advanceMonthsPaid || 0);
  const explicitEnd = periodPoint(payment.advancePeriodEnd?.month, payment.advancePeriodEnd?.year);
  const end = explicitEnd || (monthsPaid > 1
    ? {
        year: Math.floor((start.year * 12 + (start.month - 1) + monthsPaid - 1) / 12),
        month: ((start.year * 12 + (start.month - 1) + monthsPaid - 1) % 12) + 1
      }
    : start);
  if (end.year === start.year && end.month === start.month) {
    return `${RENT_MONTHS[start.month - 1]} ${start.year} Rent`;
  }
  if (end.year === start.year) {
    return `${RENT_MONTHS[start.month - 1]}–${RENT_MONTHS[end.month - 1]} ${start.year} Rent`;
  }
  return `${RENT_MONTHS[start.month - 1]} ${start.year}–${RENT_MONTHS[end.month - 1]} ${end.year} Rent`;
};

const moneyOrDash = (amount: number | undefined, format: (value: number) => string): string => {
  if (amount == null || !Number.isFinite(amount) || Math.abs(amount) < 0.005) return '—';
  return format(amount);
};

const PropertyAccountDetailPage: React.FC = () => {
  const { propertyId } = useParams<{ propertyId: string }>();
  const location = useLocation();
  const { user, company } = useAuth();
  const { getProperty } = usePropertyService();
  const { getSalesById, getByPropertyId, getSalesByPropertyId } = usePropertyOwnerService();
  
  // State
  const [property, setProperty] = useState<any>(null);
  const [account, setAccount] = useState<PropertyAccount | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tabValue, setTabValue] = useState(0);
  const [ownerMap, setOwnerMap] = useState<Record<string, string>>({});
  const [depositSummary, setDepositSummary] = useState<{ totalPaid: number; totalPayout: number; held: number } | null>(null);
  const [paymentBreakdowns, setPaymentBreakdowns] = useState<Record<string, TransactionPaymentBreakdown>>({});
  
  // Dialog states
  const [expenseDialogOpen, setExpenseDialogOpen] = useState(false);
  const [openingBalanceDialogOpen, setOpeningBalanceDialogOpen] = useState(false);
  const [payoutDialogOpen, setPayoutDialogOpen] = useState(false);
  const [statementDialogOpen, setStatementDialogOpen] = useState(false);
  const [expenseData, setExpenseData] = useState<ExpenseData>({
    amount: 0,
    date: new Date(),
    description: '',
    category: 'general',
    notes: ''
  });
  const [openingBalanceData, setOpeningBalanceData] = useState<OpeningBalanceData>({
    amount: 0,
    direction: 'credit',
    date: new Date(),
    description: '',
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
    includeAllTransactions: true
  });
  const [enterpriseStatement, setEnterpriseStatement] = useState<OwnerStatementDTO | null>(null);
  const [enterpriseStatementLoading, setEnterpriseStatementLoading] = useState(false);
  const enterpriseStatementPrintRef = useRef<HTMLDivElement | null>(null);
  
  // Form states
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showAuditRows, setShowAuditRows] = useState(false);
  const refreshInFlightRef = useRef(false);
  const refreshPendingRef = useRef(false);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const accountRef = useRef<PropertyAccount | null>(null);
  accountRef.current = account;

  // Levies state and payout controls (moved before any early returns to satisfy Hooks rules)
  const [levyRows, setLevyRows] = useState<any[]>([]);
  const [leviesLoaded, setLeviesLoaded] = useState(false);
  const [payoutOpen, setPayoutOpen] = useState(false);
  const [payoutRow, setPayoutRow] = useState<any>(null);
  const [payoutForm, setPayoutForm] = useState({ paidToName: '', paidToAccount: '', paidToContact: '', payoutDate: '', payoutMethod: 'bank_transfer', payoutReference: '', notes: '' });

  useEffect(() => {
    setEnterpriseStatement(null);
  }, [propertyId, statementData.startDate, statementData.endDate, statementData.includeAllTransactions]);

  useEffect(() => {
    const fetchData = async () => {
      if (!propertyId) return;
      
      setLoading(true);
      setError(null);
      try {
        // Try fetch property first to determine ledger type; gracefully handle development/unit IDs
        const search = new URLSearchParams(location.search);
        let found: any = null;
        try {
          found = await getProperty(propertyId);
        } catch {}
        setProperty(found || null);

        const inferredLedger = (search.get('ledger') === 'sale' || (!search.get('ledger') && ((found as any)?.rentalType === 'sale' || !found)))
          ? 'sale'
          : 'rental';

        // Fetch account and deposit summary in parallel
        const [accountData, depositSum] = await Promise.all([
          propertyAccountService.getPropertyAccount(propertyId, inferredLedger),
          paymentService.getPropertyDepositSummary(propertyId).catch(() => null)
        ]);
        setAccount(accountData);
        if (depositSum) setDepositSummary(depositSum);
        try {
          const payments = await paymentService.getPayments({ propertyId });
          const map: Record<string, TransactionPaymentBreakdown> = {};
          for (const p of Array.isArray(payments) ? payments : []) {
            const cd = (p as any)?.commissionDetails || {};
            map[String((p as any)._id)] = {
              totalCommission: Number(cd.totalCommission || 0),
              vatOnCommission: Number(cd.vatOnCommission || cd.vatAmount || 0),
              ownerAmount: Number(cd.ownerAmount || 0),
              levy: Number(cd.levy || (p as any).levyAllocated || 0),
              paymentAmount: Number((p as any).amount || 0),
              depositAmount: Number((p as any).depositAmount || 0),
              allocationGross: Number(cd.paymentAllocation?.grossAmount || 0),
              grossRent: Number(cd.grossRent || 0),
              rentUsed: (p as any).rentUsed,
              rentAllocated: (p as any).rentAllocated,
              levyAllocated: (p as any).levyAllocated,
              commissionBase: cd.commissionBase,
              rentalPeriodMonth: (p as any).rentalPeriodMonth,
              rentalPeriodYear: (p as any).rentalPeriodYear,
              advanceMonthsPaid: (p as any).advanceMonthsPaid,
              advancePeriodStart: (p as any).advancePeriodStart,
              advancePeriodEnd: (p as any).advancePeriodEnd,
              paymentType: (p as any).paymentType
            };
          }
          setPaymentBreakdowns(map);
        } catch {
          setPaymentBreakdowns({});
        }
        // If property could not be fetched (development/unit), fallback to account metadata
        if (!found && accountData) {
          const fallback: any = {
            name: (accountData as any).propertyName || 'Development/Unit Account',
            address: (accountData as any).propertyAddress || ''
          };
          try {
            // Attempt to enrich using development/development unit endpoints
            // Development first
            const dev = await (async () => {
              try { return await developmentService.getById(propertyId); } catch { return null; }
            })();
            if (dev && (dev as any).name) {
              fallback.name = (dev as any).name;
              fallback.address = (dev as any).address || fallback.address;
            } else {
              // Try unit; if found, attempt to construct label
              const unit = await (async () => {
                try { return await (developmentUnitService as any).get?.(propertyId); } catch { return null; }
              })();
              if (unit) {
                const label = (unit as any).unitCode || ((unit as any).unitNumber ? `Unit ${(unit as any).unitNumber}` : 'Development Unit');
                fallback.name = `${label}${(accountData as any).propertyName ? ` - ${(accountData as any).propertyName}` : ''}`;
              }
            }
          } catch {}
          setProperty(fallback);
        }

        // Resolve owner name:
        // - For non-development sale properties: prefer SalesOwner matched by properties array
        // - Otherwise: use property-owners cross-reference
        const map: Record<string, string> = {};
        if (found) {
          const key = String((found as any)._id);
          let resolved = false;
          if (inferredLedger === 'sale') {
            try {
              const salesOwner = await getSalesByPropertyId(propertyId);
              if (salesOwner && (salesOwner.firstName || salesOwner.lastName)) {
                map[key] = `${salesOwner.firstName || ''} ${salesOwner.lastName || ''}`.trim();
                resolved = true;
              }
            } catch {
              // proceed to fallback
            }
          }
          if (!resolved) {
            try {
              const owner = await getByPropertyId(propertyId, (company as any)?.id || (company as any)?._id);
              if (owner && (owner.firstName || owner.lastName)) {
                map[key] = `${owner.firstName || ''} ${owner.lastName || ''}`.trim();
                resolved = true;
              }
            } catch {
              // Fallback for historical sales: try sales-owners by propertyOwnerId
              if (inferredLedger === 'sale') {
                try {
                  const raw = (found as any).propertyOwnerId;
                  const ownerId = typeof raw === 'object' && raw && (raw as any).$oid ? (raw as any).$oid : (raw ? String(raw) : '');
                  if (ownerId) {
                    const salesOwner = await getSalesById(ownerId);
                    if (salesOwner && (salesOwner.firstName || salesOwner.lastName)) {
                      map[key] = `${salesOwner.firstName || ''} ${salesOwner.lastName || ''}`.trim();
                      resolved = true;
                    }
                  }
                } catch {
                  // ignore; UI will fall back to account.ownerName
                }
              }
            }
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

  const silentRefreshAccount = useCallback(async () => {
    if (!propertyId) return;
    if (refreshInFlightRef.current) {
      refreshPendingRef.current = true;
      return;
    }
    refreshInFlightRef.current = true;
    try {
      if (process.env.NODE_ENV !== 'production') {
        console.debug('Property account refresh triggered');
      }
      const requested = new URLSearchParams(location.search).get('ledger');
      const refreshLedger: 'rental' | 'sale' = requested === 'sale' || requested === 'rental'
        ? requested
        : (!property || (property as any).rentalType === 'sale' ? 'sale' : 'rental');
      const [accountData, depositSum] = await Promise.all([
        propertyAccountService.getPropertyAccount(propertyId, refreshLedger),
        paymentService.getPropertyDepositSummary(propertyId).catch(() => null)
      ]);
      setAccount(accountData);
      if (depositSum) setDepositSummary(depositSum);
      if (process.env.NODE_ENV !== 'production') {
        console.debug('Property account refreshed successfully');
      }
    } catch (err) {
      console.error('Property account refresh failed (keeping current data)', err);
    } finally {
      refreshInFlightRef.current = false;
      if (refreshPendingRef.current) {
        refreshPendingRef.current = false;
        void silentRefreshAccount();
      }
    }
  }, [propertyId, location.search, property]);

  const scheduleAccountRefresh = useCallback(() => {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    refreshTimerRef.current = setTimeout(() => {
      refreshTimerRef.current = null;
      void silentRefreshAccount();
    }, 400);
  }, [silentRefreshAccount]);

  useEffect(() => {
    return () => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    };
  }, []);

  usePropertyAccountLiveRefresh((source: PropertyAccountRefreshSource, ids: PropertyAccountChangeIds) => {
    if (source === 'reconnect' || source === 'visibility') {
      scheduleAccountRefresh();
      return;
    }

    const currentAccountId = accountRef.current?._id ? String(accountRef.current._id) : '';
    const currentPropertyId = propertyId ? String(propertyId) : '';
    const accountPropertyId = accountRef.current?.propertyId ? String(accountRef.current.propertyId) : '';

    if (ids.accountId) {
      if (currentAccountId && ids.accountId !== currentAccountId) return;
    } else if (ids.propertyId) {
      if (
        ids.propertyId !== currentPropertyId &&
        ids.propertyId !== accountPropertyId
      ) {
        return;
      }
    } else if (source === 'socket') {
      return;
    }

    scheduleAccountRefresh();
  });

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
      const updatedAccount = await propertyAccountService.addExpense(
        propertyId,
        expenseData
      );
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

  const handleAddOpeningBalanceAdjustment = async () => {
    if (!propertyId) return;

    setSubmitting(true);
    setSubmitError(null);
    setSuccess(null);

    try {
      const updatedAccount = await propertyAccountService.addOpeningBalanceAdjustment(
        propertyId,
        openingBalanceData
      );
      setAccount(updatedAccount);
      setOpeningBalanceDialogOpen(false);
      setOpeningBalanceData({
        amount: 0,
        direction: 'credit',
        date: new Date(),
        description: '',
        notes: ''
      });
      setSuccess('Opening balance adjustment added successfully!');
    } catch (err: any) {
      setSubmitError(err.message || 'Failed to add opening balance adjustment');
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
      const result = await propertyAccountService.createOwnerPayout(
        propertyId,
        payoutData
      );
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

  const getEnterpriseStatementPeriod = () => {
    const baseDate = statementData.startDate || new Date();
    const year = baseDate.getFullYear();
    const month = String(baseDate.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
  };

  const getEnterpriseStatementPropertyId = () => {
    const accountPropertyId = (account?.propertyId as any)?._id || account?.propertyId;
    return String(accountPropertyId || propertyId || '');
  };

  const toStatementDateParam = (date: Date) => date.toISOString().slice(0, 10);

  const getEnterpriseStatementQuery = () => {
    const ledgerType = account?.ledgerType === 'sale' ? 'sale' as const : 'rental' as const;
    if (statementData.includeAllTransactions) {
      return { includeAllTransactions: true, ledgerType };
    }
    return {
      from: toStatementDateParam(statementData.startDate),
      to: toStatementDateParam(statementData.endDate),
      ledgerType
    };
  };

  const handleLoadEnterpriseStatement = async () => {
    const statementPropertyId = getEnterpriseStatementPropertyId();
    if (!statementPropertyId) return;
    setEnterpriseStatementLoading(true);
    setSubmitError(null);
    try {
      const statement = await reportingService.getOwnerStatement(statementPropertyId, getEnterpriseStatementQuery());
      setEnterpriseStatement(statement);
    } catch (err: any) {
      setSubmitError(err?.message || 'Failed to load enterprise owner statement');
    } finally {
      setEnterpriseStatementLoading(false);
    }
  };

  const handleDownloadEnterpriseStatement = async (format: ReportFormat) => {
    const statementPropertyId = getEnterpriseStatementPropertyId();
    if (!statementPropertyId) return;
    setEnterpriseStatementLoading(true);
    setSubmitError(null);
    try {
      const blob = await reportingService.downloadOwnerStatement(statementPropertyId, format, getEnterpriseStatementQuery());
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `owner-statement-${statementPropertyId}-${getEnterpriseStatementPeriod()}.${format === 'excel' ? 'xls' : format}`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      setSubmitError(err?.message || `Failed to download ${format.toUpperCase()} statement`);
    } finally {
      setEnterpriseStatementLoading(false);
    }
  };

  const handlePrintEnterpriseStatement = () => {
    if (!enterpriseStatement || !enterpriseStatementPrintRef.current) return;
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      setSubmitError('Unable to open print window. Please allow pop-ups and try again.');
      return;
    }

    const statementHtml = (
      enterpriseStatementPrintRef.current.querySelector('.property-account-statement') as HTMLElement | null
    )?.outerHTML || enterpriseStatementPrintRef.current.outerHTML;

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Property Account Statement</title>
          <style>
            @page { size: A4 landscape; margin: 10mm; }
            html, body { margin: 0; padding: 0; background: #ffffff; color: #0f172a; }
            body { width: auto; }
            .property-account-statement,
            .property-account-statement.is-sheet {
              width: 100% !important;
              min-height: 0 !important;
              max-width: none !important;
              margin: 0 !important;
              padding: 0 !important;
              box-shadow: none !important;
              background: #fff !important;
            }
            .statement-table { width: 100%; table-layout: fixed; border-collapse: collapse; }
            .statement-table col:nth-child(1), .statement-table th:nth-child(1) { width: 8% !important; }
            .statement-table col:nth-child(2), .statement-table th:nth-child(2) { width: 7% !important; }
            .statement-table col:nth-child(3), .statement-table th:nth-child(3) { width: 13% !important; }
            .statement-table col:nth-child(4), .statement-table th:nth-child(4) { width: 12% !important; }
            .statement-table col:nth-child(5), .statement-table th:nth-child(5) { width: 10% !important; }
            .statement-table col:nth-child(6), .statement-table th:nth-child(6) { width: 12% !important; }
            .statement-table col:nth-child(7), .statement-table th:nth-child(7) { width: 8% !important; }
            .statement-table col:nth-child(8), .statement-table th:nth-child(8) { width: 16% !important; }
            .statement-table col:nth-child(9), .statement-table th:nth-child(9) { width: 14% !important; }
            .statement-table thead { display: table-header-group; }
            .statement-table tfoot { display: table-footer-group; }
            .statement-table tbody tr, .statement-table tfoot tr { break-inside: avoid; page-break-inside: avoid; }
            button, .no-print { display: none !important; }
          </style>
        </head>
        <body>${statementHtml}</body>
      </html>
    `);
    printWindow.document.close();
    const printWhenReady = () => {
      const images = Array.from(printWindow.document.images || []);
      if (!images.length) {
        printWindow.focus();
        printWindow.print();
        return;
      }
      let pending = images.length;
      const done = () => {
        pending -= 1;
        if (pending <= 0) {
          printWindow.focus();
          printWindow.print();
        }
      };
      images.forEach((image) => {
        if (image.complete) done();
        else {
          image.addEventListener('load', done, { once: true });
          image.addEventListener('error', done, { once: true });
        }
      });
    };
    if (printWindow.document.readyState === 'complete') printWhenReady();
    else printWindow.addEventListener('load', printWhenReady, { once: true });
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
  const payoutTransactions: Transaction[] = Array.isArray(account?.ownerPayouts)
    ? account!.ownerPayouts.map((p) => ({
        _id: (p as any)?._id ? String((p as any)._id) : undefined,
        type: 'owner_payout',
        amount: Number((p as any)?.amount || 0),
        date: (p as any)?.date ? new Date((p as any).date) : new Date(),
        description: `Owner payout - ${String((p as any)?.recipientName || 'Owner')}`,
        category: 'owner_payout',
        recipientId: (p as any)?.recipientId ? String((p as any).recipientId) : undefined,
        recipientType: 'owner',
        referenceNumber: String((p as any)?.referenceNumber || ''),
        status: (p as any)?.status || 'pending',
        processedBy: (p as any)?.processedBy ? String((p as any).processedBy) : undefined,
        notes: (p as any)?.notes,
        attachments: [],
        createdAt: (p as any)?.createdAt ? new Date((p as any).createdAt) : ((p as any)?.date ? new Date((p as any).date) : new Date()),
        updatedAt: (p as any)?.updatedAt ? new Date((p as any).updatedAt) : ((p as any)?.date ? new Date((p as any).date) : new Date()),
        runningBalance: undefined
      }))
    : [];
  const combinedLedgerEntries = [...baseTransactions, ...payoutTransactions];
  const { transactions, finalBalance } = propertyAccountService.calculateRunningBalance(combinedLedgerEntries);
  const uniqueTransactions: Transaction[] = React.useMemo(() => {
    const seen = new Set<string>();
    const result: Transaction[] = [];
    for (const t of transactions) {
      const paymentId = (t as any)?.paymentId ? String((t as any).paymentId) : '';
      const ref = (t as any)?.referenceNumber ? String((t as any).referenceNumber) : '';
      const tid = (t as any)?._id ? String((t as any)._id) : '';
      const key = paymentId
        ? `${t.type}:pid:${paymentId}`
        : (t.type === 'owner_payout' ? `${t.type}:ref:${ref || tid}` : `${t.type}:free:${ref}:${new Date(t.date).getTime()}:${Number(t.amount || 0)}`);
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(t);
    }
    return result;
  }, [transactions]);
  const visibleTransactions: Transaction[] = React.useMemo(() => {
    if (showAuditRows) return uniqueTransactions;
    return uniqueTransactions.filter((t) => String((t as any)?.status || '').toLowerCase() !== 'cancelled');
  }, [uniqueTransactions, showAuditRows]);

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

      <Alert severity="info" sx={{ mb: 2 }}>
        Balances and income below are calculated from this property&apos;s trust ledger (same source as the agent owner portfolio financials).
      </Alert>

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
          variant="outlined"
          startIcon={<AccountBalanceIcon />}
          onClick={() => setOpeningBalanceDialogOpen(true)}
          sx={{ mr: 2 }}
        >
          Add Opening Balance
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
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 1 }}>
          <FormControlLabel
            control={
              <Switch
                size="small"
                checked={showAuditRows}
                onChange={(_, checked) => setShowAuditRows(checked)}
              />
            }
            label="Show audit rows"
          />
        </Box>
        <TableContainer component={Paper} sx={{ overflowX: 'auto' }}>
          <Table size="small" sx={{ minWidth: 1280 }}>
            <TableHead>
              <TableRow>
                <TableCell>Date</TableCell>
                <TableCell>Type</TableCell>
                <TableCell>Description</TableCell>
                <TableCell align="right">Total Amount Received</TableCell>
                <TableCell align="right">Commission</TableCell>
                <TableCell align="right">VAT on Commission</TableCell>
                <TableCell align="right">Levy</TableCell>
                <TableCell align="right">Net Amount Due to Owner</TableCell>
                <TableCell align="right">Balance</TableCell>
                <TableCell>Status</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {visibleTransactions.map((transaction, index) => {
                const paymentId = String((transaction as any)?.paymentId || '');
                const breakdown = paymentId ? paymentBreakdowns[paymentId] : undefined;
                const isSaleIncome = transaction.category === 'sale_income' || breakdown?.paymentType === 'sale';
                const isRentalIncome = transaction.type === 'income' && !isSaleIncome;
                const format = (value: number) => propertyAccountService.formatCurrency(value);
                const explainedRent = breakdown ? explainDashboardRent({
                  rentUsed: breakdown.rentUsed,
                  advanceMonthsPaid: breakdown.advanceMonthsPaid,
                  rentAllocated: breakdown.rentAllocated,
                  commissionBase: breakdown.commissionBase,
                  levy: breakdown.levy,
                  grossRent: breakdown.grossRent,
                  amount: breakdown.paymentAmount
                }) : {};
                const receipt = breakdown ? resolveTotalAmountReceived({
                  paymentAmount: breakdown.paymentAmount,
                  depositAmount: breakdown.depositAmount,
                  rentComponent: explainedRent.amount,
                  rentSource: explainedRent.source,
                  levy: breakdown.levy,
                  allocationGross: breakdown.allocationGross
                }) : undefined;
                const description = isRentalIncome
                  ? (rentalPeriodDescription(breakdown) || transaction.description || transaction.referenceNumber || '—')
                  : (transaction.description || transaction.referenceNumber || '—');
                const reducesOwner = transaction.type === 'expense'
                  || transaction.type === 'repair'
                  || transaction.type === 'maintenance'
                  || transaction.type === 'owner_payout'
                  || (transaction.type === 'opening_balance' && transaction.direction === 'debit');
                const ownerColor = transaction.type === 'income' || (transaction.type === 'opening_balance' && transaction.direction !== 'debit')
                  ? 'text.primary'
                  : (transaction.type === 'owner_payout' ? 'warning.main' : 'error.main');
                return (
                <TableRow key={String((transaction as any)?._id || paymentId || index)}>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>{new Date(transaction.date).toLocaleDateString()}</TableCell>
                  <TableCell>
                    <Chip
                      label={
                        transaction.type === 'opening_balance'
                          ? `Opening Balance ${transaction.direction === 'debit' ? 'Debit' : 'Credit'}`
                          : propertyAccountService.getTransactionTypeLabel(transaction.type)
                      }
                      color={
                        transaction.type === 'income' || (transaction.type === 'opening_balance' && transaction.direction !== 'debit')
                          ? 'success'
                          : (transaction.type === 'expense'
                              ? 'error'
                              : (transaction.type === 'opening_balance'
                                  ? 'warning'
                                  : (transaction.type === 'owner_payout' ? 'warning' : 'default')))
                      }
                      size="small"
                    />
                  </TableCell>
                  <TableCell sx={{ minWidth: 160 }}>{description}</TableCell>
                  <TableCell align="right" sx={{ whiteSpace: 'nowrap', color: 'success.main' }}>
                    {isRentalIncome ? (
                      <Tooltip
                        title={receipt?.reviewRequired
                          ? 'Review required. The stored receipt could not be split into rent and levy, so the levy was not added again.'
                          : (receipt?.contractualRent && receipt.totalAmountReceived && Math.abs(receipt.contractualRent - receipt.totalAmountReceived) >= 0.005
                            ? `Contractual rent ${format(receipt.contractualRent)}`
                            : 'Total cash received from the tenant')}
                      >
                        <span>{moneyOrDash(receipt?.totalAmountReceived, format)}</span>
                      </Tooltip>
                    ) : '—'}
                  </TableCell>
                  <TableCell align="right" sx={{ whiteSpace: 'nowrap', color: 'text.secondary' }}>
                    {isRentalIncome ? moneyOrDash(breakdown?.totalCommission, format) : '—'}
                  </TableCell>
                  <TableCell align="right" sx={{ whiteSpace: 'nowrap', color: 'text.secondary' }}>
                    {isRentalIncome ? moneyOrDash(breakdown?.vatOnCommission, format) : '—'}
                  </TableCell>
                  <TableCell align="right" sx={{ whiteSpace: 'nowrap', color: 'text.secondary' }}>
                    {isRentalIncome ? moneyOrDash(breakdown?.levy, format) : '—'}
                  </TableCell>
                  <TableCell align="right" sx={{ whiteSpace: 'nowrap', fontWeight: 700, color: ownerColor }}>
                    {reducesOwner ? `-${format(transaction.amount)}` : format(transaction.amount)}
                  </TableCell>
                  <TableCell align="right" sx={{ whiteSpace: 'nowrap', fontWeight: 700 }}>
                    {propertyAccountService.formatCurrency(transaction.runningBalance || 0)}
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={transaction.status}
                      color={
                        transaction.status === 'completed'
                          ? 'success'
                          : (transaction.status === 'failed' ? 'error' : (transaction.status === 'cancelled' ? 'default' : 'warning'))
                      }
                      size="small"
                    />
                  </TableCell>
                </TableRow>
                );
              })}
              {visibleTransactions.length === 0 && (
                <TableRow>
                  <TableCell colSpan={10} align="center">
                    <Typography variant="body2" color="text.secondary">
                      No active transactions to show.
                    </Typography>
                  </TableCell>
                </TableRow>
              )}
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
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                    VAT on Commission: {propertyAccountService.formatCurrency(Object.values(paymentBreakdowns).reduce((sum, row) => sum + Number(row.vatOnCommission || 0), 0))}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Management Commission: {propertyAccountService.formatCurrency(Object.values(paymentBreakdowns).reduce((sum, row) => sum + Number(row.totalCommission || 0), 0))}
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
                    onClick={() => setOpeningBalanceDialogOpen(true)}
                  >
                    Add Opening Balance
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
                    onClick={() => {
                      setStatementDialogOpen(true);
                      setTimeout(() => handleLoadEnterpriseStatement(), 0);
                    }}
                    startIcon={<PrintIcon />}
                  >
                    Print Statement
                  </Button>
                  <Button
                    variant="contained"
                    color="warning"
                    fullWidth
                    disabled={submitting}
                    onClick={async () => {
                      if (!propertyId) return;
                      const ok = window.confirm(
                        'This is explicit ledger maintenance: it merges duplicate property ledgers. Continue only if you are authorised.'
                      );
                      if (!ok) return;
                      const reason = window.prompt('Enter a non-empty reason for this ledger merge:');
                      if (!reason || !String(reason).trim()) return;
                      setSubmitting(true);
                      setSubmitError(null);
                      setSuccess(null);
                      try {
                        const result = await propertyAccountService.mergeDuplicatesForProperty(propertyId, {
                          confirm: true,
                          reason: String(reason).trim()
                        });
                        // Refresh account after merge
                        const requested = new URLSearchParams(location.search).get('ledger');
                        const refreshLedger: 'rental' | 'sale' = requested === 'sale' || requested === 'rental'
                          ? requested
                          : (!property || (property as any).rentalType === 'sale' ? 'sale' : 'rental');
                        const refreshed = await propertyAccountService.getPropertyAccount(propertyId, refreshLedger);
                        setAccount(refreshed);
                        setSuccess(result?.merged ? 'Ledgers merged successfully.' : 'No merge needed; already unified.');
                      } catch (err: any) {
                        setSubmitError(err?.response?.data?.message || err?.message || 'Failed to merge ledgers');
                      } finally {
                        setSubmitting(false);
                      }
                    }}
                  >
                    Merge Legacy + New Ledgers
                  </Button>
                </Box>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      </TabPanel>

      {/* Add Opening Balance Dialog */}
      <Dialog open={openingBalanceDialogOpen} onClose={() => setOpeningBalanceDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Add Opening Balance Adjustment</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12} sm={6}>
              <TextField
                label="Amount"
                type="number"
                value={openingBalanceData.amount}
                onChange={(e) => setOpeningBalanceData({ ...openingBalanceData, amount: Number(e.target.value) })}
                fullWidth
                required
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth>
                <InputLabel>Direction</InputLabel>
                <Select
                  value={openingBalanceData.direction}
                  onChange={(e) => setOpeningBalanceData({ ...openingBalanceData, direction: e.target.value as 'credit' | 'debit' })}
                  label="Direction"
                >
                  <MenuItem value="credit">Credit - increase balance</MenuItem>
                  <MenuItem value="debit">Debit - decrease balance</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                label="Effective Date"
                type="date"
                value={openingBalanceData.date.toISOString().split('T')[0]}
                onChange={(e) => setOpeningBalanceData({ ...openingBalanceData, date: new Date(e.target.value) })}
                fullWidth
                required
                InputLabelProps={{ shrink: true }}
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                label="Description"
                value={openingBalanceData.description}
                onChange={(e) => setOpeningBalanceData({ ...openingBalanceData, description: e.target.value })}
                fullWidth
                placeholder="Opening balance carried forward"
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                label="Notes"
                value={openingBalanceData.notes}
                onChange={(e) => setOpeningBalanceData({ ...openingBalanceData, notes: e.target.value })}
                fullWidth
                multiline
                rows={3}
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpeningBalanceDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleAddOpeningBalanceAdjustment} variant="contained" disabled={submitting}>
            {submitting ? <CircularProgress size={24} /> : 'Add Adjustment'}
          </Button>
        </DialogActions>
      </Dialog>

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
      <Dialog open={statementDialogOpen} onClose={() => setStatementDialogOpen(false)} maxWidth="xl" fullWidth>
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
            <Grid item xs={12}>
              <Divider sx={{ my: 1 }} />
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}>
                <Button onClick={handleLoadEnterpriseStatement} variant="contained" disabled={enterpriseStatementLoading}>
                  {enterpriseStatementLoading ? <CircularProgress size={20} /> : 'Refresh Statement Data'}
                </Button>
                <Button onClick={handlePrintEnterpriseStatement} variant="contained" disabled={!enterpriseStatement || enterpriseStatementLoading}>
                  Print Statement
                </Button>
                <Button onClick={() => handleDownloadEnterpriseStatement('pdf')} variant="outlined" disabled={enterpriseStatementLoading}>
                  Download PDF
                </Button>
                <Button onClick={() => handleDownloadEnterpriseStatement('excel')} variant="outlined" disabled={enterpriseStatementLoading}>
                  Download Excel
                </Button>
                <Button onClick={() => handleDownloadEnterpriseStatement('csv')} variant="outlined" disabled={enterpriseStatementLoading}>
                  Download CSV
                </Button>
                <Button onClick={() => handleDownloadEnterpriseStatement('json')} variant="outlined" disabled={enterpriseStatementLoading}>
                  Download JSON
                </Button>
              </Box>
              {enterpriseStatement ? (
                <Box
                  ref={enterpriseStatementPrintRef}
                  sx={{
                    bgcolor: '#e6eeea',
                    borderRadius: 1,
                    p: 2,
                    maxHeight: '70vh',
                    overflow: 'auto',
                    display: 'flex',
                    justifyContent: 'center',
                  }}
                >
                  <OwnerStatementPreview statement={enterpriseStatement} layout="sheet" />
                </Box>
              ) : (
                <Alert severity="info">
                  The printed statement uses this property account&apos;s ledger. Choose a period, then print.
                </Alert>
              )}
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setStatementDialogOpen(false)}>Cancel</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default PropertyAccountDetailPage; 
