"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ownerRentEmailDecision = ownerRentEmailDecision;
exports.ownerRentIdempotencyKey = ownerRentIdempotencyKey;
exports.selectPropertyOwnerForRentNotice = selectPropertyOwnerForRentNotice;
exports.ownerRentNoticeScope = ownerRentNoticeScope;
exports.buildOwnerRentEmail = buildOwnerRentEmail;
exports.ownerNoticeReady = ownerNoticeReady;
exports.deliverOwnerRentNotice = deliverOwnerRentNotice;
exports.escapeHtml = escapeHtml;
exports.formatOwnerNoticeMoney = formatOwnerNoticeMoney;
exports.ownerRentPeriodLabel = ownerRentPeriodLabel;
exports.resolveOwnerRentNoticeFigures = resolveOwnerRentNoticeFigures;
exports.buildOwnerRentPaymentEmail = buildOwnerRentPaymentEmail;
exports.composeOwnerRentNotice = composeOwnerRentNotice;
const ownerWaterfall_1 = require("../reporting/ownerWaterfall");
const rentalPeriod_1 = require("../reporting/rentalPeriod");
const money_1 = require("../utils/money");
function ownerRentEmailDecision(rentPaymentEmails) {
    return rentPaymentEmails === false ? 'skip' : 'send';
}
function ownerRentIdempotencyKey(paymentId) {
    return `owner-rent-payment:${paymentId}`;
}
/**
 * The property-owner record lists the properties it owns. Property.ownerId is the
 * agent user and is not an owner contact.
 */
function selectPropertyOwnerForRentNotice(input) {
    const companyId = String(input.companyId || '');
    const propertyId = String(input.propertyId || '');
    if (!companyId || !propertyId)
        return null;
    const matches = input.owners.filter((owner) => String(owner.companyId) === companyId &&
        owner.active !== false &&
        owner.propertyIds.some((id) => String(id) === propertyId));
    return matches.length === 1 ? matches[0] : null;
}
function ownerRentNoticeScope(input) {
    const paymentCompanyId = String(input.paymentCompanyId || '');
    const propertyCompanyId = String(input.propertyCompanyId || '');
    const ownerCompanyId = String(input.ownerCompanyId || '');
    if (!paymentCompanyId || !propertyCompanyId || !ownerCompanyId)
        return false;
    return paymentCompanyId === propertyCompanyId && paymentCompanyId === ownerCompanyId;
}
function buildOwnerRentEmail(input) {
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
function ownerNoticeReady(accountingComplete) {
    return accountingComplete === true;
}
function deliverOwnerRentNotice(input, store) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!ownerNoticeReady(input.accountingComplete))
            return 'NOT_READY';
        const existing = yield store.findByKey(input.idempotencyKey);
        if ((existing === null || existing === void 0 ? void 0 : existing.status) === 'SENT' || (existing === null || existing === void 0 ? void 0 : existing.status) === 'SKIPPED_OPT_OUT')
            return existing.status;
        if (ownerRentEmailDecision(input.rentPaymentEmails) === 'skip') {
            yield store.save({ idempotencyKey: input.idempotencyKey, status: 'SKIPPED_OPT_OUT' });
            return 'SKIPPED_OPT_OUT';
        }
        const ownerEmail = String(input.ownerEmail || '').trim();
        if (!ownerEmail) {
            yield store.save({ idempotencyKey: input.idempotencyKey, status: 'FAILED', failureReason: 'Owner email missing' });
            return 'FAILED';
        }
        try {
            yield store.save({ idempotencyKey: input.idempotencyKey, status: 'PENDING' });
            yield store.send({ to: ownerEmail, subject: input.email.subject, text: input.email.text, html: input.email.html });
            yield store.save({ idempotencyKey: input.idempotencyKey, status: 'SENT' });
            return 'SENT';
        }
        catch (error) {
            yield store.save({
                idempotencyKey: input.idempotencyKey,
                status: 'FAILED',
                failureReason: String((error === null || error === void 0 ? void 0 : error.message) || 'Email failed'),
            });
            return 'FAILED';
        }
    });
}
const COMPLETED = 'completed';
function singleLine(value) {
    return String(value || '').replace(/[\r\n]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
}
function escapeHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}
function formatOwnerNoticeMoney(currency, amount) {
    const rounded = (0, money_1.roundMoney)(amount);
    const negative = rounded < 0;
    const [whole, fraction] = Math.abs(rounded).toFixed(2).split('.');
    const withCommas = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return `${negative ? '-' : ''}${currency} ${withCommas}.${fraction}`;
}
function ownerRentPeriodLabel(input) {
    const formatted = (0, rentalPeriod_1.formatRentPeriodDescription)(input);
    if (!formatted)
        return undefined;
    return formatted.replace(/ Rent$/, '');
}
function waterfallAgrees(input) {
    return !(0, ownerWaterfall_1.explainOwnerWaterfall)({
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
function resolveOwnerRentNoticeFigures(payment) {
    var _a, _b, _c;
    if (payment.paymentType && payment.paymentType !== 'rental' && payment.paymentType !== 'introduction') {
        return { ok: false, reason: 'not_rental' };
    }
    if (payment.status && payment.status !== COMPLETED)
        return { ok: false, reason: 'payment_not_completed' };
    if (payment.isProvisional)
        return { ok: false, reason: 'provisional' };
    if (payment.reversalOfPaymentId)
        return { ok: false, reason: 'reversal' };
    const currency = singleLine(String(payment.currency || ''));
    if (currency !== 'USD' && currency !== 'ZWL')
        return { ok: false, reason: 'currency_missing' };
    const rentalPeriod = ownerRentPeriodLabel(payment);
    if (!rentalPeriod)
        return { ok: false, reason: 'rental_period_missing' };
    const allocation = (_a = payment.commissionDetails) === null || _a === void 0 ? void 0 : _a.paymentAllocation;
    if (!allocation || allocation.grossAmount == null || allocation.ownerPayable == null || allocation.rent == null) {
        return { ok: false, reason: 'allocation_incomplete' };
    }
    if ((0, money_1.roundMoney)(Number(allocation.otherDeductions || 0)) > 0) {
        return { ok: false, reason: 'other_deductions' };
    }
    const totalPaid = (0, money_1.roundMoney)(Number(allocation.grossAmount));
    const rentAmount = (0, money_1.roundMoney)(Number(allocation.rent));
    const levy = (0, money_1.roundMoney)(Number(allocation.levy || 0));
    const commission = (0, money_1.roundMoney)(Number((_c = (_b = allocation.commissionNet) !== null && _b !== void 0 ? _b : allocation.commission) !== null && _c !== void 0 ? _c : 0));
    const vatOnCommission = (0, money_1.roundMoney)(Number(allocation.vatOnCommission || 0));
    const netOwnerAmount = (0, money_1.roundMoney)(Number(allocation.ownerPayable));
    if (!(rentAmount > 0) || !(totalPaid > 0))
        return { ok: false, reason: 'no_rent_component' };
    if (!waterfallAgrees({ grossAmount: totalPaid, commission, levy, vat: vatOnCommission, ownerPayable: netOwnerAmount })) {
        return { ok: false, reason: 'allocation_does_not_reconcile' };
    }
    return {
        ok: true,
        figures: { currency, rentalPeriod, rentAmount, commission, vatOnCommission, levy, totalPaid, netOwnerAmount },
    };
}
function noticeRows(propertyAddress, figures) {
    const money = (amount) => formatOwnerNoticeMoney(figures.currency, amount);
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
function buildOwnerRentPaymentEmail(input) {
    const ownerName = singleLine(input.ownerName) || 'Owner';
    const propertyAddress = singleLine(input.propertyAddress);
    const period = singleLine(input.figures.rentalPeriod);
    const rows = noticeRows(propertyAddress, Object.assign(Object.assign({}, input.figures), { rentalPeriod: period }));
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
function composeOwnerRentNotice(input) {
    const address = singleLine(input.propertyAddress);
    if (!address)
        return { ok: false, reason: 'property_address_missing' };
    const resolved = resolveOwnerRentNoticeFigures(input.payment);
    if (!resolved.ok)
        return resolved;
    return {
        ok: true,
        email: buildOwnerRentPaymentEmail({
            ownerName: input.ownerName,
            propertyAddress: address,
            figures: resolved.figures,
        }),
    };
}
