import { Request, Response } from 'express';
import { LeaseRepository } from '../repositories/leaseRepository';
import mongoose from 'mongoose';
import { Lease, LeaseStatus } from '../models/Lease';
import { Payment } from '../models/Payment';
import { Property } from '../models/Property';
import { Tenant } from '../models/Tenant';
import { LeaseBillingEngine } from '../services/leaseBillingEngine';
import { ensureLeaseInspectionSchedule, ensureMoveOutInspection } from '../services/inspectionAutomationService';

const LEASE_STATUSES: LeaseStatus[] = [
  'draft',
  'pending_approval',
  'active',
  'expiring_soon',
  'expired',
  'renewed',
  'terminated',
  'pending_settlement',
  'closed',
];

const IMMUTABLE_LEASE_STATUSES: LeaseStatus[] = [
  'active',
  'expiring_soon',
  'expired',
  'renewed',
  'terminated',
  'pending_settlement',
  'closed',
];

const IMMUTABLE_LEASE_FIELDS = [
  'propertyId',
  'tenantId',
  'startDate',
  'endDate',
  'rentAmount',
  'depositAmount',
  'monthlyRent',
  'securityDeposit',
  'previousLeaseId',
  'successorLeaseId',
  'billingRules',
];

const asObjectIdOrUndefined = (value: unknown): mongoose.Types.ObjectId | undefined => {
  if (!value || !mongoose.Types.ObjectId.isValid(String(value))) return undefined;
  return new mongoose.Types.ObjectId(String(value));
};

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
      // Validate required fields - handle both field name variations
      const { propertyId, tenantId, startDate, endDate, rentAmount, depositAmount, monthlyRent, securityDeposit } = req.body;
      
      // Use monthlyRent/securityDeposit if rentAmount/depositAmount are not provided
      const finalRentAmount = rentAmount !== undefined ? rentAmount : monthlyRent;
      const finalDepositAmount = depositAmount !== undefined ? depositAmount : securityDeposit;
      
      if (process.env.NODE_ENV !== 'production') {
        console.log('Extracted required fields:', {
          propertyId,
          tenantId,
          startDate,
          endDate,
          rentAmount: finalRentAmount,
          depositAmount: finalDepositAmount
        });
      }
      
      if (process.env.NODE_ENV !== 'production') {
        console.log('Field validation results:', {
          hasPropertyId: !!propertyId,
          hasTenantId: !!tenantId,
          hasStartDate: !!startDate,
          hasEndDate: !!endDate,
          hasRentAmount: finalRentAmount !== undefined && finalRentAmount !== null,
          hasDepositAmount: finalDepositAmount !== undefined && finalDepositAmount !== null
        });
      }
      
      if (!propertyId || !tenantId || !startDate || !endDate || finalRentAmount === undefined || finalRentAmount === null || finalDepositAmount === undefined || finalDepositAmount === null) {
        if (process.env.NODE_ENV !== 'production') {
          console.log('Missing required fields detected');
        }
        res.status(400).json({ 
          error: 'Missing required fields: propertyId, tenantId, startDate, endDate, rentAmount, depositAmount',
          received: { propertyId, tenantId, startDate, endDate, rentAmount: finalRentAmount, depositAmount: finalDepositAmount }
        });
        return;
      }

      // Check if amounts are valid numbers (including 0)
      if (isNaN(Number(finalRentAmount)) || isNaN(Number(finalDepositAmount))) {
        if (process.env.NODE_ENV !== 'production') {
          console.log('Invalid numeric values detected');
        }
        res.status(400).json({ 
          error: 'Rent amount and deposit amount must be valid numbers',
          received: { rentAmount: finalRentAmount, depositAmount: finalDepositAmount }
        });
        return;
      }

      // Ensure companyId is available
      if (!req.user?.companyId && !req.body.companyId) {
        if (process.env.NODE_ENV !== 'production') {
          console.log('Missing companyId detected');
        }
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
        status: LEASE_STATUSES.includes(req.body.status) ? req.body.status : 'active',
        companyId: req.user?.companyId ? new mongoose.Types.ObjectId(req.user.companyId) : (req.body.companyId ? new mongoose.Types.ObjectId(req.body.companyId) : undefined),
        // Always stamp ownerId from the authenticated user context (required by schema)
        ownerId: req.user?.userId ? new mongoose.Types.ObjectId(req.user.userId) : undefined,
        previousLeaseId: asObjectIdOrUndefined(req.body.previousLeaseId) || null,
        renewalReminderDate: req.body.renewalReminderDate ? new Date(req.body.renewalReminderDate) : undefined,
        billingStatus: req.body.billingStatus || 'current',
        billingRules: {
          frequency: 'monthly' as const,
          rentDueDay: Number(req.body.rentDueDay || 1),
          escalationPercent: Number(req.body.escalationPercent || req.body.billingRules?.escalationPercent || 0),
          escalationFrequencyMonths: Number(req.body.escalationFrequencyMonths || req.body.billingRules?.escalationFrequencyMonths || 12),
          nextEscalationDate: req.body.nextEscalationDate || req.body.billingRules?.nextEscalationDate
            ? new Date(req.body.nextEscalationDate || req.body.billingRules.nextEscalationDate)
            : undefined,
          recurringLevies: Number(req.body.recurringLevies || req.body.billingRules?.recurringLevies || 0),
          recurringServiceCharges: Number(req.body.recurringServiceCharges || req.body.billingRules?.recurringServiceCharges || 0),
          prorateMoveIn: req.body.prorateMoveIn ?? req.body.billingRules?.prorateMoveIn ?? true,
        },
        financialSummary: {
          totalBilled: 0,
          totalPaid: 0,
          outstandingBalance: 0,
          depositHeld: Number(finalDepositAmount),
          penalties: 0,
          moveOutSettlement: 0,
        },
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

      if (process.env.NODE_ENV !== 'production') {
        console.log('Processed lease data for property', leaseData?.propertyId);
      }

      const lease = await this.leaseRepository.create(leaseData);
      if (leaseData.previousLeaseId) {
        await this.leaseRepository.linkSuccessor(String(leaseData.previousLeaseId), lease._id as mongoose.Types.ObjectId);
      }
      if (lease.status === 'active' || lease.status === 'pending_approval') {
        ensureLeaseInspectionSchedule(lease).catch((error) => {
          console.error('Failed to create lease inspection schedule:', error);
        });
      }
      if (process.env.NODE_ENV !== 'production') {
        console.log('Lease created successfully:', lease._id);
      }
      
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
      if (process.env.NODE_ENV !== 'production') {
        console.log('Updating lease', req.params.id);
      }
      
      const { id } = req.params;
      const updateData = { ...req.body };
      const existingLease = await this.leaseRepository.findById(id);
      if (!existingLease) {
        res.status(404).json({ error: 'Lease not found' });
        return;
      }

      if (IMMUTABLE_LEASE_STATUSES.includes(existingLease.status)) {
        const destructiveFields = IMMUTABLE_LEASE_FIELDS.filter((field) => field in updateData);
        if (destructiveFields.length > 0) {
          res.status(409).json({
            error: 'Active and historical leases are immutable. Create a renewal lease or controlled amendment instead.',
            blockedFields: destructiveFields,
          });
          return;
        }
      }

      if (updateData.status && !LEASE_STATUSES.includes(updateData.status)) {
        res.status(400).json({ error: 'Invalid lease status' });
        return;
      }

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

      if (process.env.NODE_ENV !== 'production') {
        console.log('Processed lease update', id);
      }

      if (updateData.status && updateData.status !== existingLease.status) {
        updateData.lifecycleStatusChangedAt = new Date();
      }

      const lease = await this.leaseRepository.update(id, updateData);
      if (!lease) {
        res.status(404).json({ error: 'Lease not found' });
        return;
      }
      
      if (process.env.NODE_ENV !== 'production') {
        console.log('Lease updated successfully:', lease._id);
      }
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
      if (!LEASE_STATUSES.includes(status)) {
        res.status(400).json({ error: 'Invalid lease status' });
        return;
      }
      const lease = await this.leaseRepository.updateLeaseStatus(req.params.id, status);
      if (!lease) {
        res.status(404).json({ error: 'Lease not found' });
        return;
      }
      if (status === 'active') {
        ensureLeaseInspectionSchedule(lease).catch((error) => {
          console.error('Failed to create active lease inspection schedule:', error);
        });
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
      const lease = await this.leaseRepository.findById(req.params.id);
      if (!lease) {
        res.status(404).json({ error: 'Lease not found' });
        return;
      }
      const successor = await this.createSuccessorLease(lease, {
        ...req.body,
        startDate: new Date(lease.endDate.getTime() + 24 * 60 * 60 * 1000),
        endDate: new Date(newEndDate),
      });
      res.status(201).json(successor);
    } catch (error) {
      console.error('Error extending lease:', error);
      res.status(500).json({ error: 'Failed to renew lease' });
    }
  }

  async renewLease(req: Request, res: Response): Promise<void> {
    try {
      const lease = await this.leaseRepository.findById(req.params.id);
      if (!lease) {
        res.status(404).json({ error: 'Lease not found' });
        return;
      }

      const successor = await this.createSuccessorLease(lease, req.body);
      res.status(201).json(successor);
    } catch (error: any) {
      console.error('Error renewing lease:', error);
      res.status(500).json({ error: error.message || 'Failed to renew lease' });
    }
  }

  async terminateLease(req: Request, res: Response): Promise<void> {
    try {
      const lease = await Lease.findById(req.params.id);
      if (!lease) {
        res.status(404).json({ error: 'Lease not found' });
        return;
      }

      const payments = await Payment.find({
        leaseId: lease._id,
        status: { $in: ['pending', 'completed'] }
      });
      const totalPaid = payments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
      const generatedPeriods = LeaseBillingEngine.generateMonthlyPeriods(lease, lease.startDate, req.body.moveOutDate ? new Date(req.body.moveOutDate) : new Date());
      const totalBilled = generatedPeriods.reduce((sum, period) => sum + period.totalAmount, 0);
      const outstandingBalance = Math.max(0, totalBilled - totalPaid);
      const depositHeld = Number(lease.depositAmount || lease.securityDeposit || 0);
      const deductions = Number(req.body.deductions || req.body.damages || 0);
      const refundDue = Math.max(0, depositHeld - deductions - outstandingBalance);

      lease.status = 'pending_settlement';
      lease.terminationDate = req.body.terminationDate ? new Date(req.body.terminationDate) : new Date();
      lease.terminationReason = req.body.reason || req.body.terminationReason || 'Move-out initiated';
      lease.moveOutDate = req.body.moveOutDate ? new Date(req.body.moveOutDate) : lease.terminationDate;
      lease.lifecycleStatusChangedAt = new Date();
      lease.financialSummary = {
        totalBilled,
        totalPaid,
        outstandingBalance,
        depositHeld,
        penalties: Number(req.body.penalties || 0),
        moveOutSettlement: refundDue,
      };
      lease.depositSettlement = {
        depositHeld,
        deductions,
        refundDue,
        notes: req.body.settlementNotes || '',
      };
      await lease.save();
      ensureMoveOutInspection(lease, lease.moveOutDate || lease.terminationDate || new Date()).catch((error) => {
        console.error('Failed to create move-out inspection:', error);
      });

      res.json(lease);
    } catch (error) {
      console.error('Error terminating lease:', error);
      res.status(500).json({ error: 'Failed to terminate lease' });
    }
  }

  async closeSettlement(req: Request, res: Response): Promise<void> {
    try {
      const lease = await Lease.findById(req.params.id);
      if (!lease) {
        res.status(404).json({ error: 'Lease not found' });
        return;
      }

      lease.status = 'closed';
      lease.settlementClosedAt = new Date();
      lease.lifecycleStatusChangedAt = new Date();
      if (lease.depositSettlement) {
        lease.depositSettlement.settledAt = new Date();
        lease.depositSettlement.notes = req.body.notes || lease.depositSettlement.notes;
      }
      await lease.save();

      const activePropertyLease = await Lease.findOne({
        propertyId: lease.propertyId,
        status: { $in: ['active', 'expiring_soon', 'pending_approval'] },
        _id: { $ne: lease._id }
      });

      const activeLeaseForSameTenant = await Lease.findOne({
        propertyId: lease.propertyId,
        tenantId: lease.tenantId,
        status: { $in: ['active', 'expiring_soon', 'pending_approval'] },
        _id: { $ne: lease._id }
      });

      if (!activeLeaseForSameTenant) {
        await Promise.all([
          Tenant.updateOne(
            { _id: lease.tenantId, propertyId: lease.propertyId },
            { $unset: { propertyId: '' } }
          ),
          Tenant.updateOne(
            { _id: lease.tenantId },
            { $pull: { propertyIds: lease.propertyId } }
          )
        ]);
      }

      if (!activePropertyLease) {
        await Property.findByIdAndUpdate(lease.propertyId, {
          status: 'available',
          propertyOperationalStatus: 'Vacant',
          occupiedUnits: 0,
          nextLeaseExpiry: null
        });
      }

      res.json(lease);
    } catch (error) {
      console.error('Error closing settlement:', error);
      res.status(500).json({ error: 'Failed to close lease settlement' });
    }
  }

  private async createSuccessorLease(previousLease: any, body: any): Promise<any> {
    const startDate = body.startDate ? new Date(body.startDate) : new Date(previousLease.endDate.getTime() + 24 * 60 * 60 * 1000);
    const endDate = body.endDate ? new Date(body.endDate) : new Date(startDate.getFullYear() + 1, startDate.getMonth(), startDate.getDate() - 1);
    if (startDate >= endDate) {
      throw new Error('Renewal end date must be after start date');
    }

    const successor = await Lease.create({
      propertyId: body.propertyId || previousLease.propertyId,
      tenantId: body.tenantId || previousLease.tenantId,
      startDate,
      endDate,
      rentAmount: Number(body.rentAmount ?? body.monthlyRent ?? previousLease.rentAmount),
      depositAmount: Number(body.depositAmount ?? body.securityDeposit ?? previousLease.depositAmount),
      status: body.status || 'active',
      companyId: previousLease.companyId,
      ownerId: previousLease.ownerId,
      previousLeaseId: previousLease._id,
      monthlyRent: Number(body.monthlyRent ?? body.rentAmount ?? previousLease.monthlyRent ?? previousLease.rentAmount),
      securityDeposit: Number(body.securityDeposit ?? body.depositAmount ?? previousLease.securityDeposit ?? previousLease.depositAmount),
      petDeposit: Number(body.petDeposit ?? previousLease.petDeposit ?? 0),
      isPetAllowed: body.isPetAllowed ?? previousLease.isPetAllowed ?? false,
      maxOccupants: Number(body.maxOccupants ?? previousLease.maxOccupants ?? 1),
      isUtilitiesIncluded: body.isUtilitiesIncluded ?? previousLease.isUtilitiesIncluded ?? false,
      utilitiesDetails: body.utilitiesDetails ?? previousLease.utilitiesDetails ?? '',
      rentDueDay: Number(body.rentDueDay ?? previousLease.rentDueDay ?? 1),
      lateFee: Number(body.lateFee ?? previousLease.lateFee ?? 0),
      gracePeriod: Number(body.gracePeriod ?? previousLease.gracePeriod ?? 0),
      billingStatus: 'current',
      billingRules: {
        frequency: 'monthly' as const,
        rentDueDay: Number(body.rentDueDay ?? previousLease.billingRules?.rentDueDay ?? previousLease.rentDueDay ?? 1),
        escalationPercent: Number(body.escalationPercent ?? previousLease.billingRules?.escalationPercent ?? 0),
        escalationFrequencyMonths: Number(body.escalationFrequencyMonths ?? previousLease.billingRules?.escalationFrequencyMonths ?? 12),
        nextEscalationDate: body.nextEscalationDate ? new Date(body.nextEscalationDate) : previousLease.billingRules?.nextEscalationDate,
        recurringLevies: Number(body.recurringLevies ?? previousLease.billingRules?.recurringLevies ?? 0),
        recurringServiceCharges: Number(body.recurringServiceCharges ?? previousLease.billingRules?.recurringServiceCharges ?? 0),
        prorateMoveIn: body.prorateMoveIn ?? previousLease.billingRules?.prorateMoveIn ?? true,
      },
      financialSummary: {
        totalBilled: 0,
        totalPaid: 0,
        outstandingBalance: 0,
        depositHeld: Number(body.depositAmount ?? body.securityDeposit ?? previousLease.depositAmount ?? 0),
        penalties: 0,
        moveOutSettlement: 0,
      },
    });

    previousLease.successorLeaseId = successor._id;
    previousLease.status = 'renewed';
    previousLease.lifecycleStatusChangedAt = new Date();
    await previousLease.save();

    if (successor.status === 'active' || successor.status === 'pending_approval') {
      ensureLeaseInspectionSchedule(successor).catch((error) => {
        console.error('Failed to create renewal inspection schedule:', error);
      });
    }

    return successor;
  }

  // Legacy public endpoint for admin dashboard; now authenticated and company-scoped.
  async getLeasesPublic(req: Request, res: Response): Promise<void> {
    try {
      const companyId = req.user?.companyId;
      if (!companyId) {
        res.status(401).json({ message: 'Authentication required' });
        return;
      }
      
      let query: any = { companyId };

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

      const leases = await this.leaseRepository.find(query);

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

  // Legacy public endpoint for getting a single lease by ID.
  async getLeaseByIdPublic(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const companyId = req.user?.companyId;
      if (!companyId) {
        res.status(401).json({ message: 'Authentication required' });
        return;
      }

      let query: any = { _id: id, companyId };

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

      if (process.env.NODE_ENV !== 'production') {
        console.log('Found lease:', { id: lease._id, propertyId: lease.propertyId });
      }

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