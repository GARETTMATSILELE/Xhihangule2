"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveStatementRentAmount = void 0;
const money_1 = require("../utils/money");
/**
 * Landlord-facing Rent Amount from stored payment/property rent fields.
 * Does not reconstruct rent from commission + owner amount.
 * commissionBase is rent less levy, so a stored levy is restored only when rentUsed/rentAllocated are absent.
 * payment.amount is a last-resort stored snapshot used only when no rent snapshot fields exist.
 */
const resolveStatementRentAmount = (input) => {
    const months = Math.max(1, Number(input.advanceMonthsPaid || 1));
    const rentUsed = Number(input.rentUsed);
    if (Number.isFinite(rentUsed) && rentUsed > 0) {
        return (0, money_1.roundMoney)(rentUsed * months);
    }
    const rentAllocated = Number(input.rentAllocated);
    if (Number.isFinite(rentAllocated) && rentAllocated > 0) {
        return (0, money_1.roundMoney)(rentAllocated);
    }
    const storedGrossRent = Number(input.grossRent);
    if (Number.isFinite(storedGrossRent) && storedGrossRent > 0) {
        return (0, money_1.roundMoney)(storedGrossRent);
    }
    const commissionBase = Number(input.commissionBase);
    if (Number.isFinite(commissionBase) && commissionBase > 0) {
        const levy = Number(input.levy);
        const storedLevy = Number.isFinite(levy) && levy > 0 ? levy : 0;
        return (0, money_1.roundMoney)(commissionBase + storedLevy);
    }
    const amount = Number(input.amount);
    if (Number.isFinite(amount) && amount > 0) {
        return (0, money_1.roundMoney)(amount);
    }
    return undefined;
};
exports.resolveStatementRentAmount = resolveStatementRentAmount;
