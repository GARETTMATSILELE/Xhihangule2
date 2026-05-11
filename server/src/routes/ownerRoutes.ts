import express from 'express';
import { auth, propertyOwnerAuth } from '../middleware/auth';
import { Property } from '../models/Property';
import { MaintenanceRequest } from '../models/MaintenanceRequest';
import { User } from '../models/User';
import { PropertyOwner } from '../models/PropertyOwner';
import propertyAccountService from '../services/propertyAccountService';
import { getOwnerProperties, getOwnerPropertyById, getOwnerMaintenanceRequests, getOwnerMaintenanceRequestById, updateOwnerMaintenanceRequest, addOwnerMaintenanceMessage, getOwnerNetIncome, approveOwnerMaintenanceRequest, rejectOwnerMaintenanceRequest } from '../controllers/ownerController';
import mongoose from 'mongoose';
import { Tenant } from '../models/Tenant';
import { Lease } from '../models/Lease';
import { Payment } from '../models/Payment';

const router = express.Router();

console.log('OwnerRoutes: Registering owner routes...');

// Only protect property routes, not maintenance-requests
router.use('/properties', propertyOwnerAuth);
router.use('/properties/:id', propertyOwnerAuth);

// Property routes for owners
router.get('/properties', (req, res, next) => {
  console.log('OwnerRoutes: GET /properties route hit');
  next();
}, getOwnerProperties);

router.get('/properties/:id', (req, res, next) => {
  console.log('OwnerRoutes: GET /properties/:id route hit');
  next();
}, getOwnerPropertyById);

// Tenants for a property (owner only)
router.get('/properties/:id/tenants', propertyOwnerAuth, async (req, res) => {
  try {
    const { id } = req.params;
    if (!id || !mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: 'Invalid property ID' });
    }

    if (!req.user?.userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    // Filter by company if present on token
    const tenantQuery: any = { propertyId: id };
    if (req.user.companyId) {
      tenantQuery.companyId = req.user.companyId;
    }

    const tenants = await Tenant.find(tenantQuery).select('firstName lastName email phone status propertyId companyId');

    if (!tenants || tenants.length === 0) {
      return res.json([]);
    }

    // Fetch leases for these tenants on this property, prefer active; otherwise latest by endDate
    const tenantIds = tenants.map(t => t._id);
    const leaseQuery: any = { propertyId: id, tenantId: { $in: tenantIds } };
    if (req.user.companyId) {
      leaseQuery.companyId = req.user.companyId;
    }

    const leases = await Lease.find(leaseQuery)
      .select('startDate endDate status tenantId propertyId')
      .lean();

    const tenantIdToBestLease = new Map<string, any>();
    for (const lease of leases) {
      const key = lease.tenantId.toString();
      const existing = tenantIdToBestLease.get(key);
      if (!existing) {
        tenantIdToBestLease.set(key, lease);
        continue;
      }

      const existingIsActive = existing.status === 'active';
      const leaseIsActive = lease.status === 'active';
      if (leaseIsActive && !existingIsActive) {
        tenantIdToBestLease.set(key, lease);
        continue;
      }
      if (leaseIsActive === existingIsActive) {
        const existingEnd = existing.endDate ? new Date(existing.endDate).getTime() : 0;
        const currentEnd = lease.endDate ? new Date(lease.endDate).getTime() : 0;
        if (currentEnd > existingEnd) {
          tenantIdToBestLease.set(key, lease);
        }
      }
    }

    const response = tenants.map(t => {
      const tenantObj = t.toObject();
      const lease = tenantIdToBestLease.get(t._id.toString());
      return {
        ...tenantObj,
        leaseStartDate: lease?.startDate || null,
        leaseEndDate: lease?.endDate || null,
        leaseStatus: lease?.status || null,
        leaseId: lease?._id || null
      };
    });

    return res.json(response);
  } catch (err: any) {
    console.error('OwnerRoutes: Error fetching tenants for property', err);
    return res.status(500).json({ message: 'Error fetching tenants for property' });
  }
});

// Net income route for owners
router.get('/net-income', propertyOwnerAuth, (req, res, next) => {
  console.log('OwnerRoutes: GET /net-income route hit');
  next();
}, getOwnerNetIncome);

// Maintenance request routes for owners
router.get('/maintenance-requests', propertyOwnerAuth, (req, res, next) => {
  console.log('OwnerRoutes: GET /maintenance-requests route hit');
  next();
}, getOwnerMaintenanceRequests);

router.get('/maintenance-requests/:id', propertyOwnerAuth, (req, res, next) => {
  console.log('OwnerRoutes: GET /maintenance-requests/:id route hit');
  next();
}, getOwnerMaintenanceRequestById);

router.patch('/maintenance-requests/:id', propertyOwnerAuth, (req, res, next) => {
  console.log('OwnerRoutes: PATCH /maintenance-requests/:id route hit');
  next();
}, updateOwnerMaintenanceRequest);

router.patch('/maintenance-requests/:id/approve', propertyOwnerAuth, (req, res, next) => {
  console.log('OwnerRoutes: PATCH /maintenance-requests/:id/approve route hit');
  next();
}, approveOwnerMaintenanceRequest);

router.patch('/maintenance-requests/:id/reject', propertyOwnerAuth, (req, res, next) => {
  console.log('OwnerRoutes: PATCH /maintenance-requests/:id/reject route hit');
  next();
}, rejectOwnerMaintenanceRequest);

router.post('/maintenance-requests/:id/messages', propertyOwnerAuth, (req, res, next) => {
  console.log('OwnerRoutes: POST /maintenance-requests/:id/messages route hit');
  next();
}, addOwnerMaintenanceMessage);

const resolveOwnerIncomeType = (rentalType: unknown): { ledgerType: 'rental' | 'sale'; incomeType: 'Rental Income' | 'Sales Income' } => {
  const normalized = String(rentalType || '').trim().toLowerCase();
  if (normalized === 'sale' || normalized === 'sales') {
    return { ledgerType: 'sale', incomeType: 'Sales Income' };
  }
  return { ledgerType: 'rental', incomeType: 'Rental Income' };
};

const normalizeNumericAmount = (value: unknown): number => {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }
  if (typeof value === 'string') {
    const cleaned = value.replace(/[^0-9.-]/g, '');
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  if (value && typeof value === 'object' && typeof (value as any).toString === 'function') {
    const parsed = Number(String((value as any).toString()).replace(/[^0-9.-]/g, ''));
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
};

const getSortTimestamp = (value: unknown): number => {
  const ts = new Date(value as any).getTime();
  return Number.isFinite(ts) ? ts : 0;
};

// Get owner financial data from accounting database
router.get('/financial-data', propertyOwnerAuth, async (req, res) => {
  try {
    if (!req.user?.userId) {
      return res.status(401).json({ message: 'User ID not found' });
    }

    if (req.user.role !== 'owner') {
      return res.status(403).json({ message: 'Owner access required' });
    }

        const ownerId = req.user.userId;
    console.log(`[Owner Financial Data] Processing request for ownerId: ${ownerId}`);
    console.log(`[Owner Financial Data] Company ID: ${req.user.companyId}`);

    // Build owner context with robust fallbacks
    let propertyOwnerContext = await PropertyOwner.findById(ownerId);
    if (!propertyOwnerContext) {
      // Fallback: try to match PropertyOwner by the user's email
      try {
        const ownerUser = await User.findById(ownerId);
        if (ownerUser?.email) {
          propertyOwnerContext = await PropertyOwner.findOne({ email: ownerUser.email });
          if (propertyOwnerContext) {
            console.log('[Owner Financial Data] Matched PropertyOwner by email:', ownerUser.email);
          }
        }
      } catch (lookupErr) {
        console.warn('[Owner Financial Data] PropertyOwner email lookup failed (non-fatal):', lookupErr);
      }
    }

    if (propertyOwnerContext) {
      console.log(`[Owner Financial Data] PropertyOwner context:`, {
        _id: propertyOwnerContext._id,
        companyId: propertyOwnerContext.companyId,
        propertiesCount: propertyOwnerContext.properties?.length || 0,
        properties: propertyOwnerContext.properties
      });
    } else {
      console.log('[Owner Financial Data] PropertyOwner context not found after fallbacks. Using Property collection fallback.');
    }

    // Get the property IDs for this owner
    let ownerPropertyIds: any[] = [];
    if (propertyOwnerContext && propertyOwnerContext.properties && propertyOwnerContext.properties.length > 0) {
      ownerPropertyIds = propertyOwnerContext.properties;
      console.log(`[Owner Financial Data] Using properties from PropertyOwner context:`, ownerPropertyIds.length);
      console.log(`[Owner Financial Data] Property IDs:`, ownerPropertyIds);
    } else {
      console.log(`[Owner Financial Data] No properties in PropertyOwner context. Falling back to Property collection by ownerId: ${ownerId}`);
      const propQuery: any = { ownerId: ownerId };
      if (req.user.companyId) {
        propQuery.companyId = req.user.companyId;
      }
      const fallbackProps = await Property.find(propQuery).select('_id');
      ownerPropertyIds = fallbackProps.map((p) => p._id);
      console.log('[Owner Financial Data] Fallback properties found:', ownerPropertyIds.length);
    }

    if (!ownerPropertyIds || ownerPropertyIds.length === 0) {
      console.log(`[Owner Financial Data] No properties found for ownerId: ${ownerId}`);
      return res.json({
        success: true,
        data: {
          properties: [],
          summary: {
            totalIncome: 0,
            totalExpenses: 0,
            totalOwnerPayouts: 0,
            runningBalance: 0,
            totalProperties: 0
          },
          recentTransactions: [],
          monthlyData: [],
          propertyBreakdown: []
        }
      });
    }

    if (ownerPropertyIds.length === 0) {
      console.log(`[Owner Financial Data] No properties found for ownerId: ${ownerId}`);
      return res.json({
        success: true,
        data: {
          properties: [],
          summary: {
            totalIncome: 0,
            totalExpenses: 0,
            totalOwnerPayouts: 0,
            runningBalance: 0,
            totalProperties: 0
          },
          recentTransactions: [],
          monthlyData: [],
          propertyBreakdown: []
        }
      });
    }

    console.log(`[Owner Financial Data] Final property IDs to query:`, ownerPropertyIds);

    const ownerProperties = await Property.find({
      _id: { $in: ownerPropertyIds },
      ...(req.user.companyId ? { companyId: req.user.companyId } : {})
    }).select('_id name address rentalType');

    if (!ownerProperties || ownerProperties.length === 0) {
      return res.json({
        success: true,
        data: {
          properties: [],
          summary: {
            totalIncome: 0,
            totalExpenses: 0,
            totalOwnerPayouts: 0,
            runningBalance: 0,
            totalProperties: 0
          },
          recentTransactions: [],
          monthlyData: [],
          propertyBreakdown: []
        }
      });
    }

    const propertyAccounts = await Promise.all(
      ownerProperties.map(async (property: any) => {
        const propertyId = String(property._id);
        const { ledgerType, incomeType } = resolveOwnerIncomeType(property.rentalType);
        try {
          const account = await propertyAccountService.getPropertyAccount(propertyId, ledgerType);
          return {
            ...(typeof (account as any)?.toObject === 'function' ? (account as any).toObject() : account),
            propertyId: (account as any)?.propertyId || property._id,
            propertyName: (account as any)?.propertyName || property.name || 'Unknown Property',
            propertyAddress: (account as any)?.propertyAddress || property.address || 'No Address',
            ledgerType,
            incomeType
          };
        } catch (accountErr: any) {
          console.warn(`[Owner Financial Data] Could not load account for property ${propertyId} (${ledgerType})`, accountErr?.message || accountErr);
          return {
            propertyId: property._id,
            propertyName: property.name || 'Unknown Property',
            propertyAddress: property.address || 'No Address',
            totalIncome: 0,
            totalExpenses: 0,
            totalOwnerPayouts: 0,
            runningBalance: 0,
            lastIncomeDate: null,
            lastExpenseDate: null,
            lastPayoutDate: null,
            transactions: [],
            ownerPayouts: [],
            ledgerType,
            incomeType
          };
        }
      })
    );

    // Calculate summary statistics
    const summary = {
      totalIncome: 0,
      totalExpenses: 0,
      totalOwnerPayouts: 0,
      runningBalance: 0,
      totalProperties: propertyAccounts.length
    };

    // Collect all transactions and organize by month
    const monthlyData: { [key: string]: { income: number; expenses: number; payouts: number } } = {};
    const allTransactions: any[] = [];
    const propertyBreakdown: any[] = [];

    for (const account of propertyAccounts) {
      // Add to summary
      summary.totalIncome += account.totalIncome || 0;
      summary.totalExpenses += account.totalExpenses || 0;
      summary.totalOwnerPayouts += account.totalOwnerPayouts || 0;
      summary.runningBalance += account.runningBalance || 0;

      const incomeTransactions = Array.isArray(account.transactions)
        ? account.transactions.filter((transaction: any) => String(transaction?.type || '').toLowerCase() === 'income')
        : [];
      const paymentIds = Array.isArray(incomeTransactions)
        ? incomeTransactions
            .map((transaction: any) => String(transaction?.paymentId || '').trim())
            .filter((id: string) => Boolean(id && mongoose.isValidObjectId(id)))
        : [];
      const paymentRefs = Array.isArray(incomeTransactions)
        ? incomeTransactions
            .map((transaction: any) => String(transaction?.referenceNumber || '').trim())
            .filter((ref: string) => Boolean(ref))
        : [];
      const uniquePaymentIds = Array.from(new Set(paymentIds));
      const uniquePaymentRefs = Array.from(new Set(paymentRefs));
      let paymentById = new Map<string, { receiptAmount: number; commissionAmount: number }>();
      let paymentByReference = new Map<string, { receiptAmount: number; commissionAmount: number }>();
      if (uniquePaymentIds.length > 0 || uniquePaymentRefs.length > 0) {
        try {
          const paymentQuery: any = {
            $or: [
              ...(uniquePaymentIds.length > 0 ? [{ _id: { $in: uniquePaymentIds } }] : []),
              ...(uniquePaymentRefs.length > 0 ? [{ referenceNumber: { $in: uniquePaymentRefs } }] : [])
            ],
            ...(req.user.companyId ? { companyId: req.user.companyId } : {})
          };
          const payments = await Payment.find(paymentQuery)
            .select('_id amount commissionDetails.totalCommission')
            .lean();
          paymentById = new Map();
          paymentByReference = new Map();
          payments.forEach((payment: any) => {
            const normalized = {
              receiptAmount: normalizeNumericAmount(payment?.amount),
              commissionAmount: normalizeNumericAmount(payment?.commissionDetails?.totalCommission)
            };
            paymentById.set(String(payment._id), normalized);
            if (payment?.referenceNumber) {
              paymentByReference.set(String(payment.referenceNumber), normalized);
            }
          });
        } catch (paymentLookupError: any) {
          console.warn('[Owner Financial Data] Failed to resolve receipt totals for account transactions:', paymentLookupError?.message || paymentLookupError);
        }
      }
      const resolvePaymentInfo = (transaction: any) =>
        paymentById.get(String(transaction?.paymentId || '')) ||
        paymentByReference.get(String(transaction?.referenceNumber || ''));

      const propertyTransactionsRaw = [
        ...(Array.isArray(account.transactions) ? account.transactions.map((transaction: any) => ({
          ...(() => {
            const paymentInfo = resolvePaymentInfo(transaction);
            const normalizedType = String(transaction?.type || '').toLowerCase();
            const isIncome = normalizedType === 'income';
            return {
              // Rent must come from Payment.amount in property management DB.
              // For non-income entries, keep amount-aligned fallback for completeness.
              receiptAmount: paymentInfo?.receiptAmount ?? (isIncome ? 0 : normalizeNumericAmount(transaction?.amount)),
              commissionAmount: paymentInfo?.commissionAmount ?? 0
            };
          })(),
          id: transaction._id,
          type: transaction.type,
          amount: transaction.amount,
          date: transaction.date,
          createdAt: transaction.createdAt,
          updatedAt: transaction.updatedAt,
          description: transaction.description,
          category: transaction.category,
          status: transaction.status,
          ledgerType: account.ledgerType,
          incomeType: account.incomeType,
          propertyName: account.propertyName || (account.propertyId as any)?.name || 'Unknown Property',
          referenceNumber: transaction.referenceNumber
        })) : []),
        ...(Array.isArray(account.ownerPayouts) ? account.ownerPayouts.map((payout: any) => ({
          id: payout._id,
          type: 'owner_payout',
          amount: payout.amount,
          date: payout.date,
          createdAt: payout.createdAt,
          updatedAt: payout.updatedAt,
          description: payout.notes || 'Owner payout',
          category: 'owner_payout',
          status: payout.status,
          ledgerType: account.ledgerType,
          incomeType: account.incomeType,
          propertyName: account.propertyName || (account.propertyId as any)?.name || 'Unknown Property',
          referenceNumber: payout.referenceNumber
        })) : [])
      ];

      const propertyTransactions = propertyTransactionsRaw
        .sort((a, b) => {
          const byDate = getSortTimestamp(a.date) - getSortTimestamp(b.date);
          if (byDate !== 0) return byDate;
          const byCreated = getSortTimestamp(a.createdAt || a.updatedAt) - getSortTimestamp(b.createdAt || b.updatedAt);
          if (byCreated !== 0) return byCreated;
          return String(a.id || '').localeCompare(String(b.id || ''));
        })
        .reduce((accum: any[], transaction: any) => {
          const prev = accum.length > 0 ? Number(accum[accum.length - 1].runningBalance || 0) : 0;
          const amount = normalizeNumericAmount(transaction.amount);
          const normalizedStatus = String(transaction.status || '').trim().toLowerCase();
          const normalizedType = String(transaction.type || '').trim().toLowerCase();
          const affectsBalance = normalizedStatus === 'completed';
          const delta = affectsBalance ? (normalizedType === 'income' ? amount : -amount) : 0;
          const runningBalance = Math.round((prev + delta) * 100) / 100;
          accum.push({
            ...transaction,
            amount,
            receiptAmount: normalizeNumericAmount(transaction.receiptAmount),
            commissionAmount: normalizeNumericAmount(transaction.commissionAmount),
            runningBalance
          });
          return accum;
        }, [])
        .sort((a, b) => {
          const byDate = getSortTimestamp(b.date) - getSortTimestamp(a.date);
          if (byDate !== 0) return byDate;
          const byCreated = getSortTimestamp(b.createdAt || b.updatedAt) - getSortTimestamp(a.createdAt || a.updatedAt);
          if (byCreated !== 0) return byCreated;
          return String(b.id || '').localeCompare(String(a.id || ''));
        });

      // Add property breakdown
      const propertyName = account.propertyName || 'Unknown Property';
      const propertyAddress = account.propertyAddress || 'No Address';
      
      propertyBreakdown.push({
        propertyId: account.propertyId,
        propertyName: propertyName,
        propertyAddress: propertyAddress,
        ledgerType: account.ledgerType,
        incomeType: account.incomeType,
        totalIncome: account.totalIncome || 0,
        totalRentPaid: propertyTransactions
          .filter((transaction: any) => String(transaction?.type || '').toLowerCase() === 'income')
          .reduce((sum: number, transaction: any) => sum + normalizeNumericAmount(transaction?.receiptAmount), 0),
        totalCommission: propertyTransactions
          .filter((transaction: any) => String(transaction?.type || '').toLowerCase() === 'income')
          .reduce((sum: number, transaction: any) => sum + normalizeNumericAmount(transaction?.commissionAmount), 0),
        totalExpenses: account.totalExpenses || 0,
        totalOwnerPayouts: account.totalOwnerPayouts || 0,
        runningBalance: account.runningBalance || 0,
        netIncome: (account.totalIncome || 0) - (account.totalExpenses || 0) - (account.totalOwnerPayouts || 0),
        lastIncomeDate: account.lastIncomeDate,
        lastExpenseDate: account.lastExpenseDate,
        lastPayoutDate: account.lastPayoutDate,
        transactions: propertyTransactions,
        recentTransactions: propertyTransactions.slice(0, 20)
      });

      console.log(`[Owner Financial Data] Processing property: ${propertyName} (${propertyAddress})`);

      // Process transactions by month
      account.transactions.forEach((transaction: any) => {
        const transactionDate = new Date(transaction.date);
        const monthKey = `${transactionDate.getFullYear()}-${String(transactionDate.getMonth() + 1).padStart(2, '0')}`;
        
        if (!monthlyData[monthKey]) {
          monthlyData[monthKey] = { income: 0, expenses: 0, payouts: 0 };
        }

        if (transaction.type === 'income') {
          monthlyData[monthKey].income += transaction.amount || 0;
        } else if (transaction.type === 'owner_payout') {
          monthlyData[monthKey].payouts += transaction.amount || 0;
        } else {
          monthlyData[monthKey].expenses += transaction.amount || 0;
        }

        // Add to all transactions for recent transactions list
        allTransactions.push({
          id: transaction._id,
          type: transaction.type,
          amount: transaction.amount,
          receiptAmount: normalizeNumericAmount(resolvePaymentInfo(transaction)?.receiptAmount),
          commissionAmount: normalizeNumericAmount(resolvePaymentInfo(transaction)?.commissionAmount),
          date: transaction.date,
          description: transaction.description,
          category: transaction.category,
          status: transaction.status,
          ledgerType: account.ledgerType,
          incomeType: account.incomeType,
          propertyName: account.propertyName || (account.propertyId as any)?.name || 'Unknown Property',
          referenceNumber: transaction.referenceNumber
        });
      });

      // Process owner payouts by month and include in recent transactions
      account.ownerPayouts.forEach((payout: any) => {
        const payoutDate = new Date(payout.date);
        const monthKey = `${payoutDate.getFullYear()}-${String(payoutDate.getMonth() + 1).padStart(2, '0')}`;

        if (!monthlyData[monthKey]) {
          monthlyData[monthKey] = { income: 0, expenses: 0, payouts: 0 };
        }

        monthlyData[monthKey].payouts += payout.amount || 0;

        // Add owner payout to recent transactions so frontend filters can include them
        allTransactions.push({
          id: payout._id,
          type: 'owner_payout',
          amount: payout.amount,
          date: payout.date,
          description: payout.notes || 'Owner payout',
          category: 'owner_payout',
          status: payout.status,
          ledgerType: account.ledgerType,
          incomeType: account.incomeType,
          propertyName: account.propertyName || (account.propertyId as any)?.name || 'Unknown Property',
          referenceNumber: payout.referenceNumber
        });
      });
    }

    // Convert monthly data to chart format and sort by date
    const monthlyChartData = Object.entries(monthlyData)
      .map(([month, data]) => ({
        month,
        income: Math.round(data.income * 100) / 100,
        expenses: Math.round(data.expenses * 100) / 100,
        payouts: Math.round(data.payouts * 100) / 100,
        netIncome: Math.round((data.income - data.expenses - data.payouts) * 100) / 100
      }))
      .sort((a, b) => a.month.localeCompare(b.month))
      .slice(-12); // Last 12 months

    // Sort transactions by date (most recent first) and limit to 20
    const recentTransactions = allTransactions
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 20);

    const responseData = {
      success: true,
      data: {
        properties: propertyBreakdown,
        summary: {
          totalIncome: Math.round(summary.totalIncome * 100) / 100,
          totalExpenses: Math.round(summary.totalExpenses * 100) / 100,
          totalOwnerPayouts: Math.round(summary.totalOwnerPayouts * 100) / 100,
          runningBalance: Math.round(summary.runningBalance * 100) / 100,
          totalProperties: summary.totalProperties
        },
        recentTransactions,
        monthlyData: monthlyChartData,
        propertyBreakdown
      }
    };

    console.log(`[Owner Financial Data] Response summary:`, {
      totalProperties: summary.totalProperties,
      totalIncome: responseData.data.summary.totalIncome,
      totalExpenses: responseData.data.summary.totalExpenses,
      totalOwnerPayouts: responseData.data.summary.totalOwnerPayouts,
      runningBalance: responseData.data.summary.runningBalance,
      transactionsCount: recentTransactions.length,
      monthlyDataPoints: monthlyChartData.length
    });

    res.json(responseData);

  } catch (error: any) {
    console.error('Error fetching owner financial data:', error);
    res.status(500).json({ 
      success: false,
      message: 'Error fetching financial data',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

console.log('OwnerRoutes: All owner routes registered');

export default router; 