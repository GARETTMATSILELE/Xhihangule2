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
exports.OwnerStatementBuilder = void 0;
const ownerWaterfall_1 = require("../ownerWaterfall");
const engines_1 = require("../engines");
const ledger_1 = require("../ledger");
const rentalPeriod_1 = require("../rentalPeriod");
const DTO_VERSION = 'owner-statement.v1';
const LEDGER_ORIGIN = new Date('1900-01-01T00:00:00.000Z');
const parseDate = (value) => new Date(`${value}T00:00:00.000Z`);
const parseEndDate = (value) => new Date(`${value}T23:59:59.999Z`);
const isCompleted = (entry) => String(entry.status || 'completed').toLowerCase() === 'completed';
const isPassThrough = (entry) => {
    var _a;
    const eventType = String(entry.eventType || '').toUpperCase();
    const treatment = String(((_a = entry.metadata) === null || _a === void 0 ? void 0 : _a.accountingTreatment) || '').toUpperCase();
    return entry.sourceSystem === 'pass_through' || eventType.startsWith('PASS_THROUGH') || treatment === 'PASS_THROUGH';
};
const isOpeningBalance = (entry) => String(entry.eventType || '').toUpperCase() === 'OPENING_BALANCE';
const isOwnerPayout = (entry) => String(entry.eventType || '').toUpperCase() === 'OWNER_PAYOUT';
const toRowType = (entry) => {
    if (isOwnerPayout(entry))
        return 'Payout';
    if (entry.credit > 0)
        return 'Income';
    if (entry.debit > 0)
        return 'Expense';
    return 'Other';
};
const paymentIdOf = (entry) => {
    var _a;
    const value = (_a = entry.metadata) === null || _a === void 0 ? void 0 : _a.paymentId;
    return value ? String(value) : undefined;
};
/** Cash shown as Total Amount Received. Falls back to the stored rent component for older snapshots. */
const amountReceivedOf = (snapshot) => {
    if (!snapshot)
        return 0;
    const explicit = Number(snapshot.totalAmountReceived);
    if (Number.isFinite(explicit) && explicit > 0)
        return explicit;
    return Number(snapshot.grossRent || 0);
};
const skipDuplicateTransactionPayout = (entry, payoutRefs) => {
    var _a;
    if (entry.sourceSystem !== 'property_account' || !isOwnerPayout(entry))
        return false;
    const ref = String(((_a = entry.metadata) === null || _a === void 0 ? void 0 : _a.referenceNumber) || entry.sourceId || '');
    return Boolean(ref) && payoutRefs.has(ref);
};
const describeRow = (entry, rowType, snapshot) => {
    var _a, _b, _c, _d;
    if (rowType === 'Payout') {
        const recipient = String(((_a = entry.metadata) === null || _a === void 0 ? void 0 : _a.recipientName) || '').trim();
        const cleaned = (0, rentalPeriod_1.cleanStatementDescription)(String(((_b = entry.metadata) === null || _b === void 0 ? void 0 : _b.description) || ''), '');
        if (/^owner payout\s*[-–—]/i.test(cleaned))
            return cleaned;
        if (recipient)
            return `Owner payout - ${recipient}`;
        return cleaned || 'Owner Payout';
    }
    if (rowType === 'Income') {
        const rentalPeriod = snapshot
            ? (0, rentalPeriod_1.formatRentPeriodDescription)({
                rentalPeriodMonth: snapshot.rentalPeriodMonth,
                rentalPeriodYear: snapshot.rentalPeriodYear,
                advanceMonthsPaid: snapshot.advanceMonthsPaid,
                advancePeriodStart: snapshot.advancePeriodStart,
                advancePeriodEnd: snapshot.advancePeriodEnd
            })
            : undefined;
        if (rentalPeriod)
            return rentalPeriod;
        return (0, rentalPeriod_1.cleanStatementDescription)(String(((_c = entry.metadata) === null || _c === void 0 ? void 0 : _c.description) || ''), 'Rental Income');
    }
    return (0, rentalPeriod_1.cleanStatementDescription)(String(((_d = entry.metadata) === null || _d === void 0 ? void 0 : _d.description) || entry.eventType || ''), rowType === 'Expense' ? 'Expense' : 'Transaction');
};
class OwnerStatementBuilder {
    constructor(readModels, cashFlowEngine = new engines_1.CashFlowEngine(), kpiEngine = new engines_1.PropertyKPIEngine(), timelineEngine = new engines_1.TimelineEngine(), chartEngine = new engines_1.ChartEngine(), reconciliationEngine = new engines_1.ReconciliationEngine(), auditTrailEngine = new engines_1.AuditTrailEngine()) {
        this.readModels = readModels;
        this.cashFlowEngine = cashFlowEngine;
        this.kpiEngine = kpiEngine;
        this.timelineEngine = timelineEngine;
        this.chartEngine = chartEngine;
        this.reconciliationEngine = reconciliationEngine;
        this.auditTrailEngine = auditTrailEngine;
    }
    build(input) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b, _c;
            const periodStart = parseDate(input.period.startDate);
            const periodEnd = parseEndDate(input.period.endDate);
            if (input.ledgerType !== 'rental' && input.ledgerType !== 'sale') {
                throw new Error('Owner statement requires an explicit ledgerType of rental or sale.');
            }
            const [owner, property, entriesToDate, leaseContext, maintenanceContext, inspectionContext] = yield Promise.all([
                this.readModels.owner.getOwnerForProperty(input.companyId, input.propertyId, input.ledgerType),
                this.readModels.property.getProperty(input.companyId, input.propertyId, input.ledgerType),
                this.readModels.ledger.getLedgerEntries({
                    companyId: input.companyId,
                    propertyId: input.propertyId,
                    ledgerType: input.ledgerType,
                    from: LEDGER_ORIGIN,
                    to: periodEnd
                }),
                this.readModels.lease.getLeaseContext(input.companyId, input.propertyId),
                this.readModels.maintenance.getMaintenanceContext(input.companyId, input.propertyId),
                this.readModels.inspection.getInspectionContext(input.companyId, input.propertyId)
            ]);
            const currency = ((_a = entriesToDate[0]) === null || _a === void 0 ? void 0 : _a.currency) || 'USD';
            const payoutRefs = new Set(entriesToDate
                .filter((entry) => entry.sourceSystem === 'owner_payout')
                .map((entry) => { var _a; return String(((_a = entry.metadata) === null || _a === void 0 ? void 0 : _a.referenceNumber) || entry.sourceId || ''); })
                .filter(Boolean));
            const qualifying = (0, ledger_1.sortLedgerEntries)(entriesToDate.filter((entry) => isCompleted(entry) &&
                !isPassThrough(entry) &&
                !skipDuplicateTransactionPayout(entry, payoutRefs)));
            const prePeriod = qualifying.filter((entry) => entry.effectiveDate < periodStart);
            const inPeriod = qualifying.filter((entry) => entry.effectiveDate >= periodStart && entry.effectiveDate <= periodEnd);
            const openingBalanceAmount = prePeriod.reduce((sum, entry) => sum + entry.credit - entry.debit, 0)
                + inPeriod.filter(isOpeningBalance).reduce((sum, entry) => sum + entry.credit - entry.debit, 0);
            const periodRows = inPeriod.filter((entry) => !isOpeningBalance(entry));
            const paymentIds = Array.from(new Set(periodRows.map(paymentIdOf).filter((id) => Boolean(id))));
            const paymentSnapshots = this.readModels.payment.getPropertyCommissionSnapshots
                ? yield this.readModels.payment.getPropertyCommissionSnapshots(input.companyId, input.propertyId, periodStart, periodEnd, paymentIds)
                : [];
            const snapshotByPaymentId = new Map(paymentSnapshots.map((row) => [row.paymentId, row]));
            const snapshotByReference = new Map(paymentSnapshots
                .filter((row) => row.referenceNumber)
                .map((row) => [String(row.referenceNumber), row]));
            const snapshotFor = (entry) => {
                var _a;
                return snapshotByPaymentId.get(paymentIdOf(entry) || '') ||
                    snapshotByReference.get(String(((_a = entry.metadata) === null || _a === void 0 ? void 0 : _a.referenceNumber) || ''));
            };
            const cashFlow = this.cashFlowEngine.build(periodRows, currency, openingBalanceAmount);
            const propertyKpis = this.kpiEngine.build(periodRows, currency);
            const timeline = this.timelineEngine.buildFinancialTimeline(periodRows, currency);
            const charts = [this.chartEngine.buildCashFlowChart(cashFlow)];
            const rentalEntries = periodRows.filter((entry) => entry.eventType.toUpperCase() === 'RENT' || entry.eventType.toLowerCase() === 'income');
            const ownerPaymentEntries = periodRows.filter(isOwnerPayout);
            const expenseEntries = periodRows.filter((entry) => entry.debit > 0 && !isOwnerPayout(entry));
            const otherIncomeEntries = periodRows.filter((entry) => entry.credit > 0 && !rentalEntries.includes(entry));
            let runningBalance = openingBalanceAmount;
            const trustLedger = periodRows.map((entry) => {
                var _a;
                runningBalance += entry.credit - entry.debit;
                const rowType = toRowType(entry);
                const snapshot = snapshotFor(entry);
                const ownerAmount = rowType === 'Income' || entry.credit > 0
                    ? (0, engines_1.money)(entry.credit, currency)
                    : (0, engines_1.money)(-entry.debit, currency);
                const received = amountReceivedOf(snapshot);
                const rentAmount = rowType === 'Income' && received > 0
                    ? (0, engines_1.money)(received, currency)
                    : undefined;
                const contractualRent = rowType === 'Income' && snapshot && Number(snapshot.grossRent || 0) > 0
                    ? (0, engines_1.money)(snapshot.grossRent, currency)
                    : undefined;
                const paymentId = paymentIdOf(entry);
                const explained = rowType === 'Income' && snapshot && received > 0
                    ? (0, ownerWaterfall_1.explainOwnerWaterfall)({
                        grossAmount: received,
                        commissionAmount: snapshot.commission,
                        levyAmount: snapshot.levy,
                        vatOnCommission: snapshot.vatOnCommission,
                        vatRate: snapshot.vatRate,
                        recordedOwnerAmount: entry.credit
                    })
                    : undefined;
                const ownerWaterfall = explained
                    ? {
                        grossAmount: (0, engines_1.money)(explained.grossAmount, currency),
                        commissionAmount: (0, engines_1.money)(explained.commissionAmount, currency),
                        levyAmount: (0, engines_1.money)(explained.levyAmount, currency),
                        vatOnCommission: (0, engines_1.money)(explained.vatOnCommission, currency),
                        vatRate: explained.vatRate,
                        netOwnerAmount: (0, engines_1.money)(explained.netOwnerAmount, currency),
                        recordedOwnerAmount: explained.recordedOwnerAmount == null
                            ? undefined
                            : (0, engines_1.money)(explained.recordedOwnerAmount, currency),
                        difference: (0, engines_1.money)(explained.difference, currency),
                        reviewRequired: explained.reviewRequired,
                        formula: explained.formula
                    }
                    : undefined;
                return {
                    id: entry.entryId,
                    date: entry.effectiveDate.toISOString(),
                    reference: String(((_a = entry.metadata) === null || _a === void 0 ? void 0 : _a.referenceNumber) || entry.sourceId || ''),
                    description: describeRow(entry, rowType, snapshot),
                    debit: (0, engines_1.money)(entry.debit, currency),
                    credit: (0, engines_1.money)(entry.credit, currency),
                    runningBalance: (0, engines_1.money)(runningBalance, currency),
                    status: entry.status,
                    sourceReferences: [(0, ledger_1.toSourceReference)(entry)],
                    rowType,
                    rentAmount,
                    totalAmountReceived: rentAmount,
                    contractualRent,
                    receiptReviewRequired: Boolean(snapshot === null || snapshot === void 0 ? void 0 : snapshot.receiptReviewRequired),
                    commission: rowType === 'Income' && snapshot ? (0, engines_1.money)(snapshot.commission, currency) : undefined,
                    vatOnCommission: rowType === 'Income' && snapshot ? (0, engines_1.money)(snapshot.vatOnCommission, currency) : undefined,
                    levies: rowType === 'Income' && snapshot ? (0, engines_1.money)(snapshot.levy, currency) : undefined,
                    ownerAmount,
                    vatRate: snapshot === null || snapshot === void 0 ? void 0 : snapshot.vatRate,
                    paymentId,
                    ownerWaterfall
                };
            });
            const ownerPayments = trustLedger.filter((row) => ownerPaymentEntries.some((entry) => entry.entryId === row.id));
            const incomeBreakdown = [
                {
                    id: 'rental-income',
                    label: 'Rental Income',
                    amount: (0, engines_1.money)(rentalEntries.reduce((sum, entry) => sum + entry.credit, 0), currency),
                    direction: 'inflow',
                    sourceReferences: rentalEntries.map(ledger_1.toSourceReference)
                },
                {
                    id: 'other-income',
                    label: 'Other Income',
                    amount: (0, engines_1.money)(otherIncomeEntries.reduce((sum, entry) => sum + entry.credit, 0), currency),
                    direction: 'inflow',
                    sourceReferences: otherIncomeEntries.map(ledger_1.toSourceReference)
                }
            ];
            const displayedSnapshots = Array.from(new Map(periodRows
                .map((entry) => snapshotFor(entry))
                .filter((row) => Boolean(row))
                .map((row) => [row.paymentId, row])).values());
            const settlementGrossRent = displayedSnapshots.reduce((sum, row) => sum + Number(row.grossRent || 0), 0);
            const settlementAmountReceived = displayedSnapshots.reduce((sum, row) => sum + amountReceivedOf(row), 0);
            const settlementLevy = displayedSnapshots.reduce((sum, row) => sum + Number(row.levy || 0), 0);
            const settlementCommission = displayedSnapshots.reduce((sum, row) => sum + Number(row.commission || 0), 0);
            const settlementVat = displayedSnapshots.reduce((sum, row) => sum + Number(row.vatOnCommission || 0), 0);
            const settlementOwnerPayable = displayedSnapshots.reduce((sum, row) => sum + Number(row.ownerPayable || 0), 0);
            const expenseBreakdown = [
                {
                    id: 'expenses',
                    label: 'Expenses',
                    amount: (0, engines_1.money)(expenseEntries.reduce((sum, entry) => sum + entry.debit, 0), currency),
                    direction: 'outflow',
                    sourceReferences: expenseEntries.map(ledger_1.toSourceReference)
                }
            ];
            if (settlementLevy > 0) {
                expenseBreakdown.push({
                    id: 'levy',
                    label: 'Levy',
                    amount: (0, engines_1.money)(settlementLevy, currency),
                    direction: 'outflow',
                    sourceReferences: displayedSnapshots.map((row) => ({ sourceSystem: 'payment', sourceModel: 'Payment', sourceId: row.paymentId }))
                });
            }
            if (settlementCommission > 0) {
                expenseBreakdown.push({
                    id: 'management-commission',
                    label: 'Management Commission',
                    amount: (0, engines_1.money)(settlementCommission, currency),
                    direction: 'outflow',
                    sourceReferences: displayedSnapshots.map((row) => ({ sourceSystem: 'payment', sourceModel: 'Payment', sourceId: row.paymentId }))
                });
            }
            if (settlementVat > 0) {
                expenseBreakdown.push({
                    id: 'vat-on-commission',
                    label: 'VAT on Commission',
                    amount: (0, engines_1.money)(settlementVat, currency),
                    direction: 'outflow',
                    sourceReferences: displayedSnapshots.map((row) => ({ sourceSystem: 'payment', sourceModel: 'Payment', sourceId: row.paymentId }))
                });
            }
            const totalRentalIncome = rentalEntries.reduce((sum, entry) => sum + entry.credit, 0);
            const totalOtherIncome = otherIncomeEntries.reduce((sum, entry) => sum + entry.credit, 0);
            const totalDeductions = expenseEntries.reduce((sum, entry) => sum + entry.debit, 0);
            const ownerPaid = ownerPaymentEntries.reduce((sum, entry) => sum + entry.debit, 0);
            const netAvailable = totalRentalIncome + totalOtherIncome - totalDeductions;
            const closingBalance = cashFlow.closingBalance;
            const summaryCheck = this.reconciliationEngine.reconcileMoney('owner-statement-closing-balance', 'Closing balance equals opening plus funds received less deductions and owner payments', (0, engines_1.money)(openingBalanceAmount + totalRentalIncome + totalOtherIncome - totalDeductions - ownerPaid, currency), closingBalance, periodRows);
            const runningBalanceCheck = this.reconciliationEngine.reconcileMoney('owner-statement-running-balance', 'Final ledger running balance equals closing balance held', closingBalance, trustLedger.length ? trustLedger[trustLedger.length - 1].runningBalance : (0, engines_1.money)(openingBalanceAmount, currency), periodRows);
            const reconciliation = this.reconciliationEngine.summarize([summaryCheck, runningBalanceCheck]);
            const trustPosition = {
                openingBalance: cashFlow.openingBalance,
                moneyReceived: cashFlow.totalInflows,
                expenses: (0, engines_1.money)(totalDeductions, currency),
                ownerPayments: (0, engines_1.money)(ownerPaid, currency),
                closingBalanceHeld: closingBalance,
                reconciliation
            };
            const propertyPerformance = {
                occupancyRate: propertyKpis.occupancyRate,
                rentCollectionRate: propertyKpis.collectionRate,
                outstandingRent: propertyKpis.outstandingRent,
                openMaintenance: Number((_b = maintenanceContext === null || maintenanceContext === void 0 ? void 0 : maintenanceContext.open) !== null && _b !== void 0 ? _b : propertyKpis.openMaintenanceCount),
                closedMaintenance: Number((_c = maintenanceContext === null || maintenanceContext === void 0 ? void 0 : maintenanceContext.closed) !== null && _c !== void 0 ? _c : propertyKpis.closedMaintenanceCount),
                lastInspection: (inspectionContext === null || inspectionContext === void 0 ? void 0 : inspectionContext.lastInspectionDate) || propertyKpis.lastInspectionDate,
                nextInspection: (inspectionContext === null || inspectionContext === void 0 ? void 0 : inspectionContext.nextInspectionDate) || propertyKpis.nextInspectionDate
            };
            const tenantStatus = {
                tenant: leaseContext === null || leaseContext === void 0 ? void 0 : leaseContext.tenant,
                lease: leaseContext === null || leaseContext === void 0 ? void 0 : leaseContext.lease,
                monthlyRent: (leaseContext === null || leaseContext === void 0 ? void 0 : leaseContext.monthlyRent)
                    ? (0, engines_1.money)(Number(leaseContext.monthlyRent), currency)
                    : undefined,
                rentStatus: propertyKpis.outstandingRent.amount > 0 ? 'arrears' : 'current',
                arrears: propertyKpis.outstandingRent,
                deposit: (leaseContext === null || leaseContext === void 0 ? void 0 : leaseContext.deposit)
                    ? (0, engines_1.money)(Number(leaseContext.deposit), currency)
                    : undefined,
                nextDueDate: leaseContext === null || leaseContext === void 0 ? void 0 : leaseContext.nextDueDate,
                occupancy: (leaseContext === null || leaseContext === void 0 ? void 0 : leaseContext.occupancy) || (propertyKpis.occupancyRate === 0 ? 'vacant' : 'unknown')
            };
            const notes = {
                managementNotes: [],
                maintenanceNotes: Array.isArray(maintenanceContext === null || maintenanceContext === void 0 ? void 0 : maintenanceContext.notes)
                    ? maintenanceContext.notes
                    : [],
                inspectionNotes: Array.isArray(inspectionContext === null || inspectionContext === void 0 ? void 0 : inspectionContext.notes)
                    ? inspectionContext.notes
                    : [],
                latePaymentNotes: propertyKpis.outstandingRent.amount > 0 ? ['Outstanding rent detected in reporting KPI summary.'] : [],
                generalComments: []
            };
            const totalOwnerAmount = trustLedger
                .filter((row) => row.rowType === 'Income')
                .reduce((sum, row) => { var _a; return sum + Number(((_a = row.ownerAmount) === null || _a === void 0 ? void 0 : _a.amount) || 0); }, 0);
            const statementWaterfall = displayedSnapshots.length
                ? (0, ownerWaterfall_1.explainOwnerWaterfall)({
                    grossAmount: settlementAmountReceived,
                    commissionAmount: settlementCommission,
                    levyAmount: settlementLevy,
                    vatOnCommission: settlementVat,
                    recordedOwnerAmount: totalOwnerAmount
                })
                : undefined;
            const ownerMoneyWaterfall = statementWaterfall
                ? {
                    grossAmount: (0, engines_1.money)(statementWaterfall.grossAmount, currency),
                    commissionAmount: (0, engines_1.money)(statementWaterfall.commissionAmount, currency),
                    levyAmount: (0, engines_1.money)(statementWaterfall.levyAmount, currency),
                    vatOnCommission: (0, engines_1.money)(statementWaterfall.vatOnCommission, currency),
                    netOwnerAmount: (0, engines_1.money)(statementWaterfall.netOwnerAmount, currency),
                    recordedOwnerAmount: (0, engines_1.money)(statementWaterfall.recordedOwnerAmount || 0, currency),
                    difference: (0, engines_1.money)(statementWaterfall.difference, currency),
                    reviewRequired: statementWaterfall.reviewRequired || trustLedger.some((row) => { var _a; return (_a = row.ownerWaterfall) === null || _a === void 0 ? void 0 : _a.reviewRequired; }),
                    formula: statementWaterfall.formula
                }
                : undefined;
            const statementSummary = {
                openingBalance: (0, engines_1.money)(openingBalanceAmount, currency),
                totalRent: (0, engines_1.money)(settlementGrossRent, currency),
                totalAmountReceived: (0, engines_1.money)(settlementAmountReceived, currency),
                totalCommission: (0, engines_1.money)(settlementCommission, currency),
                totalVat: (0, engines_1.money)(settlementVat, currency),
                totalLevies: (0, engines_1.money)(settlementLevy, currency),
                totalOwnerAmount: (0, engines_1.money)(totalOwnerAmount, currency),
                totalPayouts: (0, engines_1.money)(ownerPaid, currency),
                closingBalance
            };
            const preAuditPayload = {
                companyId: input.companyId,
                propertyId: input.propertyId,
                period: input.period,
                totals: {
                    totalRentalIncome,
                    totalOtherIncome,
                    totalDeductions,
                    ownerPaid,
                    closingBalance: closingBalance.amount
                }
            };
            const dataWarnings = [
                ...(periodRows.length === 0 && openingBalanceAmount === 0 ? ['No property account ledger entries found for this property and statement period.'] : []),
                ...((ownerMoneyWaterfall === null || ownerMoneyWaterfall === void 0 ? void 0 : ownerMoneyWaterfall.reviewRequired) ? ['Review required. The stored payment allocation does not match the recorded owner income. No historical amount was changed.'] : []),
                ...(displayedSnapshots.some((row) => row.receiptReviewRequired) ? ['Review required. One or more tenant receipts could not be split into rent and levy from the stored payment. The displayed total uses the stored receipt and does not add the levy again. No historical amount was changed.'] : []),
                ...(!property ? ['Property metadata was not found for this property ID.'] : []),
                ...((owner === null || owner === void 0 ? void 0 : owner.unresolvedReason) ? [owner.unresolvedReason] : []),
                ...(!owner ? ['Owner metadata was not found for this property ID.'] : [])
            ];
            return {
                dtoVersion: DTO_VERSION,
                status: reconciliation.status === 'passed' ? 'reconciled' : 'variance',
                audit: this.auditTrailEngine.build({
                    reportType: 'owner-statement',
                    generatedBy: input.generatedBy,
                    dtoVersion: DTO_VERSION,
                    templateVersion: 'owner-statement-template.v2',
                    sourceLedgerVersion: 'canonical-ledger-projection.v1',
                    payloadForHash: preAuditPayload,
                    correlationId: input.correlationId
                }),
                company: {
                    displayName: input.companyName || 'Mantis',
                    logo: input.companyLogo,
                    type: 'company'
                },
                owner: {
                    id: owner === null || owner === void 0 ? void 0 : owner.id,
                    displayName: (owner === null || owner === void 0 ? void 0 : owner.displayName) || 'Owner not assigned',
                    email: owner === null || owner === void 0 ? void 0 : owner.email,
                    phone: owner === null || owner === void 0 ? void 0 : owner.phone,
                    type: 'owner'
                },
                property: {
                    id: input.propertyId,
                    name: (property === null || property === void 0 ? void 0 : property.name) || 'Property',
                    address: property === null || property === void 0 ? void 0 : property.address
                },
                statementNumber: `OWNER-${input.period.label}`,
                ledger: input.ledgerType,
                currency,
                period: input.period,
                executiveSummary: {
                    openingBalance: (0, engines_1.money)(openingBalanceAmount, currency),
                    rentalIncome: (0, engines_1.money)(totalRentalIncome, currency),
                    otherIncome: (0, engines_1.money)(totalOtherIncome, currency),
                    totalFundsReceived: (0, engines_1.money)(totalRentalIncome + totalOtherIncome, currency),
                    totalDeductions: (0, engines_1.money)(totalDeductions, currency),
                    netAvailable: (0, engines_1.money)(netAvailable, currency),
                    ownerPaid: (0, engines_1.money)(ownerPaid, currency),
                    closingTrustBalance: closingBalance
                },
                cashFlow,
                trustLedger,
                incomeBreakdown,
                expenseBreakdown,
                ownerPayments,
                trustPosition,
                tenantStatus,
                propertyPerformance,
                notes,
                preparedBy: {
                    id: input.generatedBy,
                    displayName: input.generatedBy || 'Mantis Reporting',
                    type: 'agent'
                },
                dataQuality: {
                    hasLedgerData: periodRows.length > 0 || openingBalanceAmount !== 0,
                    ledgerEntryCount: periodRows.length,
                    sourceSystems: Array.from(new Set(periodRows.map((entry) => entry.sourceSystem))),
                    warnings: dataWarnings
                },
                propertyKpis,
                charts,
                timeline,
                pluginSections: [],
                statementSummary,
                ownerMoneyWaterfall,
                rentalSettlement: displayedSnapshots.length
                    ? {
                        grossRent: (0, engines_1.money)(settlementGrossRent, currency),
                        levy: (0, engines_1.money)(settlementLevy, currency),
                        commission: (0, engines_1.money)(settlementCommission, currency),
                        vatOnCommission: (0, engines_1.money)(settlementVat, currency),
                        ownerPayable: (0, engines_1.money)(settlementOwnerPayable, currency)
                    }
                    : undefined,
                reconciliation
            };
        });
    }
}
exports.OwnerStatementBuilder = OwnerStatementBuilder;
