import { isIP } from 'net';
import type { Request } from 'express';

const SENSITIVE_HEADER_KEYS = new Set([
  'authorization',
  'cookie',
  'set-cookie',
  'x-api-key',
  'proxy-authorization'
]);

const parseIpFromValue = (value: string): string | undefined => {
  const trimmed = value.trim();
  if (!trimmed) return undefined;

  const first = trimmed.split(',')[0]?.trim() || '';
  if (!first) return undefined;

  // Bracketed IPv6 with optional port: [2001:db8::1]:1234
  if (first.startsWith('[')) {
    const endBracket = first.indexOf(']');
    if (endBracket > 1) {
      const candidate = first.slice(1, endBracket);
      return isIP(candidate) ? candidate : undefined;
    }
  }

  // If the full value is already a valid IP (IPv4 or IPv6), keep it.
  if (isIP(first)) return first;

  // IPv4 with port: 1.2.3.4:5678
  const lastColon = first.lastIndexOf(':');
  if (lastColon > -1) {
    const hostPart = first.slice(0, lastColon);
    const portPart = first.slice(lastColon + 1);
    if (/^\d+$/.test(portPart) && isIP(hostPart)) {
      return hostPart;
    }
  }

  return undefined;
};

const readHeaderValue = (header: string | string[] | undefined): string | undefined => {
  if (Array.isArray(header)) {
    return header.find((item) => typeof item === 'string' && item.trim().length > 0);
  }
  return typeof header === 'string' ? header : undefined;
};

export const getClientIpForRateLimit = (req: Request): string => {
  const candidates = [
    readHeaderValue(req.headers['x-forwarded-for']),
    readHeaderValue(req.headers['x-client-ip']),
    readHeaderValue(req.headers['x-real-ip']),
    readHeaderValue(req.headers['client-ip']),
    req.ip,
    req.socket?.remoteAddress
  ];

  for (const raw of candidates) {
    if (!raw) continue;
    const parsed = parseIpFromValue(raw);
    if (parsed) return parsed;
  }

  // Last-resort fallback keeps limiter stable even on malformed proxy headers.
  return '0.0.0.0';
};

export const redactHeaders = (headers: Request['headers']): Record<string, unknown> => {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(headers || {})) {
    result[key] = SENSITIVE_HEADER_KEYS.has(key.toLowerCase()) ? '[redacted]' : value;
  }
  return result;
};
