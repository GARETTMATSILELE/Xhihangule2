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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Owner rental-payment notification.
 * Figures come from the stored commission snapshot produced by the existing
 * commission pipeline. This script does not post accounting.
 */
const assert_1 = __importDefault(require("assert"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const mongoose_1 = __importDefault(require("mongoose"));
const Payment_1 = require("../models/Payment");
const propertyCommissionCalculator_1 = require("../services/propertyCommissionCalculator");
const ownerRentNotificationPolicy_1 = require("../services/ownerRentNotificationPolicy");
const money_1 = require("../utils/money");
const ADDRESS = '12 Borrowdale Road, Harare';
const COLLECTION = 'Please advise us of a convenient date and time when you intend to collect the funds, so that we can make the necessary arrangements.';
function src(rel) {
    return fs_1.default.readFileSync(path_1.default.join(__dirname, '..', rel), 'utf8');
}
function rentalPayment(overrides = {}) {
    return Object.assign({ status: 'completed', paymentType: 'rental', currency: 'USD', rentalPeriodMonth: 11, rentalPeriodYear: 2026 }, overrides);
}
function fromPipeline(input) {
    var _a, _b;
    const result = (0, propertyCommissionCalculator_1.calculatePropertyCommission)({
        grossRent: input.rent,
        levy: 0,
        commissionPercentage: (_a = input.rate) !== null && _a !== void 0 ? _a : 15,
        vatOnCommission: input.vatOn !== false,
        vatTreatment: input.treatment || 'exclusive',
        vatRate: input.vatOn === false ? 0 : 0.155,
    });
    const levy = (_b = input.levy) !== null && _b !== void 0 ? _b : 0;
    const snapshot = (0, propertyCommissionCalculator_1.applyLevyPassThroughToSnapshot)(result, input.rent, levy);
    const payment = rentalPayment(Object.assign({ amount: input.rent + levy, commissionDetails: snapshot }, input.payment));
    return { result, snapshot, payment };
}
function compose(payment, ownerName = 'Amina Dube', propertyAddress = ADDRESS) {
    const email = (0, ownerRentNotificationPolicy_1.composeOwnerRentNotice)({ payment, ownerName, propertyAddress });
    if (!email.ok)
        throw new Error(email.reason);
    return email.email;
}
function memoryStore() {
    const rows = new Map();
    const sent = [];
    return {
        rows,
        sent,
        store: {
            findByKey(key) {
                return __awaiter(this, void 0, void 0, function* () {
                    return rows.get(key) || null;
                });
            },
            save(doc) {
                return __awaiter(this, void 0, void 0, function* () {
                    rows.set(doc.idempotencyKey, { status: doc.status, failureReason: doc.failureReason });
                });
            },
            send(message) {
                return __awaiter(this, void 0, void 0, function* () {
                    sent.push(message.subject);
                });
            },
        },
    };
}
function main() {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c, _d, _e, _f;
        const results = {};
        const standard = fromPipeline({ rent: 1000, levy: 50 });
        assert_1.default.strictEqual(standard.snapshot.paymentAllocation.grossAmount, 1050);
        assert_1.default.strictEqual(standard.snapshot.paymentAllocation.ownerPayable, 826.75);
        assert_1.default.strictEqual(standard.snapshot.commissionNet, 150);
        assert_1.default.strictEqual(standard.snapshot.vatAmount, 23.25);
        assert_1.default.strictEqual(standard.snapshot.levy, 50);
        const standardResolved = (0, ownerRentNotificationPolicy_1.resolveOwnerRentNoticeFigures)(standard.payment);
        if (!standardResolved.ok)
            throw new Error(standardResolved.reason);
        assert_1.default.strictEqual(standardResolved.figures.totalPaid, 1050);
        assert_1.default.strictEqual(standardResolved.figures.totalPaid, standard.snapshot.paymentAllocation.grossAmount);
        assert_1.default.notStrictEqual(standardResolved.figures.totalPaid, (0, money_1.roundMoney)(1050 + 50));
        assert_1.default.strictEqual(standardResolved.figures.netOwnerAmount, (0, money_1.roundMoney)(standardResolved.figures.totalPaid - standardResolved.figures.commission - standardResolved.figures.vatOnCommission - standardResolved.figures.levy));
        const standardEmail = compose(standard.payment);
        assert_1.default.strictEqual(standardEmail.subject, `Rental Payment Received — ${ADDRESS} — November 2026`);
        for (const part of [standardEmail.text, standardEmail.html]) {
            assert_1.default.ok(part.includes(ADDRESS));
            assert_1.default.ok(part.includes('November 2026'));
            assert_1.default.ok(part.includes('Total Amount Paid (including levy, where applicable)'));
            assert_1.default.ok(part.includes('USD 1,050.00'));
            assert_1.default.ok(part.includes('Less: Commission'));
            assert_1.default.ok(part.includes('USD 150.00'));
            assert_1.default.ok(part.includes('Less: VAT on Commission'));
            assert_1.default.ok(part.includes('USD 23.25'));
            assert_1.default.ok(part.includes('Less: Levy'));
            assert_1.default.ok(part.includes('USD 50.00'));
            assert_1.default.ok(part.includes('Net Amount Payable to Owner'));
            assert_1.default.ok(part.includes('USD 826.75'));
            assert_1.default.strictEqual(part.split('USD 50.00').length - 1, 1);
            assert_1.default.strictEqual(part.split('USD 1,050.00').length - 1, 1);
            assert_1.default.ok(!part.includes('USD 1,000.00'));
            assert_1.default.ok(!part.includes('Levy collected with this payment'));
            assert_1.default.ok(!part.includes('Amount received'));
            assert_1.default.ok(part.includes(COLLECTION));
            assert_1.default.ok(part.includes('The Benjamins Realty'));
            assert_1.default.ok(!part.includes('776.75'));
        }
        assert_1.default.ok(standardEmail.text.includes('Total Amount Paid (including levy, where applicable): USD 1,050.00'));
        assert_1.default.ok(standardEmail.text.includes('Less: Levy: USD 50.00'));
        assert_1.default.ok(standardEmail.text.includes('Net Amount Payable to Owner: USD 826.75'));
        assert_1.default.ok(standardEmail.html.includes('font-weight:700'));
        assert_1.default.ok(!standardEmail.html.includes('October'));
        assert_1.default.ok(!standardEmail.text.includes('October'));
        const zwl = compose(fromPipeline({
            rent: 1000,
            levy: 50,
            payment: { currency: 'ZWL' },
        }).payment);
        assert_1.default.ok(zwl.text.includes('ZWL 826.75'));
        assert_1.default.ok(!zwl.text.includes('USD'));
        results['1 Standard rental payment uses the stored owner payable'] = 'PASS';
        const advance = compose(rentalPayment(Object.assign(Object.assign({}, fromPipeline({ rent: 1000, levy: 0 }).payment), { rentalPeriodMonth: 11, rentalPeriodYear: 2026, advanceMonthsPaid: 3, advancePeriodStart: { month: 11, year: 2026 }, advancePeriodEnd: { month: 1, year: 2027 }, paymentDate: new Date('2026-10-19') })));
        assert_1.default.ok(advance.subject.includes('November 2026–January 2027'));
        assert_1.default.ok(!advance.text.includes('October'));
        assert_1.default.ok(!advance.subject.includes('October'));
        results['2 Rent paid in advance uses the stored rental period'] = 'PASS';
        const combined = fromPipeline({
            rent: 1000,
            levy: 0,
            payment: { amount: 1500, depositAmount: 500 },
        });
        assert_1.default.strictEqual(combined.snapshot.paymentAllocation.rent, 1000);
        assert_1.default.strictEqual(combined.snapshot.paymentAllocation.grossAmount, 1000);
        const combinedResolved = (0, ownerRentNotificationPolicy_1.resolveOwnerRentNoticeFigures)(combined.payment);
        if (!combinedResolved.ok)
            throw new Error(combinedResolved.reason);
        assert_1.default.strictEqual(combinedResolved.figures.rentAmount, 1000);
        assert_1.default.strictEqual(combinedResolved.figures.totalPaid, 1000);
        const combinedEmail = compose(combined.payment);
        assert_1.default.ok(combinedEmail.text.includes('Total Amount Paid (including levy, where applicable): USD 1,000.00'));
        assert_1.default.ok(!combinedEmail.text.includes('1,500.00'));
        assert_1.default.ok(!combinedEmail.html.includes('1,500.00'));
        results['3 Combined rent and deposit uses the rent allocation'] = 'PASS';
        const vatOff = fromPipeline({ rent: 1000, levy: 0, vatOn: false });
        assert_1.default.strictEqual(vatOff.snapshot.vatAmount, 0);
        const vatOffEmail = compose(vatOff.payment);
        assert_1.default.ok(vatOffEmail.text.includes('Less: VAT on Commission: USD 0.00'));
        assert_1.default.ok(!vatOffEmail.text.includes('23.25'));
        assert_1.default.ok(!vatOffEmail.text.includes('15.5'));
        assert_1.default.strictEqual((0, ownerRentNotificationPolicy_1.resolveOwnerRentNoticeFigures)(vatOff.payment).figures.vatOnCommission, 0);
        results['4 VAT disabled stays at the stored zero'] = 'PASS';
        const noLevy = fromPipeline({ rent: 1000, levy: 0 });
        const noLevyEmail = compose(noLevy.payment);
        assert_1.default.ok(noLevyEmail.text.includes('Total Amount Paid (including levy, where applicable): USD 1,000.00'));
        assert_1.default.ok(noLevyEmail.text.includes('Less: Levy: USD 0.00'));
        assert_1.default.ok(!noLevyEmail.text.includes('Levy collected with this payment'));
        assert_1.default.ok(!noLevyEmail.text.includes('Amount received'));
        const noLevyResolved = (0, ownerRentNotificationPolicy_1.resolveOwnerRentNoticeFigures)(noLevy.payment);
        if (!noLevyResolved.ok)
            throw new Error(noLevyResolved.reason);
        assert_1.default.strictEqual(noLevyResolved.figures.levy, 0);
        assert_1.default.strictEqual(noLevyResolved.figures.totalPaid, 1000);
        assert_1.default.strictEqual(noLevyResolved.figures.netOwnerAmount, (0, money_1.roundMoney)(noLevyResolved.figures.totalPaid - noLevy.snapshot.commissionNet - noLevy.snapshot.vatAmount));
        results['5 No levy displays zero'] = 'PASS';
        const inclusive = fromPipeline({ rent: 1000, levy: 0, treatment: 'inclusive' });
        const inclusiveFigures = (0, ownerRentNotificationPolicy_1.resolveOwnerRentNoticeFigures)(inclusive.payment);
        if (!inclusiveFigures.ok)
            throw new Error(inclusiveFigures.reason);
        assert_1.default.strictEqual(inclusiveFigures.figures.commission, inclusive.snapshot.commissionNet);
        assert_1.default.strictEqual(inclusiveFigures.figures.vatOnCommission, inclusive.snapshot.vatAmount);
        assert_1.default.strictEqual(inclusiveFigures.figures.netOwnerAmount, inclusive.snapshot.paymentAllocation.ownerPayable);
        assert_1.default.strictEqual(inclusiveFigures.figures.netOwnerAmount, (0, money_1.roundMoney)(inclusive.result.grossRent - inclusive.result.commissionGross));
        assert_1.default.notStrictEqual(inclusiveFigures.figures.netOwnerAmount, (0, money_1.roundMoney)(inclusive.result.grossRent - inclusive.result.commissionGross - inclusive.result.vatAmount));
        assert_1.default.strictEqual(inclusiveFigures.figures.totalPaid, inclusive.snapshot.paymentAllocation.grossAmount);
        assert_1.default.strictEqual(inclusiveFigures.figures.netOwnerAmount, (0, money_1.roundMoney)(inclusiveFigures.figures.totalPaid - inclusiveFigures.figures.commission - inclusiveFigures.figures.vatOnCommission - inclusiveFigures.figures.levy));
        const inclusiveEmail = (0, ownerRentNotificationPolicy_1.buildOwnerRentPaymentEmail)({
            ownerName: 'Amina Dube',
            propertyAddress: ADDRESS,
            figures: inclusiveFigures.figures,
        });
        assert_1.default.ok(inclusiveEmail.text.includes(`Less: Commission: USD ${inclusive.snapshot.commissionNet.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`));
        assert_1.default.ok(!inclusiveEmail.text.includes(String(inclusive.result.ownerAmount + inclusive.result.vatAmount)));
        results['6 VAT-inclusive commission is not deducted twice'] = 'PASS';
        const duplicateEmail = compose(standard.payment);
        const duplicate = memoryStore();
        const duplicateKey = (0, ownerRentNotificationPolicy_1.ownerRentIdempotencyKey)('pay-standard');
        const first = yield (0, ownerRentNotificationPolicy_1.deliverOwnerRentNotice)({
            idempotencyKey: duplicateKey,
            ownerEmail: 'owner@example.com',
            rentPaymentEmails: true,
            accountingComplete: true,
            email: duplicateEmail,
        }, duplicate.store);
        const second = yield (0, ownerRentNotificationPolicy_1.deliverOwnerRentNotice)({
            idempotencyKey: duplicateKey,
            ownerEmail: 'owner@example.com',
            rentPaymentEmails: true,
            accountingComplete: true,
            email: duplicateEmail,
        }, duplicate.store);
        assert_1.default.strictEqual(first, 'SENT');
        assert_1.default.strictEqual(second, 'SENT');
        assert_1.default.strictEqual(duplicate.sent.length, 1);
        results['7 Duplicate completion sends one email'] = 'PASS';
        const failed = (0, ownerRentNotificationPolicy_1.resolveOwnerRentNoticeFigures)(rentalPayment(Object.assign(Object.assign({}, standard.payment), { status: 'failed' })));
        assert_1.default.strictEqual(failed.ok, false);
        if (failed.ok)
            throw new Error('failed payment was accepted');
        assert_1.default.strictEqual(failed.reason, 'payment_not_completed');
        const pending = (0, ownerRentNotificationPolicy_1.resolveOwnerRentNoticeFigures)(Object.assign(Object.assign({}, standard.payment), { status: 'pending' }));
        assert_1.default.strictEqual(pending.ok, false);
        const missingPeriod = (0, ownerRentNotificationPolicy_1.resolveOwnerRentNoticeFigures)(Object.assign(Object.assign({}, standard.payment), { rentalPeriodMonth: undefined, rentalPeriodYear: undefined }));
        assert_1.default.strictEqual(missingPeriod.ok, false);
        if (missingPeriod.ok)
            throw new Error('missing period was accepted');
        assert_1.default.strictEqual(missingPeriod.reason, 'rental_period_missing');
        const brokenAllocation = (0, ownerRentNotificationPolicy_1.resolveOwnerRentNoticeFigures)(Object.assign(Object.assign({}, standard.payment), { commissionDetails: Object.assign(Object.assign({}, standard.payment.commissionDetails), { paymentAllocation: Object.assign(Object.assign({}, (_a = standard.payment.commissionDetails) === null || _a === void 0 ? void 0 : _a.paymentAllocation), { ownerPayable: 1 }) }) }));
        assert_1.default.strictEqual(brokenAllocation.ok, false);
        if (brokenAllocation.ok)
            throw new Error('broken allocation was accepted');
        assert_1.default.strictEqual(brokenAllocation.reason, 'allocation_does_not_reconcile');
        const levyAddedTwice = (0, ownerRentNotificationPolicy_1.resolveOwnerRentNoticeFigures)(Object.assign(Object.assign({}, standard.payment), { commissionDetails: Object.assign(Object.assign({}, standard.payment.commissionDetails), { paymentAllocation: Object.assign(Object.assign({}, (_b = standard.payment.commissionDetails) === null || _b === void 0 ? void 0 : _b.paymentAllocation), { grossAmount: 1100 }) }) }));
        assert_1.default.strictEqual(levyAddedTwice.ok, false);
        if (levyAddedTwice.ok)
            throw new Error('double-counted levy was accepted');
        assert_1.default.strictEqual(levyAddedTwice.reason, 'allocation_does_not_reconcile');
        const missingTotal = (0, ownerRentNotificationPolicy_1.resolveOwnerRentNoticeFigures)(Object.assign(Object.assign({}, standard.payment), { commissionDetails: Object.assign(Object.assign({}, standard.payment.commissionDetails), { paymentAllocation: Object.assign(Object.assign({}, (_c = standard.payment.commissionDetails) === null || _c === void 0 ? void 0 : _c.paymentAllocation), { grossAmount: undefined }) }) }));
        assert_1.default.strictEqual(missingTotal.ok, false);
        if (missingTotal.ok)
            throw new Error('missing total was accepted');
        assert_1.default.strictEqual(missingTotal.reason, 'allocation_incomplete');
        let incompleteSends = 0;
        const notReady = yield (0, ownerRentNotificationPolicy_1.deliverOwnerRentNotice)({
            idempotencyKey: (0, ownerRentNotificationPolicy_1.ownerRentIdempotencyKey)('incomplete'),
            ownerEmail: 'owner@example.com',
            rentPaymentEmails: true,
            accountingComplete: false,
            email: duplicateEmail,
        }, {
            findByKey() {
                return __awaiter(this, void 0, void 0, function* () { return null; });
            },
            save() {
                return __awaiter(this, void 0, void 0, function* () { throw new Error('must not save'); });
            },
            send() {
                return __awaiter(this, void 0, void 0, function* () { incompleteSends += 1; });
            },
        });
        assert_1.default.strictEqual(notReady, 'NOT_READY');
        assert_1.default.strictEqual(incompleteSends, 0);
        assert_1.default.strictEqual((0, ownerRentNotificationPolicy_1.composeOwnerRentNotice)({
            payment: Object.assign(Object.assign({}, standard.payment), { status: 'failed' }),
            ownerName: 'Amina Dube',
            propertyAddress: ADDRESS,
        }).ok, false);
        results['8 Failed or incomplete payments are not confirmed'] = 'PASS';
        const missingContact = memoryStore();
        const missingStatus = yield (0, ownerRentNotificationPolicy_1.deliverOwnerRentNotice)({
            idempotencyKey: (0, ownerRentNotificationPolicy_1.ownerRentIdempotencyKey)('no-email'),
            ownerEmail: '   ',
            rentPaymentEmails: true,
            accountingComplete: true,
            email: duplicateEmail,
        }, missingContact.store);
        assert_1.default.strictEqual(missingStatus, 'FAILED');
        assert_1.default.strictEqual((_d = missingContact.rows.get((0, ownerRentNotificationPolicy_1.ownerRentIdempotencyKey)('no-email'))) === null || _d === void 0 ? void 0 : _d.failureReason, 'Owner email missing');
        assert_1.default.strictEqual(missingContact.sent.length, 0);
        results['9 Missing owner email is recorded and not sent'] = 'PASS';
        assert_1.default.strictEqual((0, ownerRentNotificationPolicy_1.ownerRentNoticeScope)({
            paymentCompanyId: 'company-a',
            propertyCompanyId: 'company-a',
            ownerCompanyId: 'company-a',
        }), true);
        assert_1.default.strictEqual((0, ownerRentNotificationPolicy_1.ownerRentNoticeScope)({
            paymentCompanyId: 'company-a',
            propertyCompanyId: 'company-b',
            ownerCompanyId: 'company-a',
        }), false);
        assert_1.default.strictEqual((0, ownerRentNotificationPolicy_1.ownerRentNoticeScope)({
            paymentCompanyId: 'company-a',
            propertyCompanyId: 'company-a',
            ownerCompanyId: 'company-b',
        }), false);
        const companyA = compose(standard.payment, 'Amina Dube', '1 Company A Close, Harare');
        const companyB = compose(fromPipeline({ rent: 800, levy: 0, rate: 10 }).payment, 'Tendai Moyo', '9 Company B Way, Bulawayo');
        assert_1.default.ok(companyA.text.includes('1 Company A Close, Harare'));
        assert_1.default.ok(!companyA.text.includes('9 Company B Way, Bulawayo'));
        assert_1.default.ok(!companyA.text.includes('Tendai Moyo'));
        assert_1.default.ok(companyB.text.includes('9 Company B Way, Bulawayo'));
        assert_1.default.ok(!companyB.text.includes('1 Company A Close, Harare'));
        assert_1.default.ok(!companyB.text.includes('USD 1,000.00'));
        results['10 Companies do not share payment figures'] = 'PASS';
        const propertyId = 'property-1';
        const selectedOwner = (0, ownerRentNotificationPolicy_1.selectPropertyOwnerForRentNotice)({
            companyId: 'company-a',
            propertyId,
            owners: [
                { id: 'agent-user', companyId: 'company-a', propertyIds: [], active: true },
                { id: 'owner-a', companyId: 'company-a', propertyIds: [propertyId, 'property-2'], active: true },
                { id: 'owner-b', companyId: 'company-b', propertyIds: [propertyId], active: true },
                { id: 'inactive-owner', companyId: 'company-a', propertyIds: [propertyId], active: false },
            ],
        });
        assert_1.default.strictEqual(selectedOwner === null || selectedOwner === void 0 ? void 0 : selectedOwner.id, 'owner-a');
        assert_1.default.strictEqual((0, ownerRentNotificationPolicy_1.selectPropertyOwnerForRentNotice)({
            companyId: 'company-a',
            propertyId,
            owners: [
                { id: 'owner-a', companyId: 'company-a', propertyIds: [propertyId] },
                { id: 'owner-c', companyId: 'company-a', propertyIds: [propertyId] },
            ],
        }), null);
        const noticeService = src('services/ownerRentNotificationService.ts');
        assert_1.default.ok(noticeService.includes('properties: payment.propertyId'));
        assert_1.default.ok(!noticeService.includes('property?.ownerId'));
        results['13 Owner email comes from the property owner property list'] = 'PASS';
        const untouched = fromPipeline({ rent: 1000, levy: 50 }).payment;
        const before = JSON.stringify(untouched);
        let providerAttempts = 0;
        let providerDelivered = 0;
        const providerRows = new Map();
        const providerStore = {
            findByKey(key) {
                return __awaiter(this, void 0, void 0, function* () { return providerRows.get(key) || null; });
            },
            save(doc) {
                return __awaiter(this, void 0, void 0, function* () {
                    providerRows.set(doc.idempotencyKey, { status: doc.status, failureReason: doc.failureReason });
                });
            },
            send() {
                return __awaiter(this, void 0, void 0, function* () {
                    providerAttempts += 1;
                    if (providerAttempts === 1)
                        throw new Error('smtp down');
                    providerDelivered += 1;
                });
            },
        };
        const providerKey = (0, ownerRentNotificationPolicy_1.ownerRentIdempotencyKey)('provider');
        const providerEmail = compose(untouched);
        const failedDelivery = yield (0, ownerRentNotificationPolicy_1.deliverOwnerRentNotice)({
            idempotencyKey: providerKey,
            ownerEmail: 'owner@example.com',
            rentPaymentEmails: true,
            accountingComplete: true,
            email: providerEmail,
        }, providerStore);
        assert_1.default.strictEqual(failedDelivery, 'FAILED');
        assert_1.default.strictEqual(JSON.stringify(untouched), before);
        assert_1.default.strictEqual((_e = providerRows.get(providerKey)) === null || _e === void 0 ? void 0 : _e.status, 'FAILED');
        const retried = yield (0, ownerRentNotificationPolicy_1.deliverOwnerRentNotice)({
            idempotencyKey: providerKey,
            ownerEmail: 'owner@example.com',
            rentPaymentEmails: true,
            accountingComplete: true,
            email: providerEmail,
        }, providerStore);
        assert_1.default.strictEqual(retried, 'SENT');
        assert_1.default.strictEqual(providerDelivered, 1);
        assert_1.default.strictEqual(JSON.stringify(untouched), before);
        results['11 Provider failure keeps the payment intact and can be retried'] = 'PASS';
        const legacy = (0, ownerRentNotificationPolicy_1.buildOwnerRentEmail)({
            ownerName: 'Owner A',
            propertyName: 'Borrowdale Example',
            amount: 1000,
            currency: 'USD',
            paymentDate: new Date('2026-10-01'),
            agencyName: 'The Benjamins Realty',
        });
        assert_1.default.ok(legacy.text.includes('USD 1000.00'));
        assert_1.default.ok(legacy.text.includes('Borrowdale Example'));
        const agent = src('services/agentPaymentNotificationService.ts');
        const inApp = src('models/Notification.ts');
        const workflow = src('agency/workflowNotify.ts');
        const ownerService = src('services/ownerRentNotificationService.ts');
        assert_1.default.ok(agent.includes('export async function sendAgentPaymentNotificationEmail'));
        assert_1.default.ok(agent.includes('sendMail'));
        assert_1.default.ok(!agent.includes('ownerRentNotificationPolicy'));
        assert_1.default.ok(inApp.includes('sendMail'));
        assert_1.default.ok(!inApp.includes('ownerRentNotificationPolicy'));
        assert_1.default.ok(!workflow.includes('ownerRentNotificationPolicy'));
        assert_1.default.ok(!ownerService.includes('postPaymentAccounting'));
        assert_1.default.ok(!ownerService.includes('payment.save'));
        assert_1.default.ok(!ownerService.includes('Payment.update'));
        assert_1.default.ok(ownerService.includes('composeOwnerRentNotice'));
        const hostile = compose(standard.payment, 'Amina <script>alert(1)</script>', '12 <img src=x onerror=alert(1)> Road');
        assert_1.default.ok(!hostile.html.includes('<script>'));
        assert_1.default.ok(hostile.html.includes('&lt;script&gt;'));
        assert_1.default.ok(!hostile.html.includes('<img'));
        assert_1.default.ok(!hostile.text.includes('pay-standard'));
        results['12 Other notifications stay on their existing mail path'] = 'PASS';
        const id = () => new mongoose_1.default.Types.ObjectId();
        function persistedAllocation(input) {
            const built = fromPipeline(input);
            const doc = new Payment_1.Payment({
                paymentType: 'rental',
                propertyType: 'residential',
                propertyId: id(),
                tenantId: id(),
                agentId: id(),
                companyId: id(),
                paymentDate: new Date('2027-04-01'),
                paymentMethod: 'cash',
                amount: input.rent + (input.levy || 0),
                rentalPeriodMonth: 4,
                rentalPeriodYear: 2027,
                processedBy: id(),
                commissionDetails: built.snapshot,
                status: 'completed',
                currency: 'USD',
            });
            const stored = doc.get('commissionDetails.paymentAllocation');
            return { built, stored };
        }
        function assertWaterfall(stored, levy, vatExpected) {
            assert_1.default.ok(stored, 'paymentAllocation was stripped on cast');
            assert_1.default.strictEqual(stored.grossAmount, (0, money_1.roundMoney)(stored.rent + stored.levy));
            assert_1.default.strictEqual(stored.levy, levy);
            assert_1.default.strictEqual(stored.source, 'canonical_payment_allocation');
            if (vatExpected === 'zero')
                assert_1.default.strictEqual(stored.vatOnCommission, 0);
            else
                assert_1.default.ok(stored.vatOnCommission > 0);
            assert_1.default.strictEqual(stored.ownerPayable, (0, money_1.roundMoney)(stored.grossAmount - stored.commissionNet - stored.vatOnCommission - stored.levy));
        }
        const vatOnLevyOff = persistedAllocation({ rent: 1900, levy: 0, vatOn: true, treatment: 'exclusive', rate: 10 });
        assertWaterfall(vatOnLevyOff.stored, 0, 'positive');
        results['14 VAT on and levy off persists allocation'] = 'PASS';
        const vatOffLevyOn = persistedAllocation({ rent: 1800, levy: 100, vatOn: false, rate: 10 });
        assertWaterfall(vatOffLevyOn.stored, 100, 'zero');
        assert_1.default.strictEqual(vatOffLevyOn.stored.vatOnCommission, 0);
        results['15 VAT off and levy on persists allocation'] = 'PASS';
        const bothOn = persistedAllocation({ rent: 1800, levy: 100, vatOn: true, treatment: 'exclusive', rate: 10 });
        assertWaterfall(bothOn.stored, 100, 'positive');
        results['16 VAT on and levy on persists allocation'] = 'PASS';
        const bothOff = persistedAllocation({ rent: 1900, levy: 0, vatOn: false, rate: 10 });
        assertWaterfall(bothOff.stored, 0, 'zero');
        results['17 VAT off and levy off persists allocation'] = 'PASS';
        const inclusiveStored = persistedAllocation({ rent: 1000, levy: 50, vatOn: true, treatment: 'inclusive', rate: 15 });
        assertWaterfall(inclusiveStored.stored, 50, 'positive');
        assert_1.default.strictEqual((0, money_1.roundMoney)(inclusiveStored.stored.commissionNet + inclusiveStored.stored.vatOnCommission), inclusiveStored.built.result.commissionGross);
        results['18 Inclusive VAT is deducted once'] = 'PASS';
        const exclusiveStored = persistedAllocation({ rent: 1000, levy: 50, vatOn: true, treatment: 'exclusive', rate: 15 });
        assertWaterfall(exclusiveStored.stored, 50, 'positive');
        assert_1.default.ok(exclusiveStored.stored.vatOnCommission > 0);
        results['19 Exclusive VAT is stored on the allocation'] = 'PASS';
        const bare = new Payment_1.Payment({
            paymentType: 'rental',
            propertyType: 'residential',
            propertyId: id(),
            tenantId: id(),
            agentId: id(),
            companyId: id(),
            paymentDate: new Date('2027-03-01'),
            paymentMethod: 'cash',
            amount: 1900,
            rentalPeriodMonth: 3,
            rentalPeriodYear: 2027,
            processedBy: id(),
            commissionDetails: {
                totalCommission: 190,
                preaFee: 0,
                agentShare: 0,
                agencyShare: 190,
                ownerAmount: 1710,
            },
            status: 'completed',
            accountingComplete: true,
            currency: 'USD',
        });
        assert_1.default.strictEqual(bare.get('commissionDetails.paymentAllocation'), undefined);
        assert_1.default.strictEqual(bare.get('commissionDetails.paymentAllocation.grossAmount'), undefined);
        const missingAllocation = (0, ownerRentNotificationPolicy_1.resolveOwnerRentNoticeFigures)({
            status: 'completed',
            paymentType: 'rental',
            currency: 'USD',
            amount: 1900,
            rentalPeriodMonth: 3,
            rentalPeriodYear: 2027,
            commissionDetails: {
                totalCommission: 190,
                ownerAmount: 1710,
                commissionNet: 190,
                vatOnCommission: 0,
                levy: 0,
            },
        });
        assert_1.default.strictEqual(missingAllocation.ok, false);
        if (missingAllocation.ok)
            throw new Error('missing allocation must refuse');
        assert_1.default.strictEqual(missingAllocation.reason, 'allocation_incomplete');
        results['20 Missing allocation is not invented'] = 'PASS';
        const noGross = fromPipeline({ rent: 1900, levy: 0, vatOn: false });
        (_f = noGross.snapshot.paymentAllocation) === null || _f === void 0 ? true : delete _f.grossAmount;
        const missingGross = (0, ownerRentNotificationPolicy_1.resolveOwnerRentNoticeFigures)(noGross.payment);
        assert_1.default.strictEqual(missingGross.ok, false);
        if (missingGross.ok)
            throw new Error('missing gross must refuse');
        assert_1.default.strictEqual(missingGross.reason, 'allocation_incomplete');
        results['21 Missing grossAmount is not treated as zero'] = 'PASS';
        const badOwner = fromPipeline({ rent: 1900, levy: 0, vatOn: false });
        badOwner.snapshot.paymentAllocation.ownerPayable = 1;
        const badPayable = (0, ownerRentNotificationPolicy_1.resolveOwnerRentNoticeFigures)(badOwner.payment);
        assert_1.default.strictEqual(badPayable.ok, false);
        if (badPayable.ok)
            throw new Error('bad owner payable must refuse');
        assert_1.default.strictEqual(badPayable.reason, 'allocation_does_not_reconcile');
        results['22 Incorrect ownerPayable is refused'] = 'PASS';
        const postedWithoutAllocation = (0, ownerRentNotificationPolicy_1.resolveOwnerRentNoticeFigures)({
            status: 'completed',
            paymentType: 'rental',
            currency: 'USD',
            amount: 1900,
            rentalPeriodMonth: 4,
            rentalPeriodYear: 2027,
            commissionDetails: {
                totalCommission: 190,
                ownerAmount: 1710,
                commissionNet: 190,
                vatAmount: 0,
                levy: 100,
            },
        });
        assert_1.default.strictEqual(postedWithoutAllocation.ok, false);
        results['23 Accounting complete without allocation does not send'] = 'PASS';
        const agentCreate = src('controllers/agentController.ts');
        const createBody = agentCreate.slice(agentCreate.indexOf('export const createAgentPayment'), agentCreate.indexOf('export const updateAgentPayment'));
        const allocationAt = createBody.indexOf('applyLevyPassThroughToSnapshot');
        const saveAt = createBody.indexOf('await payment.save()');
        const postAt = createBody.indexOf('ensurePaymentAccountingPosted');
        const notifyAt = createBody.indexOf('notifyOwnerOfRentPayment');
        assert_1.default.ok(allocationAt > 0 && allocationAt < saveAt);
        assert_1.default.ok(saveAt < postAt);
        assert_1.default.ok(postAt < notifyAt);
        assert_1.default.ok(createBody.includes('postResult.accountingComplete === true'));
        assert_1.default.ok(src('models/Payment.ts').includes('paymentAllocation:'));
        assert_1.default.ok(!src('services/ownerRentNotificationService.ts').includes('allocateRentalReceipt'));
        assert_1.default.ok(!src('services/ownerRentNotificationPolicy.ts').includes('allocateRentalReceipt'));
        results['24 Allocation is stored before accounting and mail'] = 'PASS';
        console.log(JSON.stringify(results, null, 2));
    });
}
main().catch((error) => {
    console.error(error);
    process.exit(1);
});
