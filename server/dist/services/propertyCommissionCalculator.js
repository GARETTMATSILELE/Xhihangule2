"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.applyLevyPassThroughToSnapshot = exports.toPaymentCommissionSnapshot = exports.calculatePropertyCommission = exports.sanitizePropertyVatSettings = exports.normalizeVatCommissionTreatment = void 0;
const money_1 = require("../utils/money");
const paymentAllocation_1 = require("./tax/paymentAllocation");
const clampUnit = (value, fallback) => Math.max(0, Math.min(1, Number.isFinite(Number(value)) ? Number(value) : fallback));
const splitCommission = (splitBase, options) => {
    const preaPercentOfTotal = clampUnit(options.preaPercentOfTotal, 0.03);
    const agentPercentOfRemaining = clampUnit(options.agentPercentOfRemaining, 0.6);
    const agencyPercentOfRemaining = clampUnit(options.agencyPercentOfRemaining, 0.4);
    const preaFee = (0, money_1.roundMoney)(splitBase * preaPercentOfTotal);
    const remainingCommission = (0, money_1.roundMoney)(splitBase - preaFee);
    const agentShare = (0, money_1.roundMoney)(remainingCommission * agentPercentOfRemaining);
    const agencyShare = (0, money_1.roundMoney)(remainingCommission * agencyPercentOfRemaining);
    return { preaFee, agentShare, agencyShare };
};
const normalizeVatCommissionTreatment = (vatOnCommission, treatment) => {
    if (!vatOnCommission)
        return undefined;
    return String(treatment || '').toLowerCase() === 'inclusive' ? 'inclusive' : 'exclusive';
};
exports.normalizeVatCommissionTreatment = normalizeVatCommissionTreatment;
const sanitizePropertyVatSettings = (input) => {
    const vatOnCommission = Boolean(input.vatOnCommission);
    return {
        vatOnCommission,
        vatCommissionTreatment: (0, exports.normalizeVatCommissionTreatment)(vatOnCommission, input.vatCommissionTreatment)
    };
};
exports.sanitizePropertyVatSettings = sanitizePropertyVatSettings;
const calculatePropertyCommission = (input) => {
    const grossRent = (0, money_1.roundMoney)(Math.max(0, Number(input.grossRent || 0)));
    const levy = (0, money_1.roundMoney)(Math.max(0, Number(input.levy || 0)));
    const commissionRate = Math.max(0, Number(input.commissionPercentage || 0));
    const commissionBase = (0, money_1.roundMoney)(Math.max(0, grossRent - levy));
    const vatOnCommission = Boolean(input.vatOnCommission);
    const isIntroduction = input.commissionType === 'introduction';
    const vatTreatment = isIntroduction && vatOnCommission
        ? 'inclusive'
        : (0, exports.normalizeVatCommissionTreatment)(vatOnCommission, input.vatTreatment);
    const vatRate = vatOnCommission ? Math.max(0, Number(input.vatRate || 0)) : 0;
    if (input.commissionEnabled === false) {
        return {
            grossRent,
            levy,
            commissionBase,
            commissionRate,
            commissionGross: 0,
            commissionNet: 0,
            totalCommission: 0,
            preaFee: 0,
            agentShare: 0,
            agencyShare: 0,
            vatOnCommission: false,
            vatTreatment: undefined,
            vatRate: undefined,
            vatAmount: 0,
            totalDeductions: levy,
            ownerPayable: commissionBase,
            ownerAmount: (0, money_1.roundMoney)(commissionBase + levy)
        };
    }
    const calculatedCommission = (0, money_1.roundMoney)((commissionBase * commissionRate) / 100);
    let commissionGross = calculatedCommission;
    let commissionNet = calculatedCommission;
    let vatAmount = 0;
    if (vatOnCommission && vatRate > 0 && calculatedCommission > 0) {
        if (vatTreatment === 'inclusive') {
            commissionGross = calculatedCommission;
            commissionNet = (0, money_1.roundMoney)(commissionGross / (1 + vatRate));
            vatAmount = (0, money_1.roundMoney)(commissionGross - commissionNet);
        }
        else {
            commissionGross = calculatedCommission;
            commissionNet = calculatedCommission;
            vatAmount = (0, money_1.roundMoney)(commissionGross * vatRate);
        }
    }
    const ownerCommissionDeduction = vatTreatment === 'inclusive'
        ? commissionGross
        : (0, money_1.roundMoney)(commissionNet + vatAmount);
    const ownerPayable = (0, money_1.roundMoney)(Math.max(0, commissionBase - ownerCommissionDeduction));
    const split = splitCommission(commissionNet, input);
    const totalDeductions = (0, money_1.roundMoney)(levy + ownerCommissionDeduction);
    const totalCommission = isIntroduction
        ? (vatOnCommission && vatRate > 0 ? commissionGross : calculatedCommission)
        : commissionNet;
    return {
        grossRent,
        levy,
        commissionBase,
        commissionRate,
        commissionGross,
        commissionNet,
        totalCommission,
        preaFee: split.preaFee,
        agentShare: split.agentShare,
        agencyShare: split.agencyShare,
        vatOnCommission,
        vatTreatment,
        vatRate: vatOnCommission ? vatRate : undefined,
        vatAmount,
        totalDeductions,
        ownerPayable,
        ownerAmount: (0, money_1.roundMoney)(ownerPayable + levy)
    };
};
exports.calculatePropertyCommission = calculatePropertyCommission;
const toPaymentCommissionSnapshot = (result) => ({
    totalCommission: result.totalCommission,
    preaFee: result.preaFee,
    agentShare: result.agentShare,
    agencyShare: result.agencyShare,
    vatOnCommission: result.vatAmount,
    ownerAmount: result.ownerAmount,
    levy: result.levy,
    commissionBase: result.commissionBase,
    commissionRate: result.commissionRate,
    commissionGross: result.commissionGross,
    commissionNet: result.commissionNet,
    vatTreatment: result.vatTreatment,
    vatRate: result.vatRate,
    vatAmount: result.vatAmount,
    vatJurisdiction: result.vatJurisdiction,
    vatRuleId: result.vatRuleId,
    vatTaxPoint: result.vatTaxPoint,
    paymentAllocation: (0, paymentAllocation_1.allocateRentalReceipt)({
        amount: (0, money_1.roundMoney)(result.grossRent + result.levy),
        rent: result.grossRent,
        levy: result.levy,
        commissionBase: result.commissionBase,
        commissionNet: result.commissionNet,
        vatOnCommission: result.vatAmount
    })
});
exports.toPaymentCommissionSnapshot = toPaymentCommissionSnapshot;
const applyLevyPassThroughToSnapshot = (result, rentPortion, levyPortion) => {
    const snapshot = (0, exports.toPaymentCommissionSnapshot)(result);
    const ownerCommissionDeduction = result.vatTreatment === 'inclusive'
        ? result.commissionGross
        : (0, money_1.roundMoney)(result.totalCommission + result.vatAmount);
    snapshot.levy = (0, money_1.roundMoney)(Math.max(0, levyPortion));
    snapshot.ownerAmount = (0, money_1.roundMoney)(Math.max(0, (0, money_1.roundMoney)(rentPortion) - ownerCommissionDeduction) + snapshot.levy);
    snapshot.paymentAllocation = (0, paymentAllocation_1.allocateRentalReceipt)({
        amount: (0, money_1.roundMoney)((0, money_1.roundMoney)(rentPortion) + snapshot.levy),
        rent: (0, money_1.roundMoney)(rentPortion),
        levy: snapshot.levy,
        commissionBase: result.commissionBase,
        commissionNet: result.commissionNet,
        vatOnCommission: result.vatAmount
    });
    return snapshot;
};
exports.applyLevyPassThroughToSnapshot = applyLevyPassThroughToSnapshot;
