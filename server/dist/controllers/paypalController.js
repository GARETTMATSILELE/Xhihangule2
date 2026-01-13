"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createOrder = createOrder;
exports.captureOrder = captureOrder;
exports.getStatus = getStatus;
exports.getClientConfig = getClientConfig;
const axios_1 = __importDefault(require("axios"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const dotenv_1 = __importDefault(require("dotenv"));
const LIVE_API_BASE = 'https://api-m.paypal.com';
const SANDBOX_API_BASE = 'https://api-m.sandbox.paypal.com';
// Load PayPal configuration ONLY from server/.env.production at runtime.
// This ensures production keys are consistently sourced from the same file,
// independent of how the main process environment was initialized.
let paypalEnvFileCache = null;
function loadPaypalEnvFile() {
    if (paypalEnvFileCache)
        return paypalEnvFileCache;
    try {
        // Resolve to server/.env.production regardless of build output location
        // - When running from dist/controllers: __dirname -> server/dist/controllers → ../../.env.production => server/.env.production
        // - When running from src/controllers (dev/ts-node): __dirname -> server/src/controllers → ../../.env.production => server/.env.production
        const envPath = path_1.default.resolve(__dirname, '..', '..', '.env.production');
        if (fs_1.default.existsSync(envPath)) {
            const content = fs_1.default.readFileSync(envPath, 'utf8');
            paypalEnvFileCache = dotenv_1.default.parse(content);
        }
        else {
            // Optional fallback: look in CWD as a last resort
            const altPath = path_1.default.resolve(process.cwd(), '.env.production');
            if (fs_1.default.existsSync(altPath)) {
                const content = fs_1.default.readFileSync(altPath, 'utf8');
                paypalEnvFileCache = dotenv_1.default.parse(content);
            }
            else {
                // eslint-disable-next-line no-console
                console.warn('PayPal configuration file not found at:', envPath, 'or', altPath);
                paypalEnvFileCache = {};
            }
        }
    }
    catch (e) {
        // eslint-disable-next-line no-console
        console.warn('Failed to load PayPal .env.production:', (e === null || e === void 0 ? void 0 : e.message) || e);
        paypalEnvFileCache = {};
    }
    return paypalEnvFileCache;
}
function readPaypalVar(name) {
    const vars = loadPaypalEnvFile();
    const valueFromFile = vars[name];
    if (typeof valueFromFile === 'string' && valueFromFile.length > 0) {
        return valueFromFile;
    }
    // Fallback to process.env so production can use platform env vars if the file isn't present
    const valueFromEnv = process.env[name];
    return typeof valueFromEnv === 'string' && valueFromEnv.length > 0 ? valueFromEnv : undefined;
}
function getApiBase() {
    var _a;
    // Prefer explicit override from .env.production or process.env
    const explicit = (_a = (readPaypalVar('PAYPAL_API_BASE') || process.env.PAYPAL_API_BASE)) === null || _a === void 0 ? void 0 : _a.trim();
    if (explicit)
        return explicit;
    // Always derive PayPal env from .env.production (default to 'live' if absent)
    const env = (readPaypalVar('PAYPAL_ENV') || readPaypalVar('PAYPAL_MODE') || 'live').toLowerCase();
    if (env === 'sandbox')
        return SANDBOX_API_BASE;
    return LIVE_API_BASE;
}
function getPaypalEnv() {
    const base = getApiBase();
    if (base.includes('sandbox.paypal.com'))
        return 'sandbox';
    const env = (readPaypalVar('PAYPAL_ENV') || readPaypalVar('PAYPAL_MODE') || process.env.PAYPAL_ENV || process.env.PAYPAL_MODE || 'live').toLowerCase();
    return env === 'sandbox' ? 'sandbox' : 'live';
}
function getPaypalCredentials() {
    const env = getPaypalEnv();
    if (env === 'live') {
        const clientId = readPaypalVar('PAYPAL_LIVE_CLIENT_ID') || readPaypalVar('PAYPAL_CLIENT_ID') || process.env.PAYPAL_LIVE_CLIENT_ID || process.env.PAYPAL_CLIENT_ID;
        const clientSecret = readPaypalVar('PAYPAL_LIVE_CLIENT_SECRET') || readPaypalVar('PAYPAL_CLIENT_SECRET') || process.env.PAYPAL_LIVE_CLIENT_SECRET || process.env.PAYPAL_CLIENT_SECRET;
        return { clientId, clientSecret, env };
    }
    const clientId = readPaypalVar('PAYPAL_SANDBOX_CLIENT_ID') || readPaypalVar('PAYPAL_CLIENT_ID') || process.env.PAYPAL_SANDBOX_CLIENT_ID || process.env.PAYPAL_CLIENT_ID;
    const clientSecret = readPaypalVar('PAYPAL_SANDBOX_CLIENT_SECRET') || readPaypalVar('PAYPAL_CLIENT_SECRET') || process.env.PAYPAL_SANDBOX_CLIENT_SECRET || process.env.PAYPAL_CLIENT_SECRET;
    return { clientId, clientSecret, env };
}
function extractPaypalErrorMessage(error) {
    var _a, _b;
    const status = (_a = error === null || error === void 0 ? void 0 : error.response) === null || _a === void 0 ? void 0 : _a.status;
    const data = (_b = error === null || error === void 0 ? void 0 : error.response) === null || _b === void 0 ? void 0 : _b.data;
    const errorCode = (data === null || data === void 0 ? void 0 : data.name) || (data === null || data === void 0 ? void 0 : data.error);
    const errorDescription = (data === null || data === void 0 ? void 0 : data.message) || (data === null || data === void 0 ? void 0 : data.error_description);
    const debugId = data === null || data === void 0 ? void 0 : data.debug_id;
    if (errorCode === 'INVALID_CLIENT' || errorCode === 'invalid_client') {
        return 'PayPal authentication failed: invalid client credentials. Check PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET and PAYPAL_ENV.';
    }
    if (status === 401) {
        return 'PayPal authentication failed (401). Verify PAYPAL credentials and environment.';
    }
    if (status === 404) {
        return 'PayPal API endpoint not found (404). Verify PAYPAL_API_BASE or PAYPAL_ENV (sandbox vs live).';
    }
    if (Array.isArray(data === null || data === void 0 ? void 0 : data.details) && data.details.length) {
        const parts = data.details.map((d) => {
            const issue = (d === null || d === void 0 ? void 0 : d.issue) || 'ISSUE';
            const desc = (d === null || d === void 0 ? void 0 : d.description) ? ` - ${d.description}` : '';
            return `${issue}${desc}`;
        });
        const suffix = debugId ? ` (debug_id: ${debugId})` : '';
        return `PayPal error: ${parts.join('; ')}${suffix}`;
    }
    if (errorDescription)
        return `PayPal error: ${errorDescription}${debugId ? ` (debug_id: ${debugId})` : ''}`;
    if (typeof data === 'string')
        return data;
    return (error === null || error === void 0 ? void 0 : error.message) || 'Failed to communicate with PayPal';
}
function isPaypalConfigured() {
    const { clientId, clientSecret } = getPaypalCredentials();
    return Boolean(clientId && clientSecret);
}
function assertEnv() {
    const { clientId, clientSecret, env } = getPaypalCredentials();
    if (!clientId || !clientSecret) {
        throw new Error(`Missing PayPal credentials for ${env}. Set ` +
            (env === 'live'
                ? 'PAYPAL_LIVE_CLIENT_ID and PAYPAL_LIVE_CLIENT_SECRET (or PAYPAL_CLIENT_ID/SECRET)'
                : 'PAYPAL_SANDBOX_CLIENT_ID and PAYPAL_SANDBOX_CLIENT_SECRET (or PAYPAL_CLIENT_ID/SECRET)') +
            '.');
    }
}
function generateAccessToken() {
    return __awaiter(this, void 0, void 0, function* () {
        assertEnv();
        const base = getApiBase();
        const { clientId, clientSecret } = getPaypalCredentials();
        const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
        const resp = yield axios_1.default.post(`${base}/v1/oauth2/token`, 'grant_type=client_credentials', {
            headers: {
                Authorization: `Basic ${auth}`,
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            timeout: 15000
        });
        return resp.data.access_token;
    });
}
function getServerPriceUSD(plan, cycle) {
    const monthly = { INDIVIDUAL: 10, SME: 300, ENTERPRISE: 600 };
    let amount = 0;
    if (cycle === 'monthly') {
        amount = monthly[plan];
    }
    else {
        amount = monthly[plan] * 12;
    }
    return { value: amount.toFixed(2), currency_code: 'USD' };
}
function createOrder(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c, _d, _e, _f, _g, _h;
        try {
            const { plan, cycle } = req.body || {};
            if (!plan || !cycle || !['INDIVIDUAL', 'SME', 'ENTERPRISE'].includes(plan) || !['monthly', 'yearly'].includes(cycle)) {
                return res.status(400).json({ status: 'error', message: 'Invalid plan or cycle' });
            }
            // Return a clear, non-500 response when credentials are not configured
            if (!isPaypalConfigured()) {
                return res.status(503).json({
                    status: 'disabled',
                    message: 'PayPal is not configured on the server. Set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET, and use PAYPAL_ENV=sandbox for development.'
                });
            }
            const accessToken = yield generateAccessToken();
            const base = getApiBase();
            const amount = getServerPriceUSD(plan, cycle);
            const order = {
                intent: 'CAPTURE',
                purchase_units: [
                    {
                        amount,
                        description: `${plan} plan (${cycle}) subscription`
                    }
                ],
                application_context: {
                    shipping_preference: 'NO_SHIPPING',
                    user_action: 'PAY_NOW',
                    brand_name: 'Xhihangule'
                }
            };
            const resp = yield axios_1.default.post(`${base}/v2/checkout/orders`, order, {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                },
                timeout: 20000
            });
            return res.json({ id: resp.data.id, status: resp.data.status });
        }
        catch (err) {
            try {
                const baseForLog = getApiBase();
                const resolvedEnv = getPaypalEnv();
                const usingLiveVars = Boolean(readPaypalVar('PAYPAL_LIVE_CLIENT_ID') || readPaypalVar('PAYPAL_LIVE_CLIENT_SECRET') || readPaypalVar('PAYPAL_CLIENT_ID') || readPaypalVar('PAYPAL_CLIENT_SECRET'));
                const usingSandboxVars = Boolean(readPaypalVar('PAYPAL_SANDBOX_CLIENT_ID') || readPaypalVar('PAYPAL_SANDBOX_CLIENT_SECRET'));
                const rawData = (_a = err === null || err === void 0 ? void 0 : err.response) === null || _a === void 0 ? void 0 : _a.data;
                let rawDataString;
                try {
                    rawDataString = typeof rawData === 'string' ? rawData : JSON.stringify(rawData, null, 2);
                }
                catch (_j) {
                    rawDataString = undefined;
                }
                // eslint-disable-next-line no-console
                console.error('PayPal createOrder failed', {
                    apiBase: baseForLog,
                    env: resolvedEnv,
                    hasClientId: Boolean(getPaypalCredentials().clientId),
                    hasClientSecret: Boolean(getPaypalCredentials().clientSecret),
                    usingLiveVars,
                    usingSandboxVars,
                    status: (_b = err === null || err === void 0 ? void 0 : err.response) === null || _b === void 0 ? void 0 : _b.status,
                    data: (_c = err === null || err === void 0 ? void 0 : err.response) === null || _c === void 0 ? void 0 : _c.data,
                    debug_id: (_e = (_d = err === null || err === void 0 ? void 0 : err.response) === null || _d === void 0 ? void 0 : _d.data) === null || _e === void 0 ? void 0 : _e.debug_id,
                    details: (_g = (_f = err === null || err === void 0 ? void 0 : err.response) === null || _f === void 0 ? void 0 : _f.data) === null || _g === void 0 ? void 0 : _g.details,
                    raw: rawDataString
                });
            }
            catch (_k) { }
            const message = extractPaypalErrorMessage(err);
            const statusFromPaypal = (_h = err === null || err === void 0 ? void 0 : err.response) === null || _h === void 0 ? void 0 : _h.status;
            // Forward meaningful PayPal client errors instead of masking as 500
            if ([400, 401, 403, 404, 409, 422].includes(Number(statusFromPaypal))) {
                return res.status(Number(statusFromPaypal)).json({ status: 'error', message });
            }
            // Unknown/transport errors -> internal error
            return res.status(500).json({ status: 'error', message });
        }
    });
}
function captureOrder(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c, _d, _e, _f, _g, _h;
        try {
            const { orderID } = req.body || {};
            if (!orderID) {
                return res.status(400).json({ status: 'error', message: 'orderID is required' });
            }
            // Return a clear, non-500 response when credentials are not configured
            if (!isPaypalConfigured()) {
                return res.status(503).json({
                    status: 'disabled',
                    message: 'PayPal is not configured on the server. Set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET, and use PAYPAL_ENV=sandbox for development.'
                });
            }
            const accessToken = yield generateAccessToken();
            const base = getApiBase();
            const resp = yield axios_1.default.post(`${base}/v2/checkout/orders/${orderID}/capture`, {}, {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                },
                timeout: 20000
            });
            return res.json({ status: resp.data.status, details: resp.data });
        }
        catch (err) {
            try {
                const baseForLog = getApiBase();
                const resolvedEnv = getPaypalEnv();
                const usingLiveVars = Boolean(readPaypalVar('PAYPAL_LIVE_CLIENT_ID') || readPaypalVar('PAYPAL_LIVE_CLIENT_SECRET') || readPaypalVar('PAYPAL_CLIENT_ID') || readPaypalVar('PAYPAL_CLIENT_SECRET'));
                const usingSandboxVars = Boolean(readPaypalVar('PAYPAL_SANDBOX_CLIENT_ID') || readPaypalVar('PAYPAL_SANDBOX_CLIENT_SECRET'));
                const rawData = (_a = err === null || err === void 0 ? void 0 : err.response) === null || _a === void 0 ? void 0 : _a.data;
                let rawDataString;
                try {
                    rawDataString = typeof rawData === 'string' ? rawData : JSON.stringify(rawData, null, 2);
                }
                catch (_j) {
                    rawDataString = undefined;
                }
                // eslint-disable-next-line no-console
                console.error('PayPal captureOrder failed', {
                    apiBase: baseForLog,
                    env: resolvedEnv,
                    hasClientId: Boolean(getPaypalCredentials().clientId),
                    hasClientSecret: Boolean(getPaypalCredentials().clientSecret),
                    usingLiveVars,
                    usingSandboxVars,
                    status: (_b = err === null || err === void 0 ? void 0 : err.response) === null || _b === void 0 ? void 0 : _b.status,
                    data: (_c = err === null || err === void 0 ? void 0 : err.response) === null || _c === void 0 ? void 0 : _c.data,
                    debug_id: (_e = (_d = err === null || err === void 0 ? void 0 : err.response) === null || _d === void 0 ? void 0 : _d.data) === null || _e === void 0 ? void 0 : _e.debug_id,
                    details: (_g = (_f = err === null || err === void 0 ? void 0 : err.response) === null || _f === void 0 ? void 0 : _f.data) === null || _g === void 0 ? void 0 : _g.details,
                    raw: rawDataString
                });
            }
            catch (_k) { }
            const message = extractPaypalErrorMessage(err);
            const statusFromPaypal = (_h = err === null || err === void 0 ? void 0 : err.response) === null || _h === void 0 ? void 0 : _h.status;
            if ([400, 401, 403, 404, 409, 422].includes(Number(statusFromPaypal))) {
                return res.status(Number(statusFromPaypal)).json({ status: 'error', message });
            }
            return res.status(500).json({ status: 'error', message });
        }
    });
}
function getStatus(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const base = getApiBase();
            const resolvedEnv = getPaypalEnv();
            const creds = getPaypalCredentials();
            return res.json({
                status: isPaypalConfigured() ? 'ok' : 'disabled',
                env: resolvedEnv,
                apiBase: base,
                hasClientId: Boolean(creds.clientId),
                hasClientSecret: Boolean(creds.clientSecret),
                clientIdPrefix: creds.clientId ? String(creds.clientId).slice(0, 6) : null
            });
        }
        catch (e) {
            return res.status(500).json({ status: 'error', message: (e === null || e === void 0 ? void 0 : e.message) || 'Failed to read PayPal status' });
        }
    });
}
function getClientConfig(_req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const resolvedEnv = getPaypalEnv();
            const creds = getPaypalCredentials();
            if (!creds.clientId) {
                return res.status(503).json({
                    status: 'disabled',
                    message: 'PayPal client ID not configured on server.'
                });
            }
            return res.json({
                env: resolvedEnv,
                clientId: creds.clientId
            });
        }
        catch (e) {
            return res.status(500).json({ status: 'error', message: (e === null || e === void 0 ? void 0 : e.message) || 'Failed to read PayPal client config' });
        }
    });
}
