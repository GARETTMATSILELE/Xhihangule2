import express from 'express';
import { auth } from '../middleware/auth';
import propertyAccountService from '../services/propertyAccountService';
import { PropertyOwner } from '../models/PropertyOwner';
import { SalesOwner } from '../models/SalesOwner';
import { redactHeaders } from '../utils/requestSecurity';

const router = express.Router();

// Debug middleware to log all requests
router.use((req, res, next) => {
  console.log(`[Report Routes] ${req.method} ${req.path}`);
  console.log('Request headers:', redactHeaders(req.headers));
  console.log('Request query:', req.query);
  console.log('Request body:', req.body);
  next();
});

// Health check for report routes
router.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    service: 'report-routes',
    timestamp: new Date().toISOString()
  });
});

// Owner Statement Report
router.get('/owner-statement', auth, async (req, res) => {
  try {
    const companyId = req.user?.companyId as string | undefined;
    if (!companyId) {
      return res.status(400).json({ message: 'Company ID is required' });
    }

    // Optional period filter: 'YYYY-MM'. Defaults to current month.
    const periodParam = (req.query.period as string) || '';
    const now = new Date();
    const [yearStr, monthStr] = periodParam.split('-');
    const year = yearStr ? parseInt(yearStr, 10) : now.getUTCFullYear();
    const month = monthStr ? parseInt(monthStr, 10) : (now.getUTCMonth() + 1);
    const period = `${year.toString().padStart(4, '0')}-${month.toString().padStart(2, '0')}`;
    const startDate = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0));
    const endDate = new Date(Date.UTC(year, month, 1, 0, 0, 0)); // exclusive

    console.log('Owner statement report requested', { companyId, period, startDate, endDate });

    const accounts = await propertyAccountService.getCompanyPropertyAccounts(companyId);

    // Build propertyId -> owner lookup from owners collections (company-scoped)
    const rentalPropertyIds = accounts
      .filter((a: any) => !a.ledgerType || a.ledgerType === 'rental')
      .map((a: any) => a.propertyId?.toString?.())
      .filter(Boolean) as string[];

    const salePropertyIds = accounts
      .filter((a: any) => (a as any).ledgerType === 'sale')
      .map((a: any) => a.propertyId?.toString?.())
      .filter(Boolean) as string[];

    const uniqueRentalIds = Array.from(new Set(rentalPropertyIds));
    const uniqueSaleIds = Array.from(new Set(salePropertyIds));

    const [rentalOwners, salesOwners] = await Promise.all([
      PropertyOwner.find({
        companyId,
        ...(uniqueRentalIds.length > 0 ? { properties: { $in: uniqueRentalIds } } : {})
      }).select('_id email firstName lastName phone properties companyId'),
      SalesOwner.find({
        companyId,
        ...(uniqueSaleIds.length > 0 ? { properties: { $in: uniqueSaleIds } } : {})
      }).select('_id email firstName lastName phone properties companyId')
    ]);

    const propertyIdToOwner: Record<string, {
      _id: string;
      email?: string;
      firstName?: string;
      lastName?: string;
      phone?: string;
      ownerType: 'rental' | 'sale';
    }> = {};

    for (const o of rentalOwners as any[]) {
      const props: any[] = Array.isArray(o?.properties) ? o.properties : [];
      for (const p of props) {
        const key = typeof p === 'string' ? p : (p?.toString?.() || p?.$oid || p?._id || p?.id || '');
        if (key) {
          propertyIdToOwner[String(key)] = {
            _id: o._id.toString(),
            email: o.email,
            firstName: o.firstName,
            lastName: o.lastName,
            phone: o.phone,
            ownerType: 'rental'
          };
        }
      }
    }

    for (const o of salesOwners as any[]) {
      const props: any[] = Array.isArray(o?.properties) ? o.properties : [];
      for (const p of props) {
        const key = typeof p === 'string' ? p : (p?.toString?.() || p?.$oid || p?._id || p?.id || '');
        if (key) {
          propertyIdToOwner[String(key)] = {
            _id: o._id.toString(),
            email: o.email,
            firstName: o.firstName,
            lastName: o.lastName,
            phone: o.phone,
            ownerType: 'sale'
          };
        }
      }
    }

    type OwnerMap = Record<string, {
      ownerId: string;
      ownerName: string;
      properties: Array<any>;
      totalRentCollected: number;
      totalExpenses: number;
      totalNetIncome: number;
      period: string;
    }>;

    const owners: OwnerMap = {};

    for (const acc of accounts) {
      const propertyIdStr = acc.propertyId?.toString?.() || '';
      const refOwner = propertyIdStr ? propertyIdToOwner[propertyIdStr] : undefined;

      // Use cross-referenced owner if available, else fall back to account's stored owner fields
      const ownerId = refOwner?._id || (acc.ownerId ? acc.ownerId.toString() : 'unknown-owner');
      const ownerName = refOwner ? `${refOwner.firstName || ''} ${refOwner.lastName || ''}`.trim() || (acc as any).ownerName || 'Unknown Owner' : ((acc as any).ownerName || 'Unknown Owner');

      // Sum transactions for the requested month
      const tx = Array.isArray((acc as any).transactions) ? (acc as any).transactions : [];
      const inPeriod = tx.filter((t: any) => {
        try {
          const d = new Date(t.date);
          return d >= startDate && d < endDate && t.status !== 'cancelled';
        } catch {
          return false;
        }
      });

      const income = inPeriod
        .filter((t: any) => t.type === 'income')
        .reduce((sum: number, t: any) => sum + Number(t.amount || 0), 0);

      const expenseTypes = new Set(['expense', 'repair', 'maintenance']);
      const expenses = inPeriod
        .filter((t: any) => expenseTypes.has(t.type))
        .reduce((sum: number, t: any) => sum + Number(t.amount || 0), 0);

      const netIncome = income - expenses;

      const propertyItem = {
        propertyId: propertyIdStr,
        propertyName: (acc as any).propertyName || '',
        address: (acc as any).propertyAddress || '',
        rentCollected: income,
        expenses,
        netIncome,
        period
      };

      if (!owners[ownerId]) {
        owners[ownerId] = {
          ownerId,
          ownerName,
          properties: [],
          totalRentCollected: 0,
          totalExpenses: 0,
          totalNetIncome: 0,
          period
        };
      }

      owners[ownerId].properties.push(propertyItem);
      owners[ownerId].totalRentCollected += income;
      owners[ownerId].totalExpenses += expenses;
      owners[ownerId].totalNetIncome += netIncome;

      // Attach enriched owner details (non-breaking additional field)
      if (refOwner) {
        (owners[ownerId] as any).ownerDetails = (owners[ownerId] as any).ownerDetails || {
          id: refOwner._id,
          email: refOwner.email,
          firstName: refOwner.firstName,
          lastName: refOwner.lastName,
          phone: refOwner.phone
        };
      }
    }

    const payload = Object.values(owners);
    return res.json(payload);
  } catch (error) {
    console.error('Error fetching owner statement report:', error);
    res.status(500).json({ message: 'Error fetching owner statement report' });
  }
});

// Income & Expense Report
router.get('/income-expense', auth, async (req, res) => {
  try {
    console.log('Income & expense report requested for company:', req.user?.companyId);
    
    // Mock data for now - replace with actual database queries
    const mockData = {
      period: '2024-01',
      income: {
        rent: 15000,
        lateFees: 500,
        other: 200,
        total: 15700
      },
      expenses: {
        maintenance: 3000,
        utilities: 1500,
        insurance: 800,
        propertyTax: 1200,
        other: 500,
        total: 7000
      },
      netIncome: 8700,
      properties: [
        {
          propertyId: 'prop-1',
          propertyName: 'Sunset Apartments',
          income: 8000,
          expenses: 3500,
          netIncome: 4500
        },
        {
          propertyId: 'prop-2',
          propertyName: 'Ocean View Condos',
          income: 7700,
          expenses: 3500,
          netIncome: 4200
        }
      ]
    };

    res.json(mockData);
  } catch (error) {
    console.error('Error fetching income & expense report:', error);
    res.status(500).json({ message: 'Error fetching income & expense report' });
  }
});

// Rent Roll Report
router.get('/rent-roll', auth, async (req, res) => {
  try {
    console.log('Rent roll report requested for company:', req.user?.companyId);
    
    // Mock data for now - replace with actual database queries
    const mockData = [
      {
        propertyId: 'prop-1',
        propertyName: 'Sunset Apartments',
        address: '123 Main St, City, State',
        unitNumber: 'A101',
        tenantName: 'Alice Johnson',
        leaseStartDate: '2023-01-01',
        leaseEndDate: '2024-12-31',
        monthlyRent: 1200,
        currentBalance: 0,
        status: 'occupied',
        lastPaymentDate: '2024-01-01'
      },
      {
        propertyId: 'prop-1',
        propertyName: 'Sunset Apartments',
        address: '123 Main St, City, State',
        unitNumber: 'A102',
        tenantName: 'Bob Wilson',
        leaseStartDate: '2023-02-01',
        leaseEndDate: '2024-01-31',
        monthlyRent: 1300,
        currentBalance: 0,
        status: 'occupied',
        lastPaymentDate: '2024-01-01'
      },
      {
        propertyId: 'prop-2',
        propertyName: 'Ocean View Condos',
        address: '456 Beach Blvd, City, State',
        unitNumber: 'B201',
        tenantName: 'Carol Davis',
        leaseStartDate: '2023-03-01',
        leaseEndDate: '2024-02-29',
        monthlyRent: 1800,
        currentBalance: 0,
        status: 'occupied',
        lastPaymentDate: '2024-01-01'
      },
      {
        propertyId: 'prop-2',
        propertyName: 'Ocean View Condos',
        address: '456 Beach Blvd, City, State',
        unitNumber: 'B202',
        tenantName: '',
        leaseStartDate: '',
        leaseEndDate: '',
        monthlyRent: 1800,
        currentBalance: 0,
        status: 'vacant',
        lastPaymentDate: ''
      }
    ];

    res.json(mockData);
  } catch (error) {
    console.error('Error fetching rent roll report:', error);
    res.status(500).json({ message: 'Error fetching rent roll report' });
  }
});

// Receivables Report
router.get('/receivables', auth, async (req, res) => {
  try {
    console.log('Receivables report requested for company:', req.user?.companyId);
    
    // Mock data for now
    const mockData = [
      {
        tenantId: 'tenant-1',
        tenantName: 'Alice Johnson',
        propertyName: 'Sunset Apartments',
        unitNumber: 'A101',
        currentBalance: 0,
        daysOverdue: 0,
        lastPaymentDate: '2024-01-01',
        nextPaymentDue: '2024-02-01',
        status: 'current'
      }
    ];

    res.json(mockData);
  } catch (error) {
    console.error('Error fetching receivables report:', error);
    res.status(500).json({ message: 'Error fetching receivables report' });
  }
});

// Payables Report
router.get('/payables', auth, async (req, res) => {
  try {
    console.log('Payables report requested for company:', req.user?.companyId);
    
    // Mock data for now
    const mockData = [
      {
        vendorId: 'vendor-1',
        vendorName: 'Maintenance Pro',
        invoiceNumber: 'INV-001',
        description: 'Plumbing repair',
        amount: 500,
        dueDate: '2024-02-15',
        daysOverdue: 0,
        status: 'pending'
      }
    ];

    res.json(mockData);
  } catch (error) {
    console.error('Error fetching payables report:', error);
    res.status(500).json({ message: 'Error fetching payables report' });
  }
});

// Maintenance Report
router.get('/maintenance', auth, async (req, res) => {
  try {
    console.log('Maintenance report requested for company:', req.user?.companyId);
    
    // Mock data for now
    const mockData = [
      {
        requestId: 'maint-1',
        propertyName: 'Sunset Apartments',
        unitNumber: 'A101',
        tenantName: 'Alice Johnson',
        description: 'Leaky faucet in kitchen',
        priority: 'medium',
        status: 'open',
        createdAt: '2024-01-15',
        cost: 0
      }
    ];

    res.json(mockData);
  } catch (error) {
    console.error('Error fetching maintenance report:', error);
    res.status(500).json({ message: 'Error fetching maintenance report' });
  }
});

// Vacancy Report
router.get('/vacancy', auth, async (req, res) => {
  try {
    console.log('Vacancy report requested for company:', req.user?.companyId);
    
    // Mock data for now
    const mockData = [
      {
        propertyId: 'prop-2',
        propertyName: 'Ocean View Condos',
        address: '456 Beach Blvd, City, State',
        unitNumber: 'B202',
        daysVacant: 30,
        lastTenantName: 'Previous Tenant',
        lastRentAmount: 1800,
        estimatedRent: 1800,
        vacancyReason: 'Tenant moved out'
      }
    ];

    res.json(mockData);
  } catch (error) {
    console.error('Error fetching vacancy report:', error);
    res.status(500).json({ message: 'Error fetching vacancy report' });
  }
});

// Tenant Ledger Report
router.get('/tenant-ledger', auth, async (req, res) => {
  try {
    const { tenantId } = req.query;
    console.log('Tenant ledger report requested for tenant:', tenantId);
    
    // Mock data for now
    const mockData = {
      tenantId: tenantId as string,
      tenantName: 'Alice Johnson',
      propertyName: 'Sunset Apartments',
      unitNumber: 'A101',
      transactions: [
        {
          date: '2024-01-01',
          description: 'Rent payment',
          charges: 0,
          payments: 1200,
          balance: 0,
          type: 'payment'
        }
      ],
      currentBalance: 0
    };

    res.json(mockData);
  } catch (error) {
    console.error('Error fetching tenant ledger report:', error);
    res.status(500).json({ message: 'Error fetching tenant ledger report' });
  }
});

// Delinquency Report
router.get('/delinquency', auth, async (req, res) => {
  try {
    console.log('Delinquency report requested for company:', req.user?.companyId);
    
    // Mock data for now
    const mockData = [
      {
        tenantId: 'tenant-1',
        tenantName: 'Alice Johnson',
        propertyName: 'Sunset Apartments',
        unitNumber: 'A101',
        currentBalance: 0,
        daysOverdue: 0,
        lastPaymentDate: '2024-01-01',
        nextPaymentDue: '2024-02-01',
        evictionStatus: 'none'
      }
    ];

    res.json(mockData);
  } catch (error) {
    console.error('Error fetching delinquency report:', error);
    res.status(500).json({ message: 'Error fetching delinquency report' });
  }
});

// Lease Expiry Report
router.get('/lease-expiry', auth, async (req, res) => {
  try {
    console.log('Lease expiry report requested for company:', req.user?.companyId);
    
    // Mock data for now
    const mockData = [
      {
        leaseId: 'lease-1',
        tenantName: 'Alice Johnson',
        propertyName: 'Sunset Apartments',
        unitNumber: 'A101',
        leaseStartDate: '2023-01-01',
        leaseEndDate: '2024-12-31',
        daysUntilExpiry: 300,
        monthlyRent: 1200,
        renewalStatus: 'pending'
      }
    ];

    res.json(mockData);
  } catch (error) {
    console.error('Error fetching lease expiry report:', error);
    res.status(500).json({ message: 'Error fetching lease expiry report' });
  }
});

// Portfolio Summary Report
router.get('/portfolio-summary', auth, async (req, res) => {
  try {
    console.log('Portfolio summary report requested for company:', req.user?.companyId);
    
    // Mock data for now
    const mockData = {
      totalProperties: 2,
      totalUnits: 4,
      occupiedUnits: 3,
      vacantUnits: 1,
      occupancyRate: 75,
      totalMonthlyRent: 6100,
      averageRent: 1525,
      totalValue: 800000,
      properties: [
        {
          propertyId: 'prop-1',
          propertyName: 'Sunset Apartments',
          address: '123 Main St, City, State',
          units: 2,
          occupiedUnits: 2,
          monthlyRent: 2500,
          propertyValue: 400000
        },
        {
          propertyId: 'prop-2',
          propertyName: 'Ocean View Condos',
          address: '456 Beach Blvd, City, State',
          units: 2,
          occupiedUnits: 1,
          monthlyRent: 3600,
          propertyValue: 400000
        }
      ]
    };

    res.json(mockData);
  } catch (error) {
    console.error('Error fetching portfolio summary report:', error);
    res.status(500).json({ message: 'Error fetching portfolio summary report' });
  }
});

// Capital Expenditure Report
router.get('/capital-expenditure', auth, async (req, res) => {
  try {
    console.log('Capital expenditure report requested for company:', req.user?.companyId);
    
    // Mock data for now
    const mockData = [
      {
        propertyId: 'prop-1',
        propertyName: 'Sunset Apartments',
        description: 'New HVAC system',
        amount: 15000,
        date: '2024-01-15',
        category: 'replacement',
        vendor: 'HVAC Pro',
        status: 'completed'
      }
    ];

    res.json(mockData);
  } catch (error) {
    console.error('Error fetching capital expenditure report:', error);
    res.status(500).json({ message: 'Error fetching capital expenditure report' });
  }
});

// Eviction Report
router.get('/eviction', auth, async (req, res) => {
  try {
    console.log('Eviction report requested for company:', req.user?.companyId);
    
    // Mock data for now
    const mockData = [
      {
        evictionId: 'evict-1',
        tenantName: 'Previous Tenant',
        propertyName: 'Ocean View Condos',
        unitNumber: 'B202',
        filingDate: '2024-01-01',
        courtDate: '2024-02-01',
        status: 'completed',
        reason: 'Non-payment of rent',
        amountOwed: 1800
      }
    ];

    res.json(mockData);
  } catch (error) {
    console.error('Error fetching eviction report:', error);
    res.status(500).json({ message: 'Error fetching eviction report' });
  }
});

// Forecast Report
router.get('/forecast', auth, async (req, res) => {
  try {
    console.log('Forecast report requested for company:', req.user?.companyId);
    
    // Mock data for now
    const mockData = [
      {
        period: '2024-02',
        projectedIncome: 15700,
        projectedExpenses: 7000,
        projectedNetIncome: 8700,
        assumptions: [
          {
            category: 'Rent',
            assumption: 'No rent increases',
            impact: 0
          },
          {
            category: 'Expenses',
            assumption: 'Maintenance costs remain stable',
            impact: 0
          }
        ]
      }
    ];

    res.json(mockData);
  } catch (error) {
    console.error('Error fetching forecast report:', error);
    res.status(500).json({ message: 'Error fetching forecast report' });
  }
});

// 404 handler for report routes
router.use((req, res) => {
  console.log('Report route not found:', req.method, req.path);
  res.status(404).json({ 
    message: 'Report route not found',
    path: req.path,
    method: req.method
  });
});

console.log('Report routes defined');

export default router; 