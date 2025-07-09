import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Check if user can create properties
 */
export const canCreateProperty = (user: any): boolean => {
  return !!(
    user?._id && 
    user?.companyId && 
    ['admin', 'owner'].includes(user?.role || '')
  );
};

/**
 * Get user-friendly message for property creation requirements
 */
export const getPropertyCreationMessage = (user: any): string | null => {
  if (!user) {
    return 'You must be logged in to add properties';
  }
  
  if (!user.companyId) {
    return 'You need to be associated with a company to add properties';
  }
  
  if (!['admin', 'owner'].includes(user.role || '')) {
    return `Only administrators and property owners can add properties. Your current role: ${user.role}`;
  }
  
  return null; // All requirements met
};

/**
 * Check if user has required role
 */
export const hasRole = (user: any, requiredRoles: string[]): boolean => {
  return user?.role && requiredRoles.includes(user.role);
}; 