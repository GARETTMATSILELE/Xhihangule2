import { Request, Response } from 'express';
import { User } from '../models/User';
import { Lease } from '../models/Lease';
import { Property } from '../models/Property';
import { AppError } from '../middleware/errorHandler';
import { Payment } from '../models/Payment'; // Added import for Payment
import { RentalDeposit } from '../models/rentalDeposit';
import mongoose from 'mongoose';

// Helper function to get week of year
const getWeekOfYear = (date: Date): number => {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
};

interface CommissionData {
  monthly: number;
  yearly: number;
  total: number;
  details: {
    agentId: string;
    agentName: string;
    commission: number;
    monthlyCommissions: {
      month: number;
      year: number;
      commission: number;
    }[];
    commissionEntries: {
      paymentId: string;
      propertyId: string;
      propertyName: string;
      propertyAddress?: string;
      paymentDate: Date;
      referenceNumber?: string;
      year: number;
      month: number; // 0-based
      amount: number; // agent share allocated for this month
    }[];
    properties: {
      propertyId: string;
      propertyName: string;
      rent: number;
      commission: number;
      hasPayment: boolean;
    }[];
  }[];
}

interface AgencyCommission {
  monthly: number;
  yearly: number;
  total: number;
  details: {
    paymentId: string;
    paymentDate: Date;
    propertyId: string;
    propertyName: string;
    propertyAddress: string;
    rentalAmount: number;
    agencyShare: number;
  }[];
}

interface PREACommission {
  monthly: number;
  yearly: number;
  total: number;
  details: {
    propertyId: string;
    propertyName: string;
    rent: number;
    commission: number;
  }[];
}

export const getAgentCommissions = async (req: Request, res: Response) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      throw new AppError('Company ID not found', 404);
    }

    // Get query parameters for filtering
    const { year, month } = req.query;
    const filterYear = year ? parseInt(year as string) : new Date().getFullYear();
    const filterMonth = month !== undefined ? parseInt(month as string) : null;

    // Get all agents for the company (include sales as agents)
    const agents = await User.find({ companyId, role: { $in: ['agent', 'sales'] } });
    
    const commissionData: CommissionData = {
      monthly: 0,
      yearly: 0,
      total: 0,
      details: []
    };

    const currentDate = new Date();
    const currentMonth = currentDate.getMonth();
    const currentYear = currentDate.getFullYear();

    for (const agent of agents) {
      const agentDetails = {
        agentId: agent._id.toString(),
        agentName: `${agent.firstName} ${agent.lastName}`,
        commission: 0,
        monthlyCommissions: [] as { month: number; year: number; commission: number }[],
        commissionEntries: [] as {
          paymentId: string;
          propertyId: string;
          propertyName: string;
          propertyAddress?: string;
          paymentDate: Date;
          referenceNumber?: string;
          year: number;
          month: number;
          amount: number;
        }[],
        properties: [] as { propertyId: string; propertyName: string; rent: number; commission: number; hasPayment: boolean }[]
      };

      // Get all leases where this agent is the owner (agent who created/manages the lease)
      const leases = await Lease.find({
        ownerId: agent._id,
        status: 'active'
      }).populate('propertyId', 'name address');

      // Get all payments for properties managed by this agent
      const propertyIds = leases.map(lease => lease.propertyId);
      const payments = await Payment.find({
        propertyId: { $in: propertyIds },
        status: 'completed',
        commissionFinalized: true
      }).populate('propertyId', 'name address');

      // Create a map of payments by property and month/year for filtering (using rental period)
      const paymentMap = new Map();
      const agentCommissionMap = new Map(); // Track agent commissions by month/year (using rental period)

      payments.forEach(payment => {
        // Determine rental months covered by this payment, including advance payments
        const coveredMonths: { year: number; month: number }[] = [];

        const advanceMonths = (payment as any).advanceMonthsPaid as number | undefined;
        const startPeriod = (payment as any).advancePeriodStart as { month: number; year: number } | undefined;
        const endPeriod = (payment as any).advancePeriodEnd as { month: number; year: number } | undefined;

        if (advanceMonths && advanceMonths > 1 && startPeriod && endPeriod) {
          // Expand range from start to end inclusive
          let y = startPeriod.year;
          let m0 = startPeriod.month - 1; // convert to 0-based
          const endY = endPeriod.year;
          const endM0 = endPeriod.month - 1;
          while (y < endY || (y === endY && m0 <= endM0)) {
            coveredMonths.push({ year: y, month: m0 });
            m0 += 1;
            if (m0 > 11) { m0 = 0; y += 1; }
          }
        } else {
          // Single rental period month/year
          const y = (payment as any).rentalPeriodYear as number;
          const m0 = ((payment as any).rentalPeriodMonth as number) - 1; // 0-based
          if (typeof y === 'number' && typeof m0 === 'number' && m0 >= 0 && m0 <= 11) {
            coveredMonths.push({ year: y, month: m0 });
          }
        }

        // Fallback to paymentDate month/year if rental period is not set (legacy records)
        if (coveredMonths.length === 0) {
          const fallbackDate = new Date(payment.paymentDate);
          coveredMonths.push({ year: fallbackDate.getFullYear(), month: fallbackDate.getMonth() });
        }

        // Allocate agent share evenly across covered months
        const totalAgentShare = payment.commissionDetails?.agentShare || 0;
        const perMonthAgentShare = coveredMonths.length > 0 ? totalAgentShare / coveredMonths.length : 0;

        coveredMonths.forEach(({ year, month }) => {
          const propKeyRental = payment?.propertyId ? (payment.propertyId as any).toString() : String((payment as any).propertyId || 'unknown');
          const key = `${propKeyRental}-${year}-${month}`;
          paymentMap.set(key, true);

          const commissionKey = `${year}-${month}`;
          if (agentCommissionMap.has(commissionKey)) {
            agentCommissionMap.set(commissionKey, agentCommissionMap.get(commissionKey) + perMonthAgentShare);
          } else {
            agentCommissionMap.set(commissionKey, perMonthAgentShare);
          }

          // Push commission entry per month covered
          const propObj: any = payment.propertyId;
          agentDetails.commissionEntries.push({
            paymentId: payment._id.toString(),
            propertyId: propKeyRental,
            propertyName: (propObj && (propObj as any).name) || (payment as any).manualPropertyAddress || 'Manual Entry',
            propertyAddress: (propObj && (propObj as any).address) || (payment as any).manualPropertyAddress,
            paymentDate: payment.paymentDate,
            referenceNumber: (payment as any).referenceNumber,
            year,
            month,
            amount: perMonthAgentShare
          });
        });
      });

      // Include sales payments commissions for users with role 'sales' (and agents who make sales)
      const salesPayments = await Payment.find({
        companyId,
        status: 'completed',
        commissionFinalized: true,
        paymentType: 'sale',
        agentId: agent._id
      }).populate('propertyId', 'name address');

      salesPayments.forEach(payment => {
        const paymentDate = new Date(payment.paymentDate);
        const y = paymentDate.getFullYear();
        const m0 = paymentDate.getMonth();
        const totalAgentShare = payment.commissionDetails?.agentShare || 0;
        const perMonthAgentShare = totalAgentShare; // sales are one-off; allocate to payment month

        // Mark payment presence for this property-month to support filtered views
        const propKey = payment?.propertyId ? (payment.propertyId as any).toString() : String((payment as any).propertyId || 'unknown');
        const presenceKey = `${propKey}-${y}-${m0}`;
        paymentMap.set(presenceKey, true);

        const commissionKey = `${y}-${m0}`;
        if (agentCommissionMap.has(commissionKey)) {
          agentCommissionMap.set(commissionKey, agentCommissionMap.get(commissionKey) + perMonthAgentShare);
        } else {
          agentCommissionMap.set(commissionKey, perMonthAgentShare);
        }

        // Push commission entry for the sales payment month
        const propObj: any = payment.propertyId;
        agentDetails.commissionEntries.push({
          paymentId: payment._id.toString(),
          propertyId: propKey,
          propertyName: (propObj && (propObj as any).name) || (payment as any).manualPropertyAddress || 'Manual Entry',
          propertyAddress: (propObj && (propObj as any).address) || (payment as any).manualPropertyAddress,
          paymentDate: payment.paymentDate,
          referenceNumber: (payment as any).referenceNumber,
          year: y,
          month: m0,
          amount: perMonthAgentShare
        });
      });

      // Process each lease to build property details
      for (const lease of leases) {
        const property = lease.propertyId as any; // Cast to access populated fields
        if (!property) continue;

        const rent = lease.rentAmount;
        const commission = rent * 0.1; // Default commission calculation

        // Check if this property has payments for the filtered period
        let hasPayment = false;
        if (filterMonth !== null) {
          // Check specific month
          const leaseKey = (lease as any)?.propertyId ? (lease as any).propertyId.toString() : String((lease as any).propertyId || 'unknown');
          const key = `${leaseKey}-${filterYear}-${filterMonth}`;
          hasPayment = paymentMap.has(key);
        } else {
          // Check entire year
          const leaseKey = (lease as any)?.propertyId ? (lease as any).propertyId.toString() : String((lease as any).propertyId || 'unknown');
          const prefix = `${leaseKey}-${filterYear}-`;
          const yearPayments = Array.from(paymentMap.keys()).filter(key => key.startsWith(prefix));
          hasPayment = yearPayments.length > 0;
        }

        agentDetails.properties.push({
          propertyId: property._id.toString(),
          propertyName: property.name,
          rent,
          commission,
          hasPayment
        });
      }

      // Calculate agent commissions from actual payment data
      let totalAgentCommission = 0;
      
      // Build monthly commissions array from actual payment data
      for (const [key, agentShare] of agentCommissionMap) {
        const [year, month] = key.split('-').map(Number);
        
        // Apply filters if specified
        if (filterYear && year !== filterYear) continue;
        if (filterMonth !== null && month !== filterMonth) continue;
        
        agentDetails.monthlyCommissions.push({
          month,
          year,
          commission: agentShare
        });
        
        totalAgentCommission += agentShare;
        
        // Add to monthly and yearly totals if in current period
        if (month === currentMonth && year === currentYear) {
          commissionData.monthly += agentShare;
        }
        if (year === currentYear) {
          commissionData.yearly += agentShare;
        }
        commissionData.total += agentShare;
      }

      agentDetails.commission = totalAgentCommission;
      commissionData.details.push(agentDetails);
    }

    res.json(commissionData);
  } catch (error) {
    console.error('Error getting agent commissions:', error);
    throw new AppError('Failed to get agent commissions', 500);
  }
};

export const getAgencyCommission = async (req: Request, res: Response) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      throw new AppError('Company ID not found', 404);
    }

    // Get query parameters for filtering
    const { year, month, week, day, filterType } = req.query;
    const filterYear = year ? parseInt(year as string) : new Date().getFullYear();
    const filterMonth = month !== undefined ? parseInt(month as string) : null;
    const filterWeek = week !== undefined ? parseInt(week as string) : null;
    const filterDay = day !== undefined ? parseInt(day as string) : null;
    const filterPeriod = filterType as string || 'monthly';

    const agencyCommission: AgencyCommission = {
      monthly: 0,
      yearly: 0,
      total: 0,
      details: []
    };

    const currentDate = new Date();
    const currentMonth = currentDate.getMonth();
    const currentYear = currentDate.getFullYear();

    // Get all payments for the company with commission details
    const payments = await Payment.find({ 
      companyId,
      status: 'completed',
      commissionFinalized: true
    }).populate('propertyId', 'name address');

    for (const payment of payments) {
      const property = payment.propertyId as any; // Cast to access populated fields
      const agencyShare = payment.commissionDetails?.agencyShare || 0;
      const rentalAmount = payment.amount;

      if (agencyShare <= 0) continue;

      // Compute rental-period coverage (expand advances)
      const coveredMonths: { year: number; month: number }[] = [];
      const advanceMonths = (payment as any).advanceMonthsPaid as number | undefined;
      const startPeriod = (payment as any).advancePeriodStart as { month: number; year: number } | undefined;
      const endPeriod = (payment as any).advancePeriodEnd as { month: number; year: number } | undefined;

      if (advanceMonths && advanceMonths > 1 && startPeriod && endPeriod) {
        let y = startPeriod.year;
        let m0 = startPeriod.month - 1;
        const endY = endPeriod.year;
        const endM0 = endPeriod.month - 1;
        while (y < endY || (y === endY && m0 <= endM0)) {
          coveredMonths.push({ year: y, month: m0 });
          m0 += 1;
          if (m0 > 11) { m0 = 0; y += 1; }
        }
      } else {
        const y = (payment as any).rentalPeriodYear as number;
        const m0 = ((payment as any).rentalPeriodMonth as number) - 1;
        if (typeof y === 'number' && typeof m0 === 'number' && m0 >= 0 && m0 <= 11) {
          coveredMonths.push({ year: y, month: m0 });
        }
      }

      if (coveredMonths.length === 0) {
        const d = new Date(payment.paymentDate);
        coveredMonths.push({ year: d.getFullYear(), month: d.getMonth() });
      }

      const perMonthAgencyShare = agencyShare / coveredMonths.length;

      // Payment-date components (for daily/weekly filtering only)
      const paymentDate = new Date(payment.paymentDate);
      const paymentYear = paymentDate.getFullYear();
      const paymentMonth = paymentDate.getMonth();
      const paymentWeek = getWeekOfYear(paymentDate);
      const paymentDay = paymentDate.getDate();

      // Apply filters
      let shouldInclude = true;
      if (filterPeriod === 'yearly') {
        shouldInclude = coveredMonths.some(cm => cm.year === filterYear);
      } else if (filterPeriod === 'monthly') {
        shouldInclude = coveredMonths.some(cm => cm.year === filterYear && (filterMonth === null || cm.month === filterMonth));
      } else if (filterPeriod === 'weekly') {
        shouldInclude = paymentYear === filterYear && (filterWeek === null || paymentWeek === filterWeek);
      } else if (filterPeriod === 'daily') {
        shouldInclude = paymentYear === filterYear &&
                       (filterMonth === null || paymentMonth === filterMonth) &&
                       (filterDay === null || paymentDay === filterDay);
      }

      if (!shouldInclude) continue;

      // Push detail row (single row per payment) with manual entry fallbacks
      agencyCommission.details.push({
        paymentId: payment._id.toString(),
        paymentDate: payment.paymentDate,
        propertyId: payment?.propertyId ? (payment.propertyId as any).toString() : String((payment as any).propertyId || ''),
        propertyName: property?.name || (payment as any).manualPropertyAddress || 'Manual Entry',
        propertyAddress: property?.address || (payment as any).manualPropertyAddress || 'Manual Entry',
        rentalAmount: rentalAmount,
        agencyShare: agencyShare
      });

      // Totals:
      // - Monthly/Yearly tracked for current period using rental period months
      coveredMonths.forEach(({ year, month }) => {
        if (year === currentYear) {
          agencyCommission.yearly += perMonthAgencyShare;
          if (month === currentMonth) {
            agencyCommission.monthly += perMonthAgencyShare;
          }
        }
      });

      // - Filtered total: for monthly/yearly, sum only matching covered months; for daily/weekly, sum full payment share
      if (filterPeriod === 'yearly') {
        coveredMonths.forEach(({ year }) => {
          if (year === filterYear) agencyCommission.total += perMonthAgencyShare;
        });
      } else if (filterPeriod === 'monthly') {
        coveredMonths.forEach(({ year, month }) => {
          if (year === filterYear && (filterMonth === null || month === filterMonth)) {
            agencyCommission.total += perMonthAgencyShare;
          }
        });
      } else {
        agencyCommission.total += agencyShare;
      }
    }

    // Sort details by payment date (most recent first)
    agencyCommission.details.sort((a, b) => new Date(b.paymentDate).getTime() - new Date(a.paymentDate).getTime());

    res.json(agencyCommission);
  } catch (error) {
    console.error('Error getting agency commission:', error);
    throw new AppError('Failed to get agency commission', 500);
  }
};

export const getPREACommission = async (req: Request, res: Response) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      throw new AppError('Company ID not found', 404);
    }

    // Get query parameters for filtering (align with agency filters)
    const { year, month, week, day, filterType } = req.query;
    const filterYear = year ? parseInt(year as string) : new Date().getFullYear();
    const filterMonth = month !== undefined ? parseInt(month as string) : null;
    const filterWeek = week !== undefined ? parseInt(week as string) : null;
    const filterDay = day !== undefined ? parseInt(day as string) : null;
    const filterPeriod = (filterType as string) || 'monthly';

    const preaCommission: PREACommission = {
      monthly: 0,
      yearly: 0,
      total: 0,
      details: []
    };

    const currentDate = new Date();
    const currentMonth = currentDate.getMonth();
    const currentYear = currentDate.getFullYear();

    // Get payments and compute PREA from commissionDetails.preaFee
    const payments = await Payment.find({
      companyId,
      status: 'completed',
      commissionFinalized: true
    }).populate('propertyId', 'name address');

    // Aggregate PREA by property after applying filters
    const propertyMap: Map<string, { propertyId: string; propertyName: string; rent: number; commission: number }> = new Map();

    for (const payment of payments) {
      const property = payment.propertyId as any;
      const preaFee = payment.commissionDetails?.preaFee || 0;
      if (preaFee <= 0) continue;

      // Compute rental-period coverage (expand advances)
      const coveredMonths: { year: number; month: number }[] = [];
      const advanceMonths = (payment as any).advanceMonthsPaid as number | undefined;
      const startPeriod = (payment as any).advancePeriodStart as { month: number; year: number } | undefined;
      const endPeriod = (payment as any).advancePeriodEnd as { month: number; year: number } | undefined;

      if (advanceMonths && advanceMonths > 1 && startPeriod && endPeriod) {
        let y = startPeriod.year;
        let m0 = startPeriod.month - 1;
        const endY = endPeriod.year;
        const endM0 = endPeriod.month - 1;
        while (y < endY || (y === endY && m0 <= endM0)) {
          coveredMonths.push({ year: y, month: m0 });
          m0 += 1;
          if (m0 > 11) { m0 = 0; y += 1; }
        }
      } else {
        const y = (payment as any).rentalPeriodYear as number;
        const m0 = ((payment as any).rentalPeriodMonth as number) - 1;
        if (typeof y === 'number' && typeof m0 === 'number' && m0 >= 0 && m0 <= 11) {
          coveredMonths.push({ year: y, month: m0 });
        }
      }

      if (coveredMonths.length === 0) {
        const d = new Date(payment.paymentDate);
        coveredMonths.push({ year: d.getFullYear(), month: d.getMonth() });
      }

      const perMonthPreaFee = preaFee / coveredMonths.length;

      // Payment-date components (for daily/weekly filtering only)
      const paymentDate = new Date(payment.paymentDate);
      const paymentYear = paymentDate.getFullYear();
      const paymentMonth = paymentDate.getMonth();
      const paymentWeek = getWeekOfYear(paymentDate);
      const paymentDay = paymentDate.getDate();

      // Apply filters
      let shouldInclude = true;
      if (filterPeriod === 'yearly') {
        shouldInclude = coveredMonths.some(cm => cm.year === filterYear);
      } else if (filterPeriod === 'monthly') {
        shouldInclude = coveredMonths.some(cm => cm.year === filterYear && (filterMonth === null || cm.month === filterMonth));
      } else if (filterPeriod === 'weekly') {
        shouldInclude = paymentYear === filterYear && (filterWeek === null || paymentWeek === filterWeek);
      } else if (filterPeriod === 'daily') {
        shouldInclude = paymentYear === filterYear &&
                       (filterMonth === null || paymentMonth === filterMonth) &&
                       (filterDay === null || paymentDay === filterDay);
      }

      if (!shouldInclude) continue;

      const key = payment?.propertyId ? (payment.propertyId as any).toString() : String((payment as any).propertyId || '');
      const name = property?.name || (payment as any).manualPropertyAddress || 'Manual Entry';
      const rentAmount = typeof (payment as any).amount === 'number' ? (payment as any).amount : 0;

      // Compute contribution for the selected filter period to align detail rows with totals
      let contributionForFilter = 0;
      if (filterPeriod === 'yearly') {
        coveredMonths.forEach(({ year }) => {
          if (year === filterYear) contributionForFilter += perMonthPreaFee;
        });
      } else if (filterPeriod === 'monthly') {
        coveredMonths.forEach(({ year, month }) => {
          if (year === filterYear && (filterMonth === null || month === filterMonth)) {
            contributionForFilter += perMonthPreaFee;
          }
        });
      } else {
        contributionForFilter = preaFee;
      }

      if (contributionForFilter > 0) {
        if (propertyMap.has(key)) {
          const agg = propertyMap.get(key)!;
          agg.commission += contributionForFilter;
          agg.rent = rentAmount || agg.rent;
        } else {
          propertyMap.set(key, { propertyId: key, propertyName: name, rent: rentAmount, commission: contributionForFilter });
        }
      }

      // Monthly/Yearly/Total using rental period months for current and filtered periods
      coveredMonths.forEach(({ year, month }) => {
        if (year === currentYear) {
          preaCommission.yearly += perMonthPreaFee;
          if (month === currentMonth) {
            preaCommission.monthly += perMonthPreaFee;
          }
        }
      });

      if (filterPeriod === 'yearly') {
        coveredMonths.forEach(({ year }) => {
          if (year === filterYear) preaCommission.total += perMonthPreaFee;
        });
      } else if (filterPeriod === 'monthly') {
        coveredMonths.forEach(({ year, month }) => {
          if (year === filterYear && (filterMonth === null || month === filterMonth)) {
            preaCommission.total += perMonthPreaFee;
          }
        });
      } else {
        preaCommission.total += preaFee;
      }
    }

    preaCommission.details = Array.from(propertyMap.values());

    res.json(preaCommission);
  } catch (error) {
    console.error('Error getting PREA commission:', error);
    throw new AppError('Failed to get PREA commission', 500);
  }
}; 

// Deposits: Get property deposit ledger (payments and payouts) with running balance
export const getPropertyDepositLedger = async (req: Request, res: Response) => {
  try {
    const { propertyId } = req.params;
    if (!propertyId) {
      return res.status(400).json({ message: 'Property ID is required' });
    }

    const entries = await RentalDeposit.find({ propertyId })
      .sort({ depositDate: 1 })
      .lean();

    let balance = 0;
    const ledger = entries.map((e) => {
      if (e.type === 'payout') {
        balance -= e.depositAmount;
      } else {
        balance += e.depositAmount;
      }
      return { ...e, runningBalance: balance };
    });

    res.json({ success: true, data: { entries: ledger, balance } });
  } catch (error) {
    console.error('Error getting deposit ledger:', error);
    res.status(500).json({ success: false, message: 'Failed to get deposit ledger' });
  }
};

// Deposits: Get property deposit summary (currently held)
export const getPropertyDepositSummary = async (req: Request, res: Response) => {
  try {
    const { propertyId } = req.params;
    if (!propertyId) {
      return res.status(400).json({ message: 'Property ID is required' });
    }

    const agg = await RentalDeposit.aggregate([
      { $match: { propertyId: new (require('mongoose').Types.ObjectId)(propertyId) } },
      {
        $group: {
          _id: '$type',
          total: { $sum: '$depositAmount' }
        }
      }
    ]);

    const totalPaid = agg.find(a => a._id === 'payment')?.total || 0;
    const totalPayout = agg.find(a => a._id === 'payout')?.total || 0;
    const held = totalPaid - totalPayout;

    res.json({ success: true, data: { totalPaid, totalPayout, held } });
  } catch (error) {
    console.error('Error getting deposit summary:', error);
    res.status(500).json({ success: false, message: 'Failed to get deposit summary' });
  }
};

// Deposits: Create a deposit payout entry (reduces held balance)
export const createPropertyDepositPayout = async (req: Request, res: Response) => {
  try {
    const { propertyId } = req.params;
    const { amount, paymentMethod, notes, recipientName } = req.body;
    if (!propertyId || !amount || amount <= 0) {
      return res.status(400).json({ success: false, message: 'Property ID and valid amount are required' });
    }

    // Get current held amount
    const agg = await RentalDeposit.aggregate([
      { $match: { propertyId: new mongoose.Types.ObjectId(propertyId) } },
      { $group: { _id: '$type', total: { $sum: '$depositAmount' } } }
    ]);
    const totalPaid = agg.find(a => a._id === 'payment')?.total || 0;
    const totalPayout = agg.find(a => a._id === 'payout')?.total || 0;
    const held = totalPaid - totalPayout;
    if (amount > held) {
      return res.status(400).json({ success: false, message: 'Payout exceeds held deposit' });
    }

    const entry = await RentalDeposit.create({
      propertyId: new mongoose.Types.ObjectId(propertyId),
      agentId: new mongoose.Types.ObjectId(req.user!.userId),
      companyId: new mongoose.Types.ObjectId(req.user!.companyId),
      tenantId: new mongoose.Types.ObjectId(req.body.tenantId || req.user!.userId),
      depositAmount: amount,
      depositDate: new Date(),
      type: 'payout',
      referenceNumber: `DEP-PAYOUT-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`,
      notes: notes || '',
      processedBy: new mongoose.Types.ObjectId(req.user!.userId),
      paymentMethod: paymentMethod || 'bank_transfer',
      recipientName: recipientName || ''
    });

    res.json({ success: true, data: entry });
  } catch (error) {
    console.error('Error creating deposit payout:', error);
    res.status(500).json({ success: false, message: 'Failed to create deposit payout' });
  }
};