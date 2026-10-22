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
exports.selectPropertyOwnerForRentNotice = exports.sanitizeReversalReason = exports.resolveOwnerRentNoticeFigures = exports.ownerReversalIdempotencyKey = exports.ownerRentIdempotencyKey = exports.ownerRentEmailDecision = exports.describeRentalPeriodAfterReversal = exports.deliverOwnerRentNotice = exports.composeOwnerReversalNotice = exports.composeOwnerRentNotice = exports.buildOwnerRentPaymentEmail = exports.buildOwnerRentEmail = void 0;
exports.notifyOwnerOfRentPayment = notifyOwnerOfRentPayment;
exports.notifyOwnerOfRentReversal = notifyOwnerOfRentReversal;
const Property_1 = require("../models/Property");
const PropertyOwner_1 = require("../models/PropertyOwner");
const Company_1 = require("../models/Company");
const OwnerPreferences_1 = require("../models/OwnerPreferences");
const OwnerRentNotice_1 = require("../models/OwnerRentNotice");
const Payment_1 = require("../models/Payment");
const emailService_1 = require("./emailService");
const ownerRentNotificationPolicy_1 = require("./ownerRentNotificationPolicy");
var ownerRentNotificationPolicy_2 = require("./ownerRentNotificationPolicy");
Object.defineProperty(exports, "buildOwnerRentEmail", { enumerable: true, get: function () { return ownerRentNotificationPolicy_2.buildOwnerRentEmail; } });
Object.defineProperty(exports, "buildOwnerRentPaymentEmail", { enumerable: true, get: function () { return ownerRentNotificationPolicy_2.buildOwnerRentPaymentEmail; } });
Object.defineProperty(exports, "composeOwnerRentNotice", { enumerable: true, get: function () { return ownerRentNotificationPolicy_2.composeOwnerRentNotice; } });
Object.defineProperty(exports, "composeOwnerReversalNotice", { enumerable: true, get: function () { return ownerRentNotificationPolicy_2.composeOwnerReversalNotice; } });
Object.defineProperty(exports, "deliverOwnerRentNotice", { enumerable: true, get: function () { return ownerRentNotificationPolicy_2.deliverOwnerRentNotice; } });
Object.defineProperty(exports, "describeRentalPeriodAfterReversal", { enumerable: true, get: function () { return ownerRentNotificationPolicy_2.describeRentalPeriodAfterReversal; } });
Object.defineProperty(exports, "ownerRentEmailDecision", { enumerable: true, get: function () { return ownerRentNotificationPolicy_2.ownerRentEmailDecision; } });
Object.defineProperty(exports, "ownerRentIdempotencyKey", { enumerable: true, get: function () { return ownerRentNotificationPolicy_2.ownerRentIdempotencyKey; } });
Object.defineProperty(exports, "ownerReversalIdempotencyKey", { enumerable: true, get: function () { return ownerRentNotificationPolicy_2.ownerReversalIdempotencyKey; } });
Object.defineProperty(exports, "resolveOwnerRentNoticeFigures", { enumerable: true, get: function () { return ownerRentNotificationPolicy_2.resolveOwnerRentNoticeFigures; } });
Object.defineProperty(exports, "sanitizeReversalReason", { enumerable: true, get: function () { return ownerRentNotificationPolicy_2.sanitizeReversalReason; } });
Object.defineProperty(exports, "selectPropertyOwnerForRentNotice", { enumerable: true, get: function () { return ownerRentNotificationPolicy_2.selectPropertyOwnerForRentNotice; } });
function notifyOwnerOfRentPayment(payment, options) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            if ((options === null || options === void 0 ? void 0 : options.accountingComplete) !== true)
                return;
            if (!(payment === null || payment === void 0 ? void 0 : payment._id) || !payment.propertyId || !payment.companyId)
                return;
            if (payment.paymentType !== 'rental' && payment.paymentType !== 'introduction')
                return;
            if (payment.status && payment.status !== 'completed')
                return;
            if (payment.isProvisional)
                return;
            if (payment.reversalOfPaymentId)
                return;
            if (payment.reversalPaymentId)
                return;
            const reversalState = String(payment.reversalState || '');
            if (reversalState === 'reversal_in_progress' || reversalState === 'reversal_incomplete' || reversalState === 'reversed')
                return;
            if (Number(payment.amount || 0) <= 0 && Number(payment.rentAllocated || 0) <= 0)
                return;
            const key = (0, ownerRentNotificationPolicy_1.ownerRentIdempotencyKey)(String(payment._id));
            const property = yield Property_1.Property.findOne({
                _id: payment.propertyId,
                companyId: payment.companyId,
            }).select('name address companyId').lean();
            if (!property)
                return;
            const ownerRows = yield PropertyOwner_1.PropertyOwner.find({
                companyId: payment.companyId,
                properties: payment.propertyId,
                active: { $ne: false },
            }).select('email firstName lastName companyId properties active').lean();
            const selected = (0, ownerRentNotificationPolicy_1.selectPropertyOwnerForRentNotice)({
                companyId: String(payment.companyId),
                propertyId: String(payment.propertyId),
                owners: ownerRows.map((row) => ({
                    id: String(row._id),
                    companyId: String(row.companyId),
                    propertyIds: Array.isArray(row.properties) ? row.properties.map((id) => String(id)) : [],
                    active: row.active !== false,
                })),
            });
            const owner = selected ? ownerRows.find((row) => String(row._id) === selected.id) : undefined;
            if (!owner) {
                console.warn('[owner-rent-notice] skipped', String(payment._id), ownerRows.length > 1 ? 'multiple_property_owners' : 'property_owner_not_linked');
                return;
            }
            if (!(0, ownerRentNotificationPolicy_1.ownerRentNoticeScope)({
                paymentCompanyId: String(payment.companyId),
                propertyCompanyId: String(property.companyId || ''),
                ownerCompanyId: String(owner.companyId || ''),
            }))
                return;
            const prefs = yield OwnerPreferences_1.OwnerPreferences.findOne({ ownerId: owner._id, companyId: owner.companyId }).select('rentPaymentEmails').lean();
            const company = yield Company_1.Company.findById(owner.companyId).select('name').lean();
            const ownerName = [owner.firstName, owner.lastName].filter(Boolean).join(' ') || 'Owner';
            const propertyAddress = String(property.address || payment.manualPropertyAddress || '').trim();
            const composed = (0, ownerRentNotificationPolicy_1.composeOwnerRentNotice)({
                payment: payment,
                ownerName,
                propertyAddress,
            });
            const email = composed.ok
                ? composed.email
                : payment.paymentType === 'introduction'
                    ? (0, ownerRentNotificationPolicy_1.buildOwnerRentEmail)({
                        ownerName,
                        propertyName: propertyAddress || String(property.name || 'your property'),
                        amount: Number(payment.amount || 0),
                        currency: payment.currency || 'USD',
                        paymentDate: payment.paymentDate ? new Date(payment.paymentDate) : new Date(),
                        agencyName: String((company === null || company === void 0 ? void 0 : company.name) || 'Your agency'),
                    })
                    : null;
            if (!email) {
                console.warn('[owner-rent-notice] skipped', String(payment._id), composed.ok ? '' : composed.reason);
                return;
            }
            const store = {
                findByKey(idempotencyKey) {
                    return __awaiter(this, void 0, void 0, function* () {
                        const row = yield OwnerRentNotice_1.OwnerRentNotice.findOne({ idempotencyKey }).select('status').lean();
                        return row ? { status: row.status } : null;
                    });
                },
                save(doc) {
                    return __awaiter(this, void 0, void 0, function* () {
                        yield OwnerRentNotice_1.OwnerRentNotice.findOneAndUpdate({ idempotencyKey: doc.idempotencyKey }, {
                            $set: {
                                status: doc.status,
                                failureReason: doc.failureReason,
                                companyId: owner.companyId,
                                ownerId: owner._id,
                                paymentId: payment._id,
                                propertyId: payment.propertyId,
                            },
                            $setOnInsert: { idempotencyKey: doc.idempotencyKey },
                        }, { upsert: true });
                    });
                },
                send(message) {
                    return __awaiter(this, void 0, void 0, function* () {
                        if (process.env.NODE_ENV !== 'production' &&
                            process.env.MANTIS_TEST_SEAM === '1' &&
                            String(payment.notes || '').includes('PHASE4B1_FAIL_MAIL')) {
                            const seams = global.__phase4b1MailSeam || (global.__phase4b1MailSeam = new Set());
                            const seamKey = String(payment._id);
                            if (!seams.has(seamKey)) {
                                seams.add(seamKey);
                                throw new Error('PHASE4B1_FAIL_MAIL');
                            }
                        }
                        yield (0, emailService_1.sendMail)({
                            to: message.to,
                            subject: message.subject,
                            text: message.text,
                            html: message.html || `<pre>${(0, ownerRentNotificationPolicy_1.escapeHtml)(message.text)}</pre>`,
                        });
                    });
                },
            };
            yield (0, ownerRentNotificationPolicy_1.deliverOwnerRentNotice)({
                idempotencyKey: key,
                ownerEmail: String(owner.email || '').trim() || undefined,
                rentPaymentEmails: prefs === null || prefs === void 0 ? void 0 : prefs.rentPaymentEmails,
                accountingComplete: true,
                email,
            }, store);
        }
        catch (error) {
            console.warn('[owner-rent-notice] notification failed without affecting payment', (error === null || error === void 0 ? void 0 : error.message) || error);
        }
    });
}
/**
 * Owner reversal notice. The original rent-received row is never rewritten.
 * The email is sent only after reversalState is reversed. Until then the row waits.
 * Delivery failure does not change payment or accounting state.
 */
function notifyOwnerOfRentReversal(payment, reason, options) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            if (!(payment === null || payment === void 0 ? void 0 : payment._id) || !payment.propertyId || !payment.companyId)
                return;
            const reversalState = String(payment.reversalState || '');
            const settled = (options === null || options === void 0 ? void 0 : options.settled) === true || ((options === null || options === void 0 ? void 0 : options.settled) !== false && reversalState === 'reversed');
            const reversalPaymentId = payment.reversalPaymentId;
            const key = (0, ownerRentNotificationPolicy_1.ownerReversalIdempotencyKey)(String(payment._id), reversalPaymentId ? String(reversalPaymentId) : undefined);
            const existing = yield OwnerRentNotice_1.OwnerRentNotice.findOne({ idempotencyKey: key }).select('status').lean();
            if (existing && (existing.status === 'SENT' || existing.status === 'SKIPPED_OPT_OUT'))
                return;
            const property = yield Property_1.Property.findOne({
                _id: payment.propertyId,
                companyId: payment.companyId,
            }).select('name address companyId').lean();
            if (!property)
                return;
            const ownerRows = yield PropertyOwner_1.PropertyOwner.find({
                companyId: payment.companyId,
                properties: payment.propertyId,
                active: { $ne: false },
            }).select('email firstName lastName companyId properties active').lean();
            const selected = (0, ownerRentNotificationPolicy_1.selectPropertyOwnerForRentNotice)({
                companyId: String(payment.companyId),
                propertyId: String(payment.propertyId),
                owners: ownerRows.map((row) => ({
                    id: String(row._id),
                    companyId: String(row.companyId),
                    propertyIds: Array.isArray(row.properties) ? row.properties.map((id) => String(id)) : [],
                    active: row.active !== false,
                })),
            });
            const owner = selected ? ownerRows.find((row) => String(row._id) === selected.id) : undefined;
            if (!owner || !(0, ownerRentNotificationPolicy_1.ownerRentNoticeScope)({
                paymentCompanyId: String(payment.companyId),
                propertyCompanyId: String(property.companyId || ''),
                ownerCompanyId: String(owner.companyId || ''),
            }))
                return;
            const noticeBase = Object.assign({ companyId: owner.companyId, ownerId: owner._id, paymentId: payment._id, propertyId: payment.propertyId }, (reversalPaymentId ? { reversalPaymentId } : {}));
            if (!settled) {
                yield OwnerRentNotice_1.OwnerRentNotice.findOneAndUpdate({ idempotencyKey: key }, { $set: Object.assign(Object.assign({}, noticeBase), { status: 'AWAITING_SETTLEMENT' }), $setOnInsert: { idempotencyKey: key, attemptCount: 0 } }, { upsert: true });
                return;
            }
            const prefs = yield OwnerPreferences_1.OwnerPreferences.findOne({ ownerId: owner._id, companyId: owner.companyId }).select('rentPaymentEmails').lean();
            if ((prefs === null || prefs === void 0 ? void 0 : prefs.rentPaymentEmails) === false) {
                yield OwnerRentNotice_1.OwnerRentNotice.findOneAndUpdate({ idempotencyKey: key }, { $set: Object.assign(Object.assign({}, noticeBase), { status: 'SKIPPED_OPT_OUT' }), $setOnInsert: { idempotencyKey: key, attemptCount: 0 } }, { upsert: true });
                return;
            }
            const to = String(owner.email || '').trim();
            if (!to) {
                yield OwnerRentNotice_1.OwnerRentNotice.findOneAndUpdate({ idempotencyKey: key }, {
                    $set: Object.assign(Object.assign({}, noticeBase), { status: 'FAILED', failureReason: 'Owner email missing' }),
                    $setOnInsert: { idempotencyKey: key, attemptCount: 0 },
                }, { upsert: true });
                return;
            }
            const reversal = reversalPaymentId
                ? yield Payment_1.Payment.findOne({ _id: reversalPaymentId, companyId: payment.companyId, reversalOfPaymentId: payment._id })
                    .select('referenceNumber amount paymentDate companyId')
                    .lean()
                : null;
            const periodKnown = Number.isFinite(Number(payment.rentalPeriodMonth)) && Number.isFinite(Number(payment.rentalPeriodYear));
            const periodPayments = periodKnown && payment.tenantId
                ? yield Payment_1.Payment.find({
                    companyId: payment.companyId,
                    propertyId: payment.propertyId,
                    tenantId: payment.tenantId,
                    paymentType: 'rental',
                    rentalPeriodYear: payment.rentalPeriodYear,
                    rentalPeriodMonth: payment.rentalPeriodMonth,
                }).select('amount rentAllocated status postingStatus reversalState reversalOfPaymentId isCorrectionEntry referenceNumber').lean()
                : [];
            const position = (0, ownerRentNotificationPolicy_1.describeRentalPeriodAfterReversal)({
                periodKnown,
                payments: periodPayments,
                originalPaymentId: String(payment._id),
            });
            const email = (0, ownerRentNotificationPolicy_1.composeOwnerReversalNotice)({
                ownerName: [owner.firstName, owner.lastName].filter(Boolean).join(' ') || 'Owner',
                propertyLabel: String(property.address || payment.manualPropertyAddress || property.name || 'your property'),
                currency: payment.currency || 'USD',
                originalReference: String(payment.referenceNumber || payment._id),
                originalAmount: Number(payment.amount || 0),
                reversalReference: reversal ? String(reversal.referenceNumber || reversal._id) : undefined,
                reversalAmount: reversal ? Number(reversal.amount) : undefined,
                reversalDate: reversal ? reversal.paymentDate : undefined,
                reason,
                periodLabel: (0, ownerRentNotificationPolicy_1.ownerRentPeriodLabel)(payment),
                position,
            });
            const deliver = (options === null || options === void 0 ? void 0 : options.send) || emailService_1.sendMail;
            yield OwnerRentNotice_1.OwnerRentNotice.findOneAndUpdate({ idempotencyKey: key }, { $set: Object.assign(Object.assign({}, noticeBase), { status: 'PENDING' }), $setOnInsert: { idempotencyKey: key }, $inc: { attemptCount: 1 } }, { upsert: true });
            try {
                yield deliver({ to, subject: email.subject, text: email.text, html: email.html });
                yield OwnerRentNotice_1.OwnerRentNotice.findOneAndUpdate({ idempotencyKey: key }, { $set: Object.assign(Object.assign({}, noticeBase), { status: 'SENT', failureReason: undefined }) });
            }
            catch (sendError) {
                const failureReason = String((sendError === null || sendError === void 0 ? void 0 : sendError.message) || 'Email failed').replace(/[\r\n]+/g, ' ').slice(0, 240);
                yield OwnerRentNotice_1.OwnerRentNotice.findOneAndUpdate({ idempotencyKey: key }, { $set: Object.assign(Object.assign({}, noticeBase), { status: 'FAILED', failureReason }) });
            }
        }
        catch (error) {
            console.warn('[owner-rent-reversal] notification failed without affecting payment', (error === null || error === void 0 ? void 0 : error.message) || error);
        }
    });
}
