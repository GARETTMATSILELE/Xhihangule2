"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getJwtRefreshSecret = exports.getJwtSecret = exports.JWT_CONFIG = void 0;
const dotenv_1 = require("dotenv");
const crypto_1 = __importDefault(require("crypto"));
// Load environment variables
(0, dotenv_1.config)();
const resolveJwtSecret = (envKey) => {
    const configured = process.env[envKey];
    if (configured && configured.trim().length >= 32) {
        return configured.trim();
    }
    if (process.env.NODE_ENV === 'production') {
        throw new Error(`${envKey} must be set to at least 32 characters in production`);
    }
    console.warn(`${envKey} is missing or too short; using an ephemeral development-only secret.`);
    return crypto_1.default.randomBytes(48).toString('hex');
};
// Centralized JWT configuration
exports.JWT_CONFIG = {
    SECRET: resolveJwtSecret('JWT_SECRET'),
    REFRESH_SECRET: resolveJwtSecret('JWT_REFRESH_SECRET'),
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
