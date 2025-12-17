import axios from 'axios';
import { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

type Plan = 'INDIVIDUAL' | 'SME' | 'ENTERPRISE';
type Cycle = 'monthly' | 'yearly';
type PaypalEnv = 'live' | 'sandbox';

const LIVE_API_BASE = 'https://api-m.paypal.com';
const SANDBOX_API_BASE = 'https://api-m.sandbox.paypal.com';

// Load PayPal configuration ONLY from server/.env.production at runtime.
// This ensures production keys are consistently sourced from the same file,
// independent of how the main process environment was initialized.
let paypalEnvFileCache: Record<string, string> | null = null;
function loadPaypalEnvFile(): Record<string, string> {
	if (paypalEnvFileCache) return paypalEnvFileCache;
	try {
		// Resolve to server/.env.production regardless of build output location
		// - When running from dist/controllers: __dirname -> server/dist/controllers → ../../.env.production => server/.env.production
		// - When running from src/controllers (dev/ts-node): __dirname -> server/src/controllers → ../../.env.production => server/.env.production
		const envPath = path.resolve(__dirname, '..', '..', '.env.production');
		if (fs.existsSync(envPath)) {
			const content = fs.readFileSync(envPath, 'utf8');
			paypalEnvFileCache = dotenv.parse(content);
		} else {
			// Optional fallback: look in CWD as a last resort
			const altPath = path.resolve(process.cwd(), '.env.production');
			if (fs.existsSync(altPath)) {
				const content = fs.readFileSync(altPath, 'utf8');
				paypalEnvFileCache = dotenv.parse(content);
			} else {
				// eslint-disable-next-line no-console
				console.warn('PayPal configuration file not found at:', envPath, 'or', altPath);
				paypalEnvFileCache = {};
			}
		}
	} catch (e) {
		// eslint-disable-next-line no-console
		console.warn('Failed to load PayPal .env.production:', (e as any)?.message || e);
		paypalEnvFileCache = {};
	}
	return paypalEnvFileCache;
}

function readPaypalVar(name: string): string | undefined {
	const vars = loadPaypalEnvFile();
	const value = vars[name];
	return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function getApiBase(): string {
	// Prefer explicit override from .env.production
	const explicit = readPaypalVar('PAYPAL_API_BASE')?.trim();
	if (explicit) return explicit;
	// Always derive PayPal env from .env.production (default to 'live' if absent)
	const env = (readPaypalVar('PAYPAL_ENV') || readPaypalVar('PAYPAL_MODE') || 'live').toLowerCase();
	if (env === 'sandbox') return SANDBOX_API_BASE;
	return LIVE_API_BASE;
}

function getPaypalEnv(): PaypalEnv {
	const base = getApiBase();
	if (base.includes('sandbox.paypal.com')) return 'sandbox';
	const env = (readPaypalVar('PAYPAL_ENV') || readPaypalVar('PAYPAL_MODE') || 'live').toLowerCase();
	return env === 'sandbox' ? 'sandbox' : 'live';
}

function getPaypalCredentials(): { clientId?: string; clientSecret?: string; env: PaypalEnv } {
	const env = getPaypalEnv();
	if (env === 'live') {
		const clientId = readPaypalVar('PAYPAL_LIVE_CLIENT_ID') || readPaypalVar('PAYPAL_CLIENT_ID');
		const clientSecret = readPaypalVar('PAYPAL_LIVE_CLIENT_SECRET') || readPaypalVar('PAYPAL_CLIENT_SECRET');
		return { clientId, clientSecret, env };
	}
	const clientId = readPaypalVar('PAYPAL_SANDBOX_CLIENT_ID') || readPaypalVar('PAYPAL_CLIENT_ID');
	const clientSecret = readPaypalVar('PAYPAL_SANDBOX_CLIENT_SECRET') || readPaypalVar('PAYPAL_CLIENT_SECRET');
	return { clientId, clientSecret, env };
}

function extractPaypalErrorMessage(error: any): string {
	const status = error?.response?.status;
	const data = error?.response?.data;
	const errorCode = data?.name || data?.error;
	const errorDescription = data?.message || data?.error_description;

	if (errorCode === 'INVALID_CLIENT' || errorCode === 'invalid_client') {
		return 'PayPal authentication failed: invalid client credentials. Check PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET and PAYPAL_ENV.';
	}
	if (status === 401) {
		return 'PayPal authentication failed (401). Verify PAYPAL credentials and environment.';
	}
	if (status === 404) {
		return 'PayPal API endpoint not found (404). Verify PAYPAL_API_BASE or PAYPAL_ENV (sandbox vs live).';
	}
	if (data?.details?.[0]?.issue && data?.details?.[0]?.description) {
		return `PayPal error: ${data.details[0].issue} - ${data.details[0].description}`;
	}
	if (errorDescription) return `PayPal error: ${errorDescription}`;
	if (typeof data === 'string') return data;
	return error?.message || 'Failed to communicate with PayPal';
}

function isPaypalConfigured(): boolean {
	const { clientId, clientSecret } = getPaypalCredentials();
	return Boolean(clientId && clientSecret);
}

function assertEnv() {
	const { clientId, clientSecret, env } = getPaypalCredentials();
	if (!clientId || !clientSecret) {
		throw new Error(
			`Missing PayPal credentials for ${env}. Set ` +
			(env === 'live'
				? 'PAYPAL_LIVE_CLIENT_ID and PAYPAL_LIVE_CLIENT_SECRET (or PAYPAL_CLIENT_ID/SECRET)'
				: 'PAYPAL_SANDBOX_CLIENT_ID and PAYPAL_SANDBOX_CLIENT_SECRET (or PAYPAL_CLIENT_ID/SECRET)') +
			'.'
		);
	}
}

async function generateAccessToken(): Promise<string> {
	assertEnv();
	const base = getApiBase();
	const { clientId, clientSecret } = getPaypalCredentials();
	const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
	const resp = await axios.post(
		`${base}/v1/oauth2/token`,
		'grant_type=client_credentials',
		{
			headers: {
				Authorization: `Basic ${auth}`,
				'Content-Type': 'application/x-www-form-urlencoded'
			},
			timeout: 15000
		}
	);
	return resp.data.access_token as string;
}

function getServerPriceUSD(plan: Plan, cycle: Cycle): { value: string; currency_code: 'USD' } {
	const monthly = { INDIVIDUAL: 10, SME: 300, ENTERPRISE: 600 } as const;
	let amount = 0;
	if (cycle === 'monthly') {
		amount = monthly[plan];
	} else {
		amount = monthly[plan] * 12;
	}
	return { value: amount.toFixed(2), currency_code: 'USD' };
}

export async function createOrder(req: Request, res: Response) {
	try {
		const { plan, cycle }: { plan: Plan; cycle: Cycle } = req.body || {};
		if (!plan || !cycle || !['INDIVIDUAL', 'SME', 'ENTERPRISE'].includes(plan) || !['monthly', 'yearly'].includes(cycle)) {
			return res.status(400).json({ status: 'error', message: 'Invalid plan or cycle' });
		}
		// Return a clear, non-500 response when credentials are not configured
		if (!isPaypalConfigured()) {
			return res.status(503).json({
				status: 'disabled',
				message:
					'PayPal is not configured on the server. Set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET, and use PAYPAL_ENV=sandbox for development.'
			});
		}
		const accessToken = await generateAccessToken();
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

		const resp = await axios.post(`${base}/v2/checkout/orders`, order, {
			headers: {
				Authorization: `Bearer ${accessToken}`,
				'Content-Type': 'application/json'
			},
			timeout: 20000
		});

		return res.json({ id: resp.data.id, status: resp.data.status });
	} catch (err: any) {
		try {
			const baseForLog = getApiBase();
			const resolvedEnv = getPaypalEnv();
			const usingLiveVars = Boolean(readPaypalVar('PAYPAL_LIVE_CLIENT_ID') || readPaypalVar('PAYPAL_LIVE_CLIENT_SECRET') || readPaypalVar('PAYPAL_CLIENT_ID') || readPaypalVar('PAYPAL_CLIENT_SECRET'));
			const usingSandboxVars = Boolean(readPaypalVar('PAYPAL_SANDBOX_CLIENT_ID') || readPaypalVar('PAYPAL_SANDBOX_CLIENT_SECRET'));
			// eslint-disable-next-line no-console
			console.error('PayPal createOrder failed', {
				apiBase: baseForLog,
				env: resolvedEnv,
				hasClientId: Boolean(getPaypalCredentials().clientId),
				hasClientSecret: Boolean(getPaypalCredentials().clientSecret),
				usingLiveVars,
				usingSandboxVars,
				status: err?.response?.status,
				data: err?.response?.data
			});
		} catch {}

		const message = extractPaypalErrorMessage(err);
		return res.status(500).json({ status: 'error', message });
	}
}

export async function captureOrder(req: Request, res: Response) {
	try {
		const { orderID } = req.body || {};
		if (!orderID) {
			return res.status(400).json({ status: 'error', message: 'orderID is required' });
		}
		// Return a clear, non-500 response when credentials are not configured
		if (!isPaypalConfigured()) {
			return res.status(503).json({
				status: 'disabled',
				message:
					'PayPal is not configured on the server. Set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET, and use PAYPAL_ENV=sandbox for development.'
			});
		}
		const accessToken = await generateAccessToken();
		const base = getApiBase();

		const resp = await axios.post(`${base}/v2/checkout/orders/${orderID}/capture`, {}, {
			headers: {
				Authorization: `Bearer ${accessToken}`,
				'Content-Type': 'application/json'
			},
			timeout: 20000
		});

		return res.json({ status: resp.data.status, details: resp.data });
	} catch (err: any) {
		try {
			const baseForLog = getApiBase();
			const resolvedEnv = getPaypalEnv();
			const usingLiveVars = Boolean(readPaypalVar('PAYPAL_LIVE_CLIENT_ID') || readPaypalVar('PAYPAL_LIVE_CLIENT_SECRET') || readPaypalVar('PAYPAL_CLIENT_ID') || readPaypalVar('PAYPAL_CLIENT_SECRET'));
			const usingSandboxVars = Boolean(readPaypalVar('PAYPAL_SANDBOX_CLIENT_ID') || readPaypalVar('PAYPAL_SANDBOX_CLIENT_SECRET'));
			// eslint-disable-next-line no-console
			console.error('PayPal captureOrder failed', {
				apiBase: baseForLog,
				env: resolvedEnv,
				hasClientId: Boolean(getPaypalCredentials().clientId),
				hasClientSecret: Boolean(getPaypalCredentials().clientSecret),
				usingLiveVars,
				usingSandboxVars,
				status: err?.response?.status,
				data: err?.response?.data
			});
		} catch {}

		const message = extractPaypalErrorMessage(err);
		return res.status(500).json({ status: 'error', message });
	}
}

export async function getStatus(req: Request, res: Response) {
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
	} catch (e: any) {
		return res.status(500).json({ status: 'error', message: e?.message || 'Failed to read PayPal status' });
	}
}

export async function getClientConfig(_req: Request, res: Response) {
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
	} catch (e: any) {
		return res.status(500).json({ status: 'error', message: e?.message || 'Failed to read PayPal client config' });
	}
}




