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
const assert_1 = __importDefault(require("assert"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const propertyAccountTotals_1 = require("../services/propertyAccountTotals");
const individualAccountingCategories_1 = require("../services/individualAccountingCategories");
const individualReportingPeriod_1 = require("../services/individualReportingPeriod");
function srcFile(rel) {
    return fs_1.default.readFileSync(path_1.default.join(__dirname, '..', '..', 'src', rel), 'utf8');
}
function run() {
    return __awaiter(this, void 0, void 0, function* () {
        const results = {};
        {
            const orch = srcFile('services/paymentAccountingOrchestrator.ts');
            const workspace = srcFile('services/individualWorkspaceService.ts');
            assert_1.default.ok(orch.includes('export async function postPaymentAccounting'));
            assert_1.default.ok(workspace.includes('individualAccountingService.postEntry'));
            assert_1.default.ok(!workspace.includes('account.transactions.push'));
            assert_1.default.ok(!workspace.includes('await account.save()'));
            results['Rent orchestrator unchanged; expenses no longer push+save'] = 'PASS';
        }
        {
            const classified = (0, individualAccountingCategories_1.classifyLandlordCategory)((0, individualAccountingCategories_1.normalizeLandlordCategory)('TENANT_DEPOSIT', 'LIABILITY'));
            assert_1.default.strictEqual(classified.accountingTreatment, 'LIABILITY');
            assert_1.default.strictEqual(classified.transactionCategory, 'DEPOSIT');
            assert_1.default.notStrictEqual(classified.ledgerType, 'income');
            results['Tenant deposit is liability, not income'] = 'PASS';
        }
        {
            const classified = (0, individualAccountingCategories_1.classifyLandlordCategory)('CAPITAL_IMPROVEMENT');
            assert_1.default.strictEqual(classified.accountingTreatment, 'CAPITAL');
            assert_1.default.strictEqual(classified.deductibility, 'CAPITAL');
            results['Capital improvement is not automatically deductible'] = 'PASS';
        }
        {
            const account = {
                transactions: [
                    { type: 'income', amount: 1000, status: 'completed', accountingTreatment: 'PROPERTY_INCOME', date: new Date('2026-09-10') },
                    { type: 'other', amount: 500, status: 'completed', accountingTreatment: 'LIABILITY', date: new Date('2026-09-10') },
                    { type: 'other', amount: 2000, status: 'completed', accountingTreatment: 'CAPITAL', date: new Date('2026-09-10') },
                    { type: 'expense', amount: 100, status: 'completed', accountingTreatment: 'PROPERTY_EXPENSE', date: new Date('2026-09-12') },
                    { type: 'income', amount: 800, status: 'completed', accountingTreatment: 'PROPERTY_INCOME', date: new Date('2026-08-01') }
                ]
            };
            const totals = (0, propertyAccountTotals_1.computePropertyAccountTotals)(account);
            assert_1.default.strictEqual(totals.totalIncome, 1800);
            assert_1.default.strictEqual(totals.totalExpenses, 100);
            const september = (0, propertyAccountTotals_1.sumPropertyAccountPeriodPnl)(account.transactions, new Date('2026-09-01T00:00:00.000Z'), new Date('2026-10-01T00:00:00.000Z'));
            assert_1.default.strictEqual(september.income, 1000);
            assert_1.default.strictEqual(september.expenses, 100);
            assert_1.default.strictEqual(september.net, 900);
            results['P&L excludes deposits and capital; period filter is not lifetime'] = 'PASS';
        }
        {
            const period = (0, individualReportingPeriod_1.resolveReportingPeriod)('this_month', new Date(Date.UTC(2026, 8, 17)));
            assert_1.default.strictEqual(period.basis, 'this_month');
            assert_1.default.ok(period.label.includes('2026'));
            const ytd = (0, individualReportingPeriod_1.resolveReportingPeriod)('year_to_date', new Date(Date.UTC(2026, 8, 17)));
            assert_1.default.strictEqual(ytd.basis, 'year_to_date');
            assert_1.default.ok(ytd.start && ytd.start.getUTCMonth() === 0);
            results['Reporting periods are explicit'] = 'PASS';
        }
        {
            const workspace = srcFile('services/individualWorkspaceService.ts');
            assert_1.default.ok(!workspace.includes('annualProfit: netProfit * 12'));
            assert_1.default.ok(workspace.includes('annualisedRunRate'));
            assert_1.default.ok(workspace.includes('yearToDateProfit'));
            results['annualProfit * 12 removed'] = 'PASS';
        }
        {
            const service = srcFile('services/individualAccountingService.ts');
            assert_1.default.ok(service.includes('assertPeriodAllowsPosting'));
            assert_1.default.ok(service.includes('AccountingEventLog.create'));
            assert_1.default.ok(service.includes('appendManualLedgerTransaction'));
            results['Period gate, audit, and projection writer are used'] = 'PASS';
        }
        {
            const recon = srcFile('services/paymentAccountingReconciliation.ts');
            assert_1.default.ok(recon.includes('ensureDepositLedgerFromPayment'));
            results['Payment deposits still use rental deposit ledger'] = 'PASS';
        }
        console.log(JSON.stringify(results, null, 2));
        const failed = Object.values(results).filter((v) => v !== 'PASS');
        if (failed.length) {
            throw new Error('Phase B individual accounting tests failed');
        }
        console.log('Phase B individual accounting tests: ALL PASS');
    });
}
run().catch((error) => {
    console.error(error);
    process.exit(1);
});
