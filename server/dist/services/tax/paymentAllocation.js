"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.allocateRentalReceipt = allocateRentalReceipt;
exports.allocationBalances = allocationBalances;
const money_1 = require("../../utils/money");
/**
 * Single authoritative rental receipt split.
 * Levy is a separate client liability (body corporate / municipality pass-through).
 * Owner payable is the residual after commission, VAT on commission, levy, and other deductions.
 *
 * Trust residual = owner payable + levy payable = gross − company revenue − VAT − other deductions.
 */
function allocateRentalReceipt(input) {
    const grossAmount = (0, money_1.roundMoney)(Math.max(0, Number(input.amount || 0)));
    const levy = (0, money_1.roundMoney)(Math.max(0, Number(input.levy || 0)));
    const rent = (0, money_1.roundMoney)(Math.max(0, Number(input.rent != null ? input.rent : grossAmount - levy)));
    const commissionNet = (0, money_1.roundMoney)(Math.max(0, Number(input.commissionNet || 0)));
    const vatOnCommission = (0, money_1.roundMoney)(Math.max(0, Number(input.vatOnCommission || 0)));
    const otherDeductions = (0, money_1.roundMoney)(Math.max(0, Number(input.otherDeductions || 0)));
    const commissionBase = (0, money_1.roundMoney)(Math.max(0, Number(input.commissionBase != null ? input.commissionBase : rent)));
    const companyRevenue = commissionNet;
    const trustLiability = (0, money_1.roundMoney)(Math.max(0, grossAmount - companyRevenue - vatOnCommission - otherDeductions));
    const levyPayable = (0, money_1.roundMoney)(Math.min(levy, trustLiability));
    const ownerPayable = (0, money_1.roundMoney)(Math.max(0, trustLiability - levyPayable));
    return {
        grossAmount,
        rent,
        levy,
        commissionBase,
        commission: commissionNet,
        commissionNet,
        vatOnCommission,
        otherDeductions,
        ownerPayable,
        levyPayable,
        companyRevenue,
        taxLiabilities: { vatOnCommission },
        trustLiability,
        source: 'canonical_payment_allocation'
    };
}
function allocationBalances(allocation) {
    const credits = (0, money_1.roundMoney)(allocation.companyRevenue +
        allocation.vatOnCommission +
        allocation.otherDeductions +
        allocation.ownerPayable +
        allocation.levyPayable);
    return credits === allocation.grossAmount && allocation.trustLiability === (0, money_1.roundMoney)(allocation.ownerPayable + allocation.levyPayable);
}
