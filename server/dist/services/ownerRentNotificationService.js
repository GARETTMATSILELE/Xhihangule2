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
exports.ownerRentIdempotencyKey = exports.ownerRentEmailDecision = exports.deliverOwnerRentNotice = exports.buildOwnerRentEmail = void 0;
exports.notifyOwnerOfRentPayment = notifyOwnerOfRentPayment;
const Property_1 = require("../models/Property");
const PropertyOwner_1 = require("../models/PropertyOwner");
const Company_1 = require("../models/Company");
const OwnerPreferences_1 = require("../models/OwnerPreferences");
const OwnerRentNotice_1 = require("../models/OwnerRentNotice");
const emailService_1 = require("./emailService");
const ownerRentNotificationPolicy_1 = require("./ownerRentNotificationPolicy");
var ownerRentNotificationPolicy_2 = require("./ownerRentNotificationPolicy");
Object.defineProperty(exports, "buildOwnerRentEmail", { enumerable: true, get: function () { return ownerRentNotificationPolicy_2.buildOwnerRentEmail; } });
Object.defineProperty(exports, "deliverOwnerRentNotice", { enumerable: true, get: function () { return ownerRentNotificationPolicy_2.deliverOwnerRentNotice; } });
Object.defineProperty(exports, "ownerRentEmailDecision", { enumerable: true, get: function () { return ownerRentNotificationPolicy_2.ownerRentEmailDecision; } });
Object.defineProperty(exports, "ownerRentIdempotencyKey", { enumerable: true, get: function () { return ownerRentNotificationPolicy_2.ownerRentIdempotencyKey; } });
function notifyOwnerOfRentPayment(payment, options) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            if ((options === null || options === void 0 ? void 0 : options.accountingComplete) !== true)
                return;
            if (!(payment === null || payment === void 0 ? void 0 : payment._id) || !payment.propertyId)
                return;
            if (payment.paymentType !== 'rental' && payment.paymentType !== 'introduction')
                return;
            if (Number(payment.amount || 0) <= 0)
                return;
            const key = (0, ownerRentNotificationPolicy_1.ownerRentIdempotencyKey)(String(payment._id));
            const property = yield Property_1.Property.findById(payment.propertyId).select('name ownerId propertyOwnerId companyId').lean();
            const ownerRef = (property === null || property === void 0 ? void 0 : property.propertyOwnerId) || (property === null || property === void 0 ? void 0 : property.ownerId);
            if (!ownerRef)
                return;
            const owner = yield PropertyOwner_1.PropertyOwner.findOne(Object.assign({ _id: ownerRef }, (payment.companyId ? { companyId: payment.companyId } : {}))).select('email firstName lastName companyId').lean();
            if (!owner)
                return;
            const prefs = yield OwnerPreferences_1.OwnerPreferences.findOne({ ownerId: owner._id, companyId: owner.companyId }).select('rentPaymentEmails').lean();
            const company = yield Company_1.Company.findById(owner.companyId).select('name').lean();
            const email = (0, ownerRentNotificationPolicy_1.buildOwnerRentEmail)({
                ownerName: [owner.firstName, owner.lastName].filter(Boolean).join(' ') || 'Owner',
                propertyName: String(property.name || 'your property'),
                amount: Number(payment.amount || 0),
                currency: payment.currency || 'USD',
                paymentDate: payment.paymentDate ? new Date(payment.paymentDate) : new Date(),
                agencyName: String((company === null || company === void 0 ? void 0 : company.name) || 'Your agency'),
            });
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
                        yield (0, emailService_1.sendMail)({ to: message.to, subject: message.subject, text: message.text, html: `<pre>${message.text}</pre>` });
                    });
                },
            };
            yield (0, ownerRentNotificationPolicy_1.deliverOwnerRentNotice)({
                idempotencyKey: key,
                ownerEmail: owner.email,
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
