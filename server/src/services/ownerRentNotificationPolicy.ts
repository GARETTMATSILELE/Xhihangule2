export type OwnerRentNoticeStatus = 'PENDING' | 'SENT' | 'SKIPPED_OPT_OUT' | 'FAILED' | 'NOT_READY';

export function ownerRentEmailDecision(rentPaymentEmails: boolean | undefined | null): 'send' | 'skip' {
  return rentPaymentEmails === false ? 'skip' : 'send';
}

export function ownerRentIdempotencyKey(paymentId: string): string {
  return `owner-rent-payment:${paymentId}`;
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
  send(input: { to: string; subject: string; text: string }): Promise<void>;
};

export function ownerNoticeReady(accountingComplete: boolean | undefined): boolean {
  return accountingComplete === true;
}

export async function deliverOwnerRentNotice(input: {
  idempotencyKey: string;
  ownerEmail?: string;
  rentPaymentEmails?: boolean | null;
  accountingComplete?: boolean;
  email: { subject: string; text: string };
}, store: OwnerRentNoticeStore): Promise<OwnerRentNoticeStatus> {
  if (!ownerNoticeReady(input.accountingComplete)) return 'NOT_READY';
  const existing = await store.findByKey(input.idempotencyKey);
  if (existing?.status === 'SENT' || existing?.status === 'SKIPPED_OPT_OUT') return existing.status;
  if (ownerRentEmailDecision(input.rentPaymentEmails) === 'skip') {
    await store.save({ idempotencyKey: input.idempotencyKey, status: 'SKIPPED_OPT_OUT' });
    return 'SKIPPED_OPT_OUT';
  }
  if (!input.ownerEmail) {
    await store.save({ idempotencyKey: input.idempotencyKey, status: 'FAILED', failureReason: 'Owner email missing' });
    return 'FAILED';
  }
  try {
    await store.save({ idempotencyKey: input.idempotencyKey, status: 'PENDING' });
    await store.send({ to: input.ownerEmail, subject: input.email.subject, text: input.email.text });
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
