/**
 * Sends an email to the agent associated with a payment, notifying them of the
 * payment and its details (e.g. rent payment for rental agent, sales payment for sales agent).
 */

import mongoose from 'mongoose';
import { User } from '../models/User';
import { sendMail } from './emailService';
import type { IPayment } from '../models/Payment';

/** Minimal payment-like shape for notification (e.g. from controller before full populate). */
export type PaymentLike = {
  _id: mongoose.Types.ObjectId;
  agentId: mongoose.Types.ObjectId;
  tenantId: mongoose.Types.ObjectId;
  propertyId?: mongoose.Types.ObjectId;
  paymentType: 'sale' | 'rental' | 'introduction';
  amount: number;
  paymentDate: Date;
  referenceNumber?: string;
  currency?: string;
  commissionDetails?: { agentShare?: number };
  rentalPeriodMonth?: number;
  rentalPeriodYear?: number;
  manualPropertyAddress?: string;
  manualTenantName?: string;
};

const PAYMENT_TYPE_LABELS: Record<string, string> = {
  rental: 'Rent',
  sale: 'Sale',
  introduction: 'Introduction',
};

/**
 * Send a single email to the agent associated with a payment. Fire-and-forget;
 * errors are logged and do not affect the caller.
 * Skips sending when:
 * - agentId equals tenantId (e.g. public tenant self-pay where tenant is stored as "agent")
 * - agent user has no email
 * - agent user is not in role agent/sales (avoids emailing tenants if stored as agentId)
 */
export async function sendAgentPaymentNotificationEmail(
  payment: IPayment | PaymentLike
): Promise<void> {
  try {
    const agentId = payment.agentId;
    const tenantId = payment.tenantId;
    if (!agentId) return;

    // Skip when agentId is the tenant (e.g. public payment flow stores tenantId as agentId)
    if (tenantId && String(agentId) === String(tenantId)) return;

    const agent = await User.findById(agentId)
      .select('email firstName lastName role roles')
      .lean();
    if (!agent || !agent.email) return;

    const roles: string[] = Array.isArray(agent.roles) && agent.roles.length
      ? agent.roles.map((r: string) => String(r))
      : [String(agent.role || '')];
    const isAgentOrSales = roles.some((r) => r === 'agent' || r === 'sales');
    if (!isAgentOrSales) return;

    const typeLabel = PAYMENT_TYPE_LABELS[payment.paymentType] || payment.paymentType;
    const amount = Number(payment.amount);
    const currency = payment.currency || 'USD';
    const date = payment.paymentDate instanceof Date
      ? payment.paymentDate.toLocaleDateString()
      : new Date(payment.paymentDate).toLocaleDateString();

    // Fetch tenant name and property address for email details (fallback to manual fields)
    const propertyId = (payment as any).propertyId;
    const tenantIdForFetch = payment.tenantId;
    const manualTenantName = (payment as any).manualTenantName;
    const manualPropertyAddress = (payment as any).manualPropertyAddress;
    let tenantName = typeof manualTenantName === 'string' && manualTenantName.trim() ? manualTenantName.trim() : '—';
    let propertyAddress = typeof manualPropertyAddress === 'string' && manualPropertyAddress.trim() ? manualPropertyAddress.trim() : '—';
    if (propertyId && propertyAddress === '—') {
      try {
        const { Property } = await import('../models/Property');
        const prop = await Property.findById(propertyId).select('address name').lean();
        if (prop) propertyAddress = (prop as any).address || (prop as any).name || '—';
      } catch (_) {}
    }
    if (tenantIdForFetch && tenantName === '—') {
      try {
        const { Tenant } = await import('../models/Tenant');
        const tenant = await Tenant.findById(tenantIdForFetch).select('firstName lastName').lean();
        if (tenant) {
          tenantName = [(tenant as any).firstName, (tenant as any).lastName].filter(Boolean).join(' ').trim() || '—';
        }
      } catch (_) {}
    }

    const fullName = [agent.firstName, agent.lastName].filter(Boolean).join(' ').trim();
    const greeting = fullName ? `Hi ${fullName},` : 'Hello,';

    const subject = `Payment recorded: ${typeLabel} – ${tenantName}`;

    const details: string[] = [
      `Type: ${typeLabel}`,
      `Amount: ${currency} ${amount.toLocaleString()}`,
      `Date: ${date}`,
      `Tenant: ${tenantName}`,
      `Property: ${propertyAddress}`,
    ];
    if (
      typeof (payment as any).rentalPeriodMonth === 'number' &&
      typeof (payment as any).rentalPeriodYear === 'number'
    ) {
      details.push(
        `Rental period: ${(payment as any).rentalPeriodYear}-${String((payment as any).rentalPeriodMonth).padStart(2, '0')}`
      );
    }

    const linkBase = process.env.CLIENT_URL || process.env.APP_BASE_URL || 'http://localhost:3000';
    const url = `${linkBase}/sales-dashboard/notifications`;

    const plain = [
      greeting,
      '',
      `A ${typeLabel.toLowerCase()} payment associated with you has been recorded.`,
      '',
      details.join('\n'),
      '',
      `View details: ${url}`,
    ].join('\n');

    const html = [
      `<p>${greeting}</p>`,
      `<p>A ${typeLabel.toLowerCase()} payment associated with you has been recorded.</p>`,
      '<ul>',
      ...details.map((d) => `<li>${escapeHtml(d)}</li>`),
      '</ul>',
      `<p><a href="${url}" target="_blank" rel="noopener noreferrer">View details</a></p>`,
    ].join('');

    await sendMail({ to: agent.email, subject, html, text: plain });
  } catch (e) {
    console.warn(
      '[agentPaymentNotification] Failed to send agent payment email:',
      (e as Error)?.message || e
    );
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
