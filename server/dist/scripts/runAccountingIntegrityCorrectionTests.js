"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const propertyCommissionCalculator_1 = require("../services/propertyCommissionCalculator");
const commissionRateResolution_1 = require("../services/commissionRateResolution");
const introductionCommissionService_1 = require("../services/introductionCommissionService");
const paymentAccountingProjection_1 = require("../services/paymentAccountingProjection");
const accountingIntegrityClassification_1 = require("../services/accountingIntegrityClassification");
const vatApplicability_1 = require("../services/tax/vatApplicability");
const vatPolicyService_1 = require("../services/vatPolicyService");
const money_1 = require("../utils/money");
const root = path_1.default.resolve(__dirname, '..');
const read = (relative) => fs_1.default.readFileSync(path_1.default.join(root, relative), 'utf8');
function intro(percent, rent = 1000) {
    const allocation = (0, introductionCommissionService_1.computeIntroductionAllocation)({
        rentAllocated: rent,
        levyAllocated: 0,
        oneMonthRent: rent,
        alreadyConsumed: 0
    });
    const calculated = (0, introductionCommissionService_1.snapshotFromIntroductionAllocation)(allocation, {
        commissionPercentage: percent,
        vatOnCommission: false,
        preaPercentOfTotal: 0.03,
        agentPercentOfRemaining: 0.6,
        agencyPercentOfRemaining: 0.4
    });
    return (0, introductionCommissionService_1.applyIntroductionOwnerRemainder)(calculated, allocation);
}
const failures = [];
function check(condition, message) {
    if (!condition)
        failures.push(message);
}
const unregistered = (0, vatApplicability_1.evaluateVatApplicability)({
    company: { vatRegistered: false },
    transactionDate: new Date('2026-11-03T00:00:00.000Z'),
    supplyTreatment: 'STANDARD_TAXABLE',
    requested: true
});
check(unregistered.vatApplies === false, '1 unregistered company does not apply VAT');
check(unregistered.reviewReason === 'VAT_CHARGED_WHILE_COMPANY_NOT_REGISTERED', '1 unregistered review reason is explicit');
const integration = read('services/accountingIntegrationService.ts');
check(integration.includes('if (totalVatCollected <= 0) return;'), '2 a zero VAT amount creates no VAT record');
check(integration.includes("taxType: 'VAT_ON_COMMISSION'"), '3 obligations are created only from the VAT amount branch');
check(integration.includes('if (vatOnCommission > 0 && opts?.allowCommissionVatObligation !== false)'), '3 no obligation is created when VAT was not deducted or historical eligibility is blocked');
const incomplete = (0, vatPolicyService_1.commissionVatConfigurationGap)({
    requested: true,
    vatCategory: '',
    treatment: 'exclusive'
});
check(Boolean(incomplete && incomplete.reviewReason === 'VAT_CONFIGURATION_INCOMPLETE'), '4 incomplete VAT category blocks VAT');
check((incomplete === null || incomplete === void 0 ? void 0 : incomplete.reason) === 'vat_category_not_configured', '4 the block explains the missing category');
const configured = (0, propertyCommissionCalculator_1.calculatePropertyCommission)({
    grossRent: 2000,
    levy: 0,
    commissionPercentage: 15,
    vatOnCommission: true,
    vatTreatment: 'exclusive',
    vatRate: 0.155
});
check((0, vatPolicyService_1.commissionVatConfigurationGap)({ requested: true, vatCategory: 'standard', treatment: 'exclusive' }) == null, '5 complete configuration does not block VAT');
check((0, money_1.roundMoney)(configured.totalCommission) === 300, '5 commission is 300');
check((0, money_1.roundMoney)(configured.vatAmount) === 46.5, '5 VAT is 46.50');
check((0, money_1.roundMoney)(configured.ownerAmount) === 1653.5, '5 owner income is 1653.50');
const snapshotPayment = {
    vatOnCommissionRate: 0,
    commissionDetails: { vatRate: 0.155, vatOnCommission: 46.5 }
};
check((0, vatPolicyService_1.authoritativeSnapshotVatRate)(snapshotPayment) === 0.155, '8 VAT record rate is the snapshot rate, not a zero payment flag');
check(integration.includes('authoritativeSnapshotVatRate(payment)'), '6 and 9 VAT record and obligation use the snapshot rate');
check(integration.includes('if (existing) return;'), '10 an existing VAT record is not duplicated');
check(read('models/VatRecord.ts').includes('unique: true'), '10 VAT records are uniquely keyed');
check(read('services/taxObligationService.ts').includes('upsertPaymentTaxObligation'), '6 obligations go through the idempotent upsert');
const disabled = (0, propertyCommissionCalculator_1.calculatePropertyCommission)({
    grossRent: 2000,
    levy: 0,
    commissionPercentage: 15,
    vatOnCommission: false,
    vatRate: 0.155
});
check(disabled.vatAmount === 0, '11 a VAT-disabled property calculates no VAT');
const notRequested = (0, vatApplicability_1.evaluateVatApplicability)({
    company: { vatRegistered: true, vatCategory: 'standard' },
    transactionDate: new Date('2026-11-03T00:00:00.000Z'),
    supplyTreatment: 'STANDARD_TAXABLE',
    requested: false
});
check(notRequested.vatApplies === false && notRequested.reviewRequired === false, '11 a disabled property opens no VAT review');
const half = intro(50);
check((0, money_1.roundMoney)(half.totalCommission) === 500, '12 a 50% introduction commission is 500');
check((0, money_1.roundMoney)(half.ownerAmount) === 500, '12 a 50% introduction owner income is 500');
const full = intro(100);
check((0, money_1.roundMoney)(full.totalCommission) === 1000, '13 a 100% introduction commission is 1000');
check((0, money_1.roundMoney)(full.ownerAmount) === 0, '13 a 100% introduction owner income is 0');
check(full.commissionRate === 100, '13 the snapshot stores 100');
let missingRate = false;
try {
    intro(undefined);
}
catch (error) {
    missingRate = String(error.message || '').includes('100% is not assumed');
}
check(missingRate, '14 a missing commission percentage is rejected');
check((0, commissionRateResolution_1.resolveStoredCommissionPercentage)(undefined).ok === false, '14 the shared resolver does not substitute 100');
const resolved = (0, commissionRateResolution_1.resolveStoredCommissionPercentage)(50);
const management = (0, propertyCommissionCalculator_1.calculatePropertyCommission)({
    grossRent: 1000,
    levy: 0,
    commissionPercentage: resolved.ok ? resolved.percent : -1,
    vatOnCommission: false
});
check(resolved.ok && management.commissionRate === 50 && half.commissionRate === 50, '15 introduction and management use the same stored rate');
const historical = Object.freeze({
    commissionPercentage: 100,
    totalCommission: 1000,
    ownerAmount: 0
});
intro(50);
check(historical.commissionPercentage === 100 && historical.ownerAmount === 0, '16 calculating a new receipt does not rewrite a historical snapshot');
const september = {
    _id: 'september',
    referenceNumber: 'RCPT-7DD47A-2026-09',
    amount: 1100,
    rentalPeriodYear: 2026,
    rentalPeriodMonth: 9,
    accountingComplete: null,
    commissionDetails: { ownerAmount: 1035, agentShare: 96.03, agencyShare: 64.02, totalCommission: 165, commissionPercentage: 15 }
};
const septemberClass = (0, accountingIntegrityClassification_1.classifyAccountingIntegrityRow)({
    component: 'MISSING_JOURNAL',
    payment: september,
    propertyCommission: 15,
    presence: { ownerIncome: false, agentCommission: false, companyCommission: false, journal: false }
});
check(septemberClass.classification === 'UNPOSTED RENTAL', '17 an unprojected rental is an unposted rental');
check(septemberClass.explanation.includes('RCPT-7DD47A-2026-09'), '17 the reference is reported');
check(septemberClass.explanation.includes('2026-9'), '17 the rental period is reported');
check(septemberClass.explanation.includes('Owner income posting missing'), '18 missing owner income is reported');
check(septemberClass.explanation.includes('Agent commission posting missing'), '19 missing agent commission is reported');
check(septemberClass.explanation.includes('Company commission posting missing'), '20 missing company commission is reported');
check(septemberClass.explanation.includes('Receipt journal missing'), '21 the missing journal is reported');
const october = (0, accountingIntegrityClassification_1.classifyAccountingIntegrityRow)({
    component: 'MISSING_JOURNAL',
    payment: Object.assign(Object.assign({}, september), { referenceNumber: 'RCPT-OCT', rentalPeriodMonth: 10 }),
    propertyCommission: 15,
    presence: { ownerIncome: true, agentCommission: true, companyCommission: true, journal: true }
});
check(october.classification === 'STALE EXCEPTION', '22 a later posted month does not rewrite the earlier classification input');
check(septemberClass.classification === 'UNPOSTED RENTAL', '22 the earlier month remains unposted');
const arrearsSettled = (0, accountingIntegrityClassification_1.classifyAccountingIntegrityRow)({
    component: 'MISSING_JOURNAL',
    issue: 'arrears settled and currentArrears is zero',
    payment: september,
    propertyCommission: 15,
    presence: { ownerIncome: false, agentCommission: false, companyCommission: false, journal: false }
});
check(arrearsSettled.classification === 'UNPOSTED RENTAL', '23 arrears settlement is not accounting completion');
const fairview = {
    amount: 800,
    referenceNumber: 'RCPT-DCDD37-2026-08',
    accountingComplete: null,
    commissionDetails: {
        commissionPercentage: 100,
        totalCommission: 800,
        ownerAmount: 0,
        agentShare: 465.6,
        agencyShare: 310.4,
        preaFee: 24,
        vatOnCommission: 0
    }
};
check((0, accountingIntegrityClassification_1.legitimateZeroOwnerIncome)(fairview), '24 a 100% introduction snapshot is a legitimate zero owner income');
const fairviewProjection = (0, paymentAccountingProjection_1.buildExpectedAccountingProjection)({
    status: 'completed',
    paymentType: 'rental',
    transactionDomain: 'RENTAL',
    amount: 800,
    depositAmount: 0,
    isProvisional: false,
    commissionDetails: fairview.commissionDetails
});
check(fairviewProjection.ownerIncome === false, '25 owner income is not required');
check(fairviewProjection.amounts.ownerIncome === 0, '25 the calculated owner income remains 0');
check(fairviewProjection.journal === true, '26 the journal stays required');
const fairviewPosted = (0, paymentAccountingProjection_1.evaluateAccountingReconciliation)({
    paymentId: 'fairview',
    expected: fairviewProjection,
    actual: {
        ownerIncome: false,
        agentCommission: true,
        companyCommission: true,
        journal: false,
        vat: false,
        deposit: false
    }
});
check(fairviewPosted.componentStatus.ownerIncome === 'NOT_APPLICABLE', '25 the checker classifies owner income as not applicable');
check(fairviewPosted.accountingComplete === false && fairviewPosted.missing.includes('journal'), '26 a missing journal is still reported');
const fairviewClass = (0, accountingIntegrityClassification_1.classifyAccountingIntegrityRow)({
    component: 'HISTORICAL_JOURNAL_GAP',
    payment: fairview,
    propertyCommission: 100,
    presence: { ownerIncome: false, agentCommission: true, companyCommission: true, journal: false }
});
check(fairviewClass.classification === 'HISTORICAL JOURNAL GAP', '27 the journal gap stays visible');
check(fairviewClass.explanation.includes('0.00'), '27 zero owner income is shown');
check(fairviewClass.explanation.includes('465.60') && fairviewClass.explanation.includes('310.40'), '27 agent and company commission stay visible');
const concealed = (0, accountingIntegrityClassification_1.classifyAccountingIntegrityRow)({
    component: 'MISSING_JOURNAL',
    payment: Object.assign(Object.assign({}, fairview), { commissionDetails: Object.assign(Object.assign({}, fairview.commissionDetails), { agencyShare: 1, totalCommission: 800 }) }),
    propertyCommission: 100,
    presence: { ownerIncome: false, agentCommission: true, companyCommission: false, journal: false }
});
check(concealed.classification === 'UNPOSTED RENTAL', '28 zero owner income does not conceal a missing company posting');
const gapSource = read('services/financialPostingGapService.ts');
const integritySource = read('services/paymentAccountingIntegrity.ts');
const reconciliationSource = read('services/paymentAccountingReconciliation.ts');
const introductionSource = read('services/introductionCommissionService.ts');
check(gapSource.includes('Detection only'), '29 gap detection does not reconstruct receipts');
check(!gapSource.includes('JournalEntry.create') && !gapSource.includes('backfill'), '30 the new gap code does not generate a journal');
check(!gapSource.includes('TaxObligation.create') && !integritySource.includes('upsertPaymentTaxObligation'), '31 detection does not create a VAT obligation');
check(!introductionSource.includes('Payment.updateOne') && !gapSource.includes('Payment.updateOne'), '32 these corrections do not rewrite a payment snapshot');
check(!integritySource.includes('AgentAccount.update') && !gapSource.includes('ownerBalance'), '33 detection does not change owner or agent balances');
check(reconciliationSource.includes('Never posts ledgers'), '34 reconciliation refresh remains read-only');
check(integritySource.includes('Financial ledger writers are intentionally not imported here'), '35 the integrity watchdog does not gain a ledger writer');
check(!introductionSource.includes('? 100'), 'the introduction calculator no longer hardcodes 100%');
check(!fs_1.default.existsSync(path_1.default.join(root, 'scripts', 'backfillHistoricalJournals.ts')), '29 no historical journal backfill script was added');
if (failures.length) {
    console.error(failures.map((failure) => `FAIL ${failure}`).join('\n'));
    process.exit(1);
}
console.log('Accounting integrity correction tests passed (35 scenarios).');
process.exit(0);
