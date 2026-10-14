"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sumCompleteTaxAmounts = sumCompleteTaxAmounts;
exports.netFromNullable = netFromNullable;
const money_1 = require("../../utils/money");
/**
 * Sum tax projection amounts without converting NOT_CALCULATED (null) into 0.
 * If any applicable row is missing an amount, the total is null.
 */
function sumCompleteTaxAmounts(rows, getAmount) {
    const applicable = (rows || []).filter((row) => {
        const status = String(row.calculationStatus || '');
        return status !== 'NOT_APPLICABLE';
    });
    if (!applicable.length)
        return null;
    const amounts = applicable.map((row) => getAmount(row));
    if (amounts.some((value) => value == null))
        return null;
    return (0, money_1.roundMoney)(amounts.reduce((sum, value) => sum + Number(value), 0));
}
function netFromNullable(left, right) {
    if (left == null && right == null)
        return null;
    if (left == null || right == null)
        return null;
    return (0, money_1.roundMoney)(left - right);
}
