import { IUser } from '../models/User';
import { IPropertyOwner } from '../models/PropertyOwner';
import { Request } from 'express';

declare global {
  namespace Express {
    interface Request {
      user?: IUser;
      owner?: IPropertyOwner;
      token?: string;
    }
  }
}

// Type predicates to check authentication status
export function isAuthenticated(req: Request): req is Request & { user: NonNullable<Request['user']> } {
  return req.user !== undefined;
}

export function isOwnerAuthenticated(req: Request): req is Request & { owner: NonNullable<Request['owner']> } {
  return req.owner !== undefined;
}

// Export the AuthRequest type for convenience
export type AuthRequest = Request & { user: NonNullable<Request['user']> }; 