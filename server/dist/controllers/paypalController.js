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
const axios_1 = __importDefault(require("axios"));
const LIVE_API_BASE = 'https://api-m.paypal.com';
const SANDBOX_API_BASE = 'https://api-m.sandbox.paypal.com';
function getApiBase() {
    var _a;
    const explicit = (_a = process.env.PAYPAL_API_BASE) === null || _a === void 0 ? void 0 : _a.trim();
    if (explicit)
        return explicit;
    const env = (process.env.PAYPAL_ENV || process.env.PAYPAL_MODE || '').toLowerCase();
    // Only use sandbox if explicitly requested; otherwise force live
    if (env === 'sandbox')
        return SANDBOX_API_BASE;
    return LIVE_API_BASE;
}
function extractPaypalErrorMessage(error) {
    var _a, _b, _c, _d, _e, _f;
    const status = (_a = error === null || error === void 0 ? void 0 : error.response) === null || _a === void 0 ? void 0 : _a.status;
    const data = (_b = error === null || error === void 0 ? void 0 : error.response) === null || _b === void 0 ? void 0 : _b.data;
    const errorCode = (data === null || data === void 0 ? void 0 : data.name) || (data === null || data === void 0 ? void 0 : data.error);
    const errorDescription = (data === null || data === void 0 ? void 0 : data.message) || (data === null || data === void 0 ? void 0 : data.error_description);
    if (errorCode === 'INVALID_CLIENT' || errorCode === 'invalid_client') {
        return 'PayPal authentication failed: invalid client credentials. Check PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET and PAYPAL_ENV.';
    }
    if (status === 401) {
        return 'PayPal authentication failed (401). Verify PAYPAL credentials and environment.';
    }
    if (status === 404) {
        return 'PayPal API endpoint not found (404). Verify PAYPAL_API_BASE or PAYPAL_ENV (sandbox vs live).';
    }
    if (((_d = (_c = data === null || data === void 0 ? void 0 : data.details) === null || _c === void 0 ? void 0 : _c[0]) === null || _d === void 0 ? void 0 : _d.issue) && ((_f = (_e = data === null || data === void 0 ? void 0 : data.details) === null || _e === void 0 ? void 0 : _e[0]) === null || _f === void 0 ? void 0 : _f.description)) {
        return `PayPal error: ${data.details[0].issue} - ${data.details[0].description}`;
    }
    if (errorDescription)
        return `PayPal error: ${errorDescription}`;
    if (typeof data === 'string')
        return data;
    return (error === null || error === void 0 ? void 0 : error.message) || 'Failed to communicate with PayPal';
}
function assertEnv() {
    if (!process.env.PAYPAL_CLIENT_ID || !process.env.PAYPAL_CLIENT_SECRET) {
        throw new Error('Missing PAYPAL_CLIENT_ID or PAYPAL_CLIENT_SECRET');
    }
}
function generateAccessToken() {
    return __awaiter(this, void 0, void 0, function* () {
        assertEnv();
        const base = getApiBase();
        const auth = Buffer.from(`${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`).toString('base64');
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
        var _a, _b;
        try {
            const { plan, cycle } = req.body || {};
            if (!plan || !cycle || !['INDIVIDUAL', 'SME', 'ENTERPRISE'].includes(plan) || !['monthly', 'yearly'].includes(cycle)) {
                return res.status(400).json({ status: 'error', message: 'Invalid plan or cycle' });
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
                // eslint-disable-next-line no-console
                console.error('PayPal createOrder failed', {
                    apiBase: baseForLog,
                    env: process.env.PAYPAL_ENV || process.env.PAYPAL_MODE || '',
                    hasClientId: Boolean(process.env.PAYPAL_CLIENT_ID),
                    hasClientSecret: Boolean(process.env.PAYPAL_CLIENT_SECRET),
                    status: (_a = err === null || err === void 0 ? void 0 : err.response) === null || _a === void 0 ? void 0 : _a.status,
                    data: (_b = err === null || err === void 0 ? void 0 : err.response) === null || _b === void 0 ? void 0 : _b.data
                });
            }
            catch (_c) { }
            const message = extractPaypalErrorMessage(err);
            return res.status(500).json({ status: 'error', message });
        }
    });
}
function captureOrder(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b;
        try {
            const { orderID } = req.body || {};
            if (!orderID) {
                return res.status(400).json({ status: 'error', message: 'orderID is required' });
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
                // eslint-disable-next-line no-console
                console.error('PayPal captureOrder failed', {
                    apiBase: baseForLog,
                    env: process.env.PAYPAL_ENV || process.env.PAYPAL_MODE || '',
                    hasClientId: Boolean(process.env.PAYPAL_CLIENT_ID),
                    hasClientSecret: Boolean(process.env.PAYPAL_CLIENT_SECRET),
                    status: (_a = err === null || err === void 0 ? void 0 : err.response) === null || _a === void 0 ? void 0 : _a.status,
                    data: (_b = err === null || err === void 0 ? void 0 : err.response) === null || _b === void 0 ? void 0 : _b.data
                });
            }
            catch (_c) { }
            const message = extractPaypalErrorMessage(err);
            return res.status(500).json({ status: 'error', message });
        }
    });
}
