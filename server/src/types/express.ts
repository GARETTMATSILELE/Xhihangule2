import { Request } from 'express';

export interface AuthRequest extends Request {
  user?: any;
}

export interface isAuthenticated {
  (req: AuthRequest, res: any, next: any): void;
}

export interface isOwnerAuthenticated {
  (req: AuthRequest, res: any, next: any): void;
} 