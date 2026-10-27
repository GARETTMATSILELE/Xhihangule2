import { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { PaymentSession } from '../models/PaymentSession';
import { BillingPayment } from '../models/BillingPayment';
import { User } from '../models/User';
import { PLAN_CONFIG, Plan } from '../types/plan';
import { chargeForPlan } from '../services/systemPlanService';
import {
	evaluatePaynowDeployment,
	isAllowedPaynowPollUrl,
	paynowCheckoutDecision,
	paynowConfigurationState,
	paynowCustomerAuthEmail,
	paynowModeMatchesSession,
	ProviderPoll,
	verifyPaynowPayload
} from '../services/registrationPaymentPolicy';
import { applyPolledPayment, resolvePaynowProviderRef } from '../services/applyPolledPayment';
import { signalOperationalFailure } from '../services/operationalSignal';
import { recordAuditEvent } from '../services/auditService';
import { logger } from '../utils/logger';
import { classifyOperationalFailure } from '../services/operationalFailure';
import { processVerifiedPaynowEvent } from '../services/paynowCallbackService';

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
	// Local development can keep keys in server/config/local.paynow.json.
	// Automated tests set PAYNOW_DISABLE_LOCAL_CONFIG so they cannot pick up merchant keys.
	if ((!env.INTEGRATION_ID || !env.INTEGRATION_KEY) && process.env.NODE_ENV !== 'production' && process.env.PAYNOW_DISABLE_LOCAL_CONFIG !== '1') {
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

function deploymentForRequest(req: Request) {
	const env = readEnv();
	return evaluatePaynowDeployment({
		...process.env,
		PAYNOW_INTEGRATION_ID: env.INTEGRATION_ID,
		PAYNOW_INTEGRATION_KEY: env.INTEGRATION_KEY,
		PAYNOW_RESULT_URL: env.RESULT_URL,
		PAYNOW_RETURN_URL: env.RETURN_URL,
		PUBLIC_BASE_URL: env.PUBLIC_BASE_URL || process.env.PUBLIC_BASE_URL
	}, {
		nodeEnv: process.env.NODE_ENV,
		requestHost: req.get('host') || ''
	});
}

function assertPaynowReady(req: Request) {
	const decision = deploymentForRequest(req);
	if (decision.ok) return decision;
	if (decision.issues.includes('credentials_missing')) {
		throw httpError('Checkout is temporarily unavailable.', 503, 'PAYNOW_NOT_CONFIGURED');
	}
	if (decision.issues.includes('mode_invalid') || decision.issues.includes('mode_required')) {
		throw httpError('Paynow mode is not supported. Use test, sandbox, or live.', 503, 'PAYNOW_MODE_INVALID');
	}
	if (decision.issues.includes('test_merchant_email_required')) {
		throw httpError(
			'Paynow test mode requires the merchant email that owns the integration.',
			503,
			'PAYNOW_TEST_MERCHANT_EMAIL_REQUIRED'
		);
	}
	const error = httpError('Paynow callback URL does not belong to this server.', 503, 'PAYNOW_CALLBACK_URL_REJECTED');
	error.issue = decision.issues.find((issue) => issue !== 'credentials_missing') || decision.issues[0];
	throw error;
}

function getPaynowForRequest(req: Request) {
	const env = readEnv();
	const decision = assertPaynowReady(req);
	const paynow = new Paynow(env.INTEGRATION_ID, env.INTEGRATION_KEY);
	paynow.resultUrl = decision.resultUrl;
	paynow.returnUrl = decision.returnUrl;
	return paynow;
}

function paynowLog(level: 'info' | 'warn', event: string, fields: Record<string, unknown>) {
	logger[level](event, fields);
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
	const checkoutDecision = paynowCheckoutDecision(session);
	if (checkoutDecision === 'closed') {
		throw httpError('This checkout can no longer be started', 409, 'PAYMENT_SESSION_CLOSED');
	}
	if (checkoutDecision === 'awaiting' && session.pollUrl) {
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
	email = paynowCustomerAuthEmail(email);

	const ref = session.providerRef && String(session.providerRef).trim()
		? String(session.providerRef).trim()
		: `SUBS-${session._id.toString()}`;

	const requestHost = String(req.get('host') || '');
	paynowLog('info', 'paynow_checkout_started', {
		correlationId: ref,
		reference: ref,
		paymentSessionId: String(session._id),
		amount: priced,
		currency: 'USD',
		mode: paynowConfigurationState().mode,
		testTransaction: paynowConfigurationState().mode === 'test'
	});
	let deployment: ReturnType<typeof deploymentForRequest>;
	try {
		deployment = assertPaynowReady(req);
	} catch (error: any) {
		if (error?.code === 'PAYNOW_CALLBACK_URL_REJECTED') {
			paynowLog('warn', 'paynow_callback_target_differs', {
				correlationId: ref,
				reference: ref,
				requestHost,
				issue: error.issue
			});
		}
		throw error;
	}

	const paynow = getPaynowForRequest(req);
	const payment = paynow.createPayment(ref, email || '');
	payment.add(input.description || `Mantis ${plan} ${cycle} subscription`, priced);
	let response: { success?: boolean; redirectUrl?: string; pollUrl?: string; error?: string };
	try {
		response = await paynow.send(payment);
	} catch (error: any) {
		paynowLog('warn', 'paynow_checkout_rejected', {
			correlationId: ref,
			reference: ref,
			paymentSessionId: String(session._id),
			code: 'PAYNOW_CHECKOUT_FAILED'
		});
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
		paynowLog('warn', 'paynow_checkout_rejected', {
			correlationId: ref,
			reference: ref,
			paymentSessionId: String(session._id),
			code: 'PAYNOW_CHECKOUT_FAILED'
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
	session.metadata = {
		...(session.metadata || {}),
		paynowMode: deployment.mode,
		testTransaction: deployment.mode === 'test'
	};
	session.rawProviderResponse = {
		redirectUrl: String(response.redirectUrl),
		pollUrl
	};
	await session.save();
	if (session.billingPaymentId) {
		await BillingPayment.findByIdAndUpdate(session.billingPaymentId, { $set: { providerRef: ref, amount: priced, currency: 'USD' } });
	}
	await rememberPaynowReference(req, session);
	const audited = await recordAuditEvent({
		userId: session.userId ? String(session.userId) : undefined,
		companyId: String(session.companyId),
		action: 'checkout.initiated',
		entityType: 'PaymentSession',
		entityId: String(session._id),
		metadata: { providerRef: ref, amount: priced, currency: 'USD' }
	});
	if (!audited) {
		paynowLog('warn', 'paynow_checkout_audit_missing', { correlationId: ref, reference: ref });
	}
	paynowLog('info', 'paynow_checkout_accepted', {
		correlationId: ref,
		reference: ref,
		paymentSessionId: String(session._id),
		amount: priced,
		currency: 'USD',
		paynowReference: String((session.rawProviderResponse as { paynowReference?: string } | undefined)?.paynowReference || '') || undefined
	});

	return {
		reference: ref,
		redirectUrl: String(response.redirectUrl),
		pollUrl,
		amount: priced
	};
}

async function rememberPaynowReference(req: Request, session: { providerRef?: string; rawProviderResponse?: unknown; save: () => Promise<unknown>; markModified: (path: string) => void }) {
	const pollUrl = String((session as { pollUrl?: string }).pollUrl || '');
	if (!pollUrl) return;
	const reference = String(session.providerRef || '');
	try {
		const polled = await readPaynowStatus(req, pollUrl);
		const paynowReference = String(polled.parsed?.paynowReference || polled.fields?.paynowreference || '').trim();
		paynowLog('info', 'paynow_poll_completed', {
			correlationId: reference,
			reference,
			paymentStatus: String(polled.parsed?.status || ''),
			paynowReference: paynowReference || undefined
		});
		if (!paynowReference) return;
		const current = (session.rawProviderResponse && typeof session.rawProviderResponse === 'object')
			? session.rawProviderResponse as Record<string, unknown>
			: {};
		if (current.paynowReference === paynowReference) return;
		session.rawProviderResponse = { ...current, paynowReference };
		session.markModified('rawProviderResponse');
		await session.save();
	} catch (error: any) {
		paynowLog('warn', 'paynow_poll_failed', {
			correlationId: reference,
			reference,
			error: String(error?.message || error).slice(0, 160)
		});
	}
}

async function readPaynowStatus(req: Request, pollUrl: string) {
	if (!isAllowedPaynowPollUrl(pollUrl)) {
		throw httpError('Payment status URL is not allowed', 400, 'PAYNOW_POLL_URL_REJECTED');
	}
	const paynow = getPaynowForRequest(req);
	let pollHost = '';
	try { pollHost = new URL(pollUrl).host; } catch { pollHost = ''; }
	paynowLog('info', 'paynow_poll_started', { pollHost });
	try {
		const response = await axios.post(pollUrl, null, {
			timeout: 15000,
			responseType: 'text',
			maxRedirects: 0
		});
		const raw = typeof response.data === 'string' ? response.data : String(response.data || '');
		const parsed = paynow.parseStatusUpdate(raw);
		const fields = paynow.parseQuery(raw);
		return { parsed, fields };
	} catch (error: any) {
		paynowLog('warn', 'paynow_poll_failed', {
			pollHost,
			error: String(error?.message || error).slice(0, 160)
		});
		throw error;
	}
}

async function confirmSessionPayment(req: Request, reference: string, verifiedPoll?: ProviderPoll) {
	const resolved = await resolvePaynowProviderRef(reference);
	if (resolved.kind === 'missing') {
		paynowLog('warn', 'paynow_payment_unmatched', { correlationId: reference, reference });
		return { found: false as const, activated: false, ignored: false };
	}
	if (resolved.kind === 'ambiguous') {
		return { found: true as const, activated: false, ignored: true, reviewRequired: true, paymentStatus: 'review_required' as const };
	}
	const session = resolved.session;
	if (session.status === 'paid' || session.status === 'reconciled' || session.status === 'cancelled' || session.status === 'failed' || session.status === 'expired') {
		const applied = await applyPolledPayment(reference, verifiedPoll || {
			status: session.status,
			amount: session.amount,
			currency: session.currency,
			reference
		});
		return {
			found: applied.found,
			paymentStatus: applied.paymentStatus || session.status,
			activated: applied.activated === true,
			ignored: applied.ignored === true,
			session: applied.session || session
		};
	}
	if (!paynowModeMatchesSession((session.metadata as { paynowMode?: string } | undefined)?.paynowMode)) {
		throw httpError('Paynow application mode does not match the checkout that created this payment.', 409, 'PAYNOW_MODE_MISMATCH');
	}
	if (!session.pollUrl) {
		return { found: true as const, paymentStatus: session.status, activated: false, ignored: false, session };
	}

	const polled = await readPaynowStatus(req, session.pollUrl);
	const paynowReference = String(polled.parsed?.paynowReference || polled.fields?.paynowreference || '').trim();
	paynowLog('info', 'paynow_poll_completed', {
		correlationId: reference,
		reference,
		paymentStatus: String(polled.parsed?.status || ''),
		paynowReference: paynowReference || undefined
	});
	if (paynowReference) {
		const current = (session.rawProviderResponse && typeof session.rawProviderResponse === 'object')
			? session.rawProviderResponse as Record<string, unknown>
			: {};
		if (current.paynowReference !== paynowReference) {
			session.rawProviderResponse = { ...current, paynowReference };
			session.markModified('rawProviderResponse');
			await session.save();
		}
	}
	const applied = await applyPolledPayment(reference, {
		status: polled.parsed?.status,
		amount: polled.parsed?.amount,
		currency: polled.fields?.currency || polled.fields?.Currency,
		reference: polled.parsed?.reference,
		paynowReference: polled.parsed?.paynowReference
	});
	if (applied.activated === true) {
		paynowLog('info', 'paynow_subscription_activated', { correlationId: reference, reference });
	}
	return {
		found: applied.found,
		paymentStatus: applied.paymentStatus || session.status,
		activated: applied.activated === true,
		ignored: applied.ignored === true,
		session: applied.session || session
	};
}

export function getStatus(_req: Request, res: Response) {
	try {
		const env = readEnv();
		const state = paynowConfigurationState();
		const deployment = deploymentForRequest(_req);
		return res.json({
			status: state.configured ? 'ok' : 'disabled',
			mode: state.mode,
			hasIntegrationId: Boolean(env.INTEGRATION_ID),
			hasIntegrationKey: Boolean(env.INTEGRATION_KEY),
			resultHost: deployment.resultHost || null,
			resultPath: deployment.resultPath || null,
			returnHost: deployment.returnHost || null,
			returnPath: deployment.returnPath || null,
			callbackReady: deployment.ok,
			issues: deployment.issues,
			providerDashboardModeChecked: false
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
			code: e?.code || 'PAYNOW_ERROR',
			...(e?.issue ? { issue: e.issue } : {})
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
		const checkoutDecision = paynowCheckoutDecision(session);
		if (checkoutDecision === 'completed') {
			return res.status(409).json({ status: 'error', message: 'This payment has already been completed' });
		}
		if (checkoutDecision === 'closed') {
			return res.status(409).json({ status: 'error', message: 'This checkout can no longer be started', code: 'PAYMENT_SESSION_CLOSED' });
		}
		if (checkoutDecision === 'awaiting') {
			return res.json({
				status: 'ok',
				reference: String(session.providerRef || ''),
				pollUrl: String(session.pollUrl || ''),
				instructions: (session.rawProviderResponse as { instructions?: string } | undefined)?.instructions || null,
				reused: true
			});
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
		const payment = paynow.createPayment(ref, paynowCustomerAuthEmail(email || ''));
		payment.add('Payment', amt);

		const response = await paynow.sendMobile(payment, phone, normalizedMethod);
		if (response && response.success) {
			const pollUrl = String(response.pollUrl || '');
			if (pollUrl && !isAllowedPaynowPollUrl(pollUrl)) {
				return res.status(502).json({ status: 'error', message: 'Paynow returned an unexpected status URL', code: 'PAYNOW_POLL_URL_REJECTED' });
			}
			session.provider = 'paynow';
			session.providerRef = ref;
			session.pollUrl = pollUrl;
			session.status = 'provider_created';
			session.metadata = {
				...(session.metadata || {}),
				paynowMode: paynowConfigurationState().mode,
				testTransaction: paynowConfigurationState().mode === 'test'
			};
			session.rawProviderResponse = { pollUrl, instructions: response.instructions || null };
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
		const reference = String(payload.reference || payload.Reference || '').trim();
		paynowLog('info', 'paynow_result_received', {
			correlationId: reference || 'paynow',
			reference: reference || undefined,
			hasHash: Boolean(payload.hash || payload.Hash)
		});
		if (!verifyPaynowPayload(payload, env.INTEGRATION_KEY)) {
			const unverifiedReference = reference || String(payload.reference || payload.Reference || '').trim();
			signalOperationalFailure('paynow_callback_unverified', {
				correlationId: unverifiedReference || 'paynow',
				reference: unverifiedReference || undefined
			});
			return res.status(401).json({ status: 'error', message: 'Invalid Paynow signature' });
		}
		const eventId = String(payload.hash || payload.pollurl || payload.pollUrl || reference);
		const payloadFingerprint = [
			reference,
			String(payload.status || payload.Status || ''),
			String(payload.amount || payload.Amount || '')
		].join('|');

		if (!reference) {
			return res.status(200).json({ status: 'received', message: 'No reference supplied' });
		}

		const outcome = await processVerifiedPaynowEvent({
			reference,
			eventId,
			payloadFingerprint,
			apply: async () => {
				const confirmed = await confirmSessionPayment(req, reference, {
					status: String(payload.status || payload.Status || ''),
					amount: String(payload.amount || payload.Amount || ''),
					currency: String(payload.currency || payload.Currency || ''),
					reference
				});
				return {
					found: confirmed.found,
					paymentStatus: confirmed.paymentStatus,
					activated: confirmed.activated,
					ignored: confirmed.ignored,
					session: confirmed.session
				};
			}
		});
		if (outcome.status === 'duplicate' || outcome.status === 'in_progress' || outcome.status === 'payload_conflict') {
			paynowLog('info', outcome.status === 'duplicate' ? 'paynow_result_duplicate' : 'paynow_result_skipped', {
				correlationId: reference,
				reference,
				result: outcome.status
			});
			return res.status(200).json({ status: outcome.status, activated: false });
		}
		paynowLog('info', 'paynow_result_processed', {
			correlationId: reference,
			reference,
			result: outcome.status,
			activated: outcome.activated === true
		});
		return res.status(200).json({ status: outcome.status, activated: outcome.activated });
	} catch (e: any) {
		if (e?.statusCode === 409) {
			const rejectedReference = String((req.body as any)?.reference || (req.query as any)?.reference || '').trim();
			paynowLog('warn', 'paynow_result_rejected', {
				correlationId: rejectedReference || 'paynow',
				reference: rejectedReference || undefined,
				code: e?.code || 'PAYMENT_MISMATCH'
			});
			return res.status(200).json({ status: 'ignored', message: e.message });
		}
		const failedReference = String((req.body as any)?.reference || (req.query as any)?.reference || '').trim();
		logger.warn('paynow_callback_failed', {
			correlationId: failedReference || 'paynow',
			reference: failedReference || undefined,
			failureClass: classifyOperationalFailure(e)
		});
		return res.status(500).json({ status: 'error', message: 'Failed to process Paynow result' });
	}
}

// Customer browser return URL after payment attempt
export async function confirmByReference(req: Request, res: Response) {
	try {
		const reference = String((req.body || {}).reference || (req.query || {}).reference || '').trim();
		if (!reference) {
			return res.status(400).json({ status: 'error', message: 'reference is required' });
		}
		const resolved = await resolvePaynowProviderRef(reference);
		const callerCompanyId = (req as any).user?.companyId;
		if (resolved.kind === 'missing') {
			return res.status(404).json({ status: 'error', message: 'Payment not found' });
		}
		if (resolved.kind === 'ambiguous') {
			const visible = !callerCompanyId || resolved.sessions.some((session) => String(session.companyId) === String(callerCompanyId));
			if (!visible) return res.status(404).json({ status: 'error', message: 'Payment not found' });
			return res.status(409).json({
				status: 'review_required',
				message: 'This provider reference matches more than one payment session and was not activated.'
			});
		}
		if (callerCompanyId && String(resolved.session.companyId) !== String(callerCompanyId)) {
			return res.status(404).json({ status: 'error', message: 'Payment not found' });
		}
		const confirmed = await confirmSessionPayment(req, reference);
		if ((confirmed as any).reviewRequired) {
			return res.status(409).json({
				status: 'review_required',
				message: 'This provider reference matches more than one payment session and was not activated.'
			});
		}
		if (!confirmed.found) {
			return res.status(404).json({ status: 'error', message: 'Payment not found' });
		}
		return res.json({
			status: 'ok',
			paymentStatus: confirmed.paymentStatus,
			activated: confirmed.activated === true,
			reference
		});
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


