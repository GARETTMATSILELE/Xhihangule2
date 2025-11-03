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

const subscriptionService = SubscriptionService.getInstance();

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
    console.log('Creating company with data:', { name, description, email, address, phone, website, registrationNumber, tinNumber, vatNumber });

    // Check if company with same name or email already exists
    const existingCompany = await Company.findOne({
      $or: [
        { name: { $regex: new RegExp(`^${name}$`, 'i') } },
        { email: { $regex: new RegExp(`^${email}$`, 'i') } }
      ]
    });

    if (existingCompany) {
      console.log('Company already exists:', existingCompany);
      throw new AppError('Company with this name or email already exists', 400);
    }

    const plan: Plan = (req.body?.plan && ['INDIVIDUAL','SME','ENTERPRISE'].includes(req.body.plan)) ? req.body.plan : 'ENTERPRISE';
    const config = PLAN_CONFIG[plan];

    const company = new Company({
      name,
      description,
      email,
      address,
      phone,
      website,
      registrationNumber,
      tinNumber,
      vatNumber,
      ownerId: (req.user as JwtPayload).userId,
      plan,
      propertyLimit: config.propertyLimit,
      featureFlags: config.featureFlags
    });

    console.log('Saving new company:', company);
    await company.save();
    console.log('Company saved successfully:', company);

    // Link company to current user
    const currentUserId = (req.user as JwtPayload).userId;
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

    // Create trial subscription for the new company
    console.log('Creating trial subscription for company:', company._id);
    await subscriptionService.createTrialSubscription(
      company._id.toString(), 
      plan, 
      14 // 14-day trial
    );
    console.log('Trial subscription created successfully');

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

export const updateCompany = async (req: Request, res: Response) => {
  try {
    const { name, description, email, address, phone, website, registrationNumber, tinNumber, vatNumber, logo, bankAccounts, plan, fiscalConfig, receivablesCutover, rentReceivableOpeningBalance, levyReceivableOpeningBalance, commissionConfig } = req.body;
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
    if (commissionConfig !== undefined) (updateData as any).commissionConfig = commissionConfig;
    if (receivablesCutover !== undefined) (updateData as any).receivablesCutover = receivablesCutover;
    if (rentReceivableOpeningBalance !== undefined) (updateData as any).rentReceivableOpeningBalance = Number(rentReceivableOpeningBalance);
    if (levyReceivableOpeningBalance !== undefined) (updateData as any).levyReceivableOpeningBalance = Number(levyReceivableOpeningBalance);
    if (plan && ['INDIVIDUAL','SME','ENTERPRISE'].includes(plan)) {
      const cfg = PLAN_CONFIG[plan as Plan];
      (updateData as any).plan = plan as Plan;
      (updateData as any).propertyLimit = cfg.propertyLimit;
      (updateData as any).featureFlags = cfg.featureFlags;
    }

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
    const { name, description, email, address, phone, website, registrationNumber, tinNumber, vatNumber, logo, bankAccounts, plan, fiscalConfig, receivablesCutover, rentReceivableOpeningBalance, levyReceivableOpeningBalance, commissionConfig } = req.body;
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
    if (commissionConfig !== undefined) (updateData as any).commissionConfig = commissionConfig;
    if (receivablesCutover !== undefined) (updateData as any).receivablesCutover = receivablesCutover;
    if (rentReceivableOpeningBalance !== undefined) (updateData as any).rentReceivableOpeningBalance = Number(rentReceivableOpeningBalance);
    if (levyReceivableOpeningBalance !== undefined) (updateData as any).levyReceivableOpeningBalance = Number(levyReceivableOpeningBalance);
    if (plan && ['INDIVIDUAL','SME','ENTERPRISE'].includes(plan)) {
      const cfg = PLAN_CONFIG[plan as Plan];
      (updateData as any).plan = plan as Plan;
      (updateData as any).propertyLimit = cfg.propertyLimit;
      (updateData as any).featureFlags = cfg.featureFlags;
    }

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