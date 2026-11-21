"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getJwtRefreshSecret = exports.getJwtSecret = exports.JWT_CONFIG = void 0;
const crypto_1 = __importDefault(require("crypto"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const dotenv_1 = require("dotenv");
const serverRoot = path_1.default.resolve(__dirname, '..', '..');
const envFile = process.env.ENV_FILE || (process.env.NODE_ENV === 'production' ? '.env.production' : '.env');
(0, dotenv_1.config)({ path: path_1.default.join(serverRoot, envFile) });
const localSecretsPath = path_1.default.join(serverRoot, '.env.development.local');
function secretValue(value) {
    return String(value || '').trim();
}
function secretIsStable(value) {
    return secretValue(value).length >= 32;
}
function readEnvFile(filePath) {
    if (!fs_1.default.existsSync(filePath))
        return {};
    return (0, dotenv_1.parse)(fs_1.default.readFileSync(filePath));
}
function keepStableSecret(key, candidate) {
    if (!secretIsStable(process.env[key]) && secretIsStable(candidate)) {
        process.env[key] = secretValue(candidate);
    }
}
/**
 * Development restarts were minting a new random secret, which signed out every
 * browser. A stable secret is stored in the gitignored local env file. Production
 * still refuses to boot without a real secret and never receives a generated one.
 */
function ensureDevelopmentJwtSecrets() {
    if (process.env.NODE_ENV === 'production')
        return;
    const stored = readEnvFile(localSecretsPath);
    keepStableSecret('JWT_SECRET', stored.JWT_SECRET);
    keepStableSecret('JWT_REFRESH_SECRET', stored.JWT_REFRESH_SECRET);
    const missing = ['JWT_SECRET', 'JWT_REFRESH_SECRET'].filter((key) => !secretIsStable(process.env[key]));
    if (!missing.length)
        return;
    const generated = missing.map((key) => {
        const value = crypto_1.default.randomBytes(48).toString('hex');
        process.env[key] = value;
        return `${key}=${value}`;
    });
    const prefix = fs_1.default.existsSync(localSecretsPath) && fs_1.default.statSync(localSecretsPath).size > 0 ? '\n' : '';
    fs_1.default.appendFileSync(localSecretsPath, `${prefix}${generated.join('\n')}\n`, { mode: 0o600 });
    console.warn('Development JWT secrets were missing. A stable local secret file was created and is not committed.');
}
ensureDevelopmentJwtSecrets();
const resolveJwtSecret = (envKey) => {
    const configured = process.env[envKey];
    if (secretIsStable(configured))
        return secretValue(configured);
    if (process.env.NODE_ENV === 'production') {
        throw new Error(`${envKey} must be set to at least 32 characters in production`);
    }
    throw new Error(`${envKey} is not configured for development.`);
};
exports.JWT_CONFIG = {
    SECRET: resolveJwtSecret('JWT_SECRET'),
    REFRESH_SECRET: resolveJwtSecret('JWT_REFRESH_SECRET'),
    ACCESS_TOKEN_EXPIRY: process.env.NODE_ENV === 'production' ? '1h' : '24h',
    REFRESH_TOKEN_EXPIRY: '7d',
    ISSUER: 'property-management-app',
    AUDIENCE: 'property-management-users'
};
const getJwtSecret = () => exports.JWT_CONFIG.SECRET;
exports.getJwtSecret = getJwtSecret;
const getJwtRefreshSecret = () => exports.JWT_CONFIG.REFRESH_SECRET;
exports.getJwtRefreshSecret = getJwtRefreshSecret;
