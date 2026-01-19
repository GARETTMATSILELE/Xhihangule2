import { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';

// The official package does not ship TypeScript types.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { Paynow } = require('paynow');

type PaynowEnv = {
	INTEGRATION_ID?: string;
	INTEGRATION_KEY?: string;
	RESULT_URL?: string;
	RETURN_URL?: string;
	PUBLIC_BASE_URL?: string;
};

function readEnv(): PaynowEnv {
	const env: PaynowEnv = {
		INTEGRATION_ID: process.env.PAYNOW_INTEGRATION_ID,
		INTEGRATION_KEY: process.env.PAYNOW_INTEGRATION_KEY,
		RESULT_URL: process.env.PAYNOW_RESULT_URL,
		RETURN_URL: process.env.PAYNOW_RETURN_URL,
		PUBLIC_BASE_URL: process.env.PUBLIC_BASE_URL
	};
	// Fallback: allow reading from server/config/local.paynow.json in development
	if ((!env.INTEGRATION_ID || !env.INTEGRATION_KEY) && (process.env.NODE_ENV !== 'production')) {
		try {
			const cfgPath = path.resolve(__dirname, '..', '..', 'config', 'local.paynow.json');
			if (fs.existsSync(cfgPath)) {
				const raw = fs.readFileSync(cfgPath, 'utf8');
				const json = JSON.parse(raw);
				env.INTEGRATION_ID = env.INTEGRATION_ID || json.PAYNOW_INTEGRATION_ID || json.INTEGRATION_ID;
				env.INTEGRATION_KEY = env.INTEGRATION_KEY || json.PAYNOW_INTEGRATION_KEY || json.INTEGRATION_KEY;
				env.RESULT_URL = env.RESULT_URL || json.PAYNOW_RESULT_URL || json.RESULT_URL;
				env.RETURN_URL = env.RETURN_URL || json.PAYNOW_RETURN_URL || json.RETURN_URL;
				env.PUBLIC_BASE_URL = env.PUBLIC_BASE_URL || json.PUBLIC_BASE_URL;
			}
		} catch {
			// ignore
		}
	}
	return env;
}

function resolveBaseUrl(req: Request, env: PaynowEnv): string {
	if (env.PUBLIC_BASE_URL) return env.PUBLIC_BASE_URL.replace(/\/+$/, '');
	const host = req.get('host');
	const proto = req.protocol;
	return `${proto}://${host}`;
}

function getPaynowForRequest(req: Request) {
	const env = readEnv();
	if (!env.INTEGRATION_ID || !env.INTEGRATION_KEY) {
		throw new Error(
			'Missing Paynow configuration. Set PAYNOW_INTEGRATION_ID and PAYNOW_INTEGRATION_KEY in the server environment.'
		);
	}
	const paynow = new Paynow(env.INTEGRATION_ID, env.INTEGRATION_KEY);
	// Configure result/return URLs for this request (fall back to server-computed URLs)
	const base = resolveBaseUrl(req, env);
	paynow.resultUrl = (env.RESULT_URL && env.RESULT_URL.trim().length > 0)
		? env.RESULT_URL
		: `${base}/api/paynow/result`;
	paynow.returnUrl = (env.RETURN_URL && env.RETURN_URL.trim().length > 0)
		? env.RETURN_URL
		: `${base}/api/paynow/return`;
	return paynow;
}

export function getStatus(_req: Request, res: Response) {
	try {
		const env = readEnv();
		const status = {
			status: env.INTEGRATION_ID && env.INTEGRATION_KEY ? 'ok' : 'disabled',
			hasIntegrationId: Boolean(env.INTEGRATION_ID),
			hasIntegrationKey: Boolean(env.INTEGRATION_KEY),
			resultUrl: env.RESULT_URL || null,
			returnUrl: env.RETURN_URL || null
		};
		return res.json(status);
	} catch (e: any) {
		return res.status(500).json({ status: 'error', message: e?.message || 'Failed to read Paynow status' });
	}
}

export async function createWebPayment(req: Request, res: Response) {
	try {
		const { reference, email, items, amount } = (req.body || {}) as {
			reference?: string;
			email?: string;
			items?: Array<{ title?: string; name?: string; description?: string; amount: number }>;
			amount?: number;
		};
		const ref = reference && String(reference).trim().length > 0
			? String(reference).trim()
			: `INV-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

		const paynow = getPaynowForRequest(req);
		const payment = paynow.createPayment(ref, email || '');

		if (Array.isArray(items) && items.length > 0) {
			for (const item of items) {
				const title = (item.title || item.name || item.description || 'Payment').toString();
				const amt = Number(item.amount || 0);
				if (Number.isFinite(amt) && amt > 0) {
					payment.add(title, amt);
				}
			}
		} else {
			const amt = Number(amount || 0);
			if (!Number.isFinite(amt) || amt <= 0) {
				return res.status(400).json({ status: 'error', message: 'amount is required when items are not provided' });
			}
			payment.add('Payment', amt);
		}

		const response = await paynow.send(payment);
		if (response && response.success) {
			return res.json({
				status: 'ok',
				reference: ref,
				redirectUrl: response.redirectUrl,
				pollUrl: response.pollUrl
			});
		}
		return res.status(502).json({
			status: 'error',
			message: 'Failed to create Paynow payment',
			details: response || null
		});
	} catch (e: any) {
		return res.status(500).json({ status: 'error', message: e?.message || 'Paynow error' });
	}
}

export async function createMobilePayment(req: Request, res: Response) {
	try {
		const { reference, phone, method, amount, email } = (req.body || {}) as {
			reference?: string;
			phone?: string;
			method?: 'ecocash' | 'onemoney' | string;
			amount?: number;
			email?: string;
		};
		if (!phone || !method) {
			return res.status(400).json({ status: 'error', message: 'phone and method are required' });
		}
		const amt = Number(amount || 0);
		if (!Number.isFinite(amt) || amt <= 0) {
			return res.status(400).json({ status: 'error', message: 'Valid amount is required' });
		}
		const ref = reference && String(reference).trim().length > 0
			? String(reference).trim()
			: `MP-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

		const paynow = getPaynowForRequest(req);
		const normalizedMethod = String(method).toLowerCase();
		const allowed = ['ecocash', 'onemoney', 'telecash'];
		if (!allowed.includes(normalizedMethod)) {
			return res.status(400).json({ status: 'error', message: `method must be one of: ${allowed.join(', ')}` });
		}
		// Create a standard payment, then invoke sendMobile(payment, phone, method)
		const payment = paynow.createPayment(ref, email || '');
		payment.add('Payment', amt);

		const response = await paynow.sendMobile(payment, phone, normalizedMethod);
		if (response && response.success) {
			return res.json({
				status: 'ok',
				reference: ref,
				pollUrl: response.pollUrl,
				instructions: response.instructions || null
			});
		}
		return res.status(502).json({
			status: 'error',
			message: 'Failed to initiate Paynow mobile payment',
			details: response || null
		});
	} catch (e: any) {
		return res.status(500).json({ status: 'error', message: e?.message || 'Paynow error' });
	}
}

export async function pollTransaction(req: Request, res: Response) {
	try {
		const pollUrl = String((req.query.pollUrl || req.query.url || '') as string).trim();
		if (!pollUrl) {
			return res.status(400).json({ status: 'error', message: 'pollUrl query param is required' });
		}
		const paynow = getPaynowForRequest(req);
		const status = await paynow.pollTransaction(pollUrl);
		return res.json({ status: 'ok', details: status });
	} catch (e: any) {
		return res.status(500).json({ status: 'error', message: e?.message || 'Failed to poll Paynow transaction' });
	}
}

// Paynow server-to-server notification (Instant Payment Notification)
export async function handleResult(req: Request, res: Response) {
	try {
		// In a full implementation, verify signature and update your DB records by reference
		// For now, acknowledge receipt so Paynow considers the callback successful
		return res.status(200).json({ status: 'received' });
	} catch (e: any) {
		return res.status(500).json({ status: 'error', message: e?.message || 'Failed to process Paynow result' });
	}
}

// Customer browser return URL after payment attempt
export async function handleReturn(req: Request, res: Response) {
	try {
		// Redirect back to client route if configured, otherwise return a simple JSON
		const clientUrl = process.env.CLIENT_URL || process.env.PUBLIC_BASE_URL;
		if (clientUrl) {
			const target = `${clientUrl.replace(/\/+$/, '')}/billing/confirmation`;
			return res.redirect(target);
		}
		return res.json({ status: 'ok', message: 'Returned from Paynow' });
	} catch (e: any) {
		return res.status(500).json({ status: 'error', message: e?.message || 'Failed to process Paynow return' });
	}
}


