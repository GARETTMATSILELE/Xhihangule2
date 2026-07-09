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
  } else if (!['admin', 'agent', 'accountant', 'owner', 'sales', 'principal', 'prea'].includes(data.role)) {
    errors.push('Invalid role selected');
  }

  return errors;
};

export interface OnboardingValidationData {
  email: string;
  password: string;
  confirmPassword: string;
  name: string;
  plan: 'INDIVIDUAL' | 'SME' | 'ENTERPRISE';
  companyType: 'INDIVIDUAL_LANDLORD' | 'REGISTERED_BUSINESS';
  companyName: string;
  companyEmail?: string;
  address?: string;
  phone?: string;
  registrationNumber?: string;
  tinNumber?: string;
}

export const validateOnboardingForm = (data: OnboardingValidationData): string[] => {
  const errors: string[] = [];
  if (!data.name.trim()) errors.push('Full name is required');
  if (!data.email.trim()) errors.push('Email is required');
  else if (!/\S+@\S+\.\S+/.test(data.email)) errors.push('Email is invalid');
  if (!data.password) errors.push('Password is required');
  if (data.password !== data.confirmPassword) errors.push('Passwords do not match');
  if (!data.companyName.trim()) errors.push('Company/workspace name is required');
  if (data.companyEmail && !/\S+@\S+\.\S+/.test(data.companyEmail)) errors.push('Company email is invalid');
  if (data.companyType === 'REGISTERED_BUSINESS') {
    if (!data.address?.trim()) errors.push('Business address is required');
    if (!data.phone?.trim()) errors.push('Business phone is required');
    if (!data.registrationNumber?.trim()) errors.push('Registration number is required for registered businesses');
    if (!data.tinNumber?.trim()) errors.push('TIN number is required for registered businesses');
  }
  return errors;
};

export type UserRole = 'admin' | 'agent' | 'owner' | 'accountant' | 'sales' | 'principal' | 'prea' | 'system_admin';

export const getDashboardPath = (role: UserRole, company?: { workspaceType?: 'agency' | 'individual'; plan?: 'INDIVIDUAL' | 'SME' | 'ENTERPRISE' } | null): string => {
  const isIndividualWorkspace = company?.workspaceType === 'individual' || company?.plan === 'INDIVIDUAL';
  switch (role) {
    case 'system_admin':
      return '/system-admin';
    case 'admin':
      return isIndividualWorkspace ? '/individual-dashboard' : '/admin-dashboard';
    case 'principal':
      return isIndividualWorkspace ? '/individual-dashboard' : '/admin-dashboard';
    case 'prea':
      return isIndividualWorkspace ? '/individual-dashboard' : '/admin-dashboard';
    case 'agent':
      return '/agent-dashboard';
    case 'owner':
      return '/owner-dashboard';
    case 'accountant':
      return '/accountant-dashboard';
    case 'sales':
      return '/sales-dashboard';
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