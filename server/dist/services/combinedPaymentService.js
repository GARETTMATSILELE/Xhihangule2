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
exports.sumRentPaidForPeriod = sumRentPaidForPeriod;
exports.sumLevyPaidForPeriod = sumLevyPaidForPeriod;
exports.loadPropertyCombinedBaselines = loadPropertyCombinedBaselines;
exports.allocateCombinedAmount = allocateCombinedAmount;
exports.resolveCombinedRentalAllocation = resolveCombinedRentalAllocation;
exports.createLinkedLevyPayment = createLinkedLevyPayment;
exports.voidLinkedLevyPayment = voidLinkedLevyPayment;
const mongoose_1 = __importDefault(require("mongoose"));
const Property_1 = require("../models/Property");
const Payment_1 = require("../models/Payment");
const LevyPayment_1 = require("../models/LevyPayment");
const cents = (n) => Math.round(Number(n || 0) * 100);
/** Sum rent applied for a rental period (uses rentAllocated when present). */
function sumRentPaidForPeriod(params) {
    return __awaiter(this, void 0, void 0, function* () {
        const [agg] = yield Payment_1.Payment.aggregate([
            {
                $match: {
                    companyId: params.companyId,
                    paymentType: 'rental',
                    propertyId: params.propertyId,
                    tenantId: params.tenantId,
                    rentalPeriodYear: params.rentalPeriodYear,
                    rentalPeriodMonth: params.rentalPeriodMonth,
                    status: { $in: ['pending', 'completed'] },
                },
            },
            {
                $group: {
                    _id: null,
                    total: {
                        $sum: {
                            $cond: [
                                { $gt: [{ $ifNull: ['$rentAllocated', 0] }, 0] },
                                '$rentAllocated',
                                '$amount',
                            ],
                        },
                    },
                },
            },
        ]);
        return Number((agg === null || agg === void 0 ? void 0 : agg.total) || 0);
    });
}
/** Sum levy paid for a property period (from LevyPayment collection). */
function sumLevyPaidForPeriod(params) {
    return __awaiter(this, void 0, void 0, function* () {
        const [agg] = yield LevyPayment_1.LevyPayment.aggregate([
            {
                $match: {
                    companyId: params.companyId,
                    propertyId: params.propertyId,
                    levyPeriodYear: params.levyPeriodYear,
                    levyPeriodMonth: params.levyPeriodMonth,
                    status: { $in: ['pending', 'completed'] },
                },
            },
            { $group: { _id: null, total: { $sum: '$amount' } } },
        ]);
        return Number((agg === null || agg === void 0 ? void 0 : agg.total) || 0);
    });
}
function loadPropertyCombinedBaselines(propertyId) {
    return __awaiter(this, void 0, void 0, function* () {
        const property = yield Property_1.Property.findById(propertyId)
            .select('rent levyOrMunicipalType levyOrMunicipalAmount')
            .lean();
        const monthlyRent = Number((property === null || property === void 0 ? void 0 : property.rent) || 0);
        const isLevy = String((property === null || property === void 0 ? void 0 : property.levyOrMunicipalType) || '').toLowerCase() === 'levy';
        const monthlyLevy = isLevy ? Number((property === null || property === void 0 ? void 0 : property.levyOrMunicipalAmount) || 0) : 0;
        return { monthlyRent, monthlyLevy, hasLevy: isLevy && monthlyLevy > 0 };
    });
}
/** Levy-first allocation from a cash amount (excluding deposit). */
function allocateCombinedAmount(amount, levyRemaining, rentRemaining) {
    const amountCents = cents(amount);
    const levyRemCents = Math.max(0, cents(levyRemaining));
    const rentRemCents = Math.max(0, cents(rentRemaining));
    const levyAllocatedCents = Math.min(amountCents, levyRemCents);
    const rentAllocatedCents = amountCents - levyAllocatedCents;
    return {
        levyAllocated: levyAllocatedCents / 100,
        rentAllocated: rentAllocatedCents / 100,
    };
}
function resolveCombinedRentalAllocation(input) {
    return __awaiter(this, void 0, void 0, function* () {
        const amountNum = Number(input.amount || 0);
        const depositNum = Number(input.depositAmount || 0);
        const isDepositOnly = amountNum <= 0 && depositNum > 0;
        const advanceMonths = Number(input.advanceMonthsPaid || 1);
        const isAdvance = advanceMonths > 1;
        const baselines = yield loadPropertyCombinedBaselines(input.propertyId);
        const rentUsed = Number(input.rentUsed || baselines.monthlyRent || 0);
        const levyUsed = Number(input.levyUsed || baselines.monthlyLevy || 0);
        if (!baselines.hasLevy) {
            if (isDepositOnly) {
                return { rentAllocated: 0, levyAllocated: 0, rentUsed, levyUsed: 0, hasLevy: false, monthlyLevy: 0 };
            }
            return { rentAllocated: amountNum, levyAllocated: 0, rentUsed, levyUsed: 0, hasLevy: false, monthlyLevy: 0 };
        }
        if (isDepositOnly) {
            return { rentAllocated: 0, levyAllocated: 0, rentUsed, levyUsed, hasLevy: true, monthlyLevy: baselines.monthlyLevy };
        }
        if (isAdvance) {
            const expectedRentCents = cents(rentUsed) * advanceMonths;
            const expectedLevyCents = cents(levyUsed) * advanceMonths;
            const expectedTotalCents = expectedRentCents + expectedLevyCents;
            const amountCents = cents(amountNum);
            if (expectedTotalCents > 0 && amountCents !== expectedTotalCents) {
                return {
                    status: 400,
                    message: `Amount must equal (rent ${rentUsed} + levy ${levyUsed}) x months (${advanceMonths}) = ${(expectedTotalCents / 100).toFixed(2)}`,
                };
            }
            return {
                rentAllocated: expectedRentCents / 100,
                levyAllocated: expectedLevyCents / 100,
                rentUsed,
                levyUsed,
                hasLevy: true,
                monthlyLevy: baselines.monthlyLevy,
            };
        }
        const levyPaid = yield sumLevyPaidForPeriod({
            companyId: input.companyId,
            propertyId: input.propertyId,
            levyPeriodMonth: input.rentalPeriodMonth,
            levyPeriodYear: input.rentalPeriodYear,
        });
        const rentPaid = yield sumRentPaidForPeriod({
            companyId: input.companyId,
            propertyId: input.propertyId,
            tenantId: input.tenantId,
            rentalPeriodMonth: input.rentalPeriodMonth,
            rentalPeriodYear: input.rentalPeriodYear,
        });
        const levyRemaining = Math.max(0, levyUsed - levyPaid);
        const rentRemaining = Math.max(0, rentUsed - rentPaid);
        const combinedRemaining = levyRemaining + rentRemaining;
        if (combinedRemaining <= 0) {
            return { status: 409, message: 'This month is fully paid (rent and levy). Change rental month.' };
        }
        const amountCents = cents(amountNum);
        if (amountCents > cents(combinedRemaining)) {
            return {
                status: 400,
                message: `Only ${combinedRemaining.toFixed(2)} remains for this month (rent + levy). Enter an amount ≤ remaining.`,
            };
        }
        const { levyAllocated, rentAllocated } = allocateCombinedAmount(amountNum, levyRemaining, rentRemaining);
        if (cents(rentAllocated) > cents(rentRemaining)) {
            return {
                status: 400,
                message: `Only ${rentRemaining.toFixed(2)} rent remains for this month after levy allocation.`,
            };
        }
        if (cents(levyAllocated) > cents(levyRemaining)) {
            return {
                status: 400,
                message: `Only ${levyRemaining.toFixed(2)} levy remains for this month.`,
            };
        }
        return { rentAllocated, levyAllocated, rentUsed, levyUsed, hasLevy: true, monthlyLevy: baselines.monthlyLevy };
    });
}
function createLinkedLevyPayment(payment, session) {
    return __awaiter(this, void 0, void 0, function* () {
        const levyAmount = Number(payment.levyAllocated || 0);
        if (levyAmount <= 0)
            return undefined;
        const levyPayment = new LevyPayment_1.LevyPayment({
            paymentType: 'levy',
            propertyId: payment.propertyId,
            companyId: payment.companyId,
            paymentDate: payment.paymentDate,
            paymentMethod: payment.paymentMethod,
            amount: levyAmount,
            referenceNumber: payment.referenceNumber
                ? `${payment.referenceNumber}-LEV`
                : `LEV-${String(payment._id).slice(-6)}`,
            notes: payment.notes
                ? `Linked to rental payment ${payment.referenceNumber || payment._id}. ${payment.notes}`
                : `Linked to rental payment ${payment.referenceNumber || payment._id}`,
            processedBy: payment.processedBy,
            status: 'completed',
            currency: payment.currency || 'USD',
            monthlyLevies: payment.levyUsed,
            levyPeriodMonth: payment.rentalPeriodMonth,
            levyPeriodYear: payment.rentalPeriodYear,
            advanceMonthsPaid: payment.advanceMonthsPaid || 1,
            advancePeriodStart: payment.advancePeriodStart,
            advancePeriodEnd: payment.advancePeriodEnd,
            parentPaymentId: payment._id,
        });
        yield levyPayment.save(session ? { session } : undefined);
        return levyPayment._id;
    });
}
/** Void linked levy when a rental payment is reversed. */
function voidLinkedLevyPayment(linkedLevyPaymentId, reason, session) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!linkedLevyPaymentId)
            return;
        yield LevyPayment_1.LevyPayment.updateOne({ _id: new mongoose_1.default.Types.ObjectId(String(linkedLevyPaymentId)) }, {
            $set: {
                status: 'failed',
                notes: `Voided: ${reason}`,
            },
        }, session ? { session } : undefined);
    });
}
