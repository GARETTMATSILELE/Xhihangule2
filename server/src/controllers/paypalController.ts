import axios from 'axios';
import { Request, Response } from 'express';

type Plan = 'INDIVIDUAL' | 'SME' | 'ENTERPRISE';
type Cycle = 'monthly' | 'yearly';

const LIVE_API_BASE = 'https://api-m.paypal.com';
const SANDBOX_API_BASE = 'https://api-m.sandbox.paypal.com';

function getApiBase(): string {
	const explicit = process.env.PAYPAL_API_BASE?.trim();
	if (explicit) return explicit;
	const env = (process.env.PAYPAL_ENV || process.env.PAYPAL_MODE || '').toLowerCase();
	// Only use sandbox if explicitly requested; otherwise force live
	if (env === 'sandbox') return SANDBOX_API_BASE;
	return LIVE_API_BASE;
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

function assertEnv() {
	if (!process.env.PAYPAL_CLIENT_ID || !process.env.PAYPAL_CLIENT_SECRET) {
		throw new Error('Missing PAYPAL_CLIENT_ID or PAYPAL_CLIENT_SECRET');
	}
}

async function generateAccessToken(): Promise<string> {
	assertEnv();
	const base = getApiBase();
	const auth = Buffer.from(`${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`).toString('base64');
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
			// eslint-disable-next-line no-console
			console.error('PayPal createOrder failed', {
				apiBase: baseForLog,
				env: process.env.PAYPAL_ENV || process.env.PAYPAL_MODE || '',
				hasClientId: Boolean(process.env.PAYPAL_CLIENT_ID),
				hasClientSecret: Boolean(process.env.PAYPAL_CLIENT_SECRET),
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
			// eslint-disable-next-line no-console
			console.error('PayPal captureOrder failed', {
				apiBase: baseForLog,
				env: process.env.PAYPAL_ENV || process.env.PAYPAL_MODE || '',
				hasClientId: Boolean(process.env.PAYPAL_CLIENT_ID),
				hasClientSecret: Boolean(process.env.PAYPAL_CLIENT_SECRET),
				status: err?.response?.status,
				data: err?.response?.data
			});
		} catch {}

		const message = extractPaypalErrorMessage(err);
		return res.status(500).json({ status: 'error', message });
	}
}




