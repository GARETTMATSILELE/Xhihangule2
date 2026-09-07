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
exports.CommissionService = exports.applyLevyPassThroughToSnapshot = exports.toPaymentCommissionSnapshot = exports.calculatePropertyCommission = void 0;
const Company_1 = require("../models/Company");
const propertyCommissionCalculator_1 = require("./propertyCommissionCalculator");
Object.defineProperty(exports, "calculatePropertyCommission", { enumerable: true, get: function () { return propertyCommissionCalculator_1.calculatePropertyCommission; } });
Object.defineProperty(exports, "toPaymentCommissionSnapshot", { enumerable: true, get: function () { return propertyCommissionCalculator_1.toPaymentCommissionSnapshot; } });
Object.defineProperty(exports, "applyLevyPassThroughToSnapshot", { enumerable: true, get: function () { return propertyCommissionCalculator_1.applyLevyPassThroughToSnapshot; } });
const taxRateService_1 = require("./taxRateService");
class CommissionService {
    static calculate(amount, commissionPercentage, companyId) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b, _c, _d;
            const company = yield Company_1.Company.findById(companyId).lean();
            const result = (0, propertyCommissionCalculator_1.calculatePropertyCommission)({
                grossRent: amount,
                levy: 0,
                commissionPercentage,
                vatOnCommission: false,
                commissionEnabled: ((_a = company === null || company === void 0 ? void 0 : company.featureFlags) === null || _a === void 0 ? void 0 : _a.commissionEnabled) !== false,
                preaPercentOfTotal: (_b = company === null || company === void 0 ? void 0 : company.commissionConfig) === null || _b === void 0 ? void 0 : _b.preaPercentOfTotal,
                agentPercentOfRemaining: (_c = company === null || company === void 0 ? void 0 : company.commissionConfig) === null || _c === void 0 ? void 0 : _c.agentPercentOfRemaining,
                agencyPercentOfRemaining: (_d = company === null || company === void 0 ? void 0 : company.commissionConfig) === null || _d === void 0 ? void 0 : _d.agencyPercentOfRemaining
            });
            return {
                totalCommission: result.totalCommission,
                preaFee: result.preaFee,
                agentShare: result.agentShare,
                agencyShare: result.agencyShare,
                ownerAmount: result.ownerAmount
            };
        });
    }
    static calculateForProperty(input) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b, _c, _d;
            const company = input.companyId ? yield Company_1.Company.findById(input.companyId).lean() : null;
            const vatOnCommission = Boolean(input.vatOnCommission);
            let vatRate = Number(input.vatRate);
            if (vatOnCommission && !Number.isFinite(vatRate) && input.companyId) {
                const lookedUp = yield (0, taxRateService_1.getVatRateForDate)(input.companyId, input.paymentDate || new Date());
                vatRate = lookedUp.decimal;
            }
            if (!Number.isFinite(vatRate) || vatRate < 0)
                vatRate = 0;
            return (0, propertyCommissionCalculator_1.calculatePropertyCommission)({
                grossRent: input.grossRent,
                levy: input.levy,
                commissionPercentage: input.commissionPercentage,
                vatOnCommission,
                vatTreatment: input.vatTreatment,
                vatRate,
                commissionEnabled: ((_a = company === null || company === void 0 ? void 0 : company.featureFlags) === null || _a === void 0 ? void 0 : _a.commissionEnabled) !== false,
                preaPercentOfTotal: (_b = company === null || company === void 0 ? void 0 : company.commissionConfig) === null || _b === void 0 ? void 0 : _b.preaPercentOfTotal,
                agentPercentOfRemaining: (_c = company === null || company === void 0 ? void 0 : company.commissionConfig) === null || _c === void 0 ? void 0 : _c.agentPercentOfRemaining,
                agencyPercentOfRemaining: (_d = company === null || company === void 0 ? void 0 : company.commissionConfig) === null || _d === void 0 ? void 0 : _d.agencyPercentOfRemaining
            });
        });
    }
}
exports.CommissionService = CommissionService;
