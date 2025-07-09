import { SignUpData } from '../types/auth';

export interface RegistrationFormData {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  companyName: string;
}

const PASSWORD_REQUIREMENTS = {
  minLength: 8,
  requireUppercase: true,
  requireLowercase: true,
  requireNumber: true,
  requireSpecial: true
};

export const validateRegistrationForm = (data: SignUpData): string[] => {
  const errors: string[] = [];

  // Email validation
  if (!data.email) {
    errors.push('Email is required');
  } else if (!/\S+@\S+\.\S+/.test(data.email)) {
    errors.push('Email is invalid');
  }

  // Password validation
  if (!data.password) {
    errors.push('Password is required');
  } else {
    if (data.password.length < PASSWORD_REQUIREMENTS.minLength) {
      errors.push(`Password must be at least ${PASSWORD_REQUIREMENTS.minLength} characters long`);
    }
    if (PASSWORD_REQUIREMENTS.requireUppercase && !/[A-Z]/.test(data.password)) {
      errors.push('Password must contain at least one uppercase letter');
    }
    if (PASSWORD_REQUIREMENTS.requireLowercase && !/[a-z]/.test(data.password)) {
      errors.push('Password must contain at least one lowercase letter');
    }
    if (PASSWORD_REQUIREMENTS.requireNumber && !/\d/.test(data.password)) {
      errors.push('Password must contain at least one number');
    }
    if (PASSWORD_REQUIREMENTS.requireSpecial && !/[!@#$%^&*(),.?":{}|<>]/.test(data.password)) {
      errors.push('Password must contain at least one special character');
    }
  }

  // Name validation
  if (!data.firstName) {
    errors.push('First name is required');
  }
  if (!data.lastName) {
    errors.push('Last name is required');
  }

  // Role validation
  if (!data.role) {
    errors.push('Role is required');
  } else if (!['admin', 'agent', 'accountant', 'owner'].includes(data.role)) {
    errors.push('Invalid role selected');
  }

  return errors;
};

export type UserRole = 'admin' | 'agent' | 'owner' | 'accountant';

export const getDashboardPath = (role: UserRole): string => {
  switch (role) {
    case 'admin':
      return '/admin-dashboard';
    case 'agent':
      return '/agent-dashboard';
    case 'owner':
      return '/owner-dashboard';
    case 'accountant':
      return '/accountant-dashboard';
    default:
      return '/dashboard';
  }
};

export const handleRegistrationError = (error: any): string => {
  if (error.response?.data?.message) {
    return error.response.data.message;
  }
  if (error.message) {
    return error.message;
  }
  return 'An error occurred during registration';
}; 