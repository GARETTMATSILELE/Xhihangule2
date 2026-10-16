"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.explainOwnerWaterfall = explainOwnerWaterfall;
const money_1 = require("../utils/money");
function explainOwnerWaterfall(input) {
    const grossAmount = (0, money_1.roundMoney)(input.grossAmount);
    const commissionAmount = (0, money_1.roundMoney)(input.commissionAmount);
    const levyAmount = (0, money_1.roundMoney)(input.levyAmount);
    const vatOnCommission = (0, money_1.roundMoney)(input.vatOnCommission);
    const netOwnerAmount = (0, money_1.roundMoney)(grossAmount - commissionAmount - levyAmount - vatOnCommission);
    const recordedOwnerAmount = input.recordedOwnerAmount == null
        ? undefined
        : (0, money_1.roundMoney)(input.recordedOwnerAmount);
    const difference = recordedOwnerAmount == null ? 0 : (0, money_1.moneyDifference)(netOwnerAmount, recordedOwnerAmount);
    return {
        grossAmount,
        commissionAmount,
        levyAmount,
        vatOnCommission,
        vatRate: input.vatRate,
        netOwnerAmount,
        recordedOwnerAmount,
        difference,
        reviewRequired: recordedOwnerAmount != null && !(0, money_1.moneyAmountsMatch)(netOwnerAmount, recordedOwnerAmount),
        formula: 'Total amount received − commission − levy − VAT on commission = net amount due to owner'
    };
}
