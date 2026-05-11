import { config } from 'dotenv';
import crypto from 'crypto';

// Load environment variables
config();

const resolveJwtSecret = (envKey: 'JWT_SECRET' | 'JWT_REFRESH_SECRET'): string => {
  const configured = process.env[envKey];
  if (configured && configured.trim().length >= 32) {
    return configured.trim();
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error(`${envKey} must be set to at least 32 characters in production`);
  }

  console.warn(`${envKey} is missing or too short; using an ephemeral development-only secret.`);
  return crypto.randomBytes(48).toString('hex');
};

// Centralized JWT configuration
export const JWT_CONFIG = {
  SECRET: resolveJwtSecret('JWT_SECRET'),
  REFRESH_SECRET: resolveJwtSecret('JWT_REFRESH_SECRET'),
  ACCESS_TOKEN_EXPIRY: process.env.NODE_ENV === 'production' ? '1h' : '24h', // 1 hour in production, 24 hours in development
  REFRESH_TOKEN_EXPIRY: '7d', // 7 days
  ISSUER: 'property-management-app',
  AUDIENCE: 'property-management-users'
};

// Helper function to get JWT secret
export const getJwtSecret = (): string => JWT_CONFIG.SECRET;

// Helper function to get JWT refresh secret
export const getJwtRefreshSecret = (): string => JWT_CONFIG.REFRESH_SECRET; 