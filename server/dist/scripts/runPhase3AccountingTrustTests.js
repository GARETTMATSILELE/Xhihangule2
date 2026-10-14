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
/**
 * Phase 3 owner-money waterfall. Uses the statement builder and the same DTO
 * for the text and CSV exports. Does not open a database or rewrite history.
 */
const assert_1 = __importDefault(require("assert"));
const builders_1 = require("../reporting/builders");
const exports_1 = require("../reporting/exports");
const templates_1 = require("../reporting/templates");
const ownerWaterfall_1 = require("../reporting/ownerWaterfall");
const companyId = 'company-phase3';
const propertyId = 'property-phase3';
const readModels = (entries, snapshots) => ({
    owner: { getOwnerForProperty() {
            return __awaiter(this, void 0, void 0, function* () { return { id: 'owner-1', displayName: 'Owner' }; });
        } },
    property: { getProperty() {
            return __awaiter(this, void 0, void 0, function* () { return { id: propertyId, name: 'Example House', address: 'Harare' }; });
        } },
    ledger: { getLedgerEntries() {
            return __awaiter(this, void 0, void 0, function* () { return entries; });
        } },
    payment: {
        getPaymentTraceReferences() {
            return __awaiter(this, void 0, void 0, function* () { return {}; });
        },
        getPropertyCommissionSnapshots() {
            return __awaiter(this, void 0, void 0, function* () { return snapshots; });
        }
    },
    lease: { getLeaseContext() {
            return __awaiter(this, void 0, void 0, function* () { return undefined; });
        } },
    maintenance: { getMaintenanceContext() {
            return __awaiter(this, void 0, void 0, function* () { return { notes: [] }; });
        } },
    inspection: { getInspectionContext() {
            return __awaiter(this, void 0, void 0, function* () { return { notes: [] }; });
        } },
    trust: { getTrustContext() {
            return __awaiter(this, void 0, void 0, function* () { return undefined; });
        } }
});
const income = (paymentId, credit) => ({
    entryId: `income-${paymentId}`,
    sourceSystem: 'property_account',
    sourceModel: 'PropertyAccount.transactions',
    sourceId: paymentId,
    companyId,
    propertyId,
    eventType: 'RENT',
    direction: 'credit',
    amount: credit,
    debit: 0,
    credit,
    currency: 'USD',
    status: 'completed',
    effectiveDate: new Date('2026-10-01T00:00:00.000Z'),
    metadata: { paymentId, referenceNumber: 'P3-1000' }
});
function main() {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c, _d, _e, _f, _g;
        const levyCase = (0, ownerWaterfall_1.explainOwnerWaterfall)({
            grossAmount: 1000,
            commissionAmount: 100,
            levyAmount: 100,
            vatOnCommission: 15.5,
            vatRate: 0.155,
            recordedOwnerAmount: 784.5
        });
        assert_1.default.strictEqual(levyCase.netOwnerAmount, 784.5);
        assert_1.default.strictEqual(levyCase.reviewRequired, false);
        assert_1.default.strictEqual(levyCase.vatOnCommission, 15.5);
        const noLevy = (0, ownerWaterfall_1.explainOwnerWaterfall)({
            grossAmount: 1000,
            commissionAmount: 100,
            levyAmount: 0,
            vatOnCommission: 15.5,
            recordedOwnerAmount: 884.5
        });
        assert_1.default.strictEqual(noLevy.netOwnerAmount, 884.5);
        const noVat = (0, ownerWaterfall_1.explainOwnerWaterfall)({
            grossAmount: 1000,
            commissionAmount: 100,
            levyAmount: 0,
            vatOnCommission: 0,
            vatRate: 0,
            recordedOwnerAmount: 900
        });
        assert_1.default.strictEqual(noVat.vatOnCommission, 0);
        assert_1.default.strictEqual(noVat.netOwnerAmount, 900);
        const historical = (0, ownerWaterfall_1.explainOwnerWaterfall)({
            grossAmount: 1000,
            commissionAmount: 100,
            levyAmount: 0,
            vatOnCommission: 15.5,
            vatRate: 0.155,
            recordedOwnerAmount: 884.5
        });
        assert_1.default.strictEqual(historical.vatRate, 0.155);
        assert_1.default.notStrictEqual(historical.vatOnCommission, 50);
        const mismatch = (0, ownerWaterfall_1.explainOwnerWaterfall)({
            grossAmount: 1000,
            commissionAmount: 100,
            levyAmount: 100,
            vatOnCommission: 15.5,
            recordedOwnerAmount: 684.5
        });
        assert_1.default.strictEqual(mismatch.reviewRequired, true);
        assert_1.default.strictEqual(mismatch.netOwnerAmount, 784.5);
        assert_1.default.strictEqual(mismatch.recordedOwnerAmount, 684.5);
        const snapshot = {
            paymentId: 'pay-1',
            paymentDate: new Date('2026-10-01T00:00:00.000Z'),
            referenceNumber: 'P3-1000',
            grossRent: 1000,
            levy: 100,
            commission: 100,
            vatOnCommission: 15.5,
            vatRate: 0.155,
            ownerPayable: 784.5
        };
        const builder = new builders_1.OwnerStatementBuilder(readModels([income('pay-1', 784.5)], [snapshot]));
        const dto = yield builder.build({
            companyId,
            propertyId,
            ledgerType: 'rental',
            period: { startDate: '2026-10-01', endDate: '2026-10-31', label: '2026-10' },
            generatedBy: 'phase3'
        });
        assert_1.default.strictEqual(dto.ledger, 'rental');
        assert_1.default.strictEqual((_a = dto.ownerMoneyWaterfall) === null || _a === void 0 ? void 0 : _a.grossAmount.amount, 1000);
        assert_1.default.strictEqual((_b = dto.ownerMoneyWaterfall) === null || _b === void 0 ? void 0 : _b.commissionAmount.amount, 100);
        assert_1.default.strictEqual((_c = dto.ownerMoneyWaterfall) === null || _c === void 0 ? void 0 : _c.levyAmount.amount, 100);
        assert_1.default.strictEqual((_d = dto.ownerMoneyWaterfall) === null || _d === void 0 ? void 0 : _d.vatOnCommission.amount, 15.5);
        assert_1.default.strictEqual((_e = dto.ownerMoneyWaterfall) === null || _e === void 0 ? void 0 : _e.netOwnerAmount.amount, 784.5);
        assert_1.default.strictEqual((_f = dto.ownerMoneyWaterfall) === null || _f === void 0 ? void 0 : _f.reviewRequired, false);
        assert_1.default.strictEqual(dto.trustLedger[0].paymentId, 'pay-1');
        assert_1.default.strictEqual((_g = dto.trustLedger[0].ownerWaterfall) === null || _g === void 0 ? void 0 : _g.netOwnerAmount.amount, 784.5);
        const text = new templates_1.TemplateEngine().renderOwnerStatementText(dto);
        assert_1.default.ok(text.includes('1000.00'));
        assert_1.default.ok(text.includes('100.00'));
        assert_1.default.ok(text.includes('15.50'));
        assert_1.default.ok(text.includes('784.50'));
        assert_1.default.ok(text.includes('Less VAT on Commission'));
        const csv = (yield new exports_1.ExportEngine().exportOwnerStatement(dto, 'csv')).buffer.toString('utf8');
        assert_1.default.ok(csv.includes('1000'));
        assert_1.default.ok(csv.includes('15.5'));
        assert_1.default.ok(csv.includes('784.5'));
        const sale = yield builder.build({
            companyId,
            propertyId,
            ledgerType: 'sale',
            period: { startDate: '2026-10-01', endDate: '2026-10-31', label: '2026-10' }
        });
        assert_1.default.strictEqual(sale.ledger, 'sale');
        console.log('Phase 3 accounting trust tests passed');
    });
}
main().catch((error) => {
    console.error(error);
    process.exit(1);
});
