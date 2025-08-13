import { Request, Response } from 'express';
import { User } from '../models/User';
import { Lease } from '../models/Lease';
import { Property } from '../models/Property';
import { AppError } from '../middleware/errorHandler';
import { Payment } from '../models/Payment'; // Added import for Payment

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

    // Get all agents for the company
    const agents = await User.find({ companyId, role: 'agent' });
    
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
        status: 'completed'
      }).populate('propertyId', 'name address');

      // Create a map of payments by property and month/year for filtering
      const paymentMap = new Map();
      const agentCommissionMap = new Map(); // Track agent commissions by month/year
      
      payments.forEach(payment => {
        const paymentDate = new Date(payment.paymentDate);
        const month = paymentDate.getMonth();
        const year = paymentDate.getFullYear();
        const key = `${payment.propertyId.toString()}-${year}-${month}`;
        paymentMap.set(key, payment);
        
        // Track agent commission by month/year
        const commissionKey = `${year}-${month}`;
        const agentShare = payment.commissionDetails?.agentShare || 0;
        
        if (agentCommissionMap.has(commissionKey)) {
          agentCommissionMap.set(commissionKey, agentCommissionMap.get(commissionKey) + agentShare);
        } else {
          agentCommissionMap.set(commissionKey, agentShare);
        }
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
          const key = `${lease.propertyId.toString()}-${filterYear}-${filterMonth}`;
          hasPayment = paymentMap.has(key);
        } else {
          // Check entire year
          const yearPayments = Array.from(paymentMap.keys()).filter(key => 
            key.startsWith(`${lease.propertyId.toString()}-${filterYear}-`)
          );
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
      status: 'completed'
    }).populate('propertyId', 'name address');

    for (const payment of payments) {
      const property = payment.propertyId as any; // Cast to access populated fields
      const agencyShare = payment.commissionDetails?.agencyShare || 0;
      const rentalAmount = payment.amount;

      // Only include payments with agency commission
      if (agencyShare > 0) {
        const paymentDate = new Date(payment.paymentDate);
        const paymentYear = paymentDate.getFullYear();
        const paymentMonth = paymentDate.getMonth();
        const paymentWeek = getWeekOfYear(paymentDate);
        const paymentDay = paymentDate.getDate();

        // Apply filters based on filter type
        let shouldInclude = true;
        
        if (filterPeriod === 'yearly') {
          shouldInclude = paymentYear === filterYear;
        } else if (filterPeriod === 'monthly') {
          shouldInclude = paymentYear === filterYear && (filterMonth === null || paymentMonth === filterMonth);
        } else if (filterPeriod === 'weekly') {
          shouldInclude = paymentYear === filterYear && (filterWeek === null || paymentWeek === filterWeek);
        } else if (filterPeriod === 'daily') {
          shouldInclude = paymentYear === filterYear && 
                         (filterMonth === null || paymentMonth === filterMonth) && 
                         (filterDay === null || paymentDay === filterDay);
        }

        if (shouldInclude) {
          const commissionDetail = {
            paymentId: payment._id.toString(),
            paymentDate: payment.paymentDate,
            propertyId: payment.propertyId.toString(),
            propertyName: property?.name || 'Unknown Property',
            propertyAddress: property?.address || 'Unknown Address',
            rentalAmount: rentalAmount,
            agencyShare: agencyShare
          };

          agencyCommission.details.push(commissionDetail);

          // Add to monthly and yearly totals if payment is in current period
          if (paymentMonth === currentMonth && paymentYear === currentYear) {
            agencyCommission.monthly += agencyShare;
          }
          if (paymentYear === currentYear) {
            agencyCommission.yearly += agencyShare;
          }
          agencyCommission.total += agencyShare;
        }
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

    const preaCommission: PREACommission = {
      monthly: 0,
      yearly: 0,
      total: 0,
      details: []
    };

    const currentDate = new Date();
    const currentMonth = currentDate.getMonth();
    const currentYear = currentDate.getFullYear();

    // Get all active leases for the company
    const properties = await Property.find({ companyId });
    const propertyIds = properties.map(p => p._id);

    const leases = await Lease.find({
      propertyId: { $in: propertyIds },
      status: 'active'
    });

    for (const lease of leases) {
      const property = properties.find(p => p._id.toString() === lease.propertyId.toString());
      if (!property) continue;

      const rent = lease.rentAmount;
      const commission = rent * 0.01; // 1% PREA commission

      preaCommission.details.push({
        propertyId: property._id.toString(),
        propertyName: property.name,
        rent,
        commission
      });

      // Add to monthly and yearly totals if lease is current
      if (lease.startDate.getMonth() === currentMonth && lease.startDate.getFullYear() === currentYear) {
        preaCommission.monthly += commission;
      }
      if (lease.startDate.getFullYear() === currentYear) {
        preaCommission.yearly += commission;
      }
      preaCommission.total += commission;
    }

    res.json(preaCommission);
  } catch (error) {
    console.error('Error getting PREA commission:', error);
    throw new AppError('Failed to get PREA commission', 500);
  }
}; 