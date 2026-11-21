import { Request, Response } from 'express';
import { processVerifiedDodoEvent, verifyDodoWebhook } from '../services/subscriptionPayments/dodoWebhookService';

export async function handleDodoWebhook(req: Request, res: Response) {
  try {
    const rawBody = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
    if (!rawBody) return res.status(400).json({ message: 'Webhook body is required.', code: 'DODO_BODY_REQUIRED' });
    const event = verifyDodoWebhook(rawBody, req.headers);
    const eventId = String(req.headers['webhook-id'] || '');
    const result = await processVerifiedDodoEvent(event, eventId);
    return res.status(result.status).json(result.body);
  } catch (error) {
    const coded = error as { statusCode?: number; message?: string; code?: string };
    const status = coded.statusCode === 503 ? 503 : 401;
    return res.status(status).json({ message: coded.message || 'Invalid Dodo signature', code: coded.code || 'DODO_SIGNATURE_INVALID' });
  }
}
