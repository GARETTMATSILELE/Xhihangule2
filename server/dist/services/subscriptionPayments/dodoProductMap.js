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
exports.readDodoProductPrice = readDodoProductPrice;
exports.cycleMatchesDodoPrice = cycleMatchesDodoPrice;
exports.resolveDodoProductId = resolveDodoProductId;
exports.subscriptionListPrice = subscriptionListPrice;
exports.amountToCents = amountToCents;
const Plan_1 = require("../../models/Plan");
const systemPlanService_1 = require("../systemPlanService");
const providerAvailability_1 = require("./providerAvailability");
function readDodoProductPrice(product) {
    const price = product === null || product === void 0 ? void 0 : product.price;
    if (!price || !Number.isFinite(Number(price.price)))
        return null;
    return {
        cents: Math.round(Number(price.price)),
        currency: String(price.currency || '').toUpperCase(),
        recurring: price.type === 'recurring_price',
        interval: String(price.payment_frequency_interval || ''),
        count: Number(price.payment_frequency_count || 0)
    };
}
function cycleMatchesDodoPrice(cycle, price) {
    if (!price.recurring || price.currency !== 'USD')
        return false;
    if (cycle === 'monthly')
        return price.interval === 'Month' && price.count === 1;
    if (cycle === 'quarterly')
        return price.interval === 'Month' && price.count === 3;
    return price.interval === 'Year' && price.count === 1;
}
function resolveDodoProductId(plan, cycle, env = process.env) {
    return (0, providerAvailability_1.dodoProductEnv)(cycle, plan, env);
}
function subscriptionListPrice(plan, cycle) {
    return __awaiter(this, void 0, void 0, function* () {
        if (cycle === 'quarterly') {
            const row = yield Plan_1.Plan.findOne({ code: plan, isActive: true }).select('quarterlyPrice').lean();
            const price = Number((row === null || row === void 0 ? void 0 : row.quarterlyPrice) || 0);
            return Number.isFinite(price) && price > 0 ? price : null;
        }
        return (0, systemPlanService_1.chargeForPlan)(plan, cycle);
    });
}
function amountToCents(amount) {
    return Math.round(Number(amount) * 100);
}
