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
exports.CommissionService = void 0;
const Company_1 = require("../models/Company");
class CommissionService {
    static calculate(amount, commissionPercentage, companyId) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b, _c, _d, _e, _f, _g;
            const company = yield Company_1.Company.findById(companyId).lean();
            const commissionEnabled = ((_a = company === null || company === void 0 ? void 0 : company.featureFlags) === null || _a === void 0 ? void 0 : _a.commissionEnabled) !== false;
            if (!commissionEnabled) {
                return {
                    totalCommission: 0,
                    preaFee: 0,
                    agentShare: 0,
                    agencyShare: 0,
                    ownerAmount: amount
                };
            }
            const totalCommission = (amount * (commissionPercentage || 0)) / 100;
            const preaPercentOfTotal = Math.max(0, Math.min(1, (_c = (_b = company === null || company === void 0 ? void 0 : company.commissionConfig) === null || _b === void 0 ? void 0 : _b.preaPercentOfTotal) !== null && _c !== void 0 ? _c : 0.03));
            const agentPercentOfRemaining = Math.max(0, Math.min(1, (_e = (_d = company === null || company === void 0 ? void 0 : company.commissionConfig) === null || _d === void 0 ? void 0 : _d.agentPercentOfRemaining) !== null && _e !== void 0 ? _e : 0.6));
            const agencyPercentOfRemaining = Math.max(0, Math.min(1, (_g = (_f = company === null || company === void 0 ? void 0 : company.commissionConfig) === null || _f === void 0 ? void 0 : _f.agencyPercentOfRemaining) !== null && _g !== void 0 ? _g : 0.4));
            const preaFee = totalCommission * preaPercentOfTotal;
            const remainingCommission = totalCommission - preaFee;
            const agentShare = remainingCommission * agentPercentOfRemaining;
            const agencyShare = remainingCommission * agencyPercentOfRemaining;
            return {
                totalCommission,
                preaFee,
                agentShare,
                agencyShare,
                ownerAmount: amount - totalCommission
            };
        });
    }
}
exports.CommissionService = CommissionService;
