"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildAgentReceiptJournal = buildAgentReceiptJournal;
exports.buildAgentReceiptReversal = buildAgentReceiptReversal;
exports.buildVatPaymentJournal = buildVatPaymentJournal;
exports.buildWithholdingJournal = buildWithholdingJournal;
exports.buildWithholdingRemittanceJournal = buildWithholdingRemittanceJournal;
const money_1 = require("../../utils/money");
const chartAccounts_1 = require("./chartAccounts");
/**
 * Agent collection: receipt is client money. Company recognises commission only.
 * Dr Trust Bank / Cr owner or seller payable / Cr agency revenue / Cr VAT payable.
 */
function buildAgentReceiptJournal(input) {
    const amount = (0, money_1.roundMoney)(Math.max(0, Number(input.amount || 0)));
    const commissionNet = (0, money_1.roundMoney)(Math.max(0, Number(input.commissionNet || 0)));
    const vatAmount = (0, money_1.roundMoney)(Math.max(0, Number(input.vatAmount || 0)));
    const isSale = String(input.paymentType || '') === 'sale';
    const payableAccount = isSale ? chartAccounts_1.GL.SELLER_PAYABLE : chartAccounts_1.GL.OWNER_PAYABLE;
    const revenueAccount = isSale ? chartAccounts_1.GL.SALES_COMMISSION_REVENUE : chartAccounts_1.GL.AGENCY_REVENUE;
    const residual = (0, money_1.roundMoney)(Math.max(0, amount - commissionNet - vatAmount));
    const levyLiability = isSale ? 0 : (0, money_1.roundMoney)(Math.min(Math.max(0, Number(input.levyAmount || 0)), residual));
    const ownerLiability = (0, money_1.roundMoney)(Math.max(0, residual - levyLiability));
    const lines = [];
    if (amount > 0) {
        lines.push({
            accountCode: chartAccounts_1.GL.TRUST_BANK,
            debit: amount,
            propertyId: input.propertyId,
            agentId: input.agentId
        });
    }
    if (commissionNet > 0) {
        lines.push({ accountCode: revenueAccount, credit: commissionNet });
    }
    if (vatAmount > 0) {
        lines.push({ accountCode: chartAccounts_1.GL.VAT_PAYABLE, credit: vatAmount });
    }
    if (ownerLiability > 0) {
        lines.push({
            accountCode: payableAccount,
            credit: ownerLiability,
            propertyId: input.propertyId
        });
    }
    if (levyLiability > 0) {
        lines.push({
            accountCode: chartAccounts_1.GL.LEVY_PAYABLE,
            credit: levyLiability,
            propertyId: input.propertyId
        });
    }
    const debit = (0, money_1.roundMoney)(lines.reduce((s, l) => s + Number(l.debit || 0), 0));
    const credit = (0, money_1.roundMoney)(lines.reduce((s, l) => s + Number(l.credit || 0), 0));
    return {
        lines,
        trustDebit: amount,
        ownerLiability,
        levyLiability,
        companyRevenue: commissionNet,
        vatLiability: vatAmount,
        payableAccount,
        revenueAccount,
        balanced: debit === credit
    };
}
function buildAgentReceiptReversal(input) {
    const posted = buildAgentReceiptJournal(input);
    return posted.lines.map((line) => ({
        accountCode: line.accountCode,
        debit: line.credit,
        credit: line.debit,
        propertyId: line.propertyId,
        agentId: line.agentId
    }));
}
function buildVatPaymentJournal(input) {
    const amount = (0, money_1.roundMoney)(Math.max(0, Number(input.amount || 0)));
    if (!(amount > 0))
        return [];
    const unallocated = (0, money_1.roundMoney)(Math.max(0, Number(input.unallocatedAmount || 0)));
    const allocated = input.allocatedAmount != null
        ? (0, money_1.roundMoney)(Math.max(0, Number(input.allocatedAmount)))
        : (0, money_1.roundMoney)(amount - unallocated);
    const lines = [];
    if (allocated > 0)
        lines.push({ accountCode: chartAccounts_1.GL.VAT_PAYABLE, debit: allocated });
    if (unallocated > 0)
        lines.push({ accountCode: chartAccounts_1.GL.TAX_PREPAYMENT, debit: unallocated });
    lines.push({ accountCode: input.bankAccountCode || chartAccounts_1.GL.COMPANY_BANK, credit: amount });
    return lines;
}
function buildWithholdingJournal(input) {
    const amount = (0, money_1.roundMoney)(Math.max(0, Number(input.amount || 0)));
    if (!(amount > 0))
        return [];
    return [
        { accountCode: input.fromPayableAccount, debit: amount, propertyId: input.propertyId },
        { accountCode: chartAccounts_1.GL.ZIMRA_WITHHOLDING, credit: amount }
    ];
}
function buildWithholdingRemittanceJournal(input) {
    const amount = (0, money_1.roundMoney)(Math.max(0, Number(input.amount || 0)));
    if (!(amount > 0))
        return [];
    return [
        { accountCode: chartAccounts_1.GL.ZIMRA_WITHHOLDING, debit: amount },
        { accountCode: input.bankAccountCode || chartAccounts_1.GL.TRUST_BANK, credit: amount }
    ];
}
