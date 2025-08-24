export type UserRole = 'admin' | 'agent' | 'owner' | 'accountant' | 'sales';

export interface User {
  _id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  companyName?: string;
  position?: string;
  companyId?: string;
  isActive: boolean;
  lastLogin?: Date;
  createdAt: Date;
  updatedAt: Date;
  phone?: string;
  twoFactorEnabled?: boolean;
  notifications?: {
    email: boolean;
    sms: boolean;
    push: boolean;
  };
  language?: string;
  timezone?: string;
}

export interface LoginCredentials {
  email: string;
  password: string;
  role: UserRole;
}

export interface SignUpData {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  companyName?: string;
  position?: string;
  reason?: string;
}

export interface AuthResponse {
  user: User;
  token: string;
}

export interface AuthError {
  message: string;
  code: string;
}

export interface JwtPayload {
  userId: string;
  role?: UserRole;
}

// Helper functions
export const isAuthenticated = (req: { user?: JwtPayload }): boolean => {
  return req.user !== undefined;
};

export const isOwnerAuthenticated = (req: { owner?: any }): boolean => {
  return req.owner !== undefined;
}; 