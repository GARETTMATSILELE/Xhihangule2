import { Request, Response, NextFunction } from 'express';
import { Company, ICompany } from '../models/Company';
import { PLAN_CONFIG, Plan } from '../types/plan';
import { PropertyOwner } from '../models/PropertyOwner';
import { AppError } from '../middleware/errorHandler';
import { JwtPayload } from '../types/auth';
import mongoose from 'mongoose';
import { updateChartMetrics } from './chartController';
import { User } from '../models/User';
import { SubscriptionService } from '../services/subscriptionService';
import { escapeRegex, normalizeCompanyType, normalizeEmail, normalizeLegalIdentifier, normalizeWorkspaceType } from '../utils/normalization';
import { registrationCreatesPaymentHold } from '../services/registrationPaymentPolicy';
import { chargeForPlan } from '../services/systemPlanService';
import { Subscription } from '../models/Subscription';
import { PaymentSession } from '../models/PaymentSession';
import { BillingPayment } from '../models/BillingPayment';

const subscriptionService = SubscriptionService.getInstance();

function assertCallerCompany(req: Request, companyId: string) {
  if (isSuperAdmin(req)) return;
  if (!req.user?.companyId || String(req.user.companyId) !== String(companyId)) {
    throw new AppError('Company not found', 404);
  }
}

function isSuperAdmin(req: Request): boolean {
  const roles: string[] = Array.isArray((req.user as any)?.roles)
    ? (req.user as any).roles
    : ((req.user as any)?.role ? [(req.user as any).role] : []);
  return roles.includes('system_admin');
}

export const getCompanies = async (req: Request, res: Response) => {
  try {
    const companies = await Company.find().select('-__v');
    res.json(companies);
  } catch (error) {
    throw new AppError('Error fetching companies', 500);
  }
};

export const getCompany = async (req: Request, res: Response) => {
  try {
    console.log('Fetching company by ID:', req.params.id);
    const company = await Company.findById(req.params.id).select('-__v');
    
    if (!company) {
      console.log('Company not found for ID:', req.params.id);
      return res.status(404).json({
        status: 'error',
        message: 'Company not found',
        code: 'COMPANY_NOT_FOUND'
      });
    }

    console.log('Company found:', {
      id: company._id,
      name: company.name
    });

    res.json({
      status: 'success',
      data: company
    });
  } catch (error) {
    console.error('Error in getCompany:', error);
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError('Error fetching company', 500);
  }
};

export const createCompany = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, description, email, address, phone, website, registrationNumber, tinNumber, vatNumber } = req.body;
    const companyType = normalizeCompanyType(req.body?.companyType);
    const normalizedEmail = normalizeEmail(email);
    const normalizedRegistrationNumber = normalizeLegalIdentifier(registrationNumber);
    const normalizedTinNumber = normalizeLegalIdentifier(tinNumber);
    console.log('Creating company with data:', { name, description, email, address, phone, website, registrationNumber, tinNumber, vatNumber });

    const currentUserId = (req.user as JwtPayload).userId;
    if (!currentUserId) {
      throw new AppError('User not authenticated', 401);
    }

    if (!isSuperAdmin(req)) {
      const alreadyLinkedCompanyId = req.user?.companyId;
      const ownedCompany = await Company.findOne({ ownerId: currentUserId }).select('_id').lean();
      if (alreadyLinkedCompanyId || ownedCompany) {
        throw new AppError('User is already associated with a company', 409, 'COMPANY_ALREADY_EXISTS');
      }
    }

    if (companyType === 'REGISTERED_BUSINESS' && (!registrationNumber || !tinNumber)) {
      throw new AppError('Registration number and TIN number are required for registered businesses', 400, 'VALIDATION_ERROR');
    }

    // Check if company with same normalized identifiers already exists. Regex
    // fallback preserves legacy data compatibility while escaping user input.
    const duplicateClauses: any[] = [];
    if (name) duplicateClauses.push({ name: { $regex: new RegExp(`^${escapeRegex(String(name).trim())}$`, 'i') } });
    if (normalizedEmail) {
      duplicateClauses.push({ normalizedEmail });
      duplicateClauses.push({ email: { $regex: new RegExp(`^${escapeRegex(normalizedEmail)}$`, 'i') } });
    }
    if (normalizedRegistrationNumber) duplicateClauses.push({ normalizedRegistrationNumber });
    if (normalizedTinNumber) duplicateClauses.push({ normalizedTinNumber });

    const existingCompany = duplicateClauses.length > 0
      ? await Company.findOne({ $or: duplicateClauses })
      : null;

    if (existingCompany) {
      console.log('Company already exists:', existingCompany);
      throw new AppError('Company with this name or email already exists', 400);
    }

    const plan: Plan = (req.body?.plan && ['INDIVIDUAL','SME','ENTERPRISE'].includes(req.body.plan)) ? req.body.plan : 'ENTERPRISE';
    const config = PLAN_CONFIG[plan];
    const workspaceType = normalizeWorkspaceType(req.body?.workspaceType, config.workspaceType);

    const company = new Company({
      name,
      description,
      email: normalizedEmail,
      normalizedEmail,
      address,
      phone,
      website,
      registrationNumber,
      normalizedRegistrationNumber,
      tinNumber,
      normalizedTinNumber,
      vatNumber,
      companyType,
      workspaceType,
      ownerId: currentUserId,
      plan,
      propertyLimit: config.propertyLimit,
      featureFlags: config.featureFlags
    });

    console.log('Saving new company:', company);
    await company.save();
    console.log('Company saved successfully:', company);

    // Link company to current user
    if (currentUserId) {
      try {
        await User.findByIdAndUpdate(currentUserId, { companyId: company._id });
        console.log('Linked companyId to user:', currentUserId);
      } catch (linkErr) {
        console.warn('Failed to link companyId to user (non-fatal):', linkErr);
      }
    }

    // Initialize chart data for the new company
    console.log('Initializing chart data for company:', company._id);
    await updateChartMetrics(company._id.toString());
    console.log('Chart data initialized successfully');

    const holdForPayment = registrationCreatesPaymentHold(process.env) && !isSuperAdmin(req);
    if (holdForPayment) {
      const amount = await chargeForPlan(plan, 'monthly');
      if (amount == null) {
        await Company.deleteOne({ _id: company._id });
        await User.updateOne({ _id: currentUserId, companyId: company._id }, { $unset: { companyId: '' } });
        throw new AppError('This plan does not have a configured price', 503, 'REGISTRATION_PRICE_NOT_CONFIGURED');
      }
      company.tenantStatus = 'pending';
      company.onboardingStatus = 'PENDING_PAYMENT';
      company.onboardingCompleted = false;
      company.isActive = false;
      company.subscriptionStatus = 'inactive';
      await company.save();
      const subscription = await Subscription.create({
        companyId: company._id,
        userId: currentUserId,
        plan,
        cycle: 'monthly',
        status: 'past_due'
      });
      const paymentSession = await PaymentSession.create({
        companyId: company._id,
        userId: currentUserId,
        subscriptionId: subscription._id,
        idempotencyKey: `company-create:${company._id.toString()}`,
        provider: 'paynow',
        providerRef: `SUBS-${company._id.toString()}`,
        plan,
        billingCycle: 'monthly',
        amount,
        currency: 'USD',
        status: 'pending',
        metadata: { source: 'company_create' }
      });
      const billingPayment = await BillingPayment.create({
        companyId: company._id,
        userId: currentUserId,
        subscriptionId: subscription._id,
        paymentSessionId: paymentSession._id,
        plan,
        cycle: 'monthly',
        amount,
        currency: 'USD',
        method: 'card',
        provider: 'paynow',
        providerRef: `SUBS-${company._id.toString()}`,
        idempotencyKey: `company-create:${company._id.toString()}:billing`,
        status: 'pending'
      });
      paymentSession.billingPaymentId = billingPayment._id as any;
      await paymentSession.save();
    } else {
      console.log('Creating trial subscription for company:', company._id);
      await subscriptionService.createTrialSubscription(
        company._id.toString(),
        plan,
        14
      );
      console.log('Trial subscription created successfully');
    }

    // Verify the company was saved
    const savedCompany = await Company.findById(company._id);
    console.log('Verified saved company:', savedCompany);

    res.status(201).json(company);
  } catch (error: any) {
    console.error('Error in createCompany:', error);
    // Handle duplicate key errors gracefully (e.g., registrationNumber/email/tinNumber)
    if (error && (error.code === 11000 || error.name === 'MongoServerError')) {
      const key = Object.keys(error.keyPattern || {})[0] || 'unique_field';
      const value = error.keyValue ? error.keyValue[key] : undefined;
      const message = key === 'registrationNumber'
        ? 'Registration number already exists'
        : key === 'email'
          ? 'Company email already exists'
          : key === 'tinNumber'
            ? 'TIN number already exists'
            : 'Duplicate value for a unique field';
      return res.status(400).json({
        status: 'error',
        message,
        code: 'DUPLICATE_KEY',
        field: key,
        value
      });
    }
    // Fallback: pass to error handler without crashing
    return next(new AppError('Error creating company', 500));
  }
};

function pickWorkspaceFields(body: any, currentTenantStatus?: string, currentOnboardingStatus?: string) {
  const updateData: any = {};
  const locked = currentTenantStatus === 'suspended' || currentTenantStatus === 'archived';
  const onboardingStatus = String(currentOnboardingStatus || 'ACTIVE');
  const awaitingPayment = onboardingStatus === 'PENDING_PAYMENT' || onboardingStatus === 'PENDING_SETUP' || onboardingStatus === 'FAILED_SETUP';
  const paidEnoughToFinishSetup = onboardingStatus === 'INITIALIZING_WORKSPACE' || onboardingStatus === 'PAYMENT_RECEIVED' || onboardingStatus === 'ACTIVE';
  if (body.workspacePreferences !== undefined) updateData.workspacePreferences = body.workspacePreferences;
  if (!locked && !awaitingPayment && body.onboardingStatus !== undefined && paidEnoughToFinishSetup && String(body.onboardingStatus) === 'ACTIVE') {
    updateData.onboardingStatus = 'ACTIVE';
  }
  if (!locked && !awaitingPayment && body.onboardingCompleted !== undefined && paidEnoughToFinishSetup) {
    updateData.onboardingCompleted = Boolean(body.onboardingCompleted);
  }
  if (body.companyType !== undefined) updateData.companyType = normalizeCompanyType(body.companyType);
  if (body.workspaceType !== undefined) updateData.workspaceType = normalizeWorkspaceType(body.workspaceType);
  if (!locked && !awaitingPayment && body.tenantStatus !== undefined && isSafeTenantStatus(body.tenantStatus)) {
    if (body.tenantStatus !== 'suspended' && body.tenantStatus !== 'archived' && body.tenantStatus !== 'active') {
      updateData.tenantStatus = body.tenantStatus;
    }
    if (body.tenantStatus === 'active' && paidEnoughToFinishSetup) {
      updateData.tenantStatus = 'active';
    }
  }
  return updateData;
}

function isSafeTenantStatus(value: unknown): value is 'active' | 'suspended' | 'pending' | 'archived' {
  return ['active', 'suspended', 'pending', 'archived'].includes(String(value));
}

/** Profile edits must not grant or rewrite the billed subscription. */
function stripSubscriptionAuthority(updateData: Partial<ICompany>) {
  const blocked = updateData as Partial<ICompany> & Record<string, unknown>;
  delete blocked.plan;
  delete blocked.propertyLimit;
  delete blocked.featureFlags;
  delete blocked.subscriptionStatus;
  delete blocked.subscriptionEndDate;
}

export const rejectCompanyPlanChange = async (_req: Request, res: Response) => {
  res.status(403).json({
    status: 'error',
    message: 'Plan changes require a verified billing event',
    code: 'PLAN_CHANGE_REQUIRES_BILLING',
  });
};

export const updateCompany = async (req: Request, res: Response) => {
  try {
    assertCallerCompany(req, String(req.params.id || ''));
    const existing = await Company.findById(req.params.id).select('tenantStatus onboardingStatus');
    if (!existing) {
      throw new AppError('Company not found', 404);
    }
    const currentTenantStatus = String((existing as any).tenantStatus || '');
    const currentOnboardingStatus = String((existing as any).onboardingStatus || 'ACTIVE');
    const { name, description, email, address, phone, website, registrationNumber, tinNumber, vatNumber, logo, bankAccounts, fiscalConfig, receivablesCutover, rentReceivableOpeningBalance, levyReceivableOpeningBalance, commissionConfig } = req.body;
    const updateData: Partial<ICompany> = {};

    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (email !== undefined) updateData.email = email;
    if (address !== undefined) updateData.address = address;
    if (phone !== undefined) updateData.phone = phone;
    if (website !== undefined) updateData.website = website;
    if (registrationNumber !== undefined) updateData.registrationNumber = registrationNumber;
    if (tinNumber !== undefined) updateData.tinNumber = tinNumber;
    if (vatNumber !== undefined) updateData.vatNumber = vatNumber;
    if (logo !== undefined) updateData.logo = logo;
    if (bankAccounts !== undefined) updateData.bankAccounts = bankAccounts;
    if (fiscalConfig !== undefined) (updateData as any).fiscalConfig = fiscalConfig;
    if ((req.body as any).taxProfile !== undefined) (updateData as any).taxProfile = (req.body as any).taxProfile;
    if (commissionConfig !== undefined) {
      const nextCommission = { ...(commissionConfig as any) };
      delete nextCommission.vatPercentOnCommission;
      (updateData as any).commissionConfig = nextCommission;
    }
    Object.assign(updateData as any, pickWorkspaceFields(req.body, currentTenantStatus, currentOnboardingStatus));
    if (receivablesCutover !== undefined) (updateData as any).receivablesCutover = receivablesCutover;
    if (rentReceivableOpeningBalance !== undefined) (updateData as any).rentReceivableOpeningBalance = Number(rentReceivableOpeningBalance);
    if (levyReceivableOpeningBalance !== undefined) (updateData as any).levyReceivableOpeningBalance = Number(levyReceivableOpeningBalance);
    stripSubscriptionAuthority(updateData);

    const company = await Company.findByIdAndUpdate(
      req.params.id,
      { $set: updateData },
      { new: true, runValidators: true }
    );

    if (!company) {
      throw new AppError('Company not found', 404);
    }

    res.json(company);
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError('Error updating company', 500);
  }
};

export const deleteCompany = async (req: Request, res: Response) => {
  try {
    assertCallerCompany(req, String(req.params.id || ''));
    const company = await Company.findByIdAndDelete(req.params.id);
    if (!company) {
      throw new AppError('Company not found', 404);
    }
    res.json({ message: 'Company deleted successfully' });
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError('Error deleting company', 500);
  }
};

export const getCurrentCompany = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;
    const companyId = req.user?.companyId;
    const userRole = req.user?.role;

    console.log('getCurrentCompany - Request data:', {
      userId,
      companyId,
      userRole
    });

    if (!userId) {
      console.error('getCurrentCompany: No userId in request');
      return res.status(401).json({ 
        status: 'error', 
        message: 'User not authenticated',
        code: 'NO_USER_ID'
      });
    }

    let company = null;
    
    // First try to find company by companyId if it exists
    if (companyId && mongoose.Types.ObjectId.isValid(companyId)) {
      console.log('Searching for company by companyId:', companyId);
      company = await Company.findById(companyId);
      
      if (company) {
        console.log('Found company by companyId:', {
          companyId: company._id,
          name: company.name
        });
      } else {
        console.log('No company found by companyId:', companyId);
      }
    }
    
    // If no company found by companyId, try to find by ownerId
    if (!company) {
      console.log('Searching for company by ownerId:', userId);
      company = await Company.findOne({ ownerId: userId });
      
      if (company) {
        console.log('Found company by ownerId:', {
          companyId: company._id,
          name: company.name
        });
      } else {
        console.log('No company found by ownerId:', userId);
      }
    }

    // If still no company found and user is a property owner, check their companyId
    if (!company && userRole === 'owner') {
      console.log('User is property owner, checking PropertyOwner model for companyId');
      const propertyOwner = await PropertyOwner.findById(userId);
      
      if (propertyOwner && propertyOwner.companyId) {
        console.log('Found companyId in PropertyOwner:', propertyOwner.companyId);
        company = await Company.findById(propertyOwner.companyId);
        
        if (company) {
          console.log('Found company for property owner:', {
            companyId: company._id,
            name: company.name
          });
        } else {
          console.log('No company found for property owner companyId:', propertyOwner.companyId);
        }
      } else {
        console.log('Property owner has no companyId');
      }
    }

    if (!company) {
      console.log('No company found for user:', {
        userId,
        companyId,
        role: userRole
      });
      return res.status(404).json({ 
        status: 'error', 
        message: 'No company found. Please ensure you are associated with a company.',
        code: 'NO_COMPANY'
      });
    }

    console.log('Returning company data:', {
      companyId: company._id,
      name: company.name
    });
    res.json({ status: 'success', data: company });
  } catch (error: any) {
    console.error('Error in getCurrentCompany:', error);
    res.status(500).json({ 
      status: 'error', 
      message: 'Internal server error while fetching company', 
      error: error?.message || String(error),
      code: 'INTERNAL_ERROR'
    });
  }
};

export const updateCurrentCompany = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;
    const companyId = req.user?.companyId;
    const userRole = req.user?.role;

    if (!userId) {
      throw new AppError('User not authenticated', 401);
    }

    // Find the current user's company
    let company = null;
    
    // First try to find company by companyId if it exists
    if (companyId && mongoose.Types.ObjectId.isValid(companyId)) {
      company = await Company.findById(companyId);
    }
    
    // If no company found by companyId, try to find by ownerId
    if (!company) {
      company = await Company.findOne({ ownerId: userId });
    }

    // If still no company found and user is a property owner, check their companyId
    if (!company && userRole === 'owner') {
      const propertyOwner = await PropertyOwner.findById(userId);
      if (propertyOwner && propertyOwner.companyId) {
        company = await Company.findById(propertyOwner.companyId);
      }
    }

    if (!company) {
      throw new AppError('Company not found', 404);
    }

    // Update the company
    const { name, description, email, address, phone, website, registrationNumber, tinNumber, vatNumber, logo, bankAccounts, fiscalConfig, receivablesCutover, rentReceivableOpeningBalance, levyReceivableOpeningBalance, commissionConfig } = req.body;
    const updateData: Partial<ICompany> = {};

    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (email !== undefined) updateData.email = email;
    if (address !== undefined) updateData.address = address;
    if (phone !== undefined) updateData.phone = phone;
    if (website !== undefined) updateData.website = website;
    if (registrationNumber !== undefined) updateData.registrationNumber = registrationNumber;
    if (tinNumber !== undefined) updateData.tinNumber = tinNumber;
    if (vatNumber !== undefined) updateData.vatNumber = vatNumber;
    if (logo !== undefined) updateData.logo = logo;
    if (bankAccounts !== undefined) updateData.bankAccounts = bankAccounts;
    if (fiscalConfig !== undefined) (updateData as any).fiscalConfig = fiscalConfig;
    if ((req.body as any).taxProfile !== undefined) (updateData as any).taxProfile = (req.body as any).taxProfile;
    if (commissionConfig !== undefined) {
      const nextCommission = { ...(commissionConfig as any) };
      delete nextCommission.vatPercentOnCommission;
      (updateData as any).commissionConfig = nextCommission;
    }
    Object.assign(updateData as any, pickWorkspaceFields(req.body, String((company as any).tenantStatus || ''), String((company as any).onboardingStatus || 'ACTIVE')));
    if (receivablesCutover !== undefined) (updateData as any).receivablesCutover = receivablesCutover;
    if (rentReceivableOpeningBalance !== undefined) (updateData as any).rentReceivableOpeningBalance = Number(rentReceivableOpeningBalance);
    if (levyReceivableOpeningBalance !== undefined) (updateData as any).levyReceivableOpeningBalance = Number(levyReceivableOpeningBalance);
    stripSubscriptionAuthority(updateData);

    const updatedCompany = await Company.findByIdAndUpdate(
      company._id,
      { $set: updateData },
      { new: true, runValidators: true }
    );

    if (!updatedCompany) {
      throw new AppError('Error updating company', 500);
    }

    res.json(updatedCompany);
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    console.error('Error in updateCurrentCompany:', error);
    throw new AppError('Error updating company', 500);
  }
};

export const getCompanyById = async (req: Request, res: Response) => {
  try {
    const companyId = req.params.id;
    console.log('Fetching company by ID:', companyId);

    if (!mongoose.Types.ObjectId.isValid(companyId)) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid company ID format',
        code: 'INVALID_ID'
      });
    }

    const company = await Company.findById(companyId);
    
    if (!company) {
      console.log('Company not found for ID:', companyId);
      return res.status(404).json({
        status: 'error',
        message: 'Company not found',
        code: 'COMPANY_NOT_FOUND'
      });
    }

    console.log('Company found:', {
      id: company._id,
      name: company.name
    });

    if (!company) {
      return res.status(404).json({ status: 'error', message: 'Company not found', code: 'NO_COMPANY' });
    }

    res.json({
      status: 'success',
      data: {
        _id: company._id,
        name: company.name,
        address: company.address,
        phone: company.phone,
        email: company.email,
        website: company.website,
        registrationNumber: company.registrationNumber,
        tinNumber: company.tinNumber,
        vatNumber: company.vatNumber,
        ownerId: company.ownerId,
        description: company.description,
        logo: company.logo,
        isActive: company.isActive,
        subscriptionStatus: company.subscriptionStatus,
        subscriptionEndDate: company.subscriptionEndDate,
        companyType: (company as any).companyType,
        workspaceType: (company as any).workspaceType || 'agency',
        bankAccounts: company.bankAccounts,
        commissionConfig: company.commissionConfig,
        plan: (company as any).plan,
        propertyLimit: (company as any).propertyLimit,
        featureFlags: (company as any).featureFlags,
        fiscalConfig: (company as any).fiscalConfig,
        receivablesCutover: (company as any).receivablesCutover,
        rentReceivableOpeningBalance: (company as any).rentReceivableOpeningBalance,
        levyReceivableOpeningBalance: (company as any).levyReceivableOpeningBalance,
        createdAt: (company as any).createdAt,
        updatedAt: (company as any).updatedAt
      }
    });
  } catch (error) {
    console.error('Error in getCompanyById:', error);
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError('Error fetching company', 500);
  }
};

export const uploadCompanyLogo = async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    const companyId = req.params.id;
    const userId = (req.user as JwtPayload)?.userId;

    if (!userId) {
      return res.status(401).json({ message: 'User not authenticated' });
    }

    // Check if company exists and user has permission
    const company = await Company.findById(companyId);
    if (!company) {
      return res.status(404).json({ message: 'Company not found' });
    }

    // Check if user is the owner of the company
    if (company.ownerId.toString() !== userId) {
      return res.status(403).json({ message: 'Unauthorized to update this company' });
    }

    // Convert file to base64 for storage
    const logoBase64 = req.file.buffer.toString('base64');

    // Update company with new logo
    const updatedCompany = await Company.findByIdAndUpdate(
      companyId,
      { logo: logoBase64 },
      { new: true, runValidators: true }
    );

    res.json({
      message: 'Logo uploaded successfully',
      company: updatedCompany
    });
  } catch (error) {
    console.error('Error uploading company logo:', error);
    res.status(500).json({ 
      message: 'Error uploading logo',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}; 