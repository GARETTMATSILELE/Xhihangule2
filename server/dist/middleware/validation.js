"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateTenantSchema = exports.createTenantSchema = exports.validateRequest = void 0;
const zod_1 = require("zod");
const errorHandler_1 = require("./errorHandler");
const validateRequest = (schema) => {
    return (req, res, next) => {
        try {
            const validatedData = schema.parse(req.body);
            req.body = validatedData;
            next();
        }
        catch (error) {
            if (error instanceof zod_1.z.ZodError) {
                const errors = error.errors.map(err => ({
                    field: err.path.join('.'),
                    message: err.message
                }));
                next(new errorHandler_1.AppError('Validation failed', 400, JSON.stringify(errors)));
            }
            else {
                next(error);
            }
        }
    };
};
exports.validateRequest = validateRequest;
// Tenant validation schemas
exports.createTenantSchema = zod_1.z.object({
    firstName: zod_1.z.string().min(2, 'First name must be at least 2 characters'),
    lastName: zod_1.z.string().min(2, 'Last name must be at least 2 characters'),
    email: zod_1.z.string().email('Invalid email format'),
    phone: zod_1.z.string().min(10, 'Phone number must be at least 10 digits'),
    status: zod_1.z.enum(['Active', 'Inactive', 'Pending']).optional(),
    propertyId: zod_1.z.string().optional(),
    idNumber: zod_1.z.string().optional(),
    emergencyContact: zod_1.z.string().optional(),
    companyId: zod_1.z.string().optional() // Made optional since it's extracted from JWT token
});
exports.updateTenantSchema = exports.createTenantSchema.partial();
