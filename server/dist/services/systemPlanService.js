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
exports.seedDefaultPlans = seedDefaultPlans;
exports.getPlanConfig = getPlanConfig;
exports.chargeForPlan = chargeForPlan;
exports.listDashboardPlans = listDashboardPlans;
const plan_1 = require("../types/plan");
const Plan_1 = require("../models/Plan");
const DEFAULT_DESCRIPTIONS = {
    INDIVIDUAL: 'For individual landlords and smaller portfolios.',
    SME: 'For growing property management teams.',
    ENTERPRISE: 'For high-volume agencies and enterprise operators.'
};
const DEFAULT_LIMITS = {
    INDIVIDUAL: { maxUsers: 3, maxProperties: plan_1.PLAN_CONFIG.INDIVIDUAL.propertyLimit, maxTenants: 50, maxLeases: 50, maxStorage: 1024 },
    SME: { maxUsers: 15, maxProperties: plan_1.PLAN_CONFIG.SME.propertyLimit, maxTenants: 500, maxLeases: 500, maxStorage: 10240 },
    ENTERPRISE: { maxUsers: null, maxProperties: null, maxTenants: null, maxLeases: null, maxStorage: null }
};
function seedDefaultPlans() {
    return __awaiter(this, void 0, void 0, function* () {
        const codes = Object.keys(plan_1.PLAN_CONFIG);
        yield Promise.all(codes.map((code) => __awaiter(this, void 0, void 0, function* () {
            var _a, _b;
            const cfg = plan_1.PLAN_CONFIG[code];
            yield Plan_1.Plan.findOneAndUpdate({ code }, {
                $setOnInsert: {
                    code,
                    name: code === 'SME' ? 'SME' : code.charAt(0) + code.slice(1).toLowerCase(),
                    description: DEFAULT_DESCRIPTIONS[code],
                    monthlyPrice: ((_a = cfg.pricingUSD) === null || _a === void 0 ? void 0 : _a.monthly) || 0,
                    annualPrice: ((_b = cfg.pricingUSD) === null || _b === void 0 ? void 0 : _b.yearly) || 0,
                    currency: 'USD',
                    limits: DEFAULT_LIMITS[code],
                    featureFlags: Object.assign({ maintenance: true, reports: true, ownersPortal: true, whatsappIntegration: code === 'ENTERPRISE', apiAccess: code === 'ENTERPRISE' }, cfg.featureFlags),
                    isActive: true
                }
            }, { upsert: true, new: true });
        })));
    });
}
function getPlanConfig(code) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c, _d;
        const dbPlan = yield Plan_1.Plan.findOne({ code, isActive: true }).lean();
        const fallback = plan_1.PLAN_CONFIG[code];
        if (!dbPlan) {
            return {
                code,
                monthlyPrice: ((_a = fallback.pricingUSD) === null || _a === void 0 ? void 0 : _a.monthly) || 0,
                annualPrice: ((_b = fallback.pricingUSD) === null || _b === void 0 ? void 0 : _b.yearly) || 0,
                propertyLimit: fallback.propertyLimit,
                featureFlags: fallback.featureFlags
            };
        }
        return {
            code,
            monthlyPrice: Number(dbPlan.monthlyPrice || 0),
            annualPrice: Number(dbPlan.annualPrice || 0),
            currency: dbPlan.currency || 'USD',
            propertyLimit: (_d = (_c = dbPlan.limits) === null || _c === void 0 ? void 0 : _c.maxProperties) !== null && _d !== void 0 ? _d : fallback.propertyLimit,
            featureFlags: Object.assign(Object.assign({}, fallback.featureFlags), (dbPlan.featureFlags || {}))
        };
    });
}
/** Price for a public plan. Uses the system-admin plan record and does not substitute the other billing frequency. */
function chargeForPlan(code, cycle) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        if (code !== 'INDIVIDUAL' && code !== 'SME' && code !== 'ENTERPRISE')
            return null;
        const dbPlan = yield Plan_1.Plan.findOne({ code, isActive: true }).select('monthlyPrice annualPrice').lean();
        const fallback = (_a = plan_1.PLAN_CONFIG[code]) === null || _a === void 0 ? void 0 : _a.pricingUSD;
        const amount = dbPlan
            ? Number(cycle === 'yearly' ? dbPlan.annualPrice : dbPlan.monthlyPrice)
            : Number(cycle === 'yearly' ? fallback === null || fallback === void 0 ? void 0 : fallback.yearly : fallback === null || fallback === void 0 ? void 0 : fallback.monthly);
        if (!Number.isFinite(amount) || amount <= 0)
            return null;
        return amount;
    });
}
function listDashboardPlans() {
    return __awaiter(this, void 0, void 0, function* () {
        yield seedDefaultPlans();
        const codes = ['INDIVIDUAL', 'SME', 'ENTERPRISE'];
        const names = {
            INDIVIDUAL: 'Landlord',
            SME: 'Property Manager',
            ENTERPRISE: 'Enterprise'
        };
        return Promise.all(codes.map((code) => __awaiter(this, void 0, void 0, function* () {
            const saved = yield Plan_1.Plan.findOne({ code }).lean();
            const cfg = yield getPlanConfig(code);
            return {
                code,
                name: (saved === null || saved === void 0 ? void 0 : saved.name) || names[code],
                monthly: cfg.monthlyPrice > 0 ? cfg.monthlyPrice : null,
                yearly: cfg.annualPrice > 0 ? cfg.annualPrice : null,
                currency: (saved === null || saved === void 0 ? void 0 : saved.currency) || 'USD',
                isActive: saved ? saved.isActive !== false : true
            };
        })));
    });
}
