import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { config as loadEnv, parse as parseEnv } from 'dotenv';

const serverRoot = path.resolve(__dirname, '..', '..');
const envFile = process.env.ENV_FILE || (process.env.NODE_ENV === 'production' ? '.env.production' : '.env');
loadEnv({ path: path.join(serverRoot, envFile) });

const localSecretsPath = path.join(serverRoot, '.env.development.local');

function secretValue(value: string | undefined): string {
  return String(value || '').trim();
}

function secretIsStable(value: string | undefined): boolean {
  return secretValue(value).length >= 32;
}

function readEnvFile(filePath: string): Record<string, string> {
  if (!fs.existsSync(filePath)) return {};
  return parseEnv(fs.readFileSync(filePath));
}

function keepStableSecret(key: 'JWT_SECRET' | 'JWT_REFRESH_SECRET', candidate: string | undefined) {
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
  if (process.env.NODE_ENV === 'production') return;
  const stored = readEnvFile(localSecretsPath);
  keepStableSecret('JWT_SECRET', stored.JWT_SECRET);
  keepStableSecret('JWT_REFRESH_SECRET', stored.JWT_REFRESH_SECRET);

  const missing = (['JWT_SECRET', 'JWT_REFRESH_SECRET'] as const).filter((key) => !secretIsStable(process.env[key]));
  if (!missing.length) return;

  const generated = missing.map((key) => {
    const value = crypto.randomBytes(48).toString('hex');
    process.env[key] = value;
    return `${key}=${value}`;
  });
  const prefix = fs.existsSync(localSecretsPath) && fs.statSync(localSecretsPath).size > 0 ? '\n' : '';
  fs.appendFileSync(localSecretsPath, `${prefix}${generated.join('\n')}\n`, { mode: 0o600 });
  console.warn('Development JWT secrets were missing. A stable local secret file was created and is not committed.');
}

ensureDevelopmentJwtSecrets();

const resolveJwtSecret = (envKey: 'JWT_SECRET' | 'JWT_REFRESH_SECRET'): string => {
  const configured = process.env[envKey];
  if (secretIsStable(configured)) return secretValue(configured);

  if (process.env.NODE_ENV === 'production') {
    throw new Error(`${envKey} must be set to at least 32 characters in production`);
  }

  throw new Error(`${envKey} is not configured for development.`);
};

export const JWT_CONFIG = {
  SECRET: resolveJwtSecret('JWT_SECRET'),
  REFRESH_SECRET: resolveJwtSecret('JWT_REFRESH_SECRET'),
  ACCESS_TOKEN_EXPIRY: process.env.NODE_ENV === 'production' ? '1h' : '24h',
  REFRESH_TOKEN_EXPIRY: '7d',
  ISSUER: 'property-management-app',
  AUDIENCE: 'property-management-users'
};

export const getJwtSecret = (): string => JWT_CONFIG.SECRET;
export const getJwtRefreshSecret = (): string => JWT_CONFIG.REFRESH_SECRET;
