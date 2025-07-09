import { Request, Response } from 'express';
import { User } from '../models/User';
import { Lease } from '../models/Lease';
import { Property } from '../models/Property';
import { AppError } from '../middleware/errorHandler';

interface CommissionData {
  monthly: number;
  yearly: number;
  total: number;
  details: {
    agentId: string;
    agentName: string;
    commission: number;
    properties: {
      propertyId: string;
      propertyName: string;
      rent: number;
      commission: number;
    }[];
  }[];
}

interface AgencyCommission {
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
        properties: [] as { propertyId: string; propertyName: string; rent: number; commission: number }[]
      };

      // Get all active leases for properties managed by this agent
      const properties = await Property.find({ agentId: agent._id });
      const propertyIds = properties.map(p => p._id);

      const leases = await Lease.find({
        propertyId: { $in: propertyIds },
        status: 'active'
      });

      for (const lease of leases) {
        const property = properties.find(p => p._id.toString() === lease.propertyId.toString());
        if (!property) continue;

        const rent = lease.rentAmount;
        const commission = rent * 0.1; // 10% commission

        agentDetails.properties.push({
          propertyId: property._id.toString(),
          propertyName: property.name,
          rent,
          commission
        });

        agentDetails.commission += commission;

        // Add to monthly and yearly totals if lease is current
        if (lease.startDate.getMonth() === currentMonth && lease.startDate.getFullYear() === currentYear) {
          commissionData.monthly += commission;
        }
        if (lease.startDate.getFullYear() === currentYear) {
          commissionData.yearly += commission;
        }
        commissionData.total += commission;
      }

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

    const agencyCommission: AgencyCommission = {
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
      const commission = rent * 0.15; // 15% agency commission

      agencyCommission.details.push({
        propertyId: property._id.toString(),
        propertyName: property.name,
        rent,
        commission
      });

      // Add to monthly and yearly totals if lease is current
      if (lease.startDate.getMonth() === currentMonth && lease.startDate.getFullYear() === currentYear) {
        agencyCommission.monthly += commission;
      }
      if (lease.startDate.getFullYear() === currentYear) {
        agencyCommission.yearly += commission;
      }
      agencyCommission.total += commission;
    }

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