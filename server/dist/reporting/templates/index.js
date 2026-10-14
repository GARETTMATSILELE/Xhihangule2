"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TemplateEngine = void 0;
class TemplateEngine {
    selectOwnerStatementTemplate(theme = 'executive') {
        return {
            templateId: 'owner-statement',
            templateVersion: 'owner-statement-template.v1',
            theme
        };
    }
    renderOwnerStatementText(dto) {
        var _a, _b;
        const summary = dto.executiveSummary;
        return [
            `${dto.company.displayName}`,
            'PROPERTY ACCOUNT STATEMENT',
            `Property: ${dto.property.name}${dto.property.address ? `, ${dto.property.address}` : ''}`,
            `Owner: ${dto.owner.displayName}`,
            `Period: ${dto.period.label === 'All Transactions' ? 'All Transactions' : `${dto.period.startDate} – ${dto.period.endDate}`}`,
            '',
            `Ledger: ${dto.ledger || 'required'}`,
            'Statement Summary',
            `Opening Balance: ${summary.openingBalance.currency} ${summary.openingBalance.amount.toFixed(2)}`,
            ...(dto.ownerMoneyWaterfall ? [
                `Amount Received: ${dto.ownerMoneyWaterfall.grossAmount.currency} ${dto.ownerMoneyWaterfall.grossAmount.amount.toFixed(2)}`,
                `Less Commission: ${dto.ownerMoneyWaterfall.commissionAmount.currency} ${dto.ownerMoneyWaterfall.commissionAmount.amount.toFixed(2)}`,
                `Less Levy: ${dto.ownerMoneyWaterfall.levyAmount.currency} ${dto.ownerMoneyWaterfall.levyAmount.amount.toFixed(2)}`,
                `Less VAT on Commission: ${dto.ownerMoneyWaterfall.vatOnCommission.currency} ${dto.ownerMoneyWaterfall.vatOnCommission.amount.toFixed(2)}`,
                `Net Owner Amount: ${dto.ownerMoneyWaterfall.netOwnerAmount.currency} ${dto.ownerMoneyWaterfall.netOwnerAmount.amount.toFixed(2)}`,
                dto.ownerMoneyWaterfall.reviewRequired ? 'Review required. Recorded owner income does not match the stored allocation. No amount was changed.' : 'Recorded owner income matches the stored allocation.'
            ] : []),
            ...(dto.statementSummary ? [
                `Total Rent: ${dto.statementSummary.totalRent.currency} ${dto.statementSummary.totalRent.amount.toFixed(2)}`,
                `Total Commission: ${dto.statementSummary.totalCommission.currency} ${dto.statementSummary.totalCommission.amount.toFixed(2)}`,
                `Total VAT: ${dto.statementSummary.totalVat.currency} ${dto.statementSummary.totalVat.amount.toFixed(2)}`,
                `Total Levies: ${dto.statementSummary.totalLevies.currency} ${dto.statementSummary.totalLevies.amount.toFixed(2)}`,
                `Owner Amount: ${dto.statementSummary.totalOwnerAmount.currency} ${dto.statementSummary.totalOwnerAmount.amount.toFixed(2)}`,
                `Total Payouts: ${dto.statementSummary.totalPayouts.currency} ${dto.statementSummary.totalPayouts.amount.toFixed(2)}`,
                `Closing Balance: ${dto.statementSummary.closingBalance.currency} ${dto.statementSummary.closingBalance.amount.toFixed(2)}`
            ] : [
                `Rental Income: ${summary.rentalIncome.currency} ${summary.rentalIncome.amount.toFixed(2)}`,
                `Owner Paid: ${summary.ownerPaid.currency} ${summary.ownerPaid.amount.toFixed(2)}`,
                `Closing Trust Balance: ${summary.closingTrustBalance.currency} ${summary.closingTrustBalance.amount.toFixed(2)}`
            ]),
            ...(dto.rentalSettlement ? [
                '',
                'Rental Settlement',
                `Gross Rent: ${dto.rentalSettlement.grossRent.currency} ${dto.rentalSettlement.grossRent.amount.toFixed(2)}`,
                `Levy: ${dto.rentalSettlement.levy.currency} ${dto.rentalSettlement.levy.amount.toFixed(2)}`,
                `Management Commission: ${dto.rentalSettlement.commission.currency} ${dto.rentalSettlement.commission.amount.toFixed(2)}`,
                `VAT on Commission: ${dto.rentalSettlement.vatOnCommission.currency} ${dto.rentalSettlement.vatOnCommission.amount.toFixed(2)}`,
                `Owner Payable: ${dto.rentalSettlement.ownerPayable.currency} ${dto.rentalSettlement.ownerPayable.amount.toFixed(2)}`
            ] : []),
            '',
            'Trust Position',
            `Opening Balance: ${dto.trustPosition.openingBalance.currency} ${dto.trustPosition.openingBalance.amount.toFixed(2)}`,
            `Money Received: ${dto.trustPosition.moneyReceived.currency} ${dto.trustPosition.moneyReceived.amount.toFixed(2)}`,
            `Expenses: ${dto.trustPosition.expenses.currency} ${dto.trustPosition.expenses.amount.toFixed(2)}`,
            `Owner Payments: ${dto.trustPosition.ownerPayments.currency} ${dto.trustPosition.ownerPayments.amount.toFixed(2)}`,
            `Closing Balance Held: ${dto.trustPosition.closingBalanceHeld.currency} ${dto.trustPosition.closingBalanceHeld.amount.toFixed(2)}`,
            '',
            'Property Performance',
            `Occupancy: ${(_a = dto.propertyPerformance.occupancyRate) !== null && _a !== void 0 ? _a : 'N/A'}`,
            `Rent Collection: ${(_b = dto.propertyPerformance.rentCollectionRate) !== null && _b !== void 0 ? _b : 'N/A'}`,
            `Outstanding Rent: ${dto.propertyPerformance.outstandingRent.currency} ${dto.propertyPerformance.outstandingRent.amount.toFixed(2)}`,
            `Open Maintenance: ${dto.propertyPerformance.openMaintenance}`,
            `Closed Maintenance: ${dto.propertyPerformance.closedMaintenance}`,
            '',
            'Tenant Status',
            `Rent Status: ${dto.tenantStatus.rentStatus || 'N/A'}`,
            `Arrears: ${dto.tenantStatus.arrears.currency} ${dto.tenantStatus.arrears.amount.toFixed(2)}`,
            '',
            `Report ID: ${dto.audit.reportId}`,
            `Generated: ${dto.audit.generatedAt}`,
            `Hash: ${dto.audit.hash}`
        ].join('\n');
    }
}
exports.TemplateEngine = TemplateEngine;
