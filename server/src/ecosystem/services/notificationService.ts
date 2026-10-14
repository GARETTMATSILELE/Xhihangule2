import crypto from 'crypto';
import { Notification } from '../../models/Notification';
import { User } from '../../models/User';
import { CommunicationPreference, NotificationDelivery } from '../models/commsAndPayments';
import { TEMPLATE_KEYS, TemplateKey, NotificationChannel } from '../constants';
import { isChannelGloballyEnabled } from '../flags';
import { logger } from '../../utils/logger';

export interface EmailProvider {
  send(input: { to: string; subject: string; html: string; text?: string }): Promise<{ id?: string }>;
}

export interface SmsProvider {
  send(input: { to: string; body: string }): Promise<{ id?: string }>;
}

export interface WhatsAppProvider {
  send(input: { to: string; templateName: string; variables: Record<string, string> }): Promise<{ id?: string }>;
}

const TEMPLATES: Record<TemplateKey, { title: string; body: string; sms?: string }> = {
  VIEWING_REQUESTED: { title: 'Viewing requested', body: '{{tenantName}} requested a viewing for {{propertyName}}.' },
  VIEWING_CONFIRMED: { title: 'Viewing confirmed', body: 'Your viewing for {{propertyName}} is confirmed.' },
  VIEWING_DECLINED: { title: 'Viewing declined', body: 'The viewing request for {{propertyName}} was declined.' },
  VIEWING_RESCHEDULED: { title: 'Viewing rescheduled', body: 'A new time was proposed for your viewing of {{propertyName}}.' },
  APPLICATION_SUBMITTED: { title: 'Application submitted', body: '{{tenantName}} applied for {{propertyName}}.' },
  APPLICATION_APPROVED: { title: 'Application approved', body: 'Your application for {{propertyName}} was approved.' },
  APPLICATION_DECLINED: { title: 'Application declined', body: 'Your application for {{propertyName}} was declined.' },
  RENT_PAYMENT_RECEIVED: { title: 'Rent payment received', body: 'Payment of {{amount}} was received for {{propertyName}}.' },
  RENT_PAYMENT_REMINDER: { title: 'Rent reminder', body: 'Rent of {{amount}} is due for {{propertyName}}.' },
  MAINTENANCE_REQUEST_RECEIVED: { title: 'Maintenance reported', body: '{{tenantName}} reported: {{maintenanceDescription}} at {{propertyName}}.' },
  QUOTE_REQUESTED: {
    title: 'New job request',
    body: 'A new job request is available.\nReference: {{propertyReference}}\nLocation: {{propertyLocation}}\nIssue: {{maintenanceDescription}}\nSubmitted: {{submittedAt}}\nSign in to your Mantis contractor portal to review the request and photographs, then accept or decline it.\n{{portalLink}}',
    sms: 'New Mantis job request ({{propertyReference}}). Sign in to review and accept or decline: {{portalLink}}',
  },
  QUOTE_RECEIVED: { title: 'Quote received', body: '{{contractorName}} submitted a quote of {{quoteAmount}} for {{propertyName}}.' },
  QUOTE_SENT_TO_OWNER: { title: 'Quote awaiting your approval', body: 'A maintenance quote of {{quoteAmount}} for {{propertyName}} needs your review.' },
  OWNER_QUOTE_APPROVED: { title: 'Owner approved quote', body: '{{ownerName}} approved the quote for {{propertyName}}.' },
  OWNER_QUOTE_DECLINED: { title: 'Owner declined quote', body: '{{ownerName}} declined the quote for {{propertyName}}.' },
  CONTRACTOR_AUTHORISED: { title: 'You are authorised to proceed', body: 'You are authorised to proceed with the job at {{propertyName}}.' },
  WORK_COMPLETED: { title: 'Work marked completed', body: 'Maintenance at {{propertyName}} was marked completed.' },
  MAINTENANCE_REOPENED: { title: 'Maintenance reopened', body: 'A tenant reported a problem with completed work at {{propertyName}}.' },
  BROADCAST_MESSAGE: { title: '{{title}}', body: '{{message}}' },
};

function render(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_m, key) => vars[key] || '');
}

export function isDeliverableEmail(value?: string | null): boolean {
  if (!value) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function safeHttpUrl(value?: string): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    if (url.protocol === 'https:' || url.protocol === 'http:') return url.toString();
  } catch {
    return undefined;
  }
  return undefined;
}

class SmtpEmailProvider implements EmailProvider {
  async send(input: { to: string; subject: string; html: string; text?: string }) {
    const { sendMail } = await import('../../services/emailService');
    await sendMail({ to: input.to, subject: input.subject, html: input.html, text: input.text });
    return { id: `smtp-${Date.now()}` };
  }
}

class UnconfiguredSmsProvider implements SmsProvider {
  async send(_input: { to: string; body: string }): Promise<{ id?: string }> {
    throw new Error('SMS provider is not configured');
  }
}

class UnconfiguredWhatsAppProvider implements WhatsAppProvider {
  async send(_input: { to: string; templateName: string; variables: Record<string, string> }): Promise<{ id?: string }> {
    throw new Error('WhatsApp provider is not configured');
  }
}

function getEmailProvider(): EmailProvider | null {
  if (!isChannelGloballyEnabled('EMAIL')) return null;
  return new SmtpEmailProvider();
}

function getSmsProvider(): SmsProvider | null {
  if (!isChannelGloballyEnabled('SMS')) return null;
  return new UnconfiguredSmsProvider();
}

function getWhatsAppProvider(): WhatsAppProvider | null {
  if (!isChannelGloballyEnabled('WHATSAPP')) return null;
  return new UnconfiguredWhatsAppProvider();
}

const IMPORTANT_EVENTS = new Set<TemplateKey>([
  'QUOTE_SENT_TO_OWNER',
  'OWNER_QUOTE_APPROVED',
  'OWNER_QUOTE_DECLINED',
  'CONTRACTOR_AUTHORISED',
  'WORK_COMPLETED',
  'MAINTENANCE_REOPENED',
  'APPLICATION_APPROVED',
  'APPLICATION_DECLINED',
  'VIEWING_CONFIRMED',
  'VIEWING_DECLINED',
  'VIEWING_RESCHEDULED',
]);

const RECEIPT_EVENTS = new Set<TemplateKey>(['RENT_PAYMENT_RECEIVED']);

export async function notifyEvent(input: {
  recipientId: string;
  companyId?: string;
  eventType: TemplateKey;
  variables?: Record<string, string>;
  link?: string;
  email?: string;
  operational?: boolean;
  idempotencyKey?: string;
}): Promise<void> {
  const eventType = input.eventType;
  if (!(TEMPLATE_KEYS as readonly string[]).includes(eventType)) return;

  const vars = input.variables || {};
  const tpl = TEMPLATES[eventType];
  const title = render(tpl.title, vars);
  const message = render(tpl.body, vars);
  const operational = input.operational !== false;

  const user = await User.findById(input.recipientId).select('email firstName lastName').lean();
  const prefs = await CommunicationPreference.findOne({ userId: input.recipientId }).lean();

  const channels: NotificationChannel[] = ['IN_APP'];
  if (IMPORTANT_EVENTS.has(eventType) || RECEIPT_EVENTS.has(eventType) || operational) {
    channels.push('EMAIL');
  }
  if (IMPORTANT_EVENTS.has(eventType)) {
    channels.push('SMS', 'WHATSAPP');
  }
  if (eventType === 'QUOTE_REQUESTED' && isChannelGloballyEnabled('SMS')) {
    channels.push('SMS');
  }
  if (RECEIPT_EVENTS.has(eventType)) {
    // receipts: email + in-app; SMS/WhatsApp only if configured and preferred
    if (prefs?.smsAvailable && prefs?.smsOperational) channels.push('SMS');
    if (prefs?.whatsappAvailable && prefs?.whatsappOperational) channels.push('WHATSAPP');
  }

  const uniqueChannels = Array.from(new Set(channels));
  let inAppId: string | undefined;

  for (const channel of uniqueChannels) {
    const key = input.idempotencyKey
      ? `${input.idempotencyKey}:${channel}`
      : `${eventType}:${input.recipientId}:${channel}:${crypto.createHash('sha1').update(message).digest('hex').slice(0, 12)}`;

    const existing = await NotificationDelivery.findOne({ idempotencyKey: key }).lean();
    if (existing && (existing.status === 'SENT' || existing.status === 'SKIPPED' || existing.status === 'DELIVERED')) {
      continue;
    }
    if (existing?.status === 'FAILED') {
      await NotificationDelivery.deleteOne({ _id: existing._id });
    }

    const available =
      channel === 'IN_APP'
        ? prefs?.inAppAvailable !== false
        : channel === 'EMAIL'
          ? (prefs?.emailAvailable !== false && (operational ? prefs?.emailOperational !== false : prefs?.emailMarketing))
          : channel === 'SMS'
            ? Boolean(prefs?.smsAvailable) && (operational ? prefs?.smsOperational !== false : prefs?.smsMarketing)
            : Boolean(prefs?.whatsappAvailable) && (operational ? prefs?.whatsappOperational !== false : prefs?.whatsappMarketing);

    const globallyOn =
      channel === 'IN_APP' ? true : isChannelGloballyEnabled(channel as 'EMAIL' | 'SMS' | 'WHATSAPP');

    if (!available || !globallyOn) {
      await NotificationDelivery.create({
        recipientId: input.recipientId,
        eventType,
        channel,
        status: 'SKIPPED',
        idempotencyKey: key,
        failureReason: !globallyOn ? 'channel_unconfigured' : 'preference_or_unavailable',
      });
      continue;
    }

    try {
      if (channel === 'IN_APP') {
        const doc = await Notification.create({
          companyId: String(input.companyId || 'ecosystem'),
          userId: input.recipientId,
          title,
          message,
          link: input.link,
          payload: { skipEmail: true, eventType, ...vars },
        });
        inAppId = String(doc._id);
        await NotificationDelivery.create({
          notificationId: doc._id,
          recipientId: input.recipientId,
          eventType,
          channel,
          status: 'SENT',
          provider: 'in_app',
          idempotencyKey: key,
          sentAt: new Date(),
          templateName: eventType,
        });
        continue;
      }

      if (channel === 'EMAIL') {
        const provider = getEmailProvider();
        const emailTarget = input.email !== undefined ? input.email.trim() : (user?.email || '');
        if (!isDeliverableEmail(emailTarget)) {
          await NotificationDelivery.create({
            notificationId: inAppId,
            recipientId: input.recipientId,
            eventType,
            channel,
            status: 'FAILED',
            idempotencyKey: key,
            failedAt: new Date(),
            failureReason: 'invalid_contractor_email',
          });
          continue;
        }
        if (!provider) {
          await NotificationDelivery.create({
            notificationId: inAppId,
            recipientId: input.recipientId,
            eventType,
            channel,
            status: 'SKIPPED',
            idempotencyKey: key,
            failureReason: 'email_unavailable',
          });
          continue;
        }
        const safeLink = safeHttpUrl(input.link);
        const result = await provider.send({
          to: emailTarget,
          subject: title,
          html: `<p>${escapeHtml(message).replace(/\n/g, '<br/>')}</p>${safeLink ? `<p><a href="${escapeHtml(safeLink)}">Open the job request</a></p>` : ''}`,
          text: message,
        });
        await NotificationDelivery.create({
          notificationId: inAppId,
          recipientId: input.recipientId,
          eventType,
          channel,
          status: 'SENT',
          provider: process.env.EMAIL_PROVIDER || 'smtp',
          providerMessageId: result.id,
          idempotencyKey: key,
          sentAt: new Date(),
          templateName: eventType,
        });
        continue;
      }

      if (channel === 'SMS') {
        const provider = getSmsProvider();
        const to = prefs?.phone;
        if (!provider || !to) {
          await NotificationDelivery.create({
            recipientId: input.recipientId,
            eventType,
            channel,
            status: 'SKIPPED',
            idempotencyKey: key,
            failureReason: 'sms_unavailable',
          });
          continue;
        }
        const smsBody = tpl.sms ? render(tpl.sms, vars) : message;
        const result = await provider.send({ to, body: smsBody });
        await NotificationDelivery.create({
          recipientId: input.recipientId,
          eventType,
          channel,
          status: 'SENT',
          provider: process.env.SMS_PROVIDER,
          providerMessageId: result.id,
          idempotencyKey: key,
          sentAt: new Date(),
          templateName: eventType,
        });
        continue;
      }

      const provider = getWhatsAppProvider();
      const to = prefs?.whatsappNumber || prefs?.phone;
      if (!provider || !to) {
        await NotificationDelivery.create({
          recipientId: input.recipientId,
          eventType,
          channel,
          status: 'SKIPPED',
          idempotencyKey: key,
          failureReason: 'whatsapp_unavailable',
        });
        continue;
      }
      const result = await provider.send({ to, templateName: eventType, variables: vars });
      await NotificationDelivery.create({
        recipientId: input.recipientId,
        eventType,
        channel,
        status: 'SENT',
        provider: process.env.WHATSAPP_PROVIDER,
        providerMessageId: result.id,
        templateName: eventType,
        idempotencyKey: key,
        sentAt: new Date(),
      });
    } catch (error: any) {
      logger.warn('Notification channel failed', { channel, eventType, message: error?.message });
      await NotificationDelivery.create({
        recipientId: input.recipientId,
        eventType,
        channel,
        status: 'FAILED',
        idempotencyKey: key,
        failedAt: new Date(),
        failureReason: error?.message || 'provider_error',
        retryCount: 1,
      }).catch(() => undefined);
    }
  }
}

export async function notifyCompanyStaff(
  companyId: string,
  eventType: TemplateKey,
  variables: Record<string, string>,
  idempotencyKey: string
): Promise<void> {
  if (!companyId) return;
  const staff = await User.find({
    companyId,
    isActive: { $ne: false },
    $or: [
      { role: { $in: ['admin', 'agent', 'principal', 'prea'] } },
      { roles: { $in: ['admin', 'agent', 'principal', 'prea'] } },
    ],
  }).select('_id').limit(20).lean();
  for (const member of staff) {
    await notifyEvent({
      recipientId: String(member._id),
      companyId,
      eventType,
      variables,
      idempotencyKey: `${idempotencyKey}:${member._id}`,
    });
  }
}

export const NotificationService = { notifyEvent, notifyCompanyStaff, renderTemplate: render, TEMPLATES };
