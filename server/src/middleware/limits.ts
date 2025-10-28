import { Request, Response, NextFunction } from 'express';
import { Company } from '../models/Company';
import { Property } from '../models/Property';
import { AppError } from './errorHandler';

export const enforcePropertyLimit = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user?.companyId) {
      throw new AppError('Company ID not found. Please ensure you are associated with a company.', 400);
    }

    const company = await Company.findById(req.user.companyId).select('propertyLimit');
    if (!company) {
      throw new AppError('Company not found', 404);
    }

    if (company.propertyLimit == null) {
      return next();
    }

    const count = await Property.countDocuments({ companyId: req.user.companyId });
    if (count >= (company.propertyLimit || 0)) {
      return res.status(403).json({ message: 'Property limit reached for your plan' });
    }

    next();
  } catch (error) {
    next(error);
  }
};




















