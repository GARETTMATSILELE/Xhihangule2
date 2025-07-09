"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getJwtRefreshSecret = exports.getJwtSecret = exports.JWT_CONFIG = void 0;
const dotenv_1 = require("dotenv");
// Load environment variables
(0, dotenv_1.config)();
// Centralized JWT configuration
exports.JWT_CONFIG = {
    SECRET: process.env.JWT_SECRET || 'your-secret-key-change-in-production',
    REFRESH_SECRET: process.env.JWT_REFRESH_SECRET || 'your-refresh-secret-key-change-in-production',
    ACCESS_TOKEN_EXPIRY: process.env.NODE_ENV === 'production' ? '1h' : '24h', // 1 hour in production, 24 hours in development
    REFRESH_TOKEN_EXPIRY: '7d', // 7 days
    ISSUER: 'property-management-app',
    AUDIENCE: 'property-management-users'
};
// Helper function to get JWT secret
const getJwtSecret = () => exports.JWT_CONFIG.SECRET;
exports.getJwtSecret = getJwtSecret;
// Helper function to get JWT refresh secret
const getJwtRefreshSecret = () => exports.JWT_CONFIG.REFRESH_SECRET;
exports.getJwtRefreshSecret = getJwtRefreshSecret;
