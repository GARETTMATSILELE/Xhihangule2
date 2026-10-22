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
Object.defineProperty(exports, "__esModule", { value: true });
exports.rentalCorrectionSnapshotAgrees = rentalCorrectionSnapshotAgrees;
exports.buildRentalCorrectionCommission = buildRentalCorrectionCommission;
/**
 * Commission snapshot for a rental correction draft.
 * Uses the same property commission and dated VAT path as a new rental receipt.
 * The original payment is never rewritten. The draft is finalized only when the
 * stored allocation, commission split, VAT, and owner payable agree.
 */
const Property_1 = require("../models/Property");
const commissionService_1 = require("./commissionService");
const introductionCommissionService_1 = require("./introductionCommissionService");
const paymentAllocation_1 = require("./tax/paymentAllocation");
const vatPolicyService_1 = require("./vatPolicyService");
const money_1 = require("../utils/money");
function rentalCorrectionSnapshotAgrees(snapshot, grossAmount) {
    var _a, _b, _c, _d, _e;
    const allocation = snapshot === null || snapshot === void 0 ? void 0 : snapshot.paymentAllocation;
    if (!allocation || allocation.source !== 'canonical_payment_allocation')
        return false;
    if (!(0, paymentAllocation_1.allocationBalances)(allocation))
        return false;
    const gross = (0, money_1.roundMoney)(Math.max(0, Number(grossAmount || 0)));
    const levy = (0, money_1.roundMoney)(Math.max(0, Number((_b = (_a = snapshot === null || snapshot === void 0 ? void 0 : snapshot.levy) !== null && _a !== void 0 ? _a : allocation.levy) !== null && _b !== void 0 ? _b : 0)));
    const allocationGross = (0, money_1.roundMoney)(Number(allocation.grossAmount || 0));
    const allocationRent = (0, money_1.roundMoney)(Number(allocation.rent || 0));
    const grossMatches = Math.abs(allocationGross - (0, money_1.roundMoney)(gross + levy)) <= 0.02
        || Math.abs(allocationRent - gross) <= 0.02;
    if (!grossMatches)
        return false;
    const owner = (0, money_1.roundMoney)(Number((snapshot === null || snapshot === void 0 ? void 0 : snapshot.ownerAmount) || 0));
    const expectedOwner = (0, money_1.roundMoney)(Number(allocation.ownerPayable || 0) + Number(allocation.levyPayable || 0));
    if (Math.abs(owner - expectedOwner) > 0.02)
        return false;
    const vat = (0, money_1.roundMoney)(Number((_c = snapshot === null || snapshot === void 0 ? void 0 : snapshot.vatOnCommission) !== null && _c !== void 0 ? _c : 0));
    if (Math.abs(vat - (0, money_1.roundMoney)(Number(allocation.vatOnCommission || 0))) > 0.02)
        return false;
    const net = (0, money_1.roundMoney)(Number((_e = (_d = snapshot === null || snapshot === void 0 ? void 0 : snapshot.commissionNet) !== null && _d !== void 0 ? _d : snapshot === null || snapshot === void 0 ? void 0 : snapshot.totalCommission) !== null && _e !== void 0 ? _e : 0));
    if (Math.abs(net - (0, money_1.roundMoney)(Number(allocation.commissionNet || 0))) > 0.02)
        return false;
    const parts = (0, money_1.roundMoney)(Number((snapshot === null || snapshot === void 0 ? void 0 : snapshot.agentShare) || 0) + Number((snapshot === null || snapshot === void 0 ? void 0 : snapshot.agencyShare) || 0) + Number((snapshot === null || snapshot === void 0 ? void 0 : snapshot.preaFee) || 0));
    return Math.abs(parts - net) <= 0.05;
}
function buildRentalCorrectionCommission(source) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c;
        const property = (source === null || source === void 0 ? void 0 : source.propertyId)
            ? yield Property_1.Property.findById(source.propertyId)
                .select('commission vatOnCommission vatCommissionTreatment rentalType rent')
                .lean()
            : null;
        const paymentDate = (source === null || source === void 0 ? void 0 : source.paymentDate) ? new Date(source.paymentDate) : new Date();
        const amount = Math.max(0, Number((source === null || source === void 0 ? void 0 : source.amount) || 0));
        const levy = Math.max(0, Number((source === null || source === void 0 ? void 0 : source.levyAllocated) || 0));
        const isIntroduction = String((source === null || source === void 0 ? void 0 : source.paymentType) || (property === null || property === void 0 ? void 0 : property.rentalType) || '').toLowerCase() === 'introduction';
        const policy = yield (0, vatPolicyService_1.resolveCommissionVatPolicy)({
            companyId: String((source === null || source === void 0 ? void 0 : source.companyId) || ''),
            paymentDate,
            property: {
                vatOnCommission: Boolean(property === null || property === void 0 ? void 0 : property.vatOnCommission),
                vatCommissionTreatment: property === null || property === void 0 ? void 0 : property.vatCommissionTreatment
            },
            requestedVatOnCommission: Boolean(property === null || property === void 0 ? void 0 : property.vatOnCommission),
            requestedTreatment: property === null || property === void 0 ? void 0 : property.vatCommissionTreatment,
            commissionType: isIntroduction ? 'introduction' : 'management'
        });
        const flags = (0, vatPolicyService_1.commissionVatFlagsFromPolicy)(policy);
        if (isIntroduction) {
            const prepared = yield (0, introductionCommissionService_1.prepareIntroductionRentalCommission)({
                companyId: String((source === null || source === void 0 ? void 0 : source.companyId) || ''),
                propertyId: source.propertyId,
                tenantId: source.tenantId,
                leaseId: source.leaseId,
                rentAllocated: amount,
                levyAllocated: levy,
                vatOnCommission: flags.vatOnCommission,
                vatTreatment: flags.vatTreatment,
                vatRate: flags.vatRate,
                paymentDate,
                propertyRent: Number((property === null || property === void 0 ? void 0 : property.rent) || amount),
                rentUsed: Number((source === null || source === void 0 ? void 0 : source.rentUsed) || (property === null || property === void 0 ? void 0 : property.rent) || amount)
            });
            if (!prepared.ok) {
                return {
                    snapshot: (source === null || source === void 0 ? void 0 : source.commissionDetails) || {},
                    agrees: false,
                    applyVatOnCommission: flags.vatOnCommission,
                    vatOnCommissionRate: Number(flags.vatRate || 0),
                    vatCommissionTreatment: flags.vatTreatment
                };
            }
            const snapshot = (0, vatPolicyService_1.stampVatDecision)(prepared.snapshot, policy);
            return {
                snapshot,
                agrees: rentalCorrectionSnapshotAgrees(snapshot, amount),
                applyVatOnCommission: Boolean((_a = prepared.result) === null || _a === void 0 ? void 0 : _a.vatOnCommission),
                vatOnCommissionRate: Number(((_b = prepared.result) === null || _b === void 0 ? void 0 : _b.vatRate) || flags.vatRate || 0),
                vatCommissionTreatment: ((_c = prepared.result) === null || _c === void 0 ? void 0 : _c.vatTreatment) || flags.vatTreatment
            };
        }
        const result = yield commissionService_1.CommissionService.calculateForProperty({
            companyId: source.companyId,
            grossRent: amount,
            levy,
            commissionPercentage: Number((property === null || property === void 0 ? void 0 : property.commission) || 0),
            vatOnCommission: flags.vatOnCommission,
            vatTreatment: flags.vatTreatment,
            vatRate: flags.vatRate,
            paymentDate,
            commissionType: 'management'
        });
        const snapshot = (0, vatPolicyService_1.stampVatDecision)((0, commissionService_1.applyLevyPassThroughToSnapshot)(result, amount, levy), policy);
        return {
            snapshot,
            agrees: rentalCorrectionSnapshotAgrees(snapshot, amount),
            applyVatOnCommission: Boolean(result.vatOnCommission),
            vatOnCommissionRate: Number(result.vatRate || 0),
            vatCommissionTreatment: result.vatTreatment
        };
    });
}
