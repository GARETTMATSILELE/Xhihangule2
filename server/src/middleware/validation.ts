import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { AppError } from './errorHandler';

export const validateRequest = (schema: z.ZodType<any>) => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const validatedData = schema.parse(req.body);
      req.body = validatedData;
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        const errors = error.errors.map(err => ({
          field: err.path.join('.'),
          message: err.message
        }));
        next(new AppError('Validation failed', 400, JSON.stringify(errors)));
      } else {
        next(error);
      }
    }
  };
};

// Tenant validation schemas
export const createTenantSchema = z.object({
  firstName: z.string().min(2, 'First name must be at least 2 characters'),
  lastName: z.string().min(2, 'Last name must be at least 2 characters'),
  email: z.string().email('Invalid email format'),
  phone: z.string().min(10, 'Phone number must be at least 10 digits'),
  status: z.enum(['Active', 'Inactive', 'Pending']).optional(),
  propertyId: z.string().optional(),
  idNumber: z.string().optional(),
  emergencyContact: z.string().optional(),
  companyId: z.string().optional() // Made optional since it's extracted from JWT token
});

export const updateTenantSchema = createTenantSchema.partial(); 