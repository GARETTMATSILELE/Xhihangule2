"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.redactHeaders = exports.getClientIpForRateLimit = void 0;
const net_1 = require("net");
const SENSITIVE_HEADER_KEYS = new Set([
    'authorization',
    'cookie',
    'set-cookie',
    'x-api-key',
    'proxy-authorization'
]);
const parseIpFromValue = (value) => {
    var _a;
    const trimmed = value.trim();
    if (!trimmed)
        return undefined;
    const first = ((_a = trimmed.split(',')[0]) === null || _a === void 0 ? void 0 : _a.trim()) || '';
    if (!first)
        return undefined;
    // Bracketed IPv6 with optional port: [2001:db8::1]:1234
    if (first.startsWith('[')) {
        const endBracket = first.indexOf(']');
        if (endBracket > 1) {
            const candidate = first.slice(1, endBracket);
            return (0, net_1.isIP)(candidate) ? candidate : undefined;
        }
    }
    // If the full value is already a valid IP (IPv4 or IPv6), keep it.
    if ((0, net_1.isIP)(first))
        return first;
    // IPv4 with port: 1.2.3.4:5678
    const lastColon = first.lastIndexOf(':');
    if (lastColon > -1) {
        const hostPart = first.slice(0, lastColon);
        const portPart = first.slice(lastColon + 1);
        if (/^\d+$/.test(portPart) && (0, net_1.isIP)(hostPart)) {
            return hostPart;
        }
    }
    return undefined;
};
const readHeaderValue = (header) => {
    if (Array.isArray(header)) {
        return header.find((item) => typeof item === 'string' && item.trim().length > 0);
    }
    return typeof header === 'string' ? header : undefined;
};
const getClientIpForRateLimit = (req) => {
    var _a;
    const candidates = [
        readHeaderValue(req.headers['x-forwarded-for']),
        readHeaderValue(req.headers['x-client-ip']),
        readHeaderValue(req.headers['x-real-ip']),
        readHeaderValue(req.headers['client-ip']),
        req.ip,
        (_a = req.socket) === null || _a === void 0 ? void 0 : _a.remoteAddress
    ];
    for (const raw of candidates) {
        if (!raw)
            continue;
        const parsed = parseIpFromValue(raw);
        if (parsed)
            return parsed;
    }
    // Last-resort fallback keeps limiter stable even on malformed proxy headers.
    return '0.0.0.0';
};
exports.getClientIpForRateLimit = getClientIpForRateLimit;
const redactHeaders = (headers) => {
    const result = {};
    for (const [key, value] of Object.entries(headers || {})) {
        result[key] = SENSITIVE_HEADER_KEYS.has(key.toLowerCase()) ? '[redacted]' : value;
    }
    return result;
};
exports.redactHeaders = redactHeaders;
