import { Request, Response } from 'express';
import { LeaseRepository } from '../repositories/leaseRepository';
import mongoose from 'mongoose';

export class LeaseController {
  private static instance: LeaseController;
  private readonly leaseRepository: LeaseRepository;

  private constructor() {
    this.leaseRepository = LeaseRepository.getInstance();
  }

  static getInstance(): LeaseController {
    if (!LeaseController.instance) {
      LeaseController.instance = new LeaseController();
    }
    return LeaseController.instance;
  }

  async getLeases(req: Request, res: Response): Promise<void> {
    try {
      const companyId = req.user?.companyId;
      const leases = companyId 
        ? await this.leaseRepository.findByCompanyId(companyId)
        : await this.leaseRepository.find({});
      
      res.json(leases);
    } catch (error) {
      console.error('Error fetching leases:', error);
      res.status(500).json({ error: 'Failed to fetch leases' });
    }
  }

  async getLeaseById(req: Request, res: Response): Promise<void> {
    try {
      const lease = await this.leaseRepository.findById(req.params.id);
      if (!lease) {
        res.status(404).json({ error: 'Lease not found' });
        return;
      }
      res.json(lease);
    } catch (error) {
      console.error('Error fetching lease:', error);
      res.status(500).json({ error: 'Failed to fetch lease' });
    }
  }

  async createLease(req: Request, res: Response): Promise<void> {
    try {
      console.log('Creating lease with data:', JSON.stringify(req.body, null, 2));
      console.log('User info:', req.user);
      
      // Validate required fields - handle both field name variations
      const { propertyId, tenantId, startDate, endDate, rentAmount, depositAmount, monthlyRent, securityDeposit } = req.body;
      
      // Use monthlyRent/securityDeposit if rentAmount/depositAmount are not provided
      const finalRentAmount = rentAmount !== undefined ? rentAmount : monthlyRent;
      const finalDepositAmount = depositAmount !== undefined ? depositAmount : securityDeposit;
      
      console.log('Extracted required fields:', {
        propertyId,
        tenantId,
        startDate,
        endDate,
        rentAmount: finalRentAmount,
        depositAmount: finalDepositAmount,
        originalRentAmount: rentAmount,
        originalDepositAmount: depositAmount,
        monthlyRent,
        securityDeposit
      });
      
      console.log('Field validation results:', {
        hasPropertyId: !!propertyId,
        hasTenantId: !!tenantId,
        hasStartDate: !!startDate,
        hasEndDate: !!endDate,
        hasRentAmount: finalRentAmount !== undefined && finalRentAmount !== null,
        hasDepositAmount: finalDepositAmount !== undefined && finalDepositAmount !== null,
        rentAmountType: typeof finalRentAmount,
        depositAmountType: typeof finalDepositAmount
      });
      
      if (!propertyId || !tenantId || !startDate || !endDate || finalRentAmount === undefined || finalRentAmount === null || finalDepositAmount === undefined || finalDepositAmount === null) {
        console.log('Missing required fields detected');
        res.status(400).json({ 
          error: 'Missing required fields: propertyId, tenantId, startDate, endDate, rentAmount, depositAmount',
          received: { propertyId, tenantId, startDate, endDate, rentAmount: finalRentAmount, depositAmount: finalDepositAmount }
        });
        return;
      }

      // Check if amounts are valid numbers (including 0)
      if (isNaN(Number(finalRentAmount)) || isNaN(Number(finalDepositAmount))) {
        console.log('Invalid numeric values detected');
        res.status(400).json({ 
          error: 'Rent amount and deposit amount must be valid numbers',
          received: { rentAmount: finalRentAmount, depositAmount: finalDepositAmount }
        });
        return;
      }

      // Ensure companyId is available
      if (!req.user?.companyId && !req.body.companyId) {
        console.log('Missing companyId detected');
        res.status(400).json({ 
          error: 'Company ID is required',
          received: { userCompanyId: req.user?.companyId, bodyCompanyId: req.body.companyId }
        });
        return;
      }

      // Transform and validate the data
      const leaseData = {
        propertyId,
        tenantId,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        rentAmount: Number(finalRentAmount),
        depositAmount: Number(finalDepositAmount),
        status: req.body.status || 'active',
        companyId: req.user?.companyId ? new mongoose.Types.ObjectId(req.user.companyId) : (req.body.companyId ? new mongoose.Types.ObjectId(req.body.companyId) : undefined),
        // Always stamp ownerId from the authenticated user context (required by schema)
        ownerId: req.user?.userId ? new mongoose.Types.ObjectId(req.user.userId) : undefined,
        // Additional fields with defaults
        monthlyRent: Number(req.body.monthlyRent || finalRentAmount),
        securityDeposit: Number(req.body.securityDeposit || finalDepositAmount),
        petDeposit: Number(req.body.petDeposit || 0),
        isPetAllowed: Boolean(req.body.isPetAllowed || false),
        maxOccupants: Number(req.body.maxOccupants || 1),
        isUtilitiesIncluded: Boolean(req.body.isUtilitiesIncluded || false),
        utilitiesDetails: req.body.utilitiesDetails || '',
        rentDueDay: Number(req.body.rentDueDay || 1),
        lateFee: Number(req.body.lateFee || 0),
        gracePeriod: Number(req.body.gracePeriod || 0)
      };

      // Validate date ranges
      if (leaseData.startDate >= leaseData.endDate) {
        res.status(400).json({ error: 'End date must be after start date' });
        return;
      }

      // Validate numeric fields
      if (leaseData.rentAmount < 0 || leaseData.depositAmount < 0) {
        res.status(400).json({ error: 'Rent amount and deposit amount must be non-negative' });
        return;
      }

      console.log('Processed lease data:', leaseData);

      const lease = await this.leaseRepository.create(leaseData);
      console.log('Lease created successfully:', lease._id);
      
      res.status(201).json(lease);
    } catch (error: any) {
      console.error('Error creating lease:', error);
      
      // Handle Mongoose validation errors
      if (error.name === 'ValidationError') {
        const validationErrors = Object.values(error.errors).map((err: any) => err.message);
        res.status(400).json({ 
          error: 'Validation failed', 
          details: validationErrors 
        });
        return;
      }
      
      // Handle duplicate key errors
      if (error.code === 11000) {
        res.status(400).json({ 
          error: 'A lease with these details already exists' 
        });
        return;
      }
      
      res.status(500).json({ error: 'Failed to create lease' });
    }
  }

  async updateLease(req: Request, res: Response): Promise<void> {
    try {
      console.log('Updating lease with data:', req.body);
      
      const { id } = req.params;
      const updateData = { ...req.body };

      // Transform numeric fields
      if (updateData.rentAmount !== undefined) updateData.rentAmount = Number(updateData.rentAmount);
      if (updateData.depositAmount !== undefined) updateData.depositAmount = Number(updateData.depositAmount);
      if (updateData.monthlyRent !== undefined) updateData.monthlyRent = Number(updateData.monthlyRent);
      if (updateData.securityDeposit !== undefined) updateData.securityDeposit = Number(updateData.securityDeposit);
      if (updateData.petDeposit !== undefined) updateData.petDeposit = Number(updateData.petDeposit);
      if (updateData.maxOccupants !== undefined) updateData.maxOccupants = Number(updateData.maxOccupants);
      if (updateData.rentDueDay !== undefined) updateData.rentDueDay = Number(updateData.rentDueDay);
      if (updateData.lateFee !== undefined) updateData.lateFee = Number(updateData.lateFee);
      if (updateData.gracePeriod !== undefined) updateData.gracePeriod = Number(updateData.gracePeriod);

      // Transform boolean fields
      if (updateData.isPetAllowed !== undefined) updateData.isPetAllowed = Boolean(updateData.isPetAllowed);
      if (updateData.isUtilitiesIncluded !== undefined) updateData.isUtilitiesIncluded = Boolean(updateData.isUtilitiesIncluded);

      // Transform date fields
      if (updateData.startDate) updateData.startDate = new Date(updateData.startDate);
      if (updateData.endDate) updateData.endDate = new Date(updateData.endDate);

      // Validate date ranges if both dates are provided
      if (updateData.startDate && updateData.endDate && updateData.startDate >= updateData.endDate) {
        res.status(400).json({ error: 'End date must be after start date' });
        return;
      }

      // Validate numeric fields
      if (updateData.rentAmount !== undefined && updateData.rentAmount < 0) {
        res.status(400).json({ error: 'Rent amount must be non-negative' });
        return;
      }
      if (updateData.depositAmount !== undefined && updateData.depositAmount < 0) {
        res.status(400).json({ error: 'Deposit amount must be non-negative' });
        return;
      }

      console.log('Processed update data:', updateData);

      const lease = await this.leaseRepository.update(id, updateData);
      if (!lease) {
        res.status(404).json({ error: 'Lease not found' });
        return;
      }
      
      console.log('Lease updated successfully:', lease._id);
      res.json(lease);
    } catch (error: any) {
      console.error('Error updating lease:', error);
      
      // Handle Mongoose validation errors
      if (error.name === 'ValidationError') {
        const validationErrors = Object.values(error.errors).map((err: any) => err.message);
        res.status(400).json({ 
          error: 'Validation failed', 
          details: validationErrors 
        });
        return;
      }
      
      res.status(500).json({ error: 'Failed to update lease' });
    }
  }

  async deleteLease(req: Request, res: Response): Promise<void> {
    try {
      const success = await this.leaseRepository.delete(req.params.id);
      if (!success) {
        res.status(404).json({ error: 'Lease not found' });
        return;
      }
      res.status(204).send();
    } catch (error) {
      console.error('Error deleting lease:', error);
      res.status(500).json({ error: 'Failed to delete lease' });
    }
  }

  async getLeaseStats(req: Request, res: Response): Promise<void> {
    try {
      const stats = await this.leaseRepository.getLeaseStats();
      res.json(stats);
    } catch (error) {
      console.error('Error fetching lease stats:', error);
      res.status(500).json({ error: 'Failed to fetch lease stats' });
    }
  }

  async getActiveLeases(req: Request, res: Response): Promise<void> {
    try {
      const leases = await this.leaseRepository.findActiveLeases();
      res.json(leases);
    } catch (error) {
      console.error('Error fetching active leases:', error);
      res.status(500).json({ error: 'Failed to fetch active leases' });
    }
  }

  async getExpiringLeases(req: Request, res: Response): Promise<void> {
    try {
      const daysThreshold = parseInt(req.query.days as string) || 30;
      const leases = await this.leaseRepository.findExpiringLeases(daysThreshold);
      res.json(leases);
    } catch (error) {
      console.error('Error fetching expiring leases:', error);
      res.status(500).json({ error: 'Failed to fetch expiring leases' });
    }
  }

  async updateLeaseStatus(req: Request, res: Response): Promise<void> {
    try {
      const { status } = req.body;
      const lease = await this.leaseRepository.updateLeaseStatus(req.params.id, status);
      if (!lease) {
        res.status(404).json({ error: 'Lease not found' });
        return;
      }
      res.json(lease);
    } catch (error) {
      console.error('Error updating lease status:', error);
      res.status(500).json({ error: 'Failed to update lease status' });
    }
  }

  async extendLease(req: Request, res: Response): Promise<void> {
    try {
      const { newEndDate } = req.body;
      const lease = await this.leaseRepository.extendLease(req.params.id, new Date(newEndDate));
      if (!lease) {
        res.status(404).json({ error: 'Lease not found' });
        return;
      }
      res.json(lease);
    } catch (error) {
      console.error('Error extending lease:', error);
      res.status(500).json({ error: 'Failed to extend lease' });
    }
  }

  // Public endpoint for admin dashboard - no authentication required
  async getLeasesPublic(req: Request, res: Response): Promise<void> {
    try {
      console.log('Public leases request:', {
        query: req.query,
        headers: req.headers
      });

      // Get company ID from query params or headers (for admin dashboard)
      const companyId = req.query.companyId as string || req.headers['x-company-id'] as string;
      
      let query: any = {};
      
      // Filter by company ID if provided
      if (companyId) {
        query.companyId = companyId;
      }

      // Additional filtering options
      if (req.query.status) {
        query.status = req.query.status;
      }

      if (req.query.propertyId) {
        query.propertyId = req.query.propertyId;
      }

      if (req.query.tenantId) {
        query.tenantId = req.query.tenantId;
      }

      console.log('Public leases query:', query);

      const leases = await this.leaseRepository.find(query);

      console.log(`Found ${leases.length} leases`);

      res.json({
        status: 'success',
        data: leases,
        count: leases.length,
        companyId: companyId || null
      });
    } catch (error) {
      console.error('Error fetching leases (public):', error);
      res.status(500).json({
        status: 'error',
        message: 'Error fetching leases',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  // Public endpoint for getting a single lease by ID - no authentication required
  async getLeaseByIdPublic(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const companyId = req.query.companyId as string || req.headers['x-company-id'] as string;
      
      console.log('Public lease by ID request:', {
        id,
        companyId,
        query: req.query,
        headers: req.headers
      });

      let query: any = { _id: id };
      
      // Filter by company ID if provided
      if (companyId) {
        query.companyId = companyId;
      }

      console.log('Public lease by ID query:', query);

      const lease = await this.leaseRepository.findOne(query);

      if (!lease) {
        res.status(404).json({
          status: 'error',
          message: 'Lease not found',
          id,
          companyId: companyId || null
        });
        return;
      }

      console.log('Found lease:', { id: lease._id, propertyId: lease.propertyId });

      res.json({
        status: 'success',
        data: lease
      });
    } catch (error) {
      console.error('Error fetching lease by ID (public):', error);
      res.status(500).json({
        status: 'error',
        message: 'Error fetching lease',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
} 