"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuditTrailEngine = exports.TimelineEngine = exports.ChartEngine = exports.PropertyKPIEngine = exports.CashFlowEngine = exports.ReconciliationEngine = exports.money = void 0;
const crypto_1 = __importDefault(require("crypto"));
const ledger_1 = require("../ledger");
const roundMoney = (amount) => Math.round(Number(amount || 0) * 100) / 100;
const money = (amount, currency = 'USD') => ({
    amount: roundMoney(amount),
    currency
});
exports.money = money;
class ReconciliationEngine {
    reconcileMoney(id, label, expected, actual, sourceEntries) {
        const variance = roundMoney(actual.amount - expected.amount);
        return {
            id,
            label,
            expected,
            actual,
            variance: (0, exports.money)(variance, expected.currency),
            passed: Math.abs(variance) < 0.01,
            sourceReferences: sourceEntries.map(ledger_1.toSourceReference)
        };
    }
    summarize(checks) {
        return {
            status: checks.every((check) => check.passed) ? 'passed' : 'failed',
            checks
        };
    }
}
exports.ReconciliationEngine = ReconciliationEngine;
class CashFlowEngine {
    build(entries, currency = 'USD', openingBalance = 0) {
        const ordered = (0, ledger_1.sortLedgerEntries)(entries);
        const inflows = ordered.filter((entry) => entry.credit > 0);
        const outflows = ordered.filter((entry) => entry.debit > 0);
        const ownerPayments = ordered.filter((entry) => entry.eventType.toUpperCase() === 'OWNER_PAYOUT');
        const totalInflows = (0, ledger_1.sumCredits)(inflows);
        const totalOutflows = (0, ledger_1.sumDebits)(outflows);
        const totalOwnerPayments = (0, ledger_1.sumDebits)(ownerPayments);
        const closingBalance = openingBalance + totalInflows - totalOutflows;
        const steps = [
            {
                id: 'funds-received',
                label: 'Funds Received',
                amount: (0, exports.money)(totalInflows, currency),
                direction: 'inflow',
                sourceReferences: inflows.map(ledger_1.toSourceReference)
            },
            {
                id: 'deductions',
                label: 'Deductions',
                amount: (0, exports.money)(totalOutflows - totalOwnerPayments, currency),
                direction: 'outflow',
                sourceReferences: outflows.filter((entry) => entry.eventType.toUpperCase() !== 'OWNER_PAYOUT').map(ledger_1.toSourceReference)
            },
            {
                id: 'owner-payments',
                label: 'Owner Payments',
                amount: (0, exports.money)(totalOwnerPayments, currency),
                direction: 'outflow',
                sourceReferences: ownerPayments.map(ledger_1.toSourceReference)
            },
            {
                id: 'balance-held',
                label: 'Balance Held',
                amount: (0, exports.money)(closingBalance, currency),
                direction: 'balance',
                sourceReferences: ordered.map(ledger_1.toSourceReference)
            }
        ];
        const reconciliationEngine = new ReconciliationEngine();
        const expectedClosing = (0, exports.money)(openingBalance + totalInflows - totalOutflows, currency);
        const actualClosing = (0, exports.money)(closingBalance, currency);
        return {
            openingBalance: (0, exports.money)(openingBalance, currency),
            totalInflows: (0, exports.money)(totalInflows, currency),
            totalOutflows: (0, exports.money)(totalOutflows, currency),
            ownerPayments: (0, exports.money)(totalOwnerPayments, currency),
            closingBalance: (0, exports.money)(closingBalance, currency),
            steps,
            reconciliation: reconciliationEngine.summarize([
                reconciliationEngine.reconcileMoney('cash-flow-balance', 'Cash flow closing balance equals inflows less outflows', expectedClosing, actualClosing, ordered)
            ])
        };
    }
}
exports.CashFlowEngine = CashFlowEngine;
class PropertyKPIEngine {
    build(entries, currency = 'USD') {
        const rentEntries = entries.filter((entry) => entry.eventType.toUpperCase() === 'RENT' || entry.eventType.toLowerCase() === 'income');
        const completedRent = (0, ledger_1.sumCredits)(rentEntries.filter((entry) => entry.status === 'completed'));
        const totalRent = (0, ledger_1.sumCredits)(rentEntries);
        return {
            occupancyRate: undefined,
            collectionRate: totalRent > 0 ? roundMoney((completedRent / totalRent) * 100) : undefined,
            outstandingRent: (0, exports.money)(Math.max(0, totalRent - completedRent), currency),
            openMaintenanceCount: 0,
            closedMaintenanceCount: 0,
            financialKpis: {
                totalIncome: (0, exports.money)((0, ledger_1.sumCredits)(entries), currency),
                totalExpenses: (0, exports.money)((0, ledger_1.sumDebits)(entries), currency),
                netPosition: (0, exports.money)((0, ledger_1.sumCredits)(entries) - (0, ledger_1.sumDebits)(entries), currency)
            }
        };
    }
}
exports.PropertyKPIEngine = PropertyKPIEngine;
class ChartEngine {
    buildCashFlowChart(cashFlow) {
        return {
            id: 'cash-flow',
            title: 'Cash Flow',
            kind: 'waterfall',
            series: [
                {
                    id: 'cash-flow-series',
                    label: 'Cash Flow',
                    currency: cashFlow.closingBalance.currency,
                    points: cashFlow.steps.map((step) => ({ label: step.label, value: step.amount.amount }))
                }
            ],
            sourceReferences: cashFlow.steps.flatMap((step) => step.sourceReferences)
        };
    }
}
exports.ChartEngine = ChartEngine;
class TimelineEngine {
    buildFinancialTimeline(entries, currency = 'USD') {
        return {
            id: 'financial-timeline',
            title: 'Financial Timeline',
            events: (0, ledger_1.sortLedgerEntries)(entries).map((entry) => {
                var _a;
                return ({
                    id: entry.entryId,
                    label: String(((_a = entry.metadata) === null || _a === void 0 ? void 0 : _a.description) || entry.eventType),
                    occurredAt: entry.effectiveDate.toISOString(),
                    amount: (0, exports.money)(entry.amount, currency),
                    status: entry.status,
                    sourceReferences: [(0, ledger_1.toSourceReference)(entry)]
                });
            })
        };
    }
}
exports.TimelineEngine = TimelineEngine;
class AuditTrailEngine {
    build(input) {
        const generatedAt = new Date().toISOString();
        const correlationId = input.correlationId || crypto_1.default.randomUUID();
        const hash = crypto_1.default
            .createHash('sha256')
            .update(JSON.stringify(input.payloadForHash))
            .digest('hex');
        return {
            reportId: crypto_1.default.randomUUID(),
            reportType: input.reportType,
            generatedBy: input.generatedBy,
            generatedAt,
            softwareVersion: process.env.npm_package_version,
            dtoVersion: input.dtoVersion,
            templateVersion: input.templateVersion,
            sourceLedgerVersion: input.sourceLedgerVersion,
            accountingVersion: input.accountingVersion,
            hash,
            correlationId
        };
    }
}
exports.AuditTrailEngine = AuditTrailEngine;
