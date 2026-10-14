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
exports.buildOwnerRentEmail = buildOwnerRentEmail;
exports.ownerNoticeReady = ownerNoticeReady;
exports.deliverOwnerRentNotice = deliverOwnerRentNotice;
function ownerRentEmailDecision(rentPaymentEmails) {
    return rentPaymentEmails === false ? 'skip' : 'send';
}
function ownerRentIdempotencyKey(paymentId) {
    return `owner-rent-payment:${paymentId}`;
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
        if (!input.ownerEmail) {
            yield store.save({ idempotencyKey: input.idempotencyKey, status: 'FAILED', failureReason: 'Owner email missing' });
            return 'FAILED';
        }
        try {
            yield store.save({ idempotencyKey: input.idempotencyKey, status: 'PENDING' });
            yield store.send({ to: input.ownerEmail, subject: input.email.subject, text: input.email.text });
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
