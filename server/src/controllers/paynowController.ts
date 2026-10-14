import { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { PaymentSession } from '../models/PaymentSession';
import { BillingPayment } from '../models/BillingPayment';
import { User } from '../models/User';
import { WebhookEventReceipt } from '../models/WebhookEventReceipt';
import { PLAN_CONFIG, Plan } from '../types/plan';
import { chargeForPlan } from '../services/systemPlanService';
import {
	isAllowedPaynowPollUrl,
	paynowConfigurationState,
	verifyPaynowPayload
} from '../services/registrationPaymentPolicy';
import { applyPolledPayment } from '../services/applyPolledPayment';
import { recordAuditEvent } from '../services/auditService';

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
		throw httpError(
			'Checkout is temporarily unavailable.',
			503,
			'PAYNOW_NOT_CONFIGURED'
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

function httpError(message: string, statusCode: number, code?: string) {
	const error: any = new Error(message);
	error.statusCode = statusCode;
	error.code = code;
	return error;
}

export async function initiatePaynowCheckout(req: Request, input: {
	paymentSessionId?: string;
	plan?: Plan;
	cycle?: 'monthly' | 'yearly';
	email?: string;
	reference?: string;
	description?: string;
}) {
	if (!input.paymentSessionId) {
		throw httpError('A payment session is required', 400, 'PAYMENT_SESSION_REQUIRED');
	}
	const session = await PaymentSession.findById(input.paymentSessionId);
	if (!session) {
		throw httpError('Payment session not found', 404, 'PAYMENT_SESSION_NOT_FOUND');
	}
	const callerCompanyId = (req as any).user?.companyId;
	if (callerCompanyId && String(session.companyId) !== String(callerCompanyId)) {
		throw httpError('Payment session not found', 404, 'PAYMENT_SESSION_NOT_FOUND');
	}
	if (session.status === 'paid' || session.status === 'reconciled') {
		throw httpError('This payment has already been completed', 409, 'PAYMENT_ALREADY_COMPLETED');
	}

	const plan = session.plan as Plan;
	const cycle = session.billingCycle;
	if (!plan || !cycle || !PLAN_CONFIG[plan] || !['monthly', 'yearly'].includes(cycle)) {
		throw httpError('A valid plan and billing cycle are required', 400, 'VALIDATION_ERROR');
	}

	const priced = await chargeForPlan(plan, cycle);
	if (priced == null || priced <= 0) {
		throw httpError('This plan does not have a payable amount', 503, 'REGISTRATION_PRICE_NOT_CONFIGURED');
	}

	if (session.amount !== priced && (session.status === 'pending' || session.status === 'provider_created')) {
		session.amount = priced;
		await session.save();
		if (session.billingPaymentId) {
			await BillingPayment.findByIdAndUpdate(session.billingPaymentId, { $set: { amount: priced } });
		}
	}

	const storedRedirect = String((session.rawProviderResponse as any)?.redirectUrl || '');
	const awaitingProvider = Boolean(session.pollUrl) && (session.status === 'pending' || session.status === 'provider_created');
	if (awaitingProvider && session.pollUrl && isAllowedPaynowPollUrl(session.pollUrl)) {
		if (storedRedirect) {
			return {
				reference: String(session.providerRef || ''),
				redirectUrl: storedRedirect,
				pollUrl: String(session.pollUrl),
				amount: priced
			};
		}
		throw httpError('This payment is still being confirmed. Wait for Paynow before starting another payment.', 409, 'PAYMENT_AWAITING_CONFIRMATION');
	}

	let email = String(input.email || '').trim();
	if (!email && session.userId) {
		const user = await User.findById(session.userId).select('email').lean();
		email = String(user?.email || '');
	}

	const ref = session.providerRef && String(session.providerRef).trim()
		? String(session.providerRef).trim()
		: `SUBS-${session._id.toString()}`;

	const paynow = getPaynowForRequest(req);
	const payment = paynow.createPayment(ref, email || '');
	payment.add(input.description || `Mantis ${plan} ${cycle} subscription`, priced);
	let response: { success?: boolean; redirectUrl?: string; pollUrl?: string; error?: string };
	try {
		response = await paynow.send(payment);
	} catch (error: any) {
		await recordAuditEvent({
			userId: session.userId ? String(session.userId) : undefined,
			companyId: String(session.companyId),
			action: 'checkout.initiation_failed',
			entityType: 'PaymentSession',
			entityId: String(session._id),
			status: 'failure',
			metadata: { code: 'PAYNOW_CHECKOUT_FAILED' }
		});
		throw error;
	}
	if (!response || !response.success || !response.redirectUrl) {
		await recordAuditEvent({
			userId: session.userId ? String(session.userId) : undefined,
			companyId: String(session.companyId),
			action: 'checkout.initiation_failed',
			entityType: 'PaymentSession',
			entityId: String(session._id),
			status: 'failure',
			metadata: { code: 'PAYNOW_CHECKOUT_FAILED' }
		});
		const error = httpError(String(response?.error || 'Failed to create Paynow payment'), 502, 'PAYNOW_CHECKOUT_FAILED');
		throw error;
	}
	const pollUrl = String(response.pollUrl || '');
	if (pollUrl && !isAllowedPaynowPollUrl(pollUrl)) {
		throw httpError('Paynow returned an unexpected status URL', 502, 'PAYNOW_POLL_URL_REJECTED');
	}

	session.provider = 'paynow';
	session.providerRef = ref;
	session.pollUrl = pollUrl;
	session.status = 'provider_created';
	session.amount = priced;
	session.currency = 'USD';
	session.rawProviderResponse = {
		redirectUrl: String(response.redirectUrl),
		pollUrl
	};
	await session.save();
	if (session.billingPaymentId) {
		await BillingPayment.findByIdAndUpdate(session.billingPaymentId, { $set: { providerRef: ref, amount: priced, currency: 'USD' } });
	}

	return {
		reference: ref,
		redirectUrl: String(response.redirectUrl),
		pollUrl,
		amount: priced
	};
}

async function readPaynowStatus(req: Request, pollUrl: string) {
	if (!isAllowedPaynowPollUrl(pollUrl)) {
		throw httpError('Payment status URL is not allowed', 400, 'PAYNOW_POLL_URL_REJECTED');
	}
	const paynow = getPaynowForRequest(req);
	const response = await axios.post(pollUrl, null, {
		timeout: 15000,
		responseType: 'text',
		maxRedirects: 0
	});
	const raw = typeof response.data === 'string' ? response.data : String(response.data || '');
	const parsed = paynow.parseStatusUpdate(raw);
	const fields = paynow.parseQuery(raw);
	return { parsed, fields };
}

async function confirmSessionPayment(req: Request, reference: string) {
	const session = await PaymentSession.findOne({ provider: 'paynow', providerRef: reference });
	if (!session) return { found: false as const };
	if (session.status === 'paid' || session.status === 'reconciled') {
		return { found: true as const, paymentStatus: 'paid', session };
	}
	if (!session.pollUrl) {
		return { found: true as const, paymentStatus: session.status, session };
	}

	const polled = await readPaynowStatus(req, session.pollUrl);
	const applied = await applyPolledPayment(reference, {
		status: polled.parsed?.status,
		amount: polled.parsed?.amount,
		currency: polled.fields?.currency || polled.fields?.Currency,
		reference: polled.parsed?.reference,
		paynowReference: polled.parsed?.paynowReference
	});
	return { found: applied.found, paymentStatus: applied.paymentStatus || session.status, session };
}

export function getStatus(_req: Request, res: Response) {
	try {
		const env = readEnv();
		const state = paynowConfigurationState();
		return res.json({
			status: state.configured ? 'ok' : 'disabled',
			mode: state.mode,
			hasIntegrationId: Boolean(env.INTEGRATION_ID),
			hasIntegrationKey: Boolean(env.INTEGRATION_KEY),
			resultUrl: env.RESULT_URL || null,
			returnUrl: env.RETURN_URL || null
		});
	} catch (e: any) {
		return res.status(500).json({ status: 'error', message: 'Failed to read Paynow status' });
	}
}

export async function createWebPayment(req: Request, res: Response) {
	try {
		const body = (req.body || {}) as {
			email?: string;
			description?: string;
			paymentSessionId?: string;
		};
		if (!body.paymentSessionId) {
			return res.status(400).json({ status: 'error', message: 'paymentSessionId is required', code: 'PAYMENT_SESSION_REQUIRED' });
		}
		const result = await initiatePaynowCheckout(req, {
			paymentSessionId: body.paymentSessionId,
			email: body.email,
			description: body.description
		});
		return res.json({ status: 'ok', ...result });
	} catch (e: any) {
		return res.status(e?.statusCode || 500).json({
			status: 'error',
			message: e?.message || 'Paynow error',
			code: e?.code || 'PAYNOW_ERROR'
		});
	}
}

export async function createMobilePayment(req: Request, res: Response) {
	try {
		const { phone, method, email, paymentSessionId } = (req.body || {}) as {
			phone?: string;
			method?: 'ecocash' | 'onemoney' | string;
			email?: string;
			paymentSessionId?: string;
		};
		if (!paymentSessionId) {
			return res.status(400).json({ status: 'error', message: 'paymentSessionId is required', code: 'PAYMENT_SESSION_REQUIRED' });
		}
		if (!phone || !method) {
			return res.status(400).json({ status: 'error', message: 'phone and method are required' });
		}
		const session = await PaymentSession.findById(paymentSessionId);
		const callerCompanyId = (req as any).user?.companyId;
		if (!session || (callerCompanyId && String(session.companyId) !== String(callerCompanyId))) {
			return res.status(404).json({ status: 'error', message: 'Payment session not found' });
		}
		if (session.status === 'paid' || session.status === 'reconciled') {
			return res.status(409).json({ status: 'error', message: 'This payment has already been completed' });
		}
		const amt = Number(session.amount);
		if (!Number.isFinite(amt) || amt <= 0) {
			return res.status(503).json({ status: 'error', message: 'This plan does not have a payable amount', code: 'REGISTRATION_PRICE_NOT_CONFIGURED' });
		}
		const ref = session.providerRef && String(session.providerRef).trim()
			? String(session.providerRef).trim()
			: `SUBS-${session._id.toString()}`;

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
			const pollUrl = String(response.pollUrl || '');
			if (pollUrl && !isAllowedPaynowPollUrl(pollUrl)) {
				return res.status(502).json({ status: 'error', message: 'Paynow returned an unexpected status URL', code: 'PAYNOW_POLL_URL_REJECTED' });
			}
			session.providerRef = ref;
			session.pollUrl = pollUrl;
			session.status = 'provider_created';
			session.rawProviderResponse = { pollUrl };
			await session.save();
			return res.json({
				status: 'ok',
				reference: ref,
				pollUrl,
				instructions: response.instructions || null
			});
		}
		return res.status(502).json({
			status: 'error',
			message: 'Failed to initiate Paynow mobile payment'
		});
	} catch (e: any) {
		return res.status(e?.statusCode || 500).json({ status: 'error', message: e?.message || 'Paynow error', code: e?.code });
	}
}

export async function pollTransaction(req: Request, res: Response) {
	try {
		const paymentSessionId = String((req.query.paymentSessionId || '') as string).trim();
		if (!paymentSessionId) {
			return res.status(400).json({ status: 'error', message: 'paymentSessionId is required', code: 'PAYMENT_SESSION_REQUIRED' });
		}
		const session = await PaymentSession.findById(paymentSessionId);
		const callerCompanyId = (req as any).user?.companyId;
		if (!session || (callerCompanyId && String(session.companyId) !== String(callerCompanyId)) || !session.pollUrl) {
			return res.status(404).json({ status: 'error', message: 'Payment session not found' });
		}
		const polled = await readPaynowStatus(req, session.pollUrl);
		return res.json({
			status: 'ok',
			details: {
				status: polled.parsed?.status,
				amount: polled.parsed?.amount,
				reference: polled.parsed?.reference
			}
		});
	} catch (e: any) {
		return res.status(500).json({ status: 'error', message: e?.message || 'Failed to poll Paynow transaction' });
	}
}

// Paynow server-to-server notification (Instant Payment Notification)
export async function handleResult(req: Request, res: Response) {
	try {
		const env = readEnv();
		if (!env.INTEGRATION_KEY) {
			return res.status(503).json({ status: 'error', message: 'Paynow is not configured', code: 'PAYNOW_NOT_CONFIGURED' });
		}
		const payload = { ...(req.query || {}), ...(req.body || {}) } as Record<string, unknown>;
		if (!verifyPaynowPayload(payload, env.INTEGRATION_KEY)) {
			return res.status(401).json({ status: 'error', message: 'Invalid Paynow signature' });
		}
		const reference = String(payload.reference || payload.Reference || '').trim();
		const eventId = String(payload.hash || payload.pollurl || payload.pollUrl || reference);

		if (!reference) {
			return res.status(200).json({ status: 'received', message: 'No reference supplied' });
		}

		const receipt = await WebhookEventReceipt.findOneAndUpdate(
			{ provider: 'paynow', eventId },
			{ $setOnInsert: { provider: 'paynow', eventId, status: 'processing' } },
			{ upsert: true, new: true }
		);
		if (receipt.status === 'processed') {
			return res.status(200).json({ status: 'duplicate' });
		}

		const confirmed = await confirmSessionPayment(req, reference);
		if (confirmed.found && confirmed.paymentStatus === 'paid' && confirmed.session) {
			receipt.companyId = confirmed.session.companyId as any;
			receipt.paymentId = confirmed.session.billingPaymentId as any;
		}
		receipt.status = 'processed';
		receipt.processedAt = new Date();
		await receipt.save();

		return res.status(200).json({ status: 'received' });
	} catch (e: any) {
		try {
			const payload = { ...(req.query || {}), ...(req.body || {}) } as any;
			const eventId = String(payload.pollurl || payload.pollUrl || payload.hash || payload.reference || Date.now());
			await WebhookEventReceipt.updateOne(
				{ provider: 'paynow', eventId },
				{ $set: { status: 'failed', lastError: e?.message || String(e) } },
				{ upsert: true }
			);
		} catch {}
		if (e?.statusCode === 409) {
			return res.status(200).json({ status: 'ignored', message: e.message });
		}
		return res.status(500).json({ status: 'error', message: e?.message || 'Failed to process Paynow result' });
	}
}

// Customer browser return URL after payment attempt
export async function confirmByReference(req: Request, res: Response) {
	try {
		const reference = String((req.body || {}).reference || (req.query || {}).reference || '').trim();
		if (!reference) {
			return res.status(400).json({ status: 'error', message: 'reference is required' });
		}
		const owned = await PaymentSession.findOne({ provider: 'paynow', providerRef: reference }).select('companyId');
		const callerCompanyId = (req as any).user?.companyId;
		if (!owned || (callerCompanyId && String(owned.companyId) !== String(callerCompanyId))) {
			return res.status(404).json({ status: 'error', message: 'Payment not found' });
		}
		const confirmed = await confirmSessionPayment(req, reference);
		if (!confirmed.found) {
			return res.status(404).json({ status: 'error', message: 'Payment not found' });
		}
		return res.json({ status: 'ok', paymentStatus: confirmed.paymentStatus, reference });
	} catch (e: any) {
		return res.status(e?.statusCode || 500).json({ status: 'error', message: e?.message || 'Failed to confirm Paynow payment' });
	}
}

export async function handleReturn(req: Request, res: Response) {
	try {
		const clientUrl = process.env.CLIENT_URL || process.env.PUBLIC_BASE_URL || 'https://www.mantisafrica.com';
		const reference = String((req.query as any)?.reference || (req.body as any)?.reference || '').trim();
		const target = new URL('/billing/return', clientUrl.endsWith('/') ? clientUrl : `${clientUrl}/`);
		if (reference) target.searchParams.set('reference', reference);
		return res.redirect(target.toString());
	} catch (e: any) {
		return res.status(500).json({ status: 'error', message: e?.message || 'Failed to process Paynow return' });
	}
}


