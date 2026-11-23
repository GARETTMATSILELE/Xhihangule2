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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.estimateIndividualTaxes = estimateIndividualTaxes;
const Payment_1 = require("../../models/Payment");
const Property_1 = require("../../models/Property");
const LandlordFinancialTransaction_1 = require("../../models/LandlordFinancialTransaction");
const individualTaxProfileService_1 = __importDefault(require("../individualTaxProfileService"));
const rentalPeriodCoverage_1 = require("../rentalPeriodCoverage");
const money_1 = require("../../utils/money");
const calculate_1 = require("./calculate");
const publishedRules_1 = require("./publishedRules");
const QUALIFYING = new Set(['DEDUCTIBLE', 'PARTIALLY_DEDUCTIBLE']);
function yearBounds(asOf, jurisdiction) {
    if (jurisdiction === 'ZA') {
        const startYear = asOf.getUTCMonth() < 2 ? asOf.getUTCFullYear() - 1 : asOf.getUTCFullYear();
        return {
            start: new Date(Date.UTC(startYear, 2, 1)),
            end: new Date(Date.UTC(startYear + 1, 2, 1))
        };
    }
    return {
        start: new Date(Date.UTC(asOf.getUTCFullYear(), 0, 1)),
        end: new Date(Date.UTC(asOf.getUTCFullYear() + 1, 0, 1))
    };
}
function estimateIndividualTaxes(companyId_1) {
    return __awaiter(this, arguments, void 0, function* (companyId, body = {}) {
        var _a, _b, _c;
        const profile = yield individualTaxProfileService_1.default.getOwnerProfile(companyId);
        const asOf = body.asOf ? new Date(String(body.asOf)) : new Date();
        const residency = (0, publishedRules_1.resolveIndividualJurisdiction)(profile.taxResidencyCountry || profile.taxResidence, profile.taxJurisdiction);
        const ownerJurisdiction = (0, publishedRules_1.resolveIndividualJurisdiction)(profile.taxJurisdiction, residency);
        const enabled = profile.enabledTaxes.length
            ? profile.enabledTaxes
            : ownerJurisdiction === 'ZA'
                ? ['PERSONAL_INCOME_TAX']
                : ownerJurisdiction === 'ZW'
                    ? [
                        ...(profile.rentalTaxRegime === 'PRESUMPTIVE_RENTAL' ? ['PRESUMPTIVE_RENTAL'] : []),
                        ...(profile.rentalTaxRegime === 'SELF_ASSESSMENT' || profile.incomeTaxRegistered ? ['NORMAL_INCOME_TAX'] : []),
                        ...(profile.vatRegistered ? ['VAT'] : [])
                    ]
                    : (profile.globalTaxes || []).filter((row) => row.enabled !== false).map((row) => String(row.category || 'OTHER'));
        const properties = body.propertyId
            ? yield Property_1.Property.find({ _id: body.propertyId, companyId, isDeleted: { $ne: true } }).lean()
            : yield Property_1.Property.find({ companyId, isDeleted: { $ne: true } }).lean();
        const sa = (profile.saProfile || {});
        const results = [];
        for (const property of properties) {
            const propertyJurisdiction = (0, publishedRules_1.resolveIndividualJurisdiction)(property.locationCountry, ownerJurisdiction);
            const bounds = yearBounds(asOf, propertyJurisdiction);
            const currency = String(property.operatingCurrency || profile.preferredCurrency || 'USD').toUpperCase();
            const transactions = yield LandlordFinancialTransaction_1.LandlordFinancialTransaction.find({
                companyId: property.companyId,
                propertyId: property._id,
                status: 'POSTED',
                date: { $gte: bounds.start, $lt: bounds.end }
            }).select('amount currency sourceKind deductibility').lean();
            const payments = yield Payment_1.Payment.find({
                companyId: property.companyId,
                propertyId: property._id,
                status: { $in: ['completed', 'paid', 'success'] },
                paymentDate: { $gte: bounds.start, $lt: bounds.end }
            }).lean();
            const currencies = new Set([currency]);
            let rentalIncome = 0;
            for (const payment of payments) {
                if (!(0, rentalPeriodCoverage_1.countsTowardRentReceipt)(payment))
                    continue;
                const paymentCurrency = String(payment.currency || currency).toUpperCase();
                currencies.add(paymentCurrency);
                if (paymentCurrency === currency)
                    rentalIncome += Number(payment.amount || 0);
            }
            let allowable = 0;
            let nonDeductible = 0;
            let capital = 0;
            for (const row of transactions) {
                const rowCurrency = String(row.currency || currency).toUpperCase();
                currencies.add(rowCurrency);
                if (rowCurrency !== currency || row.sourceKind === 'OTHER_INCOME')
                    continue;
                const amount = Number(row.amount || 0);
                if (row.deductibility === 'CAPITAL')
                    capital += amount;
                else if (QUALIFYING.has(String(row.deductibility || '')))
                    allowable += amount;
                else
                    nonDeductible += amount;
            }
            const estimate = (0, calculate_1.calculateJurisdictionEstimate)({
                asOf,
                currency,
                taxJurisdiction: ownerJurisdiction,
                countryOfResidence: profile.countryOfResidence,
                taxResidencyCountry: profile.taxResidencyCountry,
                propertyLocationCountry: property.locationCountry || '',
                propertyJurisdiction,
                residencyJurisdiction: residency,
                enabledTaxes: enabled,
                rentalIncome: (0, money_1.roundMoney)(rentalIncome),
                allowableExpenses: (0, money_1.roundMoney)(allowable),
                nonDeductibleExpenses: (0, money_1.roundMoney)(nonDeductible),
                capitalExpenses: (0, money_1.roundMoney)(capital),
                rentedPortionPercent: body.rentedPortionPercent == null ? Number((_a = sa.rentedPortionPercent) !== null && _a !== void 0 ? _a : 100) : Number(body.rentedPortionPercent),
                propertyUseClass: property.propertyUseClass || null,
                rentalTaxRegime: property.rentalTaxTreatment || profile.rentalTaxRegime,
                incomeTaxRegistered: profile.incomeTaxRegistered,
                incomeTaxRegistrationDate: profile.incomeTaxRegistrationDate,
                vatRegistered: profile.vatRegistered,
                vatNumber: profile.vatNumber,
                taxableSupplies: body.taxableSupplies == null ? sa.taxableSupplies : Number(body.taxableSupplies),
                otherAnnualTaxableIncome: body.otherAnnualTaxableIncome == null ? sa.otherAnnualTaxableIncome : Number(body.otherAnnualTaxableIncome),
                ageCategory: body.ageCategory || sa.ageCategory || null,
                extraRebate: body.extraRebate == null ? sa.extraRebate : Number(body.extraRebate),
                carriesOnBusiness: Boolean((_b = body.carriesOnBusiness) !== null && _b !== void 0 ? _b : sa.carriesOnBusiness),
                turnoverTaxElected: Boolean(sa.turnoverTaxElected),
                turnoverTaxEligibilityConfirmed: Boolean(sa.turnoverTaxEligibilityConfirmed),
                taxableTurnover: body.taxableTurnover == null ? sa.taxableTurnover : Number(body.taxableTurnover),
                ringFencingDoesNotApply: Boolean(sa.ringFencingDoesNotApply),
                priorResidentialLossYears: sa.priorResidentialLossYears == null ? null : Number(sa.priorResidentialLossYears),
                globalTaxes: (profile.globalTaxes || []),
                mixedCurrency: currencies.size > 1
            });
            results.push(Object.assign(Object.assign({}, estimate), { propertyId: String(property._id), propertyName: property.name }));
        }
        const currencies = new Set(results.map((row) => row.currency));
        const jurisdictions = new Set(results.map((row) => row.propertyJurisdiction));
        return {
            properties: results,
            combined: results.length === 1 ? results[0] : null,
            portfolioSeparated: results.length > 1 && (currencies.size > 1 || jurisdictions.size > 1),
            disclaimer: ((_c = results[0]) === null || _c === void 0 ? void 0 : _c.disclaimer) || 'These figures are estimates. Mantis does not submit returns or make tax payments.'
        };
    });
}
