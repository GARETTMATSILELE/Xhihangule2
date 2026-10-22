import { explainOwnerWaterfall } from '../reporting/ownerWaterfall';
import { formatRentPeriodDescription, type RentalPeriodInput } from '../reporting/rentalPeriod';
import { roundMoney } from '../utils/money';

export type OwnerRentNoticeStatus = 'PENDING' | 'SENT' | 'SKIPPED_OPT_OUT' | 'FAILED' | 'NOT_READY';

export function ownerRentEmailDecision(rentPaymentEmails: boolean | undefined | null): 'send' | 'skip' {
  return rentPaymentEmails === false ? 'skip' : 'send';
}

export function ownerRentIdempotencyKey(paymentId: string): string {
  return `owner-rent-payment:${paymentId}`;
}

export type PropertyOwnerCandidate = {
  id: string;
  companyId: string;
  propertyIds: string[];
  active?: boolean;
};

/**
 * The property-owner record lists the properties it owns. Property.ownerId is the
 * agent user and is not an owner contact.
 */
export function selectPropertyOwnerForRentNotice(input: {
  companyId: string;
  propertyId: string;
  owners: PropertyOwnerCandidate[];
}): PropertyOwnerCandidate | null {
  const companyId = String(input.companyId || '');
  const propertyId = String(input.propertyId || '');
  if (!companyId || !propertyId) return null;
  const matches = input.owners.filter((owner) =>
    String(owner.companyId) === companyId &&
    owner.active !== false &&
    owner.propertyIds.some((id) => String(id) === propertyId)
  );
  return matches.length === 1 ? matches[0] : null;
}

export function ownerRentNoticeScope(input: {
  paymentCompanyId?: string;
  propertyCompanyId?: string;
  ownerCompanyId?: string;
}): boolean {
  const paymentCompanyId = String(input.paymentCompanyId || '');
  const propertyCompanyId = String(input.propertyCompanyId || '');
  const ownerCompanyId = String(input.ownerCompanyId || '');
  if (!paymentCompanyId || !propertyCompanyId || !ownerCompanyId) return false;
  return paymentCompanyId === propertyCompanyId && paymentCompanyId === ownerCompanyId;
}

export function buildOwnerRentEmail(input: {
  ownerName: string;
  propertyName: string;
  amount: number;
  currency: string;
  paymentDate: Date;
  agencyName: string;
}): { subject: string; text: string } {
  const amount = `${input.currency} ${Number(input.amount).toFixed(2)}`;
  const date = input.paymentDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  const subject = `Rent Payment Received — ${input.propertyName}`;
  const text = [
    `Dear ${input.ownerName},`,
    '',
    `We confirm that rental payment for ${input.propertyName} has been received.`,
    '',
    `Amount received: ${amount}`,
    `Payment date: ${date}`,
    '',
    'Your property account has been updated in Mantis.',
    '',
    'Regards,',
    input.agencyName,
  ].join('\n');
  return { subject, text };
}

export type OwnerRentNoticeStore = {
  findByKey(key: string): Promise<{ status: OwnerRentNoticeStatus } | null>;
  save(doc: { idempotencyKey: string; status: OwnerRentNoticeStatus; failureReason?: string }): Promise<void>;
  send(input: { to: string; subject: string; text: string; html?: string }): Promise<void>;
};

export function ownerNoticeReady(accountingComplete: boolean | undefined): boolean {
  return accountingComplete === true;
}

export async function deliverOwnerRentNotice(input: {
  idempotencyKey: string;
  ownerEmail?: string;
  rentPaymentEmails?: boolean | null;
  accountingComplete?: boolean;
  email: { subject: string; text: string; html?: string };
}, store: OwnerRentNoticeStore): Promise<OwnerRentNoticeStatus> {
  if (!ownerNoticeReady(input.accountingComplete)) return 'NOT_READY';
  const existing = await store.findByKey(input.idempotencyKey);
  if (existing?.status === 'SENT' || existing?.status === 'SKIPPED_OPT_OUT') return existing.status;
  if (ownerRentEmailDecision(input.rentPaymentEmails) === 'skip') {
    await store.save({ idempotencyKey: input.idempotencyKey, status: 'SKIPPED_OPT_OUT' });
    return 'SKIPPED_OPT_OUT';
  }
  const ownerEmail = String(input.ownerEmail || '').trim();
  if (!ownerEmail) {
    await store.save({ idempotencyKey: input.idempotencyKey, status: 'FAILED', failureReason: 'Owner email missing' });
    return 'FAILED';
  }
  try {
    await store.save({ idempotencyKey: input.idempotencyKey, status: 'PENDING' });
    await store.send({ to: ownerEmail, subject: input.email.subject, text: input.email.text, html: input.email.html });
    await store.save({ idempotencyKey: input.idempotencyKey, status: 'SENT' });
    return 'SENT';
  } catch (error: any) {
    await store.save({
      idempotencyKey: input.idempotencyKey,
      status: 'FAILED',
      failureReason: String(error?.message || 'Email failed'),
    });
    return 'FAILED';
  }
}

export type OwnerRentPaymentSnapshot = RentalPeriodInput & {
  status?: string;
  isProvisional?: boolean;
  reversalOfPaymentId?: unknown;
  paymentType?: string;
  amount?: number;
  depositAmount?: number;
  currency?: string;
  rentAllocated?: number;
  levyAllocated?: number;
  commissionDetails?: {
    levy?: number;
    commissionNet?: number;
    totalCommission?: number;
    commissionGross?: number;
    vatOnCommission?: number;
    vatAmount?: number;
    vatTreatment?: string;
    ownerAmount?: number;
    commissionBase?: number;
    grossRent?: number;
    paymentAllocation?: {
      grossAmount?: number;
      rent?: number;
      levy?: number;
      commission?: number;
      commissionNet?: number;
      vatOnCommission?: number;
      otherDeductions?: number;
      ownerPayable?: number;
    };
  };
};

export type OwnerRentNoticeFigures = {
  currency: string;
  rentalPeriod: string;
  /** Stored rent component. Not added to the total when the levy is already inside it. */
  rentAmount: number;
  commission: number;
  vatOnCommission: number;
  levy: number;
  /** Stored allocation total. Levy is already included when a levy was collected. */
  totalPaid: number;
  netOwnerAmount: number;
};

export type OwnerRentEmailContent = { subject: string; text: string; html: string };

const COMPLETED = 'completed';

function singleLine(value: string): string {
  return String(value || '').replace(/[\r\n]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
}

export function escapeHtml(value: string): string {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function formatOwnerNoticeMoney(currency: string, amount: number): string {
  const rounded = roundMoney(amount);
  const negative = rounded < 0;
  const [whole, fraction] = Math.abs(rounded).toFixed(2).split('.');
  const withCommas = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${negative ? '-' : ''}${currency} ${withCommas}.${fraction}`;
}

export function ownerRentPeriodLabel(input: RentalPeriodInput): string | undefined {
  const formatted = formatRentPeriodDescription(input);
  if (!formatted) return undefined;
  return formatted.replace(/ Rent$/, '');
}

function waterfallAgrees(input: {
  grossAmount: number;
  commission: number;
  levy: number;
  vat: number;
  ownerPayable: number;
}): boolean {
  return !explainOwnerWaterfall({
    grossAmount: input.grossAmount,
    commissionAmount: input.commission,
    levyAmount: input.levy,
    vatOnCommission: input.vat,
    recordedOwnerAmount: input.ownerPayable,
  }).reviewRequired;
}

/**
 * Reads the stored receipt allocation. paymentAllocation.grossAmount is the
 * total collected, and the levy is already inside that total. Owner payable is
 * that total minus commission, VAT on commission, and levy. The levy is not
 * added to the total again.
 */
export function resolveOwnerRentNoticeFigures(
  payment: OwnerRentPaymentSnapshot
): { ok: true; figures: OwnerRentNoticeFigures } | { ok: false; reason: string } {
  if (payment.paymentType && payment.paymentType !== 'rental' && payment.paymentType !== 'introduction') {
    return { ok: false, reason: 'not_rental' };
  }
  if (payment.status && payment.status !== COMPLETED) return { ok: false, reason: 'payment_not_completed' };
  if (payment.isProvisional) return { ok: false, reason: 'provisional' };
  if (payment.reversalOfPaymentId) return { ok: false, reason: 'reversal' };

  const currency = singleLine(String(payment.currency || ''));
  if (currency !== 'USD' && currency !== 'ZWL') return { ok: false, reason: 'currency_missing' };

  const rentalPeriod = ownerRentPeriodLabel(payment);
  if (!rentalPeriod) return { ok: false, reason: 'rental_period_missing' };

  const allocation = payment.commissionDetails?.paymentAllocation;
  if (!allocation || allocation.grossAmount == null || allocation.ownerPayable == null || allocation.rent == null) {
    return { ok: false, reason: 'allocation_incomplete' };
  }
  if (roundMoney(Number(allocation.otherDeductions || 0)) > 0) {
    return { ok: false, reason: 'other_deductions' };
  }

  const totalPaid = roundMoney(Number(allocation.grossAmount));
  const rentAmount = roundMoney(Number(allocation.rent));
  const levy = roundMoney(Number(allocation.levy || 0));
  const commission = roundMoney(Number(allocation.commissionNet ?? allocation.commission ?? 0));
  const vatOnCommission = roundMoney(Number(allocation.vatOnCommission || 0));
  const netOwnerAmount = roundMoney(Number(allocation.ownerPayable));
  if (!(rentAmount > 0) || !(totalPaid > 0)) return { ok: false, reason: 'no_rent_component' };
  if (!waterfallAgrees({ grossAmount: totalPaid, commission, levy, vat: vatOnCommission, ownerPayable: netOwnerAmount })) {
    return { ok: false, reason: 'allocation_does_not_reconcile' };
  }

  return {
    ok: true,
    figures: { currency, rentalPeriod, rentAmount, commission, vatOnCommission, levy, totalPaid, netOwnerAmount },
  };
}

type NoticeRow = { label: string; value: string; emphasize?: boolean };

function noticeRows(propertyAddress: string, figures: OwnerRentNoticeFigures): NoticeRow[] {
  const money = (amount: number) => formatOwnerNoticeMoney(figures.currency, amount);
  return [
    { label: 'Property Address', value: propertyAddress },
    { label: 'Rental Period Paid For', value: figures.rentalPeriod },
    { label: 'Total Amount Paid (including levy, where applicable)', value: money(figures.totalPaid) },
    { label: 'Less: Commission', value: money(figures.commission) },
    { label: 'Less: VAT on Commission', value: money(figures.vatOnCommission) },
    { label: 'Less: Levy', value: money(figures.levy) },
    { label: 'Net Amount Payable to Owner', value: money(figures.netOwnerAmount), emphasize: true },
  ];
}

export function buildOwnerRentPaymentEmail(input: {
  ownerName: string;
  propertyAddress: string;
  figures: OwnerRentNoticeFigures;
}): OwnerRentEmailContent {
  const ownerName = singleLine(input.ownerName) || 'Owner';
  const propertyAddress = singleLine(input.propertyAddress);
  const period = singleLine(input.figures.rentalPeriod);
  const rows = noticeRows(propertyAddress, { ...input.figures, rentalPeriod: period });
  const subject = `Rental Payment Received — ${propertyAddress} — ${period}`;
  const text = [
    `Dear ${ownerName},`,
    '',
    `We are pleased to inform you that rental payment for your property at ${propertyAddress} has been received and processed.`,
    '',
    'Rental Payment Details',
    '',
    ...rows.map((row) => `${row.label}: ${row.value}`),
    '',
    'Please advise us of a convenient date and time when you intend to collect the funds, so that we can make the necessary arrangements.',
    '',
    'Should you require any clarification regarding the payment or the deductions reflected above, please do not hesitate to contact us.',
    '',
    'Kind regards,',
    'The Benjamins Realty',
    'Property Management Team',
  ].join('\n');

  const tableRows = rows.map((row) => {
    const label = escapeHtml(row.label);
    const value = escapeHtml(row.value);
    const weight = row.emphasize ? '700' : '400';
    const background = row.emphasize ? 'background:#e7f4ec;' : '';
    return `<tr>
      <td style="padding:10px 12px;border-bottom:1px solid #e4e7ec;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:20px;color:#1f2933;font-weight:${weight};${background}">${label}</td>
      <td align="right" style="padding:10px 12px;border-bottom:1px solid #e4e7ec;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:20px;color:#1f2933;font-weight:${weight};${background}">${value}</td>
    </tr>`;
  }).join('');

  const html = `<!DOCTYPE html>
<html lang="en">
<body style="margin:0;padding:0;background:#f4f6f8;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f8;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border:1px solid #e4e7ec;">
          <tr>
            <td style="padding:24px 24px 8px 24px;font-family:Arial,Helvetica,sans-serif;font-size:18px;line-height:24px;color:#163024;font-weight:700;">The Benjamins Realty</td>
          </tr>
          <tr>
            <td style="padding:8px 24px 0 24px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:22px;color:#1f2933;">Dear ${escapeHtml(ownerName)},</td>
          </tr>
          <tr>
            <td style="padding:12px 24px 0 24px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:22px;color:#1f2933;">We are pleased to inform you that rental payment for your property at <strong>${escapeHtml(propertyAddress)}</strong> has been received and processed.</td>
          </tr>
          <tr>
            <td style="padding:20px 24px 8px 24px;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:22px;color:#163024;font-weight:700;">Rental Payment Details</td>
          </tr>
          <tr>
            <td style="padding:0 24px 8px 24px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e4e7ec;border-bottom:0;">
                ${tableRows}
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 24px 0 24px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:22px;color:#1f2933;">Please advise us of a convenient date and time when you intend to collect the funds, so that we can make the necessary arrangements.</td>
          </tr>
          <tr>
            <td style="padding:12px 24px 0 24px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:22px;color:#1f2933;">Should you require any clarification regarding the payment or the deductions reflected above, please do not hesitate to contact us.</td>
          </tr>
          <tr>
            <td style="padding:20px 24px 24px 24px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:22px;color:#1f2933;">Kind regards,<br><strong>The Benjamins Realty</strong><br>Property Management Team</td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { subject, text, html };
}

export function composeOwnerRentNotice(input: {
  payment: OwnerRentPaymentSnapshot;
  ownerName: string;
  propertyAddress: string;
}): { ok: true; email: OwnerRentEmailContent } | { ok: false; reason: string } {
  const address = singleLine(input.propertyAddress);
  if (!address) return { ok: false, reason: 'property_address_missing' };
  const resolved = resolveOwnerRentNoticeFigures(input.payment);
  if (!resolved.ok) return resolved;
  return {
    ok: true,
    email: buildOwnerRentPaymentEmail({
      ownerName: input.ownerName,
      propertyAddress: address,
      figures: resolved.figures,
    }),
  };
}

export type RentalPeriodNoticeStatus = 'replacement_completed' | 'correction_draft' | 'no_replacement' | 'unknown';

export function ownerReversalIdempotencyKey(originalPaymentId: string, reversalPaymentId?: string): string {
  const original = String(originalPaymentId || '');
  const reversal = String(reversalPaymentId || '');
  return reversal ? `owner-rent-reversal:${original}:${reversal}` : `owner-rent-reversal:${original}`;
}

/** Plain reversal reason for an email. Drops control characters, markup, and secret-looking values. */
export function sanitizeReversalReason(reason: unknown): string {
  const text = String(reason ?? '')
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/\b(password|secret|token|api[_-]?key|authorization)\b\s*[:=]\s*\S+/gi, '[removed]')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return '';
  if (/at\s+\S+\s+\(.+:\d+:\d+\)/.test(text) || /\b(stack|node_modules|ECONN|mongodb(\+srv)?:\/\/)/i.test(text)) {
    return '';
  }
  return text.slice(0, 240);
}

export function describeRentalPeriodAfterReversal(input: {
  periodKnown: boolean;
  payments: Array<Record<string, any>>;
  originalPaymentId: string;
}): { status: RentalPeriodNoticeStatus; replacement?: { reference: string; amount: number } } {
  if (!input.periodKnown) return { status: 'unknown' };
  const originalId = String(input.originalPaymentId || '');
  const candidates = (input.payments || []).filter((payment) => {
    if (!payment) return false;
    if (String(payment._id || '') === originalId) return false;
    if (payment.reversalOfPaymentId) return false;
    if (Number(payment.amount || 0) < 0) return false;
    return true;
  });
  const completed = candidates.find((payment) => {
    const status = String(payment.status || '').toLowerCase();
    if (status !== 'completed' && status !== 'paid' && status !== 'success') return false;
    const state = String(payment.reversalState || '');
    if (state === 'reversed' || state === 'reversal_in_progress' || state === 'reversal_incomplete') return false;
    return true;
  });
  if (completed) {
    const allocated = Number(completed.rentAllocated);
    const amount = Number.isFinite(allocated) && allocated > 0 ? allocated : Number(completed.amount || 0);
    return {
      status: 'replacement_completed',
      replacement: {
        reference: String(completed.referenceNumber || completed._id || ''),
        amount
      }
    };
  }
  const draft = candidates.find((payment) => {
    const status = String(payment.status || '').toLowerCase();
    const ref = String(payment.referenceNumber || '');
    const looksLikeCorrection = payment.isCorrectionEntry === true || ref.startsWith('CORR-') || String(payment.postingStatus || '') === 'draft';
    return looksLikeCorrection && (status === 'pending' || String(payment.postingStatus || '') === 'draft');
  });
  if (draft) return { status: 'correction_draft' };
  return { status: 'no_replacement' };
}

function reversalStatusSentence(
  position: { status: RentalPeriodNoticeStatus; replacement?: { reference: string; amount: number } },
  currency: string
): string {
  if (position.status === 'replacement_completed' && position.replacement) {
    return `A completed payment ${position.replacement.reference} of ${formatOwnerNoticeMoney(currency, position.replacement.amount)} is on record for this rental period.`;
  }
  if (position.status === 'correction_draft') {
    return 'A correction draft is on record and has not been completed. It is not a receipt.';
  }
  if (position.status === 'no_replacement') {
    return 'No completed replacement payment is on record for this rental period.';
  }
  return 'This notice confirms the reversal. It does not state whether the rental period has since been paid.';
}

export function composeOwnerReversalNotice(input: {
  ownerName: string;
  propertyLabel: string;
  currency: string;
  originalReference: string;
  originalAmount: number;
  reversalReference?: string;
  reversalAmount?: number;
  reversalDate?: Date | string | null;
  reason?: string;
  periodLabel?: string;
  position: { status: RentalPeriodNoticeStatus; replacement?: { reference: string; amount: number } };
}): { subject: string; text: string; html: string } {
  const currency = input.currency || 'USD';
  const propertyLabel = singleLine(input.propertyLabel) || 'the property';
  const originalReference = singleLine(input.originalReference) || 'the original receipt';
  const reversalReference = input.reversalReference ? singleLine(input.reversalReference) : '';
  const reason = sanitizeReversalReason(input.reason);
  const period = input.periodLabel ? singleLine(input.periodLabel) : '';
  const reversalDate = input.reversalDate ? new Date(input.reversalDate) : null;
  const reversalDateLabel = reversalDate && !Number.isNaN(reversalDate.getTime())
    ? reversalDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
    : '';
  const statusLine = reversalStatusSentence(input.position, currency);
  const lines = [
    `Dear ${singleLine(input.ownerName) || 'Owner'},`,
    '',
    `A separate reversal has been recorded for ${propertyLabel}. The original transaction remains in the audit history.`,
    '',
    `Original payment reference: ${originalReference}`,
    `Original payment amount: ${formatOwnerNoticeMoney(currency, Number(input.originalAmount || 0))}`,
    period ? `Rental period: ${period}` : 'Rental period: taken from the stored payment record, which did not name a period.',
    reversalReference
      ? `Reversal payment reference: ${reversalReference}`
      : 'Reversal payment reference: not available on the payment record.',
    input.reversalAmount != null
      ? `Reversal amount: ${formatOwnerNoticeMoney(currency, Number(input.reversalAmount))}`
      : 'Reversal amount: not available on the payment record.',
    reversalDateLabel ? `Reversal date: ${reversalDateLabel}` : 'Reversal date: not available on the payment record.',
    reason ? `Reason: ${reason}` : 'Reason: not stated.',
    '',
    statusLine
  ];
  const text = lines.join('\n');
  const subject = `Rent receipt reversed — ${originalReference}`;
  const html = `<p>${escapeHtml(text).replace(/\n/g, '<br>')}</p>`;
  return { subject, text, html };
}
