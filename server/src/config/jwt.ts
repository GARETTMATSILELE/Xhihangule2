import { config } from 'dotenv';

// Load environment variables
config();

// Centralized JWT configuration
export const JWT_CONFIG = {
  SECRET: process.env.JWT_SECRET || 'your-secret-key-change-in-production',
  REFRESH_SECRET: process.env.JWT_REFRESH_SECRET || 'your-refresh-secret-key-change-in-production',
  ACCESS_TOKEN_EXPIRY: process.env.NODE_ENV === 'production' ? '1h' : '24h', // 1 hour in production, 24 hours in development
  REFRESH_TOKEN_EXPIRY: '7d', // 7 days
  ISSUER: 'property-management-app',
  AUDIENCE: 'property-management-users'
};

// Helper function to get JWT secret
export const getJwtSecret = (): string => JWT_CONFIG.SECRET;

// Helper function to get JWT refresh secret
export const getJwtRefreshSecret = (): string => JWT_CONFIG.REFRESH_SECRET; 