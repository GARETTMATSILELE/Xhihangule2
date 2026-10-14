"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.classifyReceiptControlStatus = classifyReceiptControlStatus;
exports.canonicalRentLevyExample = canonicalRentLevyExample;
const money_1 = require("../utils/money");
const paymentAllocation_1 = require("./tax/paymentAllocation");
const principalAgentJournal_1 = require("./tax/principalAgentJournal");
const chartAccounts_1 = require("./tax/chartAccounts");
function classifyReceiptControlStatus(input) {
    const paymentAmount = (0, money_1.roundMoney)(Math.max(0, Number(input.paymentAmount || 0)));
    const rent = (0, money_1.roundMoney)(Math.max(0, Number(input.rent || 0)));
    const levy = (0, money_1.roundMoney)(Math.max(0, Number(input.levy || 0)));
    const expected = (0, money_1.roundMoney)(rent + levy);
    if (!(paymentAmount > 0)) {
        return { status: 'UNALLOCATED', unallocatedAmount: 0 };
    }
    if (!(expected > 0)) {
        return { status: 'REQUIRES_REVIEW', unallocatedAmount: paymentAmount };
    }
    const unallocatedAmount = (0, money_1.roundMoney)(Math.max(0, paymentAmount - expected));
    if (unallocatedAmount > 0.005) {
        return { status: 'OVERPAYMENT', unallocatedAmount };
    }
    if (paymentAmount + 0.005 < expected) {
        return { status: 'PARTIALLY_ALLOCATED', unallocatedAmount: 0 };
    }
    return { status: 'FULLY_ALLOCATED', unallocatedAmount: 0 };
}
function canonicalRentLevyExample() {
    const allocation = (0, paymentAllocation_1.allocateRentalReceipt)({
        amount: 1050,
        rent: 1000,
        levy: 50,
        commissionBase: 1000,
        commissionNet: 150,
        vatOnCommission: 23.25
    });
    const journal = (0, principalAgentJournal_1.buildAgentReceiptJournal)({
        paymentType: 'rental',
        amount: allocation.grossAmount,
        ownerAmount: allocation.ownerPayable,
        commissionNet: allocation.commissionNet,
        vatAmount: allocation.vatOnCommission,
        levyAmount: allocation.levyPayable
    });
    return {
        allocation,
        journalAgrees: (0, paymentAllocation_1.allocationBalances)(allocation) &&
            journal.companyRevenue === 150 &&
            journal.ownerLiability === 826.75 &&
            journal.levyLiability === 50 &&
            journal.lines.some((l) => l.accountCode === chartAccounts_1.GL.TRUST_BANK && l.debit === 1050) &&
            journal.lines.some((l) => l.accountCode === chartAccounts_1.GL.AGENCY_REVENUE && l.credit === 150),
        companyRevenueIsCommission: allocation.companyRevenue === 150 && allocation.grossAmount === 1050
    };
}
