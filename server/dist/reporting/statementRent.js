"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveStatementRentAmount = exports.explainStatementRentAmount = void 0;
const money_1 = require("../utils/money");
/**
 * Landlord-facing rent component from stored payment fields.
 * Does not reconstruct rent from commission + owner amount.
 * commissionBase is rent less levy, so a stored levy is restored only when rentUsed/rentAllocated are absent.
 * payment.amount is a last-resort stored snapshot used only when no rent snapshot fields exist.
 * The source tells the receipt total whether this figure already includes the levy.
 */
const explainStatementRentAmount = (input) => {
    const months = Math.max(1, Number(input.advanceMonthsPaid || 1));
    const rentUsed = Number(input.rentUsed);
    if (Number.isFinite(rentUsed) && rentUsed > 0) {
        return { amount: (0, money_1.roundMoney)(rentUsed * months), source: 'rent_used' };
    }
    const rentAllocated = Number(input.rentAllocated);
    if (Number.isFinite(rentAllocated) && rentAllocated > 0) {
        return { amount: (0, money_1.roundMoney)(rentAllocated), source: 'rent_allocated' };
    }
    const storedGrossRent = Number(input.grossRent);
    if (Number.isFinite(storedGrossRent) && storedGrossRent > 0) {
        return { amount: (0, money_1.roundMoney)(storedGrossRent), source: 'stored_gross_rent' };
    }
    const commissionBase = Number(input.commissionBase);
    if (Number.isFinite(commissionBase) && commissionBase > 0) {
        const levy = Number(input.levy);
        const storedLevy = Number.isFinite(levy) && levy > 0 ? levy : 0;
        return { amount: (0, money_1.roundMoney)(commissionBase + storedLevy), source: 'commission_base_plus_levy' };
    }
    const amount = Number(input.amount);
    if (Number.isFinite(amount) && amount > 0) {
        return { amount: (0, money_1.roundMoney)(amount), source: 'payment_amount' };
    }
    return {};
};
exports.explainStatementRentAmount = explainStatementRentAmount;
const resolveStatementRentAmount = (input) => (0, exports.explainStatementRentAmount)(input).amount;
exports.resolveStatementRentAmount = resolveStatementRentAmount;
